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
      // Select the appropriate bundle based on browser capabilities
      const DUCKDB_CONFIG = await duckdb.selectBundle({
        mvp: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-mvp.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-browser-mvp.worker.js',
        },
        eh: {
          mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-eh.wasm',
          mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-browser-eh.worker.js',
        },
      });

      const logger = new duckdb.ConsoleLogger();
      workerInstance = new Worker(DUCKDB_CONFIG.mainWorker!);
      dbInstance = new duckdb.AsyncDuckDB(logger, workerInstance);
      await dbInstance.instantiate(DUCKDB_CONFIG.mainModule);

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
