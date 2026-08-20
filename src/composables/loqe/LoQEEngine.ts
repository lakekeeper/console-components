import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { LoQEConfig, LoQEQueryResult, LoQECatalogConfig, LoQEExtension } from './types';
import { ConnectionPool } from './ConnectionPool';
import { TokenManager } from './TokenManager';
import { CatalogManager } from './CatalogManager';
import { useDuckDBSettingsStore, DUCKDB_DEFAULTS } from '@/stores/duckdbSettings';
import { friendlyQueryError } from './queryError';
import { toPlainCellValue } from './arrowValue';

/**
 * Format an arbitrary thrown value for logging. DuckDB-WASM errors frequently
 * surface as `Error: Invalid Configuration Error:` with an EMPTY message — the
 * useful detail lives in other (non-enumerable) properties or the stack. This
 * dumps name, message, stack, and every own property so we can see the real
 * cause in the console.
 */
function describeError(e: any): string {
  if (!(e instanceof Object)) return String(e);
  const out: Record<string, unknown> = {
    name: e.name,
    message: e.message,
    toString: String(e),
  };
  for (const k of Object.getOwnPropertyNames(e)) {
    if (k === 'name' || k === 'message' || k === 'stack') continue;
    try {
      out[k] = e[k];
    } catch {
      /* ignore getters that throw */
    }
  }
  let dump: string;
  try {
    dump = JSON.stringify(out);
  } catch {
    dump = String(out);
  }
  return `${dump}\nstack: ${e.stack ?? '(none)'}`;
}

/**
 * LoQEEngine — reference-counted singleton that owns the DuckDB WASM
 * lifecycle including connection pooling, token refresh, and catalog
 * management.
 *
 * Consumers call `LoQEEngine.acquire(config)` to obtain the shared
 * instance (creating it on the first call) and `LoQEEngine.release()`
 * when they no longer need it. When the last consumer releases, teardown
 * is deferred by a short grace period (see `IDLE_GRACE_MS`) so the engine
 * stays warm across preview open/close and table-to-table navigation — the
 * WASM isn't re-fetched/re-instantiated and extensions aren't reloaded. It
 * is destroyed only if nothing re-acquires within that window.
 *
 * This class has **no Vue dependency** so it can be unit-tested outside
 * of a component tree. The Vue-specific wiring (watchers, lifecycle
 * hooks, Pinia) lives in `useLoQE`.
 */
export class LoQEEngine {
  // ── Singleton bookkeeping ───────────────────────────────────────────

  private static instance: LoQEEngine | null = null;
  private static refCount = 0;
  /** Pending deferred-teardown timer armed by `release`; see `IDLE_GRACE_MS`. */
  private static idleTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Grace period before an idle (refCount 0) engine is torn down. Keeps DuckDB
   * warm across preview open/close and navigation so the WASM isn't re-fetched
   * or re-instantiated and extensions aren't reloaded on every preview; still
   * frees memory once the user leaves LoQE for longer than this.
   */
  private static readonly IDLE_GRACE_MS = 60_000;

  static acquire(config: LoQEConfig): LoQEEngine {
    // A consumer reappeared before the grace period elapsed — cancel teardown
    // and reuse the warm instance as-is.
    if (LoQEEngine.idleTimer !== null) {
      clearTimeout(LoQEEngine.idleTimer);
      LoQEEngine.idleTimer = null;
    }
    if (!LoQEEngine.instance) {
      LoQEEngine.instance = new LoQEEngine(config);
    }
    LoQEEngine.refCount++;
    return LoQEEngine.instance;
  }

  static release(): void {
    LoQEEngine.refCount--;
    if (LoQEEngine.refCount > 0) return;
    LoQEEngine.refCount = 0;
    // Defer teardown: if another consumer acquires within the grace window
    // (e.g. opening the next preview), `acquire` cancels this and reuses the
    // already-initialized engine, so `initialize()` short-circuits.
    if (LoQEEngine.instance && LoQEEngine.idleTimer === null) {
      LoQEEngine.idleTimer = setTimeout(() => {
        LoQEEngine.idleTimer = null;
        if (LoQEEngine.refCount <= 0 && LoQEEngine.instance) {
          LoQEEngine.instance.destroy();
          LoQEEngine.instance = null;
        }
      }, LoQEEngine.IDLE_GRACE_MS);
    }
  }

