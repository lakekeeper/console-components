import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue';
import { LoQEEngine } from './loqe/LoQEEngine';
import type { LoQEConfig, LoQEQueryResult, LoQECatalogConfig } from './loqe/types';
import { useLoQEStore } from '../stores/loqe';
import { useUserStore } from '../stores/user';

/**
 * `useLoQE` — the primary Vue composable for the LoQE local query engine.
 *
 * Manages a reference-counted singleton `LoQEEngine`, wires up Vue
 * watchers for token refresh, and delegates persistence to the
 * `useLoQEStore` Pinia store.
 *
 * The existing `useDuckDB` / `useIcebergDuckDB` composables are left
 * completely untouched — LoQE is an independent, parallel system.
 */
export function useLoQE(config: LoQEConfig) {
  const engine = LoQEEngine.acquire(config);
  const store = useLoQEStore();
  const userStore = useUserStore();

  // ── Reactive state ────────────────────────────────────────────────

  const isInitialized = ref(engine.isInitialized);
  const isInitializing = ref(false);
  const error: Ref<string | null> = ref(null);
  const lastResult: Ref<LoQEQueryResult | null> = ref(null);
  const isQuerying = ref(false);

  // Promise dedup — prevents concurrent callers from each running their
  // own catalog restore.  Similar to the engine-level initPromise.
  let composableInitPromise: Promise<void> | null = null;

  const poolStats = computed(() => {
    try {
      return {
        size: engine.pool.size,
        active: engine.pool.activeCount,
        available: engine.pool.availableCount,
        queued: engine.pool.queuedCount,
        max: engine.pool.maxPoolSize,
      };
    } catch {
      return { size: 0, active: 0, available: 0, queued: 0, max: 0 };
    }
  });

  const attachedCatalogs = computed(() => engine.catalogs.getAttachedCatalogs());

  // ── Token refresh watcher ─────────────────────────────────────────

  const stopTokenWatch = watch(
    () => userStore.user.access_token,
    async (newToken, oldToken) => {
      if (newToken && newToken !== oldToken && engine.isInitialized) {
        try {
          // DuckDB's Iceberg extension caches the token at ATTACH
          // time, so we must DETACH + re-ATTACH to pick up the new
          // token.  refreshAllCatalogs handles secret + catalog.
          await engine.catalogs.refreshAllCatalogs(newToken);
        } catch (e) {
          console.error('[LoQE] Token refresh failed:', e);
        }

        // Restore any persisted catalogs that aren't yet attached.
        // This covers the common case where the engine initialised
        // before the OAuth token was available.
        await restoreMissingCatalogs(newToken);
      }
    },
  );

  /**
   * Attach persisted catalogs that are not yet live in the engine.
   * Called from the token watcher so that catalogs whose initial
   * restore failed (e.g. empty token at mount time) get a second
   * chance once authentication completes.
   */
  async function restoreMissingCatalogs(token: string): Promise<void> {
    const persistedCatalogs = Object.values(store.attachedCatalogs);
    const attachedNames = new Set(engine.catalogs.getAttachedCatalogs().map((c) => c.catalogName));
    const missing = persistedCatalogs.filter((c) => !attachedNames.has(c.catalogName));

    if (missing.length === 0) return;

    const results = await Promise.allSettled(
      missing.map((cat) =>
        engine.attachCatalog({
          catalogName: cat.catalogName,
          restUri: cat.restUri,
          accessToken: token,
          projectId: cat.projectId,
        }),
      ),
    );

    // Token is now available — if a catalog still fails, it's a real
    // problem so remove it from persistence to stop retrying.
    results.forEach((result, idx) => {
      const cat = missing[idx];
      if (result.status === 'rejected') {
        console.warn(`[LoQE] Failed to restore catalog "${cat.catalogName}":`, result.reason);
        store.removeCatalog(cat.catalogName);
      }
    });
  }

  // ── Actions ───────────────────────────────────────────────────────

  async function initialize(): Promise<void> {
    if (isInitialized.value) return;
    if (composableInitPromise) return composableInitPromise;
    composableInitPromise = _doComposableInit();
    return composableInitPromise;
  }

  async function _doComposableInit(): Promise<void> {
    isInitializing.value = true;
    error.value = null;

    try {
      const token = userStore.user?.access_token ?? '';
      await engine.initialize(token);

      // Restore extensions from previous sessions
      if (store.installedExtensions.length > 0) {
        await engine.loadExtensions(store.installedExtensions);
      }

      // Restore catalogs from previous sessions
      const persistedCatalogs = Object.values(store.attachedCatalogs);
      if (persistedCatalogs.length > 0) {
        const reattachResults = await Promise.allSettled(
          persistedCatalogs.map((cat) =>
            engine.attachCatalog({
              catalogName: cat.catalogName,
              restUri: cat.restUri,
              accessToken: token,
              projectId: cat.projectId,
            }),
          ),
        );

        // Log failures but keep catalogs in the store — the token
        // watcher will retry once the auth token becomes available.
        reattachResults.forEach((result, idx) => {
          const cat = persistedCatalogs[idx];
          if (result.status === 'rejected') {
            console.warn(
              `[LoQE] Failed to restore catalog "${cat.catalogName}" (will retry when token refreshes):`,
              result.reason,
            );
          }
        });
      }

      isInitialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialise LoQE';
      // Allow retry on next call
      composableInitPromise = null;
      throw e;
    } finally {
      isInitializing.value = false;
    }
  }

  async function query(sql: string): Promise<LoQEQueryResult> {
    if (!isInitialized.value) await initialize();

    isQuerying.value = true;
    error.value = null;
    const start = Date.now();

    try {
      const result = await engine.query(sql);
      lastResult.value = result;

      store.addHistoryEntry({
        id: crypto.randomUUID(),
        sql,
        executedAt: start,
        durationMs: result.executionTimeMs,
        rowCount: result.rowCount,
      });

      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error.value = msg;

      store.addHistoryEntry({
        id: crypto.randomUUID(),
        sql,
        executedAt: start,
        durationMs: Date.now() - start,
        rowCount: 0,
        error: msg,
      });

      throw e;
    } finally {
      isQuerying.value = false;
    }
  }

  async function installExtension(name: string): Promise<void> {
    if (!isInitialized.value) await initialize();
    await engine.installExtension(name);
    store.addExtension(name);
  }

  function removeExtension(name: string): void {
    engine.removeExtension(name);
    store.removeExtension(name);
  }

  async function getExtensions() {
    if (!isInitialized.value) await initialize();
    return engine.getInstalledExtensions();
  }

  async function attachCatalog(catalogConfig: LoQECatalogConfig): Promise<void> {
    if (!isInitialized.value) await initialize();
    await engine.attachCatalog(catalogConfig);
    store.addCatalog(catalogConfig.catalogName, {
      catalogName: catalogConfig.catalogName,
      restUri: catalogConfig.restUri,
      projectId: catalogConfig.projectId,
    });
  }

  async function detachCatalog(catalogName: string): Promise<void> {
    await engine.detachCatalog(catalogName);
    store.removeCatalog(catalogName);
  }

  /**
   * Free DuckDB WASM memory without destroying the engine.
   * Clears cached query results, closes idle connections, runs
   * CHECKPOINT + PRAGMA shrink_memory inside DuckDB.
   */
  async function freeMemory(): Promise<{
    idleConnectionsClosed: number;
    beforeMB: number | null;
    afterMB: number | null;
  }> {
    // Release the JS-heap arrays held by the last result
    lastResult.value = null;
    error.value = null;

    return engine.freeMemory();
  }

  /**
   * Lazy completion fetcher — given a dot-qualifier typed in the editor,
   * returns the list of names to offer after the last dot.
   *
   * Handles every qualification level via targeted DuckDB metadata queries:
   *   1 part  ("catalog.")          → schemas in that catalog
   *   2 parts ("catalog.schema.")   → tables/views in that schema
   *   3 parts ("catalog.schema.t.") → columns in that table
   *   1 part  ("table.")            → columns (fallback when no schemas match)
   *   2 parts ("schema.table.")     → columns (fallback when no tables match)
   */
  const _completionCache = new Map<string, string[]>();

  async function fetchCompletions(qualifier: string): Promise<string[]> {
    const cached = _completionCache.get(qualifier);
    if (cached) return cached;

    if (!engine.isInitialized || !engine.pool) return [];

    // Empty qualifier = list all catalog names
    if (!qualifier) {
      const pooled = await engine.pool.acquire();
      try {
        const names = await queryColumn(
          pooled.connection,
          `SELECT DISTINCT database_name FROM duckdb_databases()
           WHERE database_name NOT IN ('system', 'temp')
           ORDER BY database_name LIMIT 200`,
        );
        if (names.length > 0) _completionCache.set(qualifier, names);
        return names;
      } catch {
        return [];
      } finally {
        engine.pool.release(pooled);
      }
    }

    const parts = qualifier.split('.');
    const pooled = await engine.pool.acquire();
    try {
      let names: string[] = [];

      if (parts.length === 1) {
        // Try as catalog → return schema names
        names = await queryColumn(
          pooled.connection,
          `SELECT DISTINCT schema_name FROM duckdb_schemas()
           WHERE database_name = '${esc(parts[0])}'
             AND schema_name NOT IN ('information_schema', 'pg_catalog')
           ORDER BY schema_name LIMIT 2000`,
        );
        // Fallback: try as bare table name → return columns
        if (names.length === 0) {
          names = await queryColumn(
            pooled.connection,
            `SELECT column_name FROM duckdb_columns()
             WHERE table_name = '${esc(parts[0])}'
               AND database_name NOT IN ('system', 'temp')
               AND schema_name NOT IN ('information_schema', 'pg_catalog')
             ORDER BY column_index LIMIT 2000`,
          );
        }
      } else if (parts.length === 2) {
        // Try as catalog.schema → return table/view names
        names = await queryColumn(
          pooled.connection,
          `SELECT DISTINCT table_name FROM duckdb_tables()
           WHERE database_name = '${esc(parts[0])}' AND schema_name = '${esc(parts[1])}'
           UNION
           SELECT DISTINCT view_name FROM duckdb_views()
           WHERE database_name = '${esc(parts[0])}' AND schema_name = '${esc(parts[1])}'
           ORDER BY 1 LIMIT 2000`,
        );
        // Fallback: schema.table → return columns
        if (names.length === 0) {
          names = await queryColumn(
            pooled.connection,
            `SELECT column_name FROM duckdb_columns()
             WHERE schema_name = '${esc(parts[0])}' AND table_name = '${esc(parts[1])}'
               AND database_name NOT IN ('system', 'temp')
             ORDER BY column_index LIMIT 2000`,
          );
        }
      } else if (parts.length >= 3) {
        // catalog.schema.table → return columns
        // Try DESCRIBE first — it works reliably for Iceberg / REST-catalog tables
        // even when duckdb_columns() has stale or incomplete metadata.
        try {
          names = await queryColumn(
            pooled.connection,
            `SELECT column_name FROM (DESCRIBE "${parts[0]}"."${parts[1]}"."${parts[2]}")`,
          );
        } catch {
          // DESCRIBE may fail if table doesn't exist — fall through
        }
        // Fallback to duckdb_columns() if DESCRIBE returned nothing
        if (names.length === 0) {
          names = await queryColumn(
            pooled.connection,
            `SELECT column_name FROM duckdb_columns()
             WHERE database_name = '${esc(parts[0])}' AND schema_name = '${esc(parts[1])}' AND table_name = '${esc(parts[2])}'
             ORDER BY column_index LIMIT 2000`,
          );
        }
      }

      if (names.length > 0) {
        _completionCache.set(qualifier, names);
      }
      return names;
    } catch (e) {
      console.warn(`[LoQE] Completion fetch failed for "${qualifier}":`, e);
      return [];
    } finally {
      engine.pool.release(pooled);
    }
  }

  /** Helper: run a query and return the first column as string[]. */
  async function queryColumn(conn: any, sql: string): Promise<string[]> {
    const result = await conn.query(sql);
    const out: string[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const v = result.getChildAt(0)?.get(i);
      if (v != null) out.push(String(v));
    }
    return out;
  }

  /** Escape single quotes in SQL identifiers. */
  function esc(s: string): string {
    return s.replace(/'/g, "''");
  }

  /** Clear the completion cache (e.g. after catalog attach/detach). */
  function clearCompletionCache(): void {
    _completionCache.clear();
  }

  async function resetDatabase(): Promise<void> {
    LoQEEngine.forceDestroy();
    store.$reset();
    isInitialized.value = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  onBeforeUnmount(() => {
    stopTokenWatch();
    LoQEEngine.release();
    isInitialized.value = false;
  });

  // ── Public surface ────────────────────────────────────────────────

  return {
    // State
    isInitialized,
    isInitializing,
    isQuerying,
    error,
    lastResult,
    poolStats,
    attachedCatalogs,

    // Actions
    initialize,
    query,
    installExtension,
    removeExtension,
    getExtensions,
    attachCatalog,
    detachCatalog,
    freeMemory,
    resetDatabase,
    fetchCompletions,
    clearCompletionCache,

    // Advanced
    engine,
    store,
  };
}
