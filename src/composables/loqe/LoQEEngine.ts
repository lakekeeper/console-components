import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { LoQEConfig, LoQEQueryResult, LoQECatalogConfig, LoQEExtension } from './types';
import { ConnectionPool } from './ConnectionPool';
import { TokenManager } from './TokenManager';
import { CatalogManager } from './CatalogManager';
import { useDuckDBSettingsStore, DUCKDB_DEFAULTS } from '@/stores/duckdbSettings';

/**
 * LoQEEngine — reference-counted singleton that owns the DuckDB WASM
 * lifecycle including connection pooling, token refresh, and catalog
 * management.
 *
 * Consumers call `LoQEEngine.acquire(config)` to obtain the shared
 * instance (creating it on the first call) and `LoQEEngine.release()`
 * when they no longer need it. The engine is destroyed only when the
 * last consumer releases.
 *
 * This class has **no Vue dependency** so it can be unit-tested outside
 * of a component tree. The Vue-specific wiring (watchers, lifecycle
 * hooks, Pinia) lives in `useLoQE`.
 */
export class LoQEEngine {
  // ── Singleton bookkeeping ───────────────────────────────────────────

  private static instance: LoQEEngine | null = null;
  private static refCount = 0;

  static acquire(config: LoQEConfig): LoQEEngine {
    if (!LoQEEngine.instance) {
      LoQEEngine.instance = new LoQEEngine(config);
    }
    LoQEEngine.refCount++;
    return LoQEEngine.instance;
  }

  static release(): void {
    LoQEEngine.refCount--;
    if (LoQEEngine.refCount <= 0 && LoQEEngine.instance) {
      LoQEEngine.instance.destroy();
      LoQEEngine.instance = null;
      LoQEEngine.refCount = 0;
    }
  }

  /** Immediately destroy regardless of outstanding references. */
  static forceDestroy(): void {
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

      // 4. Open in-memory database
      await this.db.open({});

      // 5. Connection pool
      this._pool = new ConnectionPool(this.db, this.config.maxConnections ?? 4);

      // 6. Token manager
      this.tokens.initialize(this.db, initialToken ?? '');

      // 7. Catalog manager
      this.catalogs.initialize(this.db);

      this._isInitialized = true;
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

    const start = performance.now();
    const pooled = await this.pool.acquire();

    try {
      // ── Timeout guardrail ─────────────────────────────────────────
      let result: any;
      if (timeoutMs > 0) {
        const queryPromise = pooled.connection.query(sql);
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
        result = await Promise.race([queryPromise, timeoutPromise]);
      } else {
        result = await pooled.connection.query(sql);
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
          row.push(result.getChildAt(j)?.get(i));
        }
        rows.push(row);

        if (i > 0 && i % BATCH_SIZE === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
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
      this.pool.release(pooled);
    }
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
      // Apply or reset custom extension repository URL
      const settingsStore = useDuckDBSettingsStore();
      const repo = (settingsStore.extensionRepository ?? '').trim();
      if (repo) {
        await pooled.connection.query(`SET custom_extension_repository = '${repo}'`);
      } else {
        // Reset to DuckDB built-in default so a previously SET value doesn't linger
        await pooled.connection.query(`RESET custom_extension_repository`);
      }

      await pooled.connection.query(`INSTALL ${name}`);
      await pooled.connection.query(`LOAD ${name}`);
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

    // Ensure required extensions are loaded
    if (!this.installedExtensions.has('httpfs')) {
      const pooled = await this.pool.acquire();
      try {
        await pooled.connection.query('SET builtin_httpfs = false');
        await pooled.connection.query('INSTALL httpfs');
        await pooled.connection.query('LOAD httpfs');
        this.installedExtensions.add('httpfs');
      } finally {
        this.pool.release(pooled);
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
