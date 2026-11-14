import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useDuckDBSettingsStore } from './duckdbSettings';
import type { LoQEHistoryEntry, LoQEPersistedCatalog } from '../composables/loqe/types';

/**
 * Pinia store for LoQE persisted state.
 *
 * Survives page reloads so the engine can restore previously-installed
 * extensions and re-attach catalogs on next boot.
 */
export const useLoQEStore = defineStore(
  'loqe',
  () => {
    // ── State ───────────────────────────────────────────────────────

    /** Extension names that were installed in previous sessions. */
    const installedExtensions = ref<string[]>([]);

    /** Catalog configs (minus tokens) for re-attachment. */
    const attachedCatalogs = ref<Record<string, LoQEPersistedCatalog>>({});

    /** Rolling query history (newest first). */
    const queryHistory = ref<LoQEHistoryEntry[]>([]);

    /**
     * Runs kept per query tab (a setting), so one busy tab cannot push every
     * other tab's history out; the whole history keeps at most four tabs' worth,
     * and never less than 200, which also bounds runs from closed tabs.
     */
    const settings = useDuckDBSettingsStore();
    const perTab = () => Math.max(1, Math.round(settings.historyPerTab) || 50);
    const maxHistory = () => Math.max(200, perTab() * 4);

    /** Whether the per-tab history rail beside the editor shows times and rows. */
    const historyRailExpanded = ref(false);

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
      trimHistory();
    }

    /** Drop the oldest runs beyond the per-tab and overall limits. */
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
      if (kept.length !== queryHistory.value.length || kept.length > max) {
        queryHistory.value = kept.slice(0, max);
      }
    }

    // Lowering the setting trims existing history right away.
    watch(() => settings.historyPerTab, trimHistory);

    /** Name a run; an empty name clears it. */
    function renameHistoryEntry(id: string, name: string) {
      const entry = queryHistory.value.find((e) => e.id === id);
      if (!entry) return;
      if (name.trim()) entry.name = name.trim();
      else delete entry.name;
    }

    function removeHistoryEntry(id: string) {
      queryHistory.value = queryHistory.value.filter((e) => e.id !== id);
    }

    /** One tab's runs, newest first. */
    function historyForTab(tabId: string): LoQEHistoryEntry[] {
      return queryHistory.value.filter((e) => e.tabId === tabId);
    }

    function clearHistory() {
      queryHistory.value = [];
    }

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
      historyRailExpanded,
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
    },
  },
);
