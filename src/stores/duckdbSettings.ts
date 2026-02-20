import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

/**
 * Detect the browser's JS heap limit in MB (Chromium-only).
 * Returns `null` on Firefox / Safari / non-browser environments.
 */
function detectHeapLimitMB(): number | null {
  const perf = performance as any;
  if (perf.memory?.jsHeapSizeLimit) {
    return Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024));
  }
  return null;
}

/**
 * Compute memory thresholds scaled to the browser's actual heap.
 *   - warning  = ~12.5% of heap  (rounded to nearest 64 MB)
 *   - limit    = ~25%  of heap  (rounded to nearest 64 MB)
 *   - resultMB = ~12.5% of heap (rounded to nearest 64 MB)
 *
 * Falls back to conservative static values when the API is unavailable.
 */
function computeMemoryDefaults(): {
  memoryWarningThresholdMB: number;
  memoryLimitMB: number;
  maxResultSizeMB: number;
} {
  const heapMB = detectHeapLimitMB();
  if (heapMB === null) {
    // Non-Chromium — use safe static defaults
    return { memoryWarningThresholdMB: 512, memoryLimitMB: 1024, maxResultSizeMB: 512 };
  }
  const round64 = (v: number) => Math.max(64, Math.round(v / 64) * 64);
  return {
    memoryWarningThresholdMB: round64(heapMB * 0.125),
    memoryLimitMB: round64(heapMB * 0.25),
    maxResultSizeMB: round64(heapMB * 0.125),
  };
}

const _memDefaults = computeMemoryDefaults();

/**
 * Default settings for DuckDB WASM query execution.
 * These are conservative values that should work on most machines.
 */
export const DUCKDB_DEFAULTS = {
  /** Max rows to materialize into JS from an Arrow result. */
  maxResultRows: 10_000,
  /** Query execution timeout in seconds (0 = no timeout). */
  queryTimeoutSeconds: 120,
  /** Memory threshold in MB — warn before executing if usage is above this. */
  memoryWarningThresholdMB: _memDefaults.memoryWarningThresholdMB,
  /** Hard memory limit in MB — refuse to execute if usage is above this. */
  memoryLimitMB: _memDefaults.memoryLimitMB,
  /**
   * Estimated result-size cap in MB.
   * Works on ALL browsers (doesn't need performance.memory).
   * Before materializing rows into JS we estimate rows × cols × ~100 bytes
   * and refuse if the estimate exceeds this value.
   * Set 0 to disable.
   */
  maxResultSizeMB: _memDefaults.maxResultSizeMB,
  /**
   * Custom DuckDB extension repository URL.
   * When non-empty, DuckDB downloads extensions from this URL instead
   * of the default `extensions.duckdb.org`. Useful for proxy / artifact
   * repositories or air-gapped environments.
   * Example: `https://my-proxy.corp.com/duckdb-extensions`
   */
  extensionRepository: '',
};

/** Row count presets for the UI selector. */
export const ROW_LIMIT_OPTIONS = [
  1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000, 1_000_000,
];

/** Timeout presets for the UI selector. */
export const TIMEOUT_OPTIONS = [
  { title: '30 seconds', value: 30 },
  { title: '60 seconds', value: 60 },
  { title: '2 minutes', value: 120 },
  { title: '5 minutes', value: 300 },
  { title: 'No timeout', value: 0 },
] as const;

export interface DuckDBSettings {
  maxResultRows: number;
  queryTimeoutSeconds: number;
  memoryWarningThresholdMB: number;
  memoryLimitMB: number;
  maxResultSizeMB: number;
  extensionRepository: string;
}

/**
 * Persisted Pinia store for DuckDB WASM user preferences.
 *
 * Controls query safety guardrails: row limits, timeouts, and memory thresholds.
 * All values survive page reload via pinia-plugin-persistedstate.
 */
