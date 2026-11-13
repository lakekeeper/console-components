import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { LoQECatalogConfig, AttachedCatalog } from './types';
import type { TokenManager } from './TokenManager';
import { icebergSecretSql } from './icebergSecret';
import { ident, literal, sql, type Sql } from './sql';
import { SqlConnection } from './SqlConnection';

/**
 * ATTACH an Iceberg REST catalog under the warehouse's name.
 *
 * NB: the option is `STAGE_CREATE_TABLES` — DuckDB's iceberg extension renamed
 * it from `SUPPORT_STAGE_CREATE` in 1.5.x. Unknown ATTACH options are silently
 * collected instead of rejected, so the old name would just disable staging.
 */
function attachSql(
  projectId: string,
  catalogName: string,
  secretName: string,
  restUri: string,
): Sql {
  return sql`ATTACH IF NOT EXISTS ${literal(`${projectId}/${catalogName}`)} AS ${ident(catalogName)} (
    TYPE iceberg,
    SUPPORT_NESTED_NAMESPACES true,
    STAGE_CREATE_TABLES true,
    SECRET ${ident(secretName)},
    ENDPOINT ${literal(restUri)}
  )`;
}

/**
 * One secret per catalog, named so that distinct catalog names never share one:
 * every character outside `[a-z0-9]` is written as `_<hex code point>_`. A plain
 * `_` substitution would give `sales-eu` and `sales_eu` the same secret, and
 * detaching either would then drop the other's.
 */
export function secretNameFor(catalogName: string): string {
  const encoded = [...catalogName]
    .map((ch) => (/[a-z0-9]/.test(ch) ? ch : `_${ch.codePointAt(0)!.toString(16)}_`))
    .join('');
  return `loqe_secret_${encoded}`;
}

/**
 * CatalogManager — tracks Iceberg REST catalogs that have been ATTACHed
 * to the DuckDB instance, wires each one into the TokenManager for
 * automatic secret rotation.
 */
export class CatalogManager {
  private db: AsyncDuckDB | null = null;
  private tokenManager: TokenManager;
  private catalogs = new Map<string, AttachedCatalog>();

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  /** Bind to a live DuckDB instance. */
  initialize(db: AsyncDuckDB): void {
    this.db = db;
  }

  // ── Attach / Detach ─────────────────────────────────────────────────

