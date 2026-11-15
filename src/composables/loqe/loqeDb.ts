import type { LoQEHistoryEntry } from './types';
import type { LoQEPlanNode } from './runProfile';

/**
 * LoQE's run history in IndexedDB: each run under its id in `runs`, and its
 * plan under the same id in `plans`.
 *
 * Not in the persisted Pinia store with the rest of LoQE's state. That one is
 * written to localStorage whole, on every change: a thousand runs would be
 * megabytes rewritten per run, close to localStorage's ~5 MB shared with the
 * whole console — and a full localStorage stops every persisted store from
 * saving. Here each run is its own record, written alone.
 *
 * The store still holds the runs in memory (Pinia, reactive) for the History
 * view; this is where they survive a reload. Best effort throughout: a private
 * window or blocked site data has no IndexedDB, and LoQE then keeps history for
 * the session only.
 */

const DB_NAME = 'lakekeeper-loqe';
const DB_VERSION = 2;
const RUNS = 'runs';
const PLANS = 'plans';
type StoreName = typeof RUNS | typeof PLANS;

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Version 1 had plans only.
        if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS);
        if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = work(tx.objectStore(store));
          if (req) {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } else {
            tx.oncomplete = () => resolve(null);
            tx.onerror = () => resolve(null);
          }
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Plain data only: a reactive proxy cannot be cloned into IndexedDB. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// ── Runs ────────────────────────────────────────────────────────────

/** Every kept run, in no particular order (the store sorts them). */
export function loadRuns(): Promise<LoQEHistoryEntry[] | null> {
  return run<LoQEHistoryEntry[]>(RUNS, 'readonly', (s) => s.getAll());
}

export function saveRun(entry: LoQEHistoryEntry): Promise<unknown> {
  return run(RUNS, 'readwrite', (s) => s.put(plain(entry)));
}

/** Write many runs in one transaction (moving the old localStorage history over). */
export function saveRuns(entries: LoQEHistoryEntry[]): Promise<unknown> {
  return run(RUNS, 'readwrite', (s) => {
    for (const e of entries) s.put(plain(e));
  });
}

export function deleteRuns(ids: string[]): Promise<unknown> {
  if (!ids.length) return Promise.resolve(null);
  return Promise.all([
    run(RUNS, 'readwrite', (s) => {
      for (const id of ids) s.delete(id);
    }),
    run(PLANS, 'readwrite', (s) => {
      for (const id of ids) s.delete(id);
    }),
  ]);
}

export function clearRuns(): Promise<unknown> {
  return Promise.all([run(RUNS, 'readwrite', (s) => s.clear()), clearPlans()]);
}

// ── Plans ───────────────────────────────────────────────────────────

export function savePlan(id: string, plan: LoQEPlanNode): Promise<unknown> {
  return run(PLANS, 'readwrite', (s) => s.put(plain(plan), id));
}

export function loadPlan(id: string): Promise<LoQEPlanNode | null> {
  return run<LoQEPlanNode | undefined>(PLANS, 'readonly', (s) => s.get(id)).then((p) => p ?? null);
}

export function clearPlans(): Promise<unknown> {
  return run(PLANS, 'readwrite', (s) => s.clear());
}

/** Drop plans whose run is no longer kept (left behind by an older version). */
export async function prunePlans(keep: Set<string>): Promise<void> {
  const keys = await run<IDBValidKey[]>(PLANS, 'readonly', (s) => s.getAllKeys());
  if (!keys) return;
  const stale = keys.map(String).filter((k) => !keep.has(k));
  if (stale.length)
    await run(PLANS, 'readwrite', (s) => {
      for (const k of stale) s.delete(k);
    });
}