  /** Immediately destroy regardless of outstanding references. */
  static forceDestroy(): void {
    if (LoQEEngine.idleTimer !== null) {
      clearTimeout(LoQEEngine.idleTimer);
      LoQEEngine.idleTimer = null;
    }
    if (LoQEEngine.instance) {
      LoQEEngine.instance.destroy();
      LoQEEngine.instance = null;
      LoQEEngine.refCount = 0;
    }
  }

  // ── Instance state ──────────────────────────────────────────────────

  private db: AsyncDuckDB | null = null;
  private worker: Worker | null = null;
  private config: LoQEConfig;
  private _isInitialized = false;
  private _isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private _pool: ConnectionPool | null = null;
  private installedExtensions = new Set<string>();
  private _activeConnection: any = null;
  private _cancelRequested = false;
  // Bundled (self-hosted) extension repository, resolved at init from the app
  // origin. Used by default so extensions load offline instead of from the CDN.
  private bundledExtensionRepo = '';

  readonly tokens = new TokenManager();
  readonly catalogs = new CatalogManager(this.tokens);

  private constructor(config: LoQEConfig) {
    this.config = config;
  }

  // ── Getters ─────────────────────────────────────────────────────────

  get isInitialized(): boolean {
    return this._isInitialized;
  }
  get isInitializing(): boolean {
    return this._isInitializing;
  }
  get pool(): ConnectionPool {
    if (!this._pool) throw new Error('[LoQE] Engine not initialised — no pool');
    return this._pool;
  }

  // ── Initialisation ──────────────────────────────────────────────────

  /**
   * Initialise the engine. Safe to call multiple times — subsequent calls
   * return the same promise until initialisation completes.
   */
  async initialize(initialToken?: string): Promise<void> {
    if (this._isInitialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInitialize(initialToken);
    return this.initPromise;
  }

  private async _doInitialize(initialToken?: string): Promise<void> {
    this._isInitializing = true;

    try {
      // 1. Resolve DuckDB WASM bundles
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const basePath = pathname
        .replace(this.config.baseUrlPrefix, '')
        .split('/')
        .slice(0, 2)
        .join('/');
      const baseUrl = basePath ? `${origin}${this.config.baseUrlPrefix}${basePath}` : origin;
      // Airgap: install extensions from our own origin, never extensions.duckdb.org.
      // DuckDB appends `/v<version>/wasm_<platform>/<name>.duckdb_extension.wasm`
      // to this repo base, which matches the vendored layout under
      // public/duckdb/extensions/ (see vite.config copyDuckDBFiles). The core
      // build reports v1.5.5, and we vendor v1.5.5 extensions, so the ABI matches;
      // allowUnsignedExtensions (below) covers signature validation.
      // NOTE: keep the vendored extension versions in sync with the DuckDB core
      // version whenever @duckdb/duckdb-wasm is bumped, or INSTALL will 404.
      this.bundledExtensionRepo = `${baseUrl}/duckdb/extensions`;

      const bundles: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: `${baseUrl}/duckdb/duckdb-mvp.wasm`,
          mainWorker: `${baseUrl}/duckdb/duckdb-browser-mvp.worker.js`,
        },
        eh: {
          mainModule: `${baseUrl}/duckdb/duckdb-eh.wasm`,
          mainWorker: `${baseUrl}/duckdb/duckdb-browser-eh.worker.js`,
        },
      };

      const bundle = await duckdb.selectBundle(bundles);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);

