import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

// ── Engine Configuration ──────────────────────────────────────────────

export interface LoQEConfig {
  /** Base URL prefix for locating DuckDB WASM/worker assets (e.g. '' or '/ui') */
  baseUrlPrefix: string;
  /** Maximum number of pooled connections. Defaults to 4. */
  maxConnections?: number;
}

// ── Query Results ─────────────────────────────────────────────────────

export interface LoQEQueryResult {
  columns: string[];
  rows: any[][];
  /** Number of rows returned to JS (may be capped). */
  rowCount: number;
  /** Total rows produced by the query before truncation. */
  totalRowCount: number;
  /** True when the result was truncated to the row limit. */
  truncated: boolean;
  executionTimeMs: number;
}

// ── Catalog ───────────────────────────────────────────────────────────

export interface LoQECatalogConfig {
  catalogName: string;
  restUri: string;
  accessToken: string;
  projectId?: string;
}

export interface AttachedCatalog {
  catalogName: string;
  restUri: string;
  projectId: string;
  secretName: string;
  attachedAt: number;
}

// ── Extensions ────────────────────────────────────────────────────────

export interface LoQEExtension {
  name: string;
  installed: boolean;
  loaded: boolean;
}

// ── Connection Pool ───────────────────────────────────────────────────

export interface PooledConnection {
  id: number;
  connection: AsyncDuckDBConnection;
  inUse: boolean;
  lastUsed: number;
}

// ── Persisted State ───────────────────────────────────────────────────

export interface LoQEHistoryEntry {
  id: string;
  sql: string;
  executedAt: number;
  durationMs: number;
  rowCount: number;
  error?: string;
}

export interface LoQEPersistedCatalog {
  catalogName: string;
  restUri: string;
  projectId?: string;
}
