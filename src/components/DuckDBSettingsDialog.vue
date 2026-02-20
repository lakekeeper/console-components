<template>
  <v-dialog v-model="dialogVisible" max-width="550" persistent>
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn icon size="small" variant="text" v-bind="activatorProps">
        <v-icon size="small">mdi-cog</v-icon>
        <v-tooltip activator="parent" location="bottom">Settings</v-tooltip>
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-cog</v-icon>
        DuckDB WASM Settings
      </v-card-title>

      <v-card-text>
        <!-- Memory usage indicator -->
        <v-alert
          v-if="currentMemoryMB !== null"
          :type="memoryAlertType"
          variant="tonal"
          density="compact"
          class="mb-4">
          <div class="d-flex align-center justify-space-between">
            <span>
              Current memory usage:
              <strong>{{ currentMemoryMB }} MB</strong>
              <span v-if="heapLimitMB">/ {{ heapLimitMB }} MB</span>
            </span>
            <v-btn size="x-small" variant="text" @click="refreshMemory">
              <v-icon size="small">mdi-refresh</v-icon>
            </v-btn>
          </div>
        </v-alert>

        <v-alert v-else type="info" variant="tonal" density="compact" class="mb-4">
          <v-icon start size="small">mdi-information-outline</v-icon>
          Detailed memory monitoring requires a Chromium-based browser (Edge, Chrome). Memory
          thresholds below are ignored when usage cannot be measured.
        </v-alert>

        <!-- Row Limit -->
        <v-combobox
          v-model="maxRowsModel"
          :items="ROW_LIMIT_OPTIONS"
          label="Max result rows"
          hint="Pick a preset or type any number. Higher values use more memory."
          persistent-hint
          variant="outlined"
          density="comfortable"
          :rules="[maxRowsRule]"
          class="mb-3" />

        <!-- Query Timeout -->
        <v-select
          v-model="store.queryTimeoutSeconds"
          :items="TIMEOUT_OPTIONS"
          item-title="title"
          item-value="value"
          label="Query timeout"
          hint="Cancel queries that run longer than this. Prevents runaway queries."
          persistent-hint
          variant="outlined"
          density="comfortable"
          class="mb-3" />

        <!-- Memory Warning Threshold -->
        <v-text-field
          v-model.number="store.memoryWarningThresholdMB"
          label="Memory warning threshold (MB)"
          hint="Show a warning before executing when JS heap usage exceeds this value. Requires Chromium."
          persistent-hint
          variant="outlined"
          density="comfortable"
          type="number"
          :min="0"
          :step="64"
          :disabled="currentMemoryMB === null"
          class="mb-3" />

        <!-- Memory Hard Limit -->
        <v-text-field
          v-model.number="store.memoryLimitMB"
          label="Memory hard limit (MB)"
          hint="Block query execution when JS heap usage exceeds this value. Set 0 to disable. Requires Chromium."
          persistent-hint
          variant="outlined"
          density="comfortable"
          type="number"
          :min="0"
          :step="64"
          :disabled="currentMemoryMB === null"
          class="mb-3" />

        <!-- Result Size Limit (works on all browsers) -->
        <v-text-field
          v-model.number="store.maxResultSizeMB"
          label="Max result size (MB)"
          hint="Estimated materialization cap. Blocks results that would use more JS memory than this. Works on all browsers. Set 0 to disable."
          persistent-hint
          variant="outlined"
          density="comfortable"
          type="number"
          :min="0"
          :step="64"
          class="mb-3" />

        <!-- Extension Repository URL -->
        <v-text-field
          v-model="store.extensionRepository"
          label="Custom extension repository URL"
          hint="Base URL only — DuckDB appends /{version}/{platform}/{ext}.duckdb_extension.wasm automatically. Example: https://my-proxy.corp.com/duckdb-extensions (not including /v1.x.x/). Leave empty for the default (extensions.duckdb.org)."
          persistent-hint
          variant="outlined"
          density="comfortable"
          placeholder="https://extensions.duckdb.org"
          clearable
          prepend-inner-icon="mdi-puzzle-outline"
          class="mb-3" />

        <!-- Free Memory -->
        <v-divider class="my-3" />

        <div class="d-flex align-center justify-space-between">
          <div>
            <div class="text-subtitle-2">Free Memory</div>
            <div class="text-caption text-medium-emphasis">
              Close idle connections, flush caches, and shrink DuckDB WASM memory.
            </div>
          </div>
          <v-btn
            color="error"
            variant="tonal"
            size="small"
            :loading="isFreeing"
            @click="handleFreeMemory">
            <v-icon start size="small">mdi-memory</v-icon>
            Free RAM
          </v-btn>
        </div>

        <v-alert
          v-if="freeMemoryResult"
          type="info"
          variant="tonal"
          density="compact"
          closable
          class="mt-2"
          @click:close="freeMemoryResult = null">
          <span v-if="freeMemoryResult.beforeMB !== null && freeMemoryResult.afterMB !== null">
            Memory: {{ freeMemoryResult.beforeMB }} MB → {{ freeMemoryResult.afterMB }} MB
            <span v-if="freeMemoryResult.beforeMB > freeMemoryResult.afterMB" class="text-success">
              (freed {{ freeMemoryResult.beforeMB - freeMemoryResult.afterMB }} MB)
            </span>
          </span>
          <span v-else>
            Freed {{ freeMemoryResult.idleConnectionsClosed }} idle connection(s) and flushed
            caches.
          </span>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" color="warning" size="small" @click="store.resetToDefaults()">
          <v-icon start>mdi-restore</v-icon>
          Reset Defaults
        </v-btn>
        <v-spacer />
        <v-btn variant="elevated" color="primary" @click="dialogVisible = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  useDuckDBSettingsStore,
  ROW_LIMIT_OPTIONS,
  TIMEOUT_OPTIONS,
} from '@/stores/duckdbSettings';