export const useDuckDBSettingsStore = defineStore(
  'duckdbSettings',
  () => {
    // ── State ───────────────────────────────────────────────────────

    const maxResultRows = ref<number>(DUCKDB_DEFAULTS.maxResultRows);
    const queryTimeoutSeconds = ref(DUCKDB_DEFAULTS.queryTimeoutSeconds);
    const memoryWarningThresholdMB = ref(DUCKDB_DEFAULTS.memoryWarningThresholdMB);
    const memoryLimitMB = ref(DUCKDB_DEFAULTS.memoryLimitMB);
    const maxResultSizeMB = ref(DUCKDB_DEFAULTS.maxResultSizeMB);
    const extensionRepository = ref<string>(DUCKDB_DEFAULTS.extensionRepository);

    // ── Getters ─────────────────────────────────────────────────────

    /** Timeout in milliseconds (0 = no timeout). */
    const queryTimeoutMs = computed(() =>
      queryTimeoutSeconds.value > 0 ? queryTimeoutSeconds.value * 1000 : 0,
    );

    /** All settings as a plain object (handy for passing to composables). */
    const settings = computed<DuckDBSettings>(() => ({
      maxResultRows: maxResultRows.value,
      queryTimeoutSeconds: queryTimeoutSeconds.value,
      memoryWarningThresholdMB: memoryWarningThresholdMB.value,
      memoryLimitMB: memoryLimitMB.value,
      maxResultSizeMB: maxResultSizeMB.value,
      extensionRepository: extensionRepository.value,
    }));

    // ── Actions ─────────────────────────────────────────────────────

    function resetToDefaults() {
      maxResultRows.value = DUCKDB_DEFAULTS.maxResultRows;
      queryTimeoutSeconds.value = DUCKDB_DEFAULTS.queryTimeoutSeconds;
      memoryWarningThresholdMB.value = DUCKDB_DEFAULTS.memoryWarningThresholdMB;
      memoryLimitMB.value = DUCKDB_DEFAULTS.memoryLimitMB;
      maxResultSizeMB.value = DUCKDB_DEFAULTS.maxResultSizeMB;
      extensionRepository.value = DUCKDB_DEFAULTS.extensionRepository;
    }

    // ── Memory helpers ──────────────────────────────────────────────

    /**
     * Returns estimated memory usage in MB using `performance.memory`
     * (Chromium-only) or `navigator.deviceMemory` as a rough fallback.
     * Returns `null` when the API is unavailable.
     */
    function getMemoryUsageMB(): number | null {
      const perf = performance as any;
      if (perf.memory?.usedJSHeapSize) {
        return Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
      }
      return null;
    }

    /**
     * Returns the total JS heap limit in MB (Chromium-only).
     * Returns `null` when unavailable.
     */
    function getMemoryLimitMB(): number | null {
      const perf = performance as any;
      if (perf.memory?.jsHeapSizeLimit) {
        return Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024));
      }
      return null;
    }

    type MemoryCheckResult =
      | { ok: true }
      | { ok: false; reason: 'warning' | 'blocked'; usageMB: number; message: string };

    /**
     * Check memory status before executing a query.
     * Returns `{ ok: true }` if safe to proceed, otherwise includes reason.
     */
    function checkMemory(): MemoryCheckResult {
      const usage = getMemoryUsageMB();
      if (usage === null) {
        // Can't measure — allow execution
        return { ok: true };
      }

      if (memoryLimitMB.value > 0 && usage >= memoryLimitMB.value) {
        return {
          ok: false,
          reason: 'blocked',
          usageMB: usage,
          message:
            `Memory usage is ${usage} MB, exceeding the ${memoryLimitMB.value} MB safety limit. ` +
            `Free memory by closing other tabs or reducing the row limit before running more queries.`,
        };
      }

      if (memoryWarningThresholdMB.value > 0 && usage >= memoryWarningThresholdMB.value) {
        return {
          ok: false,
          reason: 'warning',
          usageMB: usage,
          message:
            `Memory usage is ${usage} MB (warning threshold: ${memoryWarningThresholdMB.value} MB). ` +
            `Consider adding a LIMIT clause to avoid crashing the browser.`,
        };
      }

      return { ok: true };
    }

    /**
     * Estimate the JS heap cost of materializing a query result.
     * Uses ~100 bytes per cell as a conservative average
     * (covers strings, numbers, objects, array overhead, V8/JSC padding).
     * Returns `{ ok: true }` when safe, or an error when the estimate
     * exceeds `maxResultSizeMB`. Works on ALL browsers.
     */
    function checkResultSize(
      rows: number,
      cols: number,
    ): { ok: true } | { ok: false; estimatedMB: number; message: string } {
      if (maxResultSizeMB.value <= 0) return { ok: true };
      const BYTES_PER_CELL = 100;
      const estimatedMB = Math.round((rows * cols * BYTES_PER_CELL) / (1024 * 1024));
      if (estimatedMB > maxResultSizeMB.value) {
        return {
          ok: false,
          estimatedMB,
          message:
            `Estimated result size is ~${estimatedMB} MB ` +
            `(${rows.toLocaleString()} rows × ${cols} columns), ` +
            `exceeding the ${maxResultSizeMB.value} MB safety limit. ` +
            `Add a LIMIT clause or reduce "Max result rows" in Settings.`,
        };
      }
      return { ok: true };
    }

    return {
      // State
      maxResultRows,
      queryTimeoutSeconds,
      memoryWarningThresholdMB,
      memoryLimitMB,
      maxResultSizeMB,
      extensionRepository,
      // Getters
      queryTimeoutMs,
      settings,
      // Actions
      resetToDefaults,
      // Memory helpers
      getMemoryUsageMB,
      getMemoryLimitMB,
      checkMemory,
      checkResultSize,
    };
  },
  {
    persistedState: {
      key: 'duckdbSettings',
      persist: true,
    },
  },
);
