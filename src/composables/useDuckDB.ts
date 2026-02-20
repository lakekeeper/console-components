import { ref, type Ref } from 'vue';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { useDuckDBSettingsStore, DUCKDB_DEFAULTS } from '@/stores/duckdbSettings';

let dbInstance: AsyncDuckDB | null = null;
let workerInstance: Worker | null = null;

/**
 * Hard cap on rows materialized into JS to prevent browser OOM crashes.
 * DuckDB WASM loads the full Arrow result in WASM memory; this limit only
 * controls how many rows we copy into the JS heap for display.
 *
 * @deprecated Use `useDuckDBSettingsStore().maxResultRows` instead.
 *             This constant is kept for backward compatibility.
 */
export const MAX_RESULT_ROWS = DUCKDB_DEFAULTS.maxResultRows;

export interface QueryResult {
  columns: string[];
  rows: any[][];
  /** Number of rows returned to JS (may be capped by MAX_RESULT_ROWS). */
  rowCount: number;
  /** Total rows produced by the query before truncation. */
  totalRowCount: number;
  /** True when the result was truncated to MAX_RESULT_ROWS. */
  truncated: boolean;
}

export function useDuckDB(baseUrlPrefix: string) {
  const isInitialized: Ref<boolean> = ref(false);
  const isInitializing: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);

  async function initialize(): Promise<void> {
    if (isInitialized.value || isInitializing.value) {
      return;
    }

    isInitializing.value = true;
    error.value = null;

    try {
      // Get the base URL for the current page including any base path (e.g., ${baseUrlPrefix}/ui/)
      const origin = window.location.origin;
      // Extract base path from pathname (e.g., /ui/ from /ui/warehouses/...)
      const pathname = window.location.pathname;
      const basePath = pathname.replace(baseUrlPrefix, '').split('/').slice(0, 2).join('/'); // Gets /ui or empty
      const baseUrl = basePath ? `${origin}${baseUrlPrefix}${basePath}` : origin;

      // We'll use MVP bundle which is most compatible
      // and doesn't require exception handling support
      const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: `${baseUrl}/duckdb/duckdb-mvp.wasm`,
          mainWorker: `${baseUrl}/duckdb/duckdb-browser-mvp.worker.js`,
        },
        eh: {
          mainModule: `${baseUrl}/duckdb/duckdb-eh.wasm`,
          mainWorker: `${baseUrl}/duckdb/duckdb-browser-eh.worker.js`,
        },
      };

      // Select the bundle - prefer MVP for compatibility
      const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);

      // Use less verbose logging
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);

      // Create worker with importScripts wrapper (required for DuckDB WASM)
      // See: https://github.com/duckdb/duckdb-wasm/blob/main/examples/plain-html/index.html
      const workerUrl = bundle.mainWorker!;

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${workerUrl}");`], { type: 'text/javascript' }),
      );
      workerInstance = new Worker(worker_url);
      URL.revokeObjectURL(worker_url);

      // Listen for worker errors
      workerInstance.onerror = (e) => {
        console.error('Worker error event:', e);
        console.error('Worker error message:', e.message);
        console.error('Worker error filename:', e.filename);
        console.error('Worker error lineno:', e.lineno);
      };

      workerInstance.onmessageerror = (e) => {
        console.error('Worker message error:', e);
      };

      dbInstance = new duckdb.AsyncDuckDB(logger, workerInstance);

      // Instantiate with the WASM module URL
      // The second parameter is the pthread worker (only for COI bundle)
      await dbInstance.instantiate(bundle.mainModule);

      isInitialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialize DuckDB';
      console.error('DuckDB initialization error:', e);
      throw e;
    } finally {
      isInitializing.value = false;
    }
  }

  async function executeQuery(
    sql: string,
    options?: { maxRows?: number; skipGuardrails?: boolean },
  ): Promise<QueryResult> {
    if (!dbInstance) {
      await initialize();
    }

    if (!dbInstance) {
      throw new Error('DuckDB is not initialized');
    }

    const settingsStore = useDuckDBSettingsStore();

    // ── Memory guardrail ──────────────────────────────────────────
    if (!options?.skipGuardrails) {
      const memCheck = settingsStore.checkMemory();
      if (!memCheck.ok && memCheck.reason === 'blocked') {
        throw new Error(memCheck.message);
      }
    }

    const limit = options?.maxRows ?? settingsStore.maxResultRows;
    const timeoutMs = options?.skipGuardrails ? 0 : settingsStore.queryTimeoutMs;

    let conn: AsyncDuckDBConnection | null = null;
    try {
      conn = await dbInstance.connect();

      // ── Timeout guardrail ─────────────────────────────────────
      let result: any;
      if (timeoutMs > 0) {
        const queryPromise = conn.query(sql);
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
        result = await conn.query(sql);
      }

      // Convert Arrow table to plain JSON structure
      const columns = result.schema.fields.map((f: any) => f.name);
      const rows: any[][] = [];
      const totalRows = result.numRows;
      const rowsToRead = Math.min(totalRows, limit);

      // ── Result-size guardrail (works on all browsers) ──────────
      if (!options?.skipGuardrails) {
        const sizeCheck = settingsStore.checkResultSize(rowsToRead, columns.length);
        if (!sizeCheck.ok) {
          throw new Error(sizeCheck.message);
        }
      }

      for (let i = 0; i < rowsToRead; i++) {
        const row: any[] = [];
        for (let j = 0; j < result.numCols; j++) {
          const col = result.getChildAt(j);
          row.push(col?.get(i));
        }
        rows.push(row);
      }

      return {
        columns,
        rows,
        rowCount: rows.length,
        totalRowCount: totalRows,
        truncated: totalRows > limit,
      };
    } finally {
      if (conn) {
        await conn.close();
      }
    }
  }

  async function registerTable(tableName: string, url: string): Promise<void> {
    if (!dbInstance) {
      await initialize();
    }

    if (!dbInstance) {
      throw new Error('DuckDB is not initialized');
    }

    const conn = await dbInstance.connect();
    try {
      // Register a Parquet file as a table
      await conn.query(
        `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${url}')`,
      );
    } finally {
      await conn.close();
    }
  }

  async function cleanup(): Promise<void> {
    if (dbInstance) {
      await dbInstance.terminate();
      dbInstance = null;
    }
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
    }
    isInitialized.value = false;
  }

  /**
   * Free DuckDB WASM memory without tearing down the engine.
   * Runs CHECKPOINT + PRAGMA shrink_memory to return buffer-manager
   * pages back to the WASM linear memory / OS.
   */
  async function freeMemory(): Promise<{
    idleConnectionsClosed: number;
    beforeMB: number | null;
    afterMB: number | null;
  }> {
    if (!dbInstance) {
      return { idleConnectionsClosed: 0, beforeMB: null, afterMB: null };
    }

    const perf = performance as any;
    const beforeMB: number | null = perf.memory?.usedJSHeapSize
      ? Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
      : null;

    let conn: AsyncDuckDBConnection | null = null;
    try {
      conn = await dbInstance.connect();
      try {
        await conn.query('CHECKPOINT');
      } catch {
        /* non-critical */
      }
      try {
        await conn.query('PRAGMA shrink_memory');
      } catch {
        /* may not exist in older builds */
      }
    } finally {
      if (conn) {
        await conn.close();
      }
    }

    const afterMB: number | null = perf.memory?.usedJSHeapSize
      ? Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
      : null;

    console.log(`[DuckDB] freeMemory: memory ${beforeMB ?? '?'}→${afterMB ?? '?'} MB`);

    return { idleConnectionsClosed: 0, beforeMB, afterMB };
  }

  return {
    isInitialized,
    isInitializing,
    error,
    initialize,
    executeQuery,
    registerTable,
    cleanup,
    freeMemory,
  };
}