export interface FreeMemoryResult {
  idleConnectionsClosed: number;
  beforeMB: number | null;
  afterMB: number | null;
}

const props = defineProps<{
  /**
   * Optional callback invoked when the user presses "Free RAM".
   * Should run engine-specific cleanup (close idle connections,
   * CHECKPOINT, shrink_memory) and return a result summary.
   * When omitted, only a basic GC hint + memory refresh is performed.
   */
  onFreeMemory?: () => Promise<FreeMemoryResult>;
}>();

const store = useDuckDBSettingsStore();
const dialogVisible = ref(false);

// ── Max rows combobox ───────────────────────────────────────────────
// With :return-object="false" + item-value="value", the combobox emits
// the numeric `value` when a preset is picked, or the raw string when
// the user types a custom number.
const maxRowsModel = computed<number | string>({
  get() {
    return store.maxResultRows;
  },
  set(val: number | string | null) {
    if (val === null || val === undefined) return;
    const n = Number(val);
    if (!isNaN(n) && n >= 1) {
      store.maxResultRows = Math.round(n);
    }
  },
});

function maxRowsRule(val: unknown): true | string {
  const n = Number(val);
  if (isNaN(n) || n < 1 || !Number.isInteger(n)) return 'Enter a positive whole number';
  return true;
}
const currentMemoryMB = ref<number | null>(null);
const heapLimitMB = ref<number | null>(null);
const isFreeing = ref(false);
const freeMemoryResult = ref<FreeMemoryResult | null>(null);

const memoryAlertType = computed(() => {
  if (currentMemoryMB.value === null) return 'info';
  if (store.memoryLimitMB > 0 && currentMemoryMB.value >= store.memoryLimitMB) return 'error';
  if (store.memoryWarningThresholdMB > 0 && currentMemoryMB.value >= store.memoryWarningThresholdMB)
    return 'warning';
  return 'success';
});

function refreshMemory() {
  currentMemoryMB.value = store.getMemoryUsageMB();
  heapLimitMB.value = store.getMemoryLimitMB();
}

async function handleFreeMemory() {
  isFreeing.value = true;
  freeMemoryResult.value = null;

  try {
    if (props.onFreeMemory) {
      freeMemoryResult.value = await props.onFreeMemory();
    } else {
      // Basic fallback — no engine-level cleanup available
      const beforeMB = store.getMemoryUsageMB();
      // Hint the GC (best effort, only some engines honour this)
      if (typeof (globalThis as any).gc === 'function') {
        (globalThis as any).gc();
      }
      const afterMB = store.getMemoryUsageMB();
      freeMemoryResult.value = { idleConnectionsClosed: 0, beforeMB, afterMB };
    }
  } catch (e) {
    console.error('[DuckDBSettings] freeMemory failed:', e);
  } finally {
    isFreeing.value = false;
    refreshMemory();
  }
}

onMounted(() => {
  refreshMemory();
});
</script>
