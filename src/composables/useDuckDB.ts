import { ref, type Ref } from 'vue';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

let dbInstance: AsyncDuckDB | null = null;
let workerInstance: Worker | null = null;

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
}

export function useDuckDB() {
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
      // Get the base URL for the current page including any base path (e.g., /ui/)
      const origin = window.location.origin;
      // Extract base path from pathname (e.g., /ui/ from /ui/warehouses/...)
      const pathname = window.location.pathname;
      const basePath = pathname.split('/').slice(0, 2).join('/');  // Gets /ui or empty
      const baseUrl = basePath ? `${origin}${basePath}` : origin;
      
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
      
      console.log('DuckDB bundle selected:', bundle);

      // Use less verbose logging
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);
      
      // Create worker with importScripts wrapper (required for DuckDB WASM)
      // See: https://github.com/duckdb/duckdb-wasm/blob/main/examples/plain-html/index.html
      const workerUrl = bundle.mainWorker!;
      console.log('Creating worker with URL:', workerUrl);
      
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${workerUrl}");`], {type: "text/javascript"})
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

      console.log('Instantiating DuckDB with module:', bundle.mainModule);
      
      // Instantiate with the WASM module URL
      // The second parameter is the pthread worker (only for COI bundle)
      await dbInstance.instantiate(bundle.mainModule);

      console.log('DuckDB initialized successfully');
      isInitialized.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialize DuckDB';
      console.error('DuckDB initialization error:', e);
      throw e;
    } finally {
      isInitializing.value = false;
    }
  }

  async function executeQuery(sql: string): Promise<QueryResult> {
    if (!dbInstance) {
      await initialize();
    }

    if (!dbInstance) {
      throw new Error('DuckDB is not initialized');
    }

    let conn: AsyncDuckDBConnection | null = null;
    try {
      conn = await dbInstance.connect();
      const result = await conn.query(sql);
      
      // Convert Arrow table to plain JSON structure
      const columns = result.schema.fields.map(f => f.name);
      const rows: any[][] = [];
      
      for (let i = 0; i < result.numRows; i++) {
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
        rowCount: result.numRows,
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
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${url}')`);
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

  return {
    isInitialized,
    isInitializing,
    error,
    initialize,
    executeQuery,
    registerTable,
    cleanup,
  };
}