      // 2. Create Web Worker via Blob URL (avoids CORS issues)
      const workerUrl = bundle.mainWorker!;
      const blobUrl = URL.createObjectURL(
        new Blob([`importScripts("${workerUrl}");`], { type: 'text/javascript' }),
      );
      this.worker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.worker.onerror = (e) => console.error('[LoQE] Worker error:', e);

      // 3. Instantiate DuckDB
      this.db = new duckdb.AsyncDuckDB(logger, this.worker);
      await this.db.instantiate(bundle.mainModule);

      // 4. Open in-memory database.
      // allowUnsignedExtensions: we serve our OWN vendored extensions from the
      // app origin (airgap). A pre-release/dev DuckDB core reports a version that
      // doesn't match the released signed extensions, so signature validation
      // fails ("signature is either missing or invalid"). Since we control the
      // extension binaries, allow unsigned so they load from our repo.
      await this.db.open({ allowUnsignedExtensions: true });

      // 5. Connection pool
      this._pool = new ConnectionPool(this.db, this.config.maxConnections ?? 4);

      // 5b. Airgap: pin the extension repository GLOBALLY (database-wide) so every
      // resolution path uses our self-hosted mirror instead of extensions.duckdb.org
      // — not just manual INSTALL, but also DuckDB's on-demand AUTOLOAD/autoinstall
      // of an extension a query references (e.g. `json` when a preview SELECT touches
      // a JSON/varchar column). Setting the repo only inside installExtension's
      // fallback missed those autoloaded extensions, which still hit the CDN.
      {
        const settingsStore = useDuckDBSettingsStore();
        const repo = (settingsStore.extensionRepository ?? '').trim() || this.bundledExtensionRepo;
        if (repo) {
          const conn = await this._pool.acquire();
          try {
            // Escape single quotes to keep a user-supplied repo URL from breaking
            // the statement (SQL string-literal escaping is doubling the quote).
            const escapedRepo = repo.replace(/'/g, "''");
            await conn.connection.query(`SET custom_extension_repository = '${escapedRepo}'`);
            // Newer DuckDB uses a dedicated setting for autoload; best-effort so an
            // older core that lacks it doesn't fail init.
            try {
              await conn.connection.query(
                `SET autoinstall_extension_repository = '${escapedRepo}'`,
              );
            } catch (e) {
              console.debug('[LoQE] autoinstall_extension_repository not supported', e);
            }
          } catch (e) {
            // A malformed/unsupported repo setting must not fail the whole engine;
            // extensions would just fall back to their default resolution.
            console.warn('[LoQE] Failed to pin extension repository', e);
          } finally {
            this._pool.release(conn);
          }
        }
      }

      // 6. Token manager
      this.tokens.initialize(this.db, initialToken ?? '');

      // 7. Catalog manager
      this.catalogs.initialize(this.db);

      this._isInitialized = true;
      console.info('%c[LoQE] engine ready', 'color:#1976d2');
    } catch (e) {
      console.error('[LoQE] Initialisation failed:', e);
      throw e;
    } finally {
      this._isInitializing = false;
      this.initPromise = null;
    }
  }

  // ── Query execution ─────────────────────────────────────────────────

  /**
   * Hard cap on rows materialized into JS to prevent browser OOM crashes.
   * @deprecated Read from useDuckDBSettingsStore().maxResultRows at runtime.
   */
  static readonly MAX_RESULT_ROWS = DUCKDB_DEFAULTS.maxResultRows;

  async query(sql: string): Promise<LoQEQueryResult> {
    if (!this._isInitialized || !this._pool) {
      await this.initialize();
    }

    const settingsStore = useDuckDBSettingsStore();

    // ── Memory guardrail ──────────────────────────────────────────
    const memCheck = settingsStore.checkMemory();
    if (!memCheck.ok && memCheck.reason === 'blocked') {
      throw new Error(memCheck.message);
    }

    const maxRows = settingsStore.maxResultRows;
    const timeoutMs = settingsStore.queryTimeoutMs;

    this._cancelRequested = false;
    const start = performance.now();
    const pooled = await this.pool.acquire();
    this._activeConnection = pooled.connection;

    try {
      // ── Timeout guardrail ─────────────────────────────────────────
      const exec = async (q: string): Promise<any> => {
        if (timeoutMs > 0) {
          const queryPromise = pooled.connection.query(q);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Query timed out after ${settingsStore.queryTimeoutSeconds}s. ` +
                      `You can increase the timeout in Settings.`,
                  ),
                ),
              timeoutMs,
            );
          });
          return Promise.race([queryPromise, timeoutPromise]);
        }
        return pooled.connection.query(q);
      };

      let result: any;
      try {
        result = await exec(sql);
      } catch (err: any) {
        // Log the failing statement and the FULL error — DuckDB's `.message` is
        // often empty (e.g. "Invalid Configuration Error:"), so dump everything.
        console.error(`[LoQE] query FAILED on SQL:\n${sql}\n`, describeError(err));
        const msg = String(err?.message ?? err);

        // Retry A: DuckDB can't serialize VARIANT (and a few other types) to Arrow
        // for transport to JS. Retry once casting those columns to text so the
        // result is at least viewable (value shown as JSON/text).
        const casted = /unsupported arrow type/i.test(msg)
          ? await this.buildArrowSafeQuery(pooled.connection, sql)
          : null;
        if (!casted) throw friendlyQueryError(err, msg);
        result = await exec(casted);
      }
      const elapsed = performance.now() - start;

      const columns = result.schema.fields.map((f: any) => f.name);
      const rows: any[][] = [];
      const totalRows = result.numRows;
      const rowsToRead = Math.min(totalRows, maxRows);

      // ── Result-size guardrail (works on all browsers) ──────────
      const sizeCheck = settingsStore.checkResultSize(rowsToRead, columns.length);
      if (!sizeCheck.ok) {
        throw new Error(sizeCheck.message);
      }

      // Yield to the browser event loop every BATCH_SIZE rows so the
      // main thread stays responsive during large result sets.
      const BATCH_SIZE = 2000;

      for (let i = 0; i < rowsToRead; i++) {
        const row: any[] = [];
        for (let j = 0; j < result.numCols; j++) {
          // Flattened here, at the boundary: an Arrow struct/map row is a proxy
          // that Vue's reactive() cannot wrap (see toPlainCellValue).
          row.push(toPlainCellValue(result.getChildAt(j)?.get(i)));
        }
        rows.push(row);

        if (i > 0 && i % BATCH_SIZE === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
          if (this._cancelRequested) throw new Error('Query cancelled.');
        }
      }

      return {
        columns,
        rows,
        rowCount: rows.length,
        totalRowCount: totalRows,
        truncated: totalRows > maxRows,
        executionTimeMs: elapsed,
      };
    } finally {
      this._activeConnection = null;
      this.pool.release(pooled);
    }
  }

  cancelCurrentQuery(): void {
    this._cancelRequested = true;
    this._activeConnection?.cancelSent().catch(() => {});
  }

  /**
   * Build a VARIANT-safe rewrite of a SELECT query: DESCRIBE it, and if any
   * column is a VARIANT (which has no Arrow representation), wrap the original
   * query and CAST those columns to VARCHAR. Returns null when the query isn't a
   * single SELECT/WITH, can't be described, or has no VARIANT columns.
   */
  private async buildArrowSafeQuery(connection: any, sql: string): Promise<string | null> {
    const trimmed = sql.trim().replace(/;\s*$/, '');
    // Only wrap a single SELECT/WITH statement — never DDL, PRAGMA, multi-stmt.
    if (!/^(select|with)\b/i.test(trimmed) || /;/.test(trimmed)) return null;

    let desc: any;
    try {
      desc = await connection.query(`DESCRIBE ${trimmed}`);
    } catch {
      return null;
    }

    const names = desc.getChild('column_name');
    const types = desc.getChild('column_type');
    if (!names || !types) return null;

    let hasVariant = false;
    const projection: string[] = [];
    for (let i = 0; i < desc.numRows; i++) {
      const name = String(names.get(i));
      const type = String(types.get(i) ?? '');
      const q = `"${name.replace(/"/g, '""')}"`;
      if (/variant/i.test(type)) {
        hasVariant = true;
        // CAST(... AS JSON) yields real JSON text and serializes to Arrow as a
        // string (unlike VARIANT, which has no Arrow type). CAST(... AS VARCHAR)
        // would instead give DuckDB's struct notation ({'k': v}), not JSON.
        projection.push(`CAST(${q} AS JSON) AS ${q}`);
      } else {
        projection.push(q);
      }
    }
    if (!hasVariant) return null;

    return `SELECT ${projection.join(', ')} FROM (${trimmed}) AS _loqe_arrow_safe`;
  }

  // ── Extension management ────────────────────────────────────────────

  /**
   * Free as much DuckDB WASM / JS-heap memory as possible without
   * destroying the engine. Safe to call at any time — the engine
   * remains usable afterwards.
   *
   * What it does:
   *   1. Closes idle pooled connections (active ones are left alone).
   *   2. Runs `CHECKPOINT` to flush the WAL and release pages.
   *   3. Runs `PRAGMA shrink_memory` (DuckDB ≥ 0.10) to return
   *      buffer-manager memory to the OS / WASM linear memory.
   *
   * Returns an object with before/after memory stats when available.
   */
  async freeMemory(): Promise<{
    idleConnectionsClosed: number;
    beforeMB: number | null;
    afterMB: number | null;
  }> {
    if (!this._isInitialized || !this._pool) {
      return { idleConnectionsClosed: 0, beforeMB: null, afterMB: null };
    }

    const perf = performance as any;
    const beforeMB: number | null = perf.memory?.usedJSHeapSize
      ? Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
      : null;

    // 1. Close idle pool connections
    const closed = await this._pool.drainIdle();

    // 2. CHECKPOINT + shrink_memory via a temporary connection
    const pooled = await this._pool.acquire();
    try {
      try {
        await pooled.connection.query('CHECKPOINT');
      } catch {
        /* non-critical */
      }
      try {
        await pooled.connection.query('PRAGMA shrink_memory');
      } catch {
        /* shrink_memory may not exist in older builds — ignore */
      }
    } finally {
      this._pool.release(pooled);
    }

    const afterMB: number | null = perf.memory?.usedJSHeapSize
      ? Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
      : null;

    console.log(
      `[LoQE] freeMemory: closed ${closed} idle connections, ` +
        `memory ${beforeMB ?? '?'}→${afterMB ?? '?'} MB`,
    );

    return { idleConnectionsClosed: closed, beforeMB, afterMB };
  }

  async installExtension(name: string): Promise<void> {
    if (!this._isInitialized) throw new Error('[LoQE] Not initialised');

    const pooled = await this.pool.acquire();
    try {
      // iceberg/httpfs/avro/parquet/json are statically built into the duckdb-wasm
      // binary (which we self-host at /duckdb/*.wasm), so just LOAD them — no
      // INSTALL, no `custom_extension_repository`, no network. This is fully
      // airgapped and avoids extension/core ABI mismatches ("Unknown ABI type").
      // Only if LOAD fails (the extension isn't builtin in this build) do we fall
      // back to INSTALL from the configured repo.
      try {
        await pooled.connection.query(`LOAD ${name}`);
      } catch (loadErr) {
        console.warn(
          `[LoQE] LOAD ${name} not builtin; falling back to INSTALL from repo\n`,
          describeError(loadErr),
        );
        const settingsStore = useDuckDBSettingsStore();
        const repo = (settingsStore.extensionRepository ?? '').trim() || this.bundledExtensionRepo;
        if (repo) {
          await pooled.connection.query(`SET custom_extension_repository = '${repo}'`);
        }
        await pooled.connection.query(`INSTALL ${name}`);
        await pooled.connection.query(`LOAD ${name}`);
      }
      this.installedExtensions.add(name);
    } finally {
      this.pool.release(pooled);
    }
  }

  /**
   * Remove an extension from the tracked set.  DuckDB WASM cannot
   * truly unload an extension from memory, but removing it here
   * prevents it from being re-installed on the next page load.
   */
  removeExtension(name: string): void {
    this.installedExtensions.delete(name);
  }

  /** Batch-install a list of extensions (best-effort). */
  async loadExtensions(extensions: string[]): Promise<void> {
    for (const ext of extensions) {
      try {
        await this.installExtension(ext);
      } catch (e) {
        console.warn(`[LoQE] Skipped extension "${ext}":`, e);
      }
    }
  }

  async getInstalledExtensions(): Promise<LoQEExtension[]> {
    if (!this._isInitialized) return [];

    const result = await this.query(
      `SELECT extension_name, installed, loaded
       FROM duckdb_extensions()
       WHERE installed = true`,
    );
    return result.rows.map((row) => ({
      name: String(row[0]),
      installed: Boolean(row[1]),
      loaded: Boolean(row[2]),
    }));
  }

  // ── Catalog shortcuts ───────────────────────────────────────────────

  /**
   * Install httpfs + iceberg if needed, then attach an Iceberg REST
   * catalog via `CatalogManager`.
   */
  async attachCatalog(config: LoQECatalogConfig): Promise<void> {
    if (!this._isInitialized) throw new Error('[LoQE] Not initialised');

    // Ensure required extensions are loaded BEFORE iceberg. The modern iceberg
    // reader depends on avro (manifests) and parquet (data files) and will
    // auto-install them at init; pre-installing from our bundled repo keeps the
    // whole chain airgapped (otherwise iceberg's init pulls them from the CDN).
    // json is needed for the VARIANT -> JSON cast used to make variant columns
    // Arrow-serializable (see buildArrowSafeQuery).
    for (const dep of ['httpfs', 'avro', 'parquet', 'json']) {
      if (!this.installedExtensions.has(dep)) {
        await this.installExtension(dep);
      }
    }

    // azure_wasm (community extension) provides the `abfss://` filesystem and
    // registers the `azure` secret type. It must be loaded BEFORE the first scan:
    // iceberg turns the vended `adls.sas-token.*` config into a `TYPE azure`
    // secret, and without a registered type DuckDB would autoload the official
    // `azure` extension — which has no wasm build, so it 404s in our mirror.
    // Best-effort: s3/gcs warehouses don't need it, so a missing binary (older
    // vendored mirror, core version without a community build) must not break ATTACH.
    if (!this.installedExtensions.has('azure_wasm')) {
      try {
        await this.installExtension('azure_wasm');
      } catch (e) {
        console.warn('[LoQE] azure_wasm unavailable — ADLS warehouses will not be readable', e);
      }
    }

    if (!this.installedExtensions.has('iceberg')) {
      await this.installExtension('iceberg');
    }

    await this.catalogs.attachCatalog(config);
  }

  async detachCatalog(catalogName: string): Promise<void> {
    await this.catalogs.detachCatalog(catalogName);
  }

  /**
   * Drop DuckDB's cached iceberg metadata by DETACHing + re-ATTACHing all
   * catalogs, so the next query re-reads the current snapshot. Use when a read
   * 404s on a `snap-*.avro` that still exists (DuckDB is on a stale, now-expired
   * snapshot while the table itself is healthy).
   */
  async refreshMetadata(): Promise<void> {
    if (!this._isInitialized) return;
    await this.catalogs.reattachAll();
  }

  // ── Internals ───────────────────────────────────────────────────────

  /** Expose the raw AsyncDuckDB for advanced consumers. */
  getDB(): AsyncDuckDB | null {
    return this.db;
  }

  private destroy(): void {
    this.tokens.dispose();
    this.catalogs.dispose();
    this._pool?.drain().catch(() => {});
    this._pool = null;

    if (this.db) {
      this.db.terminate().catch(() => {});
      this.db = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this._isInitialized = false;
    this.installedExtensions.clear();
  }
}
