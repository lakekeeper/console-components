import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useDuckDBSettingsStore } from './duckdbSettings';
import type { LoQEHistoryEntry, LoQEPersistedCatalog } from '../composables/loqe/types';
import {
  clearRuns,
  deleteRuns,
  loadRuns,
  prunePlans,
  saveRun,
  saveRuns,
} from '../composables/loqe/loqeDb';

/**
 * Pinia store for LoQE persisted state.
 *
 * Survives page reloads so the engine can restore previously-installed
 * extensions and re-attach catalogs on next boot.
 */
/** Where runs from before IndexedDB wait until they are written there. */
const LEGACY_KEY = 'loqe-history-migration';

/**
 * Runs that versions before IndexedDB kept in this store's localStorage copy.
 * They are moved, at once, into a key of their own: the persisted-state plugin
 * rewrites `loqe` (without them) on the store's next change, and would erase
 * them before IndexedDB had them. The key goes once they are written there
 * (`dropLegacyHistory`), so they move over once and a removal stays removed.
 */
function readLegacyHistory(): LoQEHistoryEntry[] {
  try {
    const parked = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
    const runs: LoQEHistoryEntry[] = Array.isArray(parked) ? parked : [];
    const raw = localStorage.getItem('loqe');
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && 'queryHistory' in saved) {
      if (Array.isArray(saved.queryHistory)) runs.push(...saved.queryHistory);
      localStorage.setItem(LEGACY_KEY, JSON.stringify(runs));
      delete saved.queryHistory;
      localStorage.setItem('loqe', JSON.stringify(saved));
    }
    return runs;
  } catch {
    return [];
  }
}

function dropLegacyHistory() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage unavailable: nothing was parked either.
  }
}

