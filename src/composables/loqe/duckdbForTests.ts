/**
 * A real DuckDB-WASM engine for tests (Node, blocking API): runs the SQL the
 * app generates and hands back the Arrow results the app reads. Test-only —
 * not exported from the library.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Table } from 'apache-arrow';

const require = createRequire(import.meta.url);

export interface TestDuckDB {
  query(text: string): Table;
  close(): void;
}

export async function openTestDuckDB(): Promise<TestDuckDB> {
  const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
  const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'));
  const db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: path.join(dist, 'duckdb-mvp.wasm'), mainWorker: '' },
      eh: { mainModule: path.join(dist, 'duckdb-eh.wasm'), mainWorker: '' },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  db.open({});
  const conn = db.connect();
  return {
    query: (text: string) => conn.query(text) as Table,
    close: () => {
      conn.close();
      db.reset();
    },
  };
}
