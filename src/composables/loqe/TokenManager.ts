import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

/**
 * TokenManager — keeps DuckDB `SECRET` objects in sync with the
 * application's OIDC access token.
 *
 * This is a plain class with no Vue dependencies so it can be used from
 * any context. The `useLoQE` composable wires up a Vue `watch` that
 * calls `refreshAllSecrets()` whenever the token changes.
 *
 * The `useLoQE` composable wires up the Vue `watch`.
 */
export class TokenManager {
  private db: AsyncDuckDB | null = null;
  private registeredSecrets = new Map<string, { catalogName: string; type: string }>();
  private _currentToken = '';

  get currentToken(): string {
    return this._currentToken;
  }

  /** Bind the manager to a live DuckDB instance. */
  initialize(db: AsyncDuckDB, initialToken: string): void {
    this.db = db;
    this._currentToken = initialToken;
  }

  /** Track a SECRET that needs refreshing when the token rotates. */
  registerSecret(secretName: string, catalogName: string, type = 'iceberg'): void {
    this.registeredSecrets.set(secretName, { catalogName, type });
  }

  /** Stop tracking a SECRET (e.g. after detaching a catalog). */
  unregisterSecret(secretName: string): void {
    this.registeredSecrets.delete(secretName);
  }

  /**
   * DROP + re-CREATE every registered SECRET with the new token.
   * Called by the composable's `watch` handler.
   */
  async refreshAllSecrets(newToken: string): Promise<void> {
    if (!this.db) return;
    this._currentToken = newToken;

    if (this.registeredSecrets.size === 0) return;

    let conn;
    try {
      conn = await this.db.connect();

      for (const [secretName, { type }] of this.registeredSecrets) {
        try {
          await conn.query(
            `CREATE OR REPLACE SECRET ${secretName} (
              TYPE ${type},
              TOKEN '${newToken.replace(/'/g, "''")}'
            )`,
          );
        } catch (e) {
          console.error(`[LoQE] Failed to refresh secret ${secretName}:`, e);
        }
      }
    } catch (e) {
      console.error('[LoQE] Token refresh failed:', e);
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Release all references. */
  dispose(): void {
    this.registeredSecrets.clear();
    this.db = null;
    this._currentToken = '';
  }
}
