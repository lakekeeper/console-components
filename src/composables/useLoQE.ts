import { ref, computed, watch, effectScope, onBeforeUnmount, type Ref } from 'vue';
import { LoQEEngine } from './loqe/LoQEEngine';
import type {
  LoQEConfig,
  LoQEQueryResult,
  LoQECatalogConfig,
  SqlCompletionItem,
} from './loqe/types';
import { useLoQEStore } from '../stores/loqe';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';
import { persistedCatalogKey } from './loqe/catalogIdentity';
import { ident, literal, sql, sqlText, type Sql } from './loqe/sql';
import type { SqlConnection } from './loqe/SqlConnection';

// ── DuckDB error rewriting ────────────────────────────────────────────

const HTTP_ERROR_RE =
  /HTTP Error:\s*\w+ request to endpoint '([^']+)' returned an error response \(HTTP (\d{3})\)/i;

// Patterns to identify which catalog resource the failed URL targeted
const URL_TABLE_RE = /\/namespaces\/([^/]+)\/tables\/([^/?]+)/;
const URL_VIEW_RE = /\/namespaces\/([^/]+)\/views\/([^/?]+)/;
// Only match direct namespace URLs, NOT ?parent= probes (those are
// internal DuckDB namespace-resolution calls with meaningless names)
const URL_NS_RE = /\/namespaces\/([^/?]+)(?:$|[?/])/;

/** Extract a human-readable resource description from the failed URL. */
function describeResource(url: string): string | null {
  let m = URL_TABLE_RE.exec(url);
  if (m) return `table "${m[1]}.${m[2]}"`;

  m = URL_VIEW_RE.exec(url);
  if (m) return `view "${m[1]}.${m[2]}"`;

  m = URL_NS_RE.exec(url);
  if (m) return `namespace "${m[1]}"`;

  return null;
}

/**
 * Rewrite raw DuckDB WASM error messages into human-friendly text.
 *
 * DuckDB's REST-catalog HTTP errors look like:
 *   "HTTP Error: GET request to endpoint '…' returned an error response
 *    (HTTP 404). Reason: Please consult the browser console …"
 * which is confusing for end-users. We extract the status code and the
 * URL to produce a precise, actionable message.
 */
function humanizeDuckDBError(raw: string): string {
  const m = HTTP_ERROR_RE.exec(raw);
  if (!m) return raw;

  const url = m[1];
  const status = Number(m[2]);
  const resource = describeResource(url);

  if (status === 401) {
    return 'Authentication required — your session may have expired. Please log in again.';
  }
  if (status === 403) {
    return resource
      ? `Access denied — you do not have permission to access ${resource}.`
      : 'Access denied — you do not have permission to access one or more of the referenced tables or namespaces.';
  }
  if (status === 404) {
    return resource
      ? `Not found — ${resource} does not exist or you do not have permission to see it.`
      : 'Not found — the referenced warehouse, namespace, or table does not exist (or you lack permission to see it).';
  }
  if (status === 419) {
    return 'Session expired — please log in again.';
  }
  if (status >= 500) {
    return `Server error (HTTP ${status}) — the catalog server encountered an internal error. Please try again later.`;
  }
  // For other 4xx codes, still rewrite to remove the misleading CORS hint
  return `HTTP ${status} error from the catalog server.`;
}

/**
 * `useLoQE` — the primary Vue composable for the LoQE local query engine.
 *
 * Manages a reference-counted singleton `LoQEEngine`, wires up Vue
 * watchers for token refresh, and delegates persistence to the
 * `useLoQEStore` Pinia store.
 *
 * All DuckDB usage is consolidated through LoQE — the old `useDuckDB`
 * and `useIcebergDuckDB` composables have been removed.
 */
/**
 * Owns the page-wide project-switch watcher (see below). Detached, so the watcher
 * is not collected with whichever component happened to call `useLoQE` first.
 */
const projectWatchScope = effectScope(true);
let projectWatchStarted = false;

