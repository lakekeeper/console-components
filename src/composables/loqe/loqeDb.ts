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
            tx.oncomplete = () => resolve(true as T);
            tx.onerror = () => resolve(null);
          }
          // An aborted transaction (quota, a closing database) fires neither
          // success nor complete; settle anyway, as a failure.
          tx.onabort = () => resolve(null);
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

/**
 * Write many runs in one transaction (moving the old localStorage history
 * over). True once the transaction has committed, false otherwise.
 */
export async function saveRuns(entries: LoQEHistoryEntry[]): Promise<boolean> {
  const done = await run<boolean>(RUNS, 'readwrite', (s) => {
    for (const e of entries) s.put(plain(e));
  });
  return done === true;
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

/**
 * Drop plans whose run is no longer stored. The runs and the plans are read in
 * the same transaction that deletes, so a run saved meanwhile keeps its plan.
 */
export async function prunePlans(): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([RUNS, PLANS], 'readwrite');
      const runKeys = tx.objectStore(RUNS).getAllKeys();
      const planKeys = tx.objectStore(PLANS).getAllKeys();
      // Requests in a transaction complete in order: the runs are read by now.
      planKeys.onsuccess = () => {
        const runs = new Set((runKeys.result ?? []).map(String));
        for (const k of planKeys.result) if (!runs.has(String(k))) tx.objectStore(PLANS).delete(k);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
