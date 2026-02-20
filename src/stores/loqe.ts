import { ref } from 'vue';
import { defineStore } from 'pinia';
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

    const MAX_HISTORY = 200;

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
      if (queryHistory.value.length > MAX_HISTORY) {
        queryHistory.value = queryHistory.value.slice(0, MAX_HISTORY);
      }
    }

    function clearHistory() {
      queryHistory.value = [];
    }

    return {
      installedExtensions,
      attachedCatalogs,
      queryHistory,
      addExtension,
      removeExtension,
      addCatalog,
      removeCatalog,
      addHistoryEntry,
      clearHistory,
    };
  },
  {
    persistedState: {
      key: 'loqe',
      persist: true,
    },
  },
);