export function useLoQE(config: LoQEConfig) {
  const engine = LoQEEngine.acquire(config);
  const store = useLoQEStore();
  const userStore = useUserStore();
  const visualStore = useVisualStore();

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

  const currentProjectId = (): string | undefined =>
    visualStore.projectSelected['project-id'] || undefined;

  /** Persisted catalogs belonging to the project that is currently selected. */
  const catalogsOfCurrentProject = () =>
    Object.values(store.attachedCatalogs).filter((c) => c.projectId === currentProjectId());

  // ── Project switch watcher ────────────────────────────────────────
  //
  // Catalog aliases are bare warehouse names, and a name is unique only within a
  // project — two projects can each have a `sales`. Drop the previous project's
  // catalogs so a query can never resolve against the wrong warehouse.
  //
  // Registered once per page, not per caller, and never stopped: switching project
  // routes to Home, which unmounts every LoQE view, so a watcher owned by a
  // component would be disposed before — or instead of — doing this. The engine it
  // cleans up is a singleton that outlives those components.
  if (!projectWatchStarted) {
    projectWatchStarted = true;
    projectWatchScope.run(() =>
      watch(
        () => visualStore.projectSelected['project-id'],
        async (projectId) => {
          const live = LoQEEngine.current;
          if (!live?.isInitialized) return;
          try {
            await live.catalogs.detachForeignCatalogs(projectId || undefined);
          } catch (e) {
            console.error('[LoQE] Failed to detach catalogs of the previous project:', e);
          }
        },
      ),
    );
  }

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
    const persistedCatalogs = catalogsOfCurrentProject();
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
        store.removeCatalog(persistedCatalogKey(cat.projectId, cat.catalogName));
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
      const persistedCatalogs = catalogsOfCurrentProject();
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

  /** Run a statement; `tabId` files its history entry under that query tab. */
  async function query(statement: Sql, options: { tabId?: string } = {}): Promise<LoQEQueryResult> {
    const text = sqlText(statement);
    if (!isInitialized.value) await initialize();

    isQuerying.value = true;
    error.value = null;
    const start = Date.now();

    try {
      const result = await engine.query(statement);
      lastResult.value = result;

      store.addHistoryEntry({
        id: crypto.randomUUID(),
        sql: text,
        executedAt: start,
        durationMs: result.executionTimeMs,
        rowCount: result.rowCount,
        ...(options.tabId ? { tabId: options.tabId } : {}),
      });

      return result;
    } catch (e) {
      const msg = humanizeDuckDBError(e instanceof Error ? e.message : String(e));
      error.value = msg;

      store.addHistoryEntry({
        id: crypto.randomUUID(),
        sql: text,
        executedAt: start,
        durationMs: Date.now() - start,
        rowCount: 0,
        error: msg,
        ...(options.tabId ? { tabId: options.tabId } : {}),
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

  /**
   * Register an in-memory file buffer with DuckDB and run a query against it,
   * then drop the file. Used by the storage explorer to preview a downloaded
   * object (parquet/csv) without DuckDB needing its own storage/CORS access —
   * we supply the bytes ourselves.
   */
  async function queryBuffer(fileName: string, bytes: Uint8Array, statement: Sql) {
    if (!isInitialized.value) await initialize();
    await engine.registerFileBuffer(fileName, bytes);
    try {
      return await engine.query(statement);
    } finally {
      try {
        await engine.dropFile(fileName);
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  async function attachCatalog(catalogConfig: LoQECatalogConfig): Promise<void> {
    if (!isInitialized.value) await initialize();
    await engine.attachCatalog(catalogConfig);
    store.addCatalog(persistedCatalogKey(catalogConfig.projectId, catalogConfig.catalogName), {
      catalogName: catalogConfig.catalogName,
      restUri: catalogConfig.restUri,
      projectId: catalogConfig.projectId,
    });
  }

  async function detachCatalog(catalogName: string): Promise<void> {
    const attached = engine.catalogs
      .getAttachedCatalogs()
      .find((c) => c.catalogName === catalogName);
    await engine.detachCatalog(catalogName);
    store.removeCatalog(
      persistedCatalogKey(attached?.headerProjectId ?? currentProjectId(), catalogName),
    );
    // Entries persisted before catalogs were keyed by project.
    store.removeCatalog(catalogName);
  }

  /**
   * Force DuckDB to re-read fresh iceberg metadata (detach + reattach all
   * catalogs). Use after a read 404s on a `snap-*.avro` that still exists —
   * DuckDB is on a stale, expired snapshot while the table is healthy.
   */
  async function refreshMetadata(): Promise<void> {
    if (!isInitialized.value) return;
    await engine.refreshMetadata();
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
   * returns the names to offer after the last dot, each with its kind.
   *
   * Handles every qualification level via targeted DuckDB metadata queries:
   *   empty                         → catalogs
   *   1 part  ("catalog.")          → schemas in that catalog
   *   2 parts ("catalog.schema.")   → tables/views in that schema
   *   3 parts ("catalog.schema.t.") → columns in that table
   *   1 part  ("table.")            → columns (fallback when no schemas match)
   *   2 parts ("schema.table.")     → columns (fallback when no tables match)
   */
  const _completionCache = new Map<string, SqlCompletionItem[]>();

  async function fetchCompletionItems(qualifier: string): Promise<SqlCompletionItem[]> {
    const cached = _completionCache.get(qualifier);
    if (cached) return cached;

    if (!engine.isInitialized || !engine.pool) return [];

    const parts = qualifier ? qualifier.split('\x1F') : [];
    const pooled = await engine.pool.acquire();
    const conn = pooled.connection;
    const columnsWhere = (where: Sql) =>
      queryItems(
        conn,
        sql`SELECT column_name, 'column', data_type FROM duckdb_columns()
         WHERE ${where} ORDER BY column_index LIMIT 2000`,
      );
    try {
      let items: SqlCompletionItem[] = [];

      if (parts.length === 0) {
        items = await queryItems(
          conn,
          sql`SELECT DISTINCT database_name, 'catalog', NULL FROM duckdb_databases()
           WHERE database_name NOT IN ('system', 'temp')
           ORDER BY database_name LIMIT 200`,
        );
      } else if (parts.length === 1) {
        // Try as catalog → return schema names
        items = await queryItems(
          conn,
          sql`SELECT DISTINCT schema_name, 'schema', NULL FROM duckdb_schemas()
           WHERE database_name = ${literal(parts[0])}
             AND schema_name NOT IN ('information_schema', 'pg_catalog')
           ORDER BY schema_name LIMIT 2000`,
        );
        // Fallback: try as bare table name → return columns
        if (items.length === 0) {
          items = realColumns(
            await columnsWhere(
              sql`table_name = ${literal(parts[0])}
               AND database_name NOT IN ('system', 'temp')
               AND schema_name NOT IN ('information_schema', 'pg_catalog')`,
            ),
          );
        }
      } else if (parts.length === 2) {
        // Try as catalog.schema → return table/view names
        items = await queryItems(
          conn,
          sql`SELECT DISTINCT table_name, 'table', NULL FROM duckdb_tables()
           WHERE database_name = ${literal(parts[0])} AND schema_name = ${literal(parts[1])}
           UNION
           SELECT DISTINCT view_name, 'view', NULL FROM duckdb_views()
           WHERE database_name = ${literal(parts[0])} AND schema_name = ${literal(parts[1])}
           ORDER BY 1 LIMIT 2000`,
        );
        // Fallback: schema.table → return columns
        if (items.length === 0) {
          items = realColumns(
            await columnsWhere(
              sql`schema_name = ${literal(parts[0])} AND table_name = ${literal(parts[1])}
               AND database_name NOT IN ('system', 'temp')`,
            ),
          );
        }
      } else {
        // catalog.schema.table → return columns
        // DESCRIBE works for Iceberg / REST-catalog tables, but a table DuckDB has
        // only listed (not loaded) still carries the extension's placeholder
        // column; reading zero rows loads it, then DESCRIBE has the real schema.
        const table = ident(parts[0], parts[1], parts[2]);
        const describe = async () => {
          try {
            return realColumns(
              await queryItems(
                conn,
                sql`SELECT column_name, 'column', column_type FROM (DESCRIBE ${table})`,
              ),
            );
          } catch {
            return []; // DESCRIBE may fail if the table doesn't exist
          }
        };
        items = await describe();
        if (items.length === 0) {
          try {
            await conn.query(sql`SELECT * FROM ${table} LIMIT 0`);
            items = await describe();
          } catch {
            // Not readable (missing, or no read rights) — fall through
          }
        }
        // Fallback to duckdb_columns() if DESCRIBE returned nothing
        if (items.length === 0) {
          items = realColumns(
            await columnsWhere(
              sql`database_name = ${literal(parts[0])} AND schema_name = ${literal(parts[1])} AND table_name = ${literal(parts[2])}`,
            ),
          );
        }
      }

      if (items.length > 0) {
        _completionCache.set(qualifier, items);
      }
      return items;
    } catch (e) {
      console.warn(`[LoQE] Completion fetch failed for "${qualifier}":`, e);
      return [];
    } finally {
      engine.pool.release(pooled);
    }
  }

  /** The names alone, for callers that predate `fetchCompletionItems`. */
  async function fetchCompletions(qualifier: string): Promise<string[]> {
    return (await fetchCompletionItems(qualifier)).map((item) => item.name);
  }

  /**
   * Columns without the Iceberg extension's placeholder: a table it has listed
   * but not yet loaded reports one column `__` of type UNKNOWN.
   */
  function realColumns(items: SqlCompletionItem[]): SqlCompletionItem[] {
    return items.filter((i) => !(i.name === '__' && i.detail?.toUpperCase() === 'UNKNOWN'));
  }

  /** Helper: run a query of (name, kind, detail) rows. */
  async function queryItems(conn: SqlConnection, statement: Sql): Promise<SqlCompletionItem[]> {
    const result = await conn.query(statement);
    const out: SqlCompletionItem[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const name = result.getChildAt(0)?.get(i);
      if (name == null) continue;
      const detail = result.getChildAt(2)?.get(i);
      out.push({
        name: String(name),
        kind: String(result.getChildAt(1)?.get(i)) as SqlCompletionItem['kind'],
        ...(detail != null ? { detail: String(detail) } : {}),
      });
    }
    return out;
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
    queryBuffer,
    cancelQuery: () => engine.cancelCurrentQuery(),
    installExtension,
    removeExtension,
    getExtensions,
    attachCatalog,
    detachCatalog,
    refreshMetadata,
    freeMemory,
    resetDatabase,
    fetchCompletions,
    fetchCompletionItems,
    clearCompletionCache,

    // Advanced
    engine,
    store,
  };
}
