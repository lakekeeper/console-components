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
  /** Re-attach even if already attached, so DuckDB re-vends fresh storage
   *  credentials (vended creds expire on a short TTL independent of the token). */
  force?: boolean;
}

export interface AttachedCatalog {
  catalogName: string;
  restUri: string;
  projectId: string;
  secretName: string;
  attachedAt: number;
}

/**
 * Extra HTTP headers DuckDB attaches (via the iceberg SECRET's
 * `EXTRA_HTTP_HEADERS`) to EVERY catalog request it makes — `loadTable`,
 * `credentials`, etc. Intended to ask Lakekeeper to bypass its per-session
 * vended-credential cache and re-mint fresh STS creds.
 *
 * NOTE: only effective if the catalog actually honors the header server-side.
 * A plain `Cache-Control` will NOT dislodge a server-side AssumeRole cache —
 * change the value below to whatever Lakekeeper recognizes as "force refresh".
 * Set to `{}` to send no extra headers.
 */
export const LOQE_CATALOG_EXTRA_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
};

/** Render the `, EXTRA_HTTP_HEADERS MAP { … }` clause for a CREATE SECRET. */
export function extraHttpHeadersClause(): string {
  const entries = Object.entries(LOQE_CATALOG_EXTRA_HEADERS);
  if (entries.length === 0) return '';
  const map = entries
    .map(([k, v]) => `'${k.replace(/'/g, "''")}': '${v.replace(/'/g, "''")}'`)
    .join(', ');
  return `, EXTRA_HTTP_HEADERS MAP { ${map} }`;
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
