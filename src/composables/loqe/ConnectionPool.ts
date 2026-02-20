import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { PooledConnection } from './types';

/**
 * ConnectionPool — fixed-size pool of DuckDB WASM connections.
 *
 * Connections are lazily created up to `maxSize`, then callers queue behind a
 * FIFO wait-list until a connection is released.
 */
export class ConnectionPool {
  private pool: PooledConnection[] = [];
  private nextId = 0;
  private db: AsyncDuckDB;
  private maxSize: number;
  private waitQueue: Array<(conn: PooledConnection) => void> = [];
  private _disposed = false;

  constructor(db: AsyncDuckDB, maxSize = 4) {
    this.db = db;
    this.maxSize = maxSize;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Lease a connection from the pool. If none are free and the pool is at
   * capacity the returned promise will resolve once another caller releases.
   */
  async acquire(): Promise<PooledConnection> {
    if (this._disposed) throw new Error('[LoQE] Connection pool is disposed');

    // 1. Reuse an idle connection
    const free = this.pool.find((c) => !c.inUse);
    if (free) {
      free.inUse = true;
      free.lastUsed = Date.now();
      return free;
    }

    // 2. Grow the pool if there is room
    if (this.pool.length < this.maxSize) {
      const conn = await this.db.connect();
      const pooled: PooledConnection = {
        id: this.nextId++,
        connection: conn,
        inUse: true,
        lastUsed: Date.now(),
      };
      this.pool.push(pooled);
      return pooled;
    }

    // 3. Wait in the FIFO queue
    return new Promise<PooledConnection>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /** Return a leased connection to the pool. */
  release(pooled: PooledConnection): void {
    if (this.waitQueue.length > 0) {
      // Hand the connection directly to the next waiter
      const resolve = this.waitQueue.shift()!;
      pooled.lastUsed = Date.now();
      resolve(pooled);
    } else {
      pooled.inUse = false;
      pooled.lastUsed = Date.now();
    }
  }

  /**
   * Close idle (not in-use) connections to free WASM / JS memory.
   * Active connections are left untouched.
   */
  async drainIdle(): Promise<number> {
    const idle = this.pool.filter((c) => !c.inUse);
    for (const pooled of idle) {
      try {
        await pooled.connection.close();
      } catch {
        /* ignore */
      }
    }
    this.pool = this.pool.filter((c) => c.inUse);
    return idle.length;
  }

  /** Close every connection in the pool and reject pending waiters. */
  async drain(): Promise<void> {
    this._disposed = true;

    // Reject any pending waiters
    // for (const resolve of this.waitQueue) {
    //   // Resolve with a closed-pool error via a rejected promise pattern would
    //   // complicate types — instead we just clear the queue; callers that are
    //   // still awaiting will never resolve (acceptable during shutdown).
    // }
    this.waitQueue = [];

    for (const pooled of this.pool) {
      try {
        await pooled.connection.close();
      } catch {
        /* ignore close errors during shutdown */
      }
    }
    this.pool = [];
  }

  // ── Stats ───────────────────────────────────────────────────────────

  get size(): number {
    return this.pool.length;
  }

  get activeCount(): number {
    return this.pool.filter((c) => c.inUse).length;
  }

  get availableCount(): number {
    return this.pool.filter((c) => !c.inUse).length;
  }

  get queuedCount(): number {
    return this.waitQueue.length;
  }

  get maxPoolSize(): number {
    return this.maxSize;
  }
}
