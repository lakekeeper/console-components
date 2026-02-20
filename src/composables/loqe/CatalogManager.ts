import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { LoQECatalogConfig, AttachedCatalog } from './types';
import type { TokenManager } from './TokenManager';

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

    // Idempotent — skip if this catalog is already attached
    if (this.catalogs.has(config.catalogName)) {
      return;
    }

    const projectId = config.projectId || 'default';
    const secretName = `loqe_secret_${config.catalogName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const token = config.accessToken || this.tokenManager.currentToken;

    let conn;
    try {
      conn = await this.db.connect();

      // Create a dedicated secret for this catalog
      await conn.query(
        `CREATE OR REPLACE SECRET ${secretName} (
          TYPE iceberg,
          TOKEN '${token.replace(/'/g, "''")}'
        )`,
      );

      // Attach the Iceberg REST catalog
      await conn.query(
        `ATTACH IF NOT EXISTS '${projectId}/${config.catalogName}' AS "${config.catalogName}" (
          TYPE iceberg,
          SUPPORT_NESTED_NAMESPACES true,
          SUPPORT_STAGE_CREATE true,
          SECRET ${secretName},
          ENDPOINT '${config.restUri}'
        )`,
      );

      // Register with token manager for auto-refresh
      this.tokenManager.registerSecret(secretName, config.catalogName);

      this.catalogs.set(config.catalogName, {
        catalogName: config.catalogName,
        restUri: config.restUri,
        projectId,
        secretName,
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
      conn = await this.db.connect();
      await conn.query(`DETACH DATABASE IF EXISTS "${catalogName}"`);
      await conn.query(`DROP SECRET IF EXISTS ${catalog.secretName}`);
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
      conn = await this.db.connect();

      for (const [name, cat] of entries) {
        try {
          // 1. Detach the old binding (DATABASE keyword required with IF EXISTS)
          await conn.query(`DETACH DATABASE IF EXISTS "${name}"`);

          // 2. Re-create the secret with the fresh token (idempotent)
          await conn.query(
            `CREATE OR REPLACE SECRET ${cat.secretName} (
              TYPE iceberg,
              TOKEN '${newToken.replace(/'/g, "''")}'
            )`,
          );

          // 3. Re-attach with the same config
          await conn.query(
            `ATTACH IF NOT EXISTS '${cat.projectId}/${name}' AS "${name}" (
              TYPE iceberg,
              SUPPORT_NESTED_NAMESPACES true,
              SUPPORT_STAGE_CREATE true,
              SECRET ${cat.secretName},
              ENDPOINT '${cat.restUri}'
            )`,
          );
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

  // ── Lifecycle ───────────────────────────────────────────────────────

  dispose(): void {
    this.catalogs.clear();
    this.db = null;
  }
}
