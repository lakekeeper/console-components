import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { sqlText, type Sql } from './sql';

/** A DuckDB connection that runs only `Sql`, never a plain string. */
export class SqlConnection {
  readonly #raw: AsyncDuckDBConnection;

  private constructor(raw: AsyncDuckDBConnection) {
    this.#raw = raw;
    // Frozen: also keeps Vue from wrapping it in a proxy, which has no `#raw`.
    Object.freeze(this);
  }

  static async open(db: AsyncDuckDB): Promise<SqlConnection> {
    return new SqlConnection(await db.connect());
  }

  query(statement: Sql): ReturnType<AsyncDuckDBConnection['query']> {
    return this.#raw.query(sqlText(statement));
  }

  /**
   * Run a statement step by step, so `cancelSent()` can interrupt it while it
   * runs; `query()` runs it to the end in one call and cannot be stopped.
   * The result arrives as a stream of record batches.
   */
  send(statement: Sql): ReturnType<AsyncDuckDBConnection['send']> {
    return this.#raw.send(sqlText(statement), true);
  }

  cancelSent(): Promise<boolean> {
    return this.#raw.cancelSent();
  }

  close(): Promise<void> {
    return this.#raw.close();
  }
}