  async attachCatalog(config: LoQECatalogConfig): Promise<void> {
    if (!this.db) throw new Error('[LoQE] Engine not initialised');

    // Anything still attached from another project is the wrong warehouse under
    // every name: the alias is the bare warehouse name, unique only within a
    // project. Done before the idempotency check below so a re-attach of an
    // already-attached catalog still clears the leftovers — belt and braces for
    // the project-switch watcher in `useLoQE`.
    await this.detachForeignCatalogs(config.projectId);

    // Idempotent — skip if already attached, unless force is set (then detach
    // first so the re-attach re-vends fresh storage credentials).
    if (this.catalogs.has(config.catalogName)) {
      if (!config.force) return;
      await this.detachCatalog(config.catalogName);
    }

    const projectId = config.projectId || 'default';
    const secretName = secretNameFor(config.catalogName);
    const token = config.accessToken || this.tokenManager.currentToken;

    let conn;
    try {
      conn = await SqlConnection.open(this.db);

      // Create a dedicated secret for this catalog
      await conn.query(icebergSecretSql(secretName, token, config.projectId));

      // Attach the Iceberg REST catalog.
      await conn.query(attachSql(projectId, config.catalogName, secretName, config.restUri));

      // Register with token manager for auto-refresh
      this.tokenManager.registerSecret(secretName, config.catalogName, 'iceberg', config.projectId);

      this.catalogs.set(config.catalogName, {
        catalogName: config.catalogName,
        restUri: config.restUri,
        projectId,
        secretName,
        headerProjectId: config.projectId,
        attachedAt: Date.now(),
      });
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  async detachCatalog(catalogName: string): Promise<void> {
    if (!this.db) return;

    const catalog = this.catalogs.get(catalogName);
    if (!catalog) return;

    let conn;
    try {
      conn = await SqlConnection.open(this.db);
      await conn.query(sql`DETACH DATABASE IF EXISTS ${ident(catalogName)}`);
      await conn.query(sql`DROP SECRET IF EXISTS ${ident(catalog.secretName)}`);
      this.tokenManager.unregisterSecret(catalog.secretName);
      this.catalogs.delete(catalogName);
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Detach every catalog that does not belong to `projectId`.
   *
   * Called when the selected project changes: catalog aliases are bare warehouse
   * names, so only one project's catalogs may be attached at a time.
   */
  async detachForeignCatalogs(projectId?: string): Promise<void> {
    for (const cat of Array.from(this.catalogs.values())) {
      if (cat.headerProjectId !== projectId) {
        await this.detachCatalog(cat.catalogName);
      }
    }
  }

  getAttachedCatalogs(): AttachedCatalog[] {
    return Array.from(this.catalogs.values());
  }

  isAttached(catalogName: string): boolean {
    return this.catalogs.has(catalogName);
  }

  /**
   * Re-attach every catalog so DuckDB picks up the freshly rotated
   * secrets.  Called by the token-refresh watcher in `useLoQE`.
   *
   * For each catalog we DETACH (which is cheap and releases the old
   * HTTP connection / cached token), then ATTACH again referencing the
   * same secret name that `TokenManager.refreshAllSecrets` just
   * updated.  Failures are best-effort — the catalog is removed from
   * the in-memory map so `restoreMissingCatalogs` can retry later.
   */
  async refreshAllCatalogs(newToken: string): Promise<void> {
    if (!this.db) return;

    const entries = Array.from(this.catalogs.entries());
    if (entries.length === 0) return;

    let conn;
    try {
      conn = await SqlConnection.open(this.db);

      for (const [name, cat] of entries) {
        try {
          // 1. Detach the old binding (DATABASE keyword required with IF EXISTS)
          await conn.query(sql`DETACH DATABASE IF EXISTS ${ident(name)}`);

          // 2. Re-create the secret with the fresh token (idempotent)
          await conn.query(icebergSecretSql(cat.secretName, newToken, cat.headerProjectId));

          // 3. Re-attach with the same config
          await conn.query(attachSql(cat.projectId, name, cat.secretName, cat.restUri));
        } catch (e) {
          console.error(`[LoQE] Failed to refresh catalog "${name}":`, e);
          // Remove from in-memory map so restoreMissingCatalogs can retry
          this.tokenManager.unregisterSecret(cat.secretName);
          this.catalogs.delete(name);
        }
      }
    } catch (e) {
      console.error('[LoQE] Catalog refresh failed:', e);
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Force DuckDB to re-vend fresh storage credentials and re-read table metadata.
   *
   * The iceberg extension caches, per session: (a) the table metadata/snapshot,
   * and (b) an auto-created S3 `SECRET` built from `loadTable`'s vended
   * `storage-credentials` — which carries a ~1h STS session token. When that
   * token expires, S3 returns `403 ExpiredToken` (DuckDB-WASM masks it as a
   * "404 / CORS"). DuckDB does not refresh it on its own. To recover we must:
   *   1. DROP the stale auto-created storage secret(s) (TYPE s3/gcs/azure/r2),
   *   2. DETACH + re-ATTACH each catalog (clears the cached binding),
   * so the next scan does a fresh `loadTable` → fresh creds → new secret.
   * Our own catalog secrets are TYPE iceberg and are preserved.
   */
  async reattachAll(): Promise<void> {
    if (!this.db) return;

    const entries = Array.from(this.catalogs.entries());
    if (entries.length === 0) return;

    let conn;
    try {
      conn = await SqlConnection.open(this.db);

      // 1. Drop DuckDB's auto-created storage secrets holding the expired creds.
      try {
        const res: any = await conn.query(
          sql`SELECT name FROM duckdb_secrets() WHERE lower(type) IN ('s3', 'gcs', 'azure', 'r2', 'huggingface')`,
        );
        for (const row of res.toArray()) {
          const name = row.name ?? row[0];
          if (name) {
            console.debug(`[LoQE] dropping stale storage secret: ${name}`);
            await conn.query(sql`DROP SECRET IF EXISTS ${ident(String(name))}`);
          }
        }
      } catch (e) {
        console.warn('[LoQE] could not enumerate/drop storage secrets:', e);
      }

      // 2. Detach + reattach each catalog so the next scan re-loadTables.
      for (const [name, cat] of entries) {
        try {
          await conn.query(sql`DETACH DATABASE IF EXISTS ${ident(name)}`);
          await conn.query(attachSql(cat.projectId, name, cat.secretName, cat.restUri));
        } catch (e) {
          console.error(`[LoQE] Failed to reattach catalog "${name}":`, e);
        }
      }
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  dispose(): void {
    this.catalogs.clear();
    this.db = null;
  }
}