export const useLoQEStore = defineStore(
  'loqe',
  () => {
    // ── State ───────────────────────────────────────────────────────

    /** Extension names that were installed in previous sessions. */
    const installedExtensions = ref<string[]>([]);

    /** Catalog configs (minus tokens) for re-attachment. */
    const attachedCatalogs = ref<Record<string, LoQEPersistedCatalog>>({});

    /**
     * Every kept run, newest first. Held here for the views; kept across
     * reloads in IndexedDB, one record per run (loqeDb.ts), not in this
     * store's localStorage copy.
     */
    const queryHistory = ref<LoQEHistoryEntry[]>([]);
    /** False until the runs kept in IndexedDB have been read. */
    const historyLoaded = ref(false);

    /**
     * Runs kept per query tab (a setting), so one busy tab cannot push every
     * other tab's history out, and runs kept in all (a setting, applied on its
     * own: a per-tab limit above it does not raise it), the oldest dropping
     * off first.
     */
    const settings = useDuckDBSettingsStore();
    const perTab = () => Math.max(1, Math.round(settings.historyPerTab) || 50);
    const maxHistory = () => Math.max(1, Math.round(settings.historyMax) || 1000);

    /** Whether the per-tab history rail beside the editor shows times and rows. */
    const historyRailExpanded = ref(false);

    /** Which view the LoQE page shows: the editor, or every run as a table. */
    const view = ref<'editor' | 'history'>('editor');
    /** The History view's filters, kept across reloads (DESIGN.md "State"). */
    const historyFilters = ref<{
      search: string;
      status: 'all' | 'succeeded' | 'failed';
      /** A tab id, `closed` for runs whose tab is gone, or empty for all. */
      tab: string;
      foldOut: boolean;
    }>({ search: '', status: 'all', tab: '', foldOut: false });

    // ── Extensions ──────────────────────────────────────────────────

    function addExtension(name: string) {
      if (!installedExtensions.value.includes(name)) {
        installedExtensions.value.push(name);
      }
    }

    function removeExtension(name: string) {
      installedExtensions.value = installedExtensions.value.filter((e) => e !== name);
    }

    // ── Catalogs ────────────────────────────────────────────────────

    function addCatalog(name: string, config: LoQEPersistedCatalog) {
      attachedCatalogs.value[name] = config;
    }

    function removeCatalog(name: string) {
      delete attachedCatalogs.value[name];
    }

    // ── History ─────────────────────────────────────────────────────

    function addHistoryEntry(entry: LoQEHistoryEntry) {
      queryHistory.value.unshift(entry);
      void saveRun(entry);
      trimHistory();
    }

    /** Drop the oldest runs beyond the per-tab and overall limits, plans and all. */
    function trimHistory() {
      const limit = perTab();
      const seen = new Map<string, number>();
      const kept = queryHistory.value.filter((e) => {
        if (!e.tabId) return true;
        const n = (seen.get(e.tabId) ?? 0) + 1;
        seen.set(e.tabId, n);
        return n <= limit;
      });
      const max = maxHistory();
      if (kept.length === queryHistory.value.length && kept.length <= max) return;
      const next = kept.slice(0, max);
      const keep = new Set(next.map((e) => e.id));
      const dropped = queryHistory.value.filter((e) => !keep.has(e.id)).map((e) => e.id);
      queryHistory.value = next;
      void deleteRuns(dropped);
    }

    // Lowering either setting trims existing history right away.
    watch(() => [settings.historyPerTab, settings.historyMax], trimHistory);

    /** Name a run; an empty name clears it. */
    function renameHistoryEntry(id: string, name: string) {
      const entry = queryHistory.value.find((e) => e.id === id);
      if (!entry) return;
      if (name.trim()) entry.name = name.trim();
      else delete entry.name;
      void saveRun(entry);
    }

    function removeHistoryEntry(id: string) {
      queryHistory.value = queryHistory.value.filter((e) => e.id !== id);
      void deleteRuns([id]);
    }

    /** One tab's runs, newest first. */
    function historyForTab(tabId: string): LoQEHistoryEntry[] {
      return queryHistory.value.filter((e) => e.tabId === tabId);
    }

    /** Bumped by every clear, so a load still in flight does not bring runs back. */
    let clears = 0;

    function clearHistory() {
      clears++;
      queryHistory.value = [];
      dropLegacyHistory();
      void clearRuns();
    }

    /**
     * Read the kept runs from IndexedDB, once, at start, together with any runs
     * an earlier version left in localStorage (read first, before anything is
     * awaited, and dropped only once IndexedDB has them). Runs made before the
     * read finished are kept: they were already written, and the merge goes by
     * id. A clear while this runs wins: nothing read before it comes back.
     */
    async function loadHistory() {
      const legacy = readLegacyHistory();
      const clearsAtStart = clears;
      const stored = await loadRuns();
      if (clears !== clearsAtStart) {
        historyLoaded.value = true;
        return;
      }
      const byId = new Map<string, LoQEHistoryEntry>();
      for (const e of [...queryHistory.value, ...(stored ?? []), ...legacy]) {
        if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
      }
      queryHistory.value = [...byId.values()].sort((a, b) => b.executedAt - a.executedAt);
      trimHistory();
      // No IndexedDB (private window, blocked site data): this session only,
      // and the parked runs stay parked for a browser that has it.
      if (stored !== null) {
        const kept = new Set(queryHistory.value.map((e) => e.id));
        const moving = legacy.filter((e) => kept.has(e.id));
        if (!moving.length || (await saveRuns(moving))) dropLegacyHistory();
        void prunePlans();
      }
      historyLoaded.value = true;
    }
    void loadHistory();

    // ── Schema Profiler results (per table, survive reloads) ─────────

    /** key = `${warehouseId}/${namespaceId}/${tableName}` → { columnName → ProfileData } */
    const tableProfiles = ref<Record<string, Record<string, unknown>>>({});

    function setTableProfile(key: string, column: string, data: unknown) {
      if (!tableProfiles.value[key]) tableProfiles.value[key] = {};
      tableProfiles.value[key][column] = data;
    }

    function getTableProfiles(key: string): Record<string, unknown> {
      return tableProfiles.value[key] ?? {};
    }

    function clearTableProfiles(key: string) {
      delete tableProfiles.value[key];
    }

    return {
      installedExtensions,
      attachedCatalogs,
      queryHistory,
      historyLoaded,
      historyRailExpanded,
      view,
      historyFilters,
      tableProfiles,
      addExtension,
      removeExtension,
      addCatalog,
      removeCatalog,
      addHistoryEntry,
      historyForTab,
      renameHistoryEntry,
      removeHistoryEntry,
      clearHistory,
      setTableProfile,
      getTableProfiles,
      clearTableProfiles,
    };
  },
  {
    persistedState: {
      key: 'loqe',
      persist: true,
      // Not the runs: those live in IndexedDB (loadHistory).
      includePaths: [
        'installedExtensions',
        'attachedCatalogs',
        'historyRailExpanded',
        'view',
        'historyFilters',
        'tableProfiles',
      ],
    },
  },
);
