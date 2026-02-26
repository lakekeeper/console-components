<template>
  <v-container fluid>
    <!-- S3/GCS + HTTP Warning -->
    <v-alert v-if="showS3HttpWarning" type="warning" variant="tonal" class="mb-4" closable>
      <div class="text-body-1 font-weight-bold mb-2">Security Warning</div>
      <div class="text-body-2">
        {{ storageValidation.httpWarningMessage }}
      </div>
    </v-alert>

    <!-- Preview Not Available Warning -->
    <v-alert
      v-if="!isPreviewAvailable.available"
      type="warning"
      variant="tonal"
      prominent
      class="mb-4">
      <div class="text-body-1 font-weight-bold mb-2">
        <v-icon class="mr-2">mdi-alert</v-icon>
        Preview Not Available
      </div>
      <div class="text-body-2">{{ isPreviewAvailable.reason }}</div>
      <div class="text-body-2 mt-3">
        <strong>Requirements for DuckDB WASM:</strong>
        <ul class="mt-2">
          <li>{{ storageValidation.storageRequirement }}</li>
          <li>{{ storageValidation.protocolRequirement }}</li>
        </ul>
      </div>
    </v-alert>

    <!-- Loading/Initializing State -->
    <v-alert v-if="isLoading" type="info" variant="tonal" class="mb-4">
      <v-progress-circular indeterminate size="24" class="mr-2"></v-progress-circular>
      Loading table preview...
    </v-alert>

    <!-- Error State -->
    <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
      <div class="text-body-1 font-weight-bold mb-2">Failed to load preview</div>
      <div class="text-body-2">{{ error }}</div>
    </v-alert>

    <!-- Results -->
    <div v-else-if="queryResults">
      <div class="text-h6 mb-3">Preview: {{ warehouseName }}.{{ namespaceId }}.{{ tableName }}</div>

      <!-- Branch & Time Travel Toolbar -->
      <v-card variant="outlined" class="mb-4" density="compact">
        <div class="d-flex align-center flex-wrap ga-3 pa-3">
          <!-- Branch selector -->
          <div v-if="branchOptions.length > 1" class="d-flex align-center">
            <v-icon size="small" class="mr-2 text-medium-emphasis">mdi-source-branch</v-icon>
            <v-btn-toggle
              v-model="selectedBranch"
              mandatory
              density="compact"
              variant="outlined"
              divided
              color="primary"
              @update:model-value="
                selectedSnapshot = null;
                selectedTimestamp = '';
                loadPreview();
              ">
              <v-btn
                v-for="branch in branchOptions"
                :key="branch.value"
                :value="branch.value"
                size="small">
                {{ branch.title }}
              </v-btn>
            </v-btn-toggle>
          </div>

          <v-divider v-if="branchOptions.length > 1" vertical class="mx-1"></v-divider>

          <!-- Time Travel: datetime picker -->
          <div class="d-flex align-center">
            <v-icon size="small" class="mr-2 text-medium-emphasis">mdi-clock-outline</v-icon>
            <span class="text-caption text-medium-emphasis mr-2">Time Travel</span>
            <input
              v-model="selectedTimestamp"
              type="datetime-local"
              class="time-travel-input mr-2"
              :max="maxTimestamp"
              :min="minTimestamp"
              @change="onTimestampChange" />
            <v-btn
              v-if="selectedSnapshot || selectedTimestamp"
              icon="mdi-close-circle"
              size="x-small"
              variant="text"
              color="error"
              @click="clearTimeTravel"></v-btn>
          </div>

          <v-spacer></v-spacer>

          <!-- Row count & download -->
          <v-chip v-if="queryResults.truncated" color="warning" variant="flat" size="small">
            {{ queryResults.rowCount.toLocaleString() }} of
            {{ queryResults.totalRowCount.toLocaleString() }} rows
          </v-chip>
          <v-chip v-else color="primary" variant="flat" size="small">
            {{ queryResults.rows.length }} rows
          </v-chip>
          <v-btn
            size="small"
            variant="outlined"
            color="primary"
            @click="downloadCSV"
            :disabled="!csvDownload.isDownloadAvailable(queryResults)">
            <v-icon start>mdi-download</v-icon>
            CSV
          </v-btn>
        </div>

        <!-- Snapshot timeline strip -->
        <div v-if="branchSnapshots.length > 1" class="px-3 pb-3">
          <div class="snapshot-strip d-flex align-center ga-1 overflow-x-auto">
            <v-chip
              v-for="snap in visibleSnapshots"
              :key="snap.id"
              :color="snap.id === (selectedSnapshot ?? currentTipId) ? 'primary' : undefined"
              :variant="snap.id === (selectedSnapshot ?? currentTipId) ? 'flat' : 'outlined'"
              size="small"
              label
              class="snapshot-chip flex-shrink-0"
              @click="selectSnapshot(snap.id)">
              <v-icon start size="x-small">{{ operationIcon(snap.operation) }}</v-icon>
              <span class="font-weight-medium">#{{ snap.seq }}</span>
              <span class="text-caption ml-1 text-medium-emphasis">{{ snap.shortTime }}</span>
            </v-chip>
            <v-chip
              v-if="branchSnapshots.length > maxVisibleSnapshots"
              size="small"
              variant="text"
              class="flex-shrink-0 text-medium-emphasis">
              +{{ branchSnapshots.length - maxVisibleSnapshots }} more
            </v-chip>
          </div>
        </div>
      </v-card>

      <!-- Results Table -->
      <v-data-table
        :headers="tableHeaders"
        :items="tableRows"
        :items-per-page="1000"
        hide-default-footer
        density="compact"
        class="elevation-1"
        fixed-header
        height="50vh"></v-data-table>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, toRef, watch, inject } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { useCsvDownload } from '@/composables/useCsvDownload';

// Local types for json-bigint parsed metadata (BigInt IDs stored as strings)
interface BigIntSnapshot {
  'snapshot-id': string;
  'parent-snapshot-id'?: string;
  'timestamp-ms': number;
  'sequence-number'?: number;
  summary?: { operation?: string; [key: string]: string | undefined };
}

interface BigIntRef {
  type: 'branch' | 'tag';
  'snapshot-id': string;
}

interface BigIntTableMetadata {
  snapshots?: BigIntSnapshot[];
  refs?: Record<string, BigIntRef>;
  'current-snapshot-id'?: string;
}

interface BigIntLoadTableResult {
  metadata: BigIntTableMetadata;
}

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  catalogUrl: string;
  storageType?: string;
}>();

const config = inject<any>('appConfig', { enabledAuthentication: false });
const functions = useFunctions();
const userStore = useUserStore();
const icebergDB = useIcebergDuckDB(config.baseUrlPrefix);
const csvDownload = useCsvDownload();

const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
);

const isLoading = ref(true);
const error = ref<string | null>(null);
const queryResults = ref<any>(null);
const warehouseName = ref<string | undefined>(undefined);
const loadedTable = ref<BigIntLoadTableResult | null>(null);
const selectedSnapshot = ref<string | null>(null);
const selectedBranch = ref<string>('main');
const selectedTimestamp = ref<string>('');
const maxVisibleSnapshots = 15;

// Resolved table metadata (fetched with json-bigint to preserve snapshot IDs)
const tableMetadata = computed<BigIntLoadTableResult | null>(() => loadedTable.value);

// Available branches from refs
const branchOptions = computed(() => {
  const refs = tableMetadata.value?.metadata?.refs;
  if (!refs) return [{ title: 'main', value: 'main' }];
  return Object.entries(refs)
    .filter(([, r]) => r.type === 'branch')
    .map(([name]) => ({ title: name, value: name }));
});

// Walk branch parent chain to get snapshots on the selected branch
const branchSnapshots = computed<BigIntSnapshot[]>(() => {
  const meta = tableMetadata.value?.metadata;
  if (!meta?.snapshots) return [];
  const snapshotMap = new Map<string, BigIntSnapshot>();
  for (const s of meta.snapshots) {
    if (s['snapshot-id']) snapshotMap.set(String(s['snapshot-id']), s);
  }
  // Find branch tip
  const refs = meta.refs;
  let tipId: string | undefined;
  if (refs && refs[selectedBranch.value]) {
    tipId = String(refs[selectedBranch.value]['snapshot-id']);
  } else if (meta['current-snapshot-id']) {
    tipId = String(meta['current-snapshot-id']);
  }
  if (!tipId) return [];
  // Walk parent chain
  const chain: BigIntSnapshot[] = [];
  let id: string | undefined = tipId;
  while (id) {
    const snap = snapshotMap.get(id);
    if (!snap) break;
    chain.push(snap);
    id = snap['parent-snapshot-id'] ? String(snap['parent-snapshot-id']) : undefined;
  }
  return chain;
});

// Current branch tip snapshot id
const currentTipId = computed(() => {
  const snaps = branchSnapshots.value;
  return snaps.length > 0 ? String(snaps[0]['snapshot-id']) : null;
});

// Visible snapshot chips (most recent first, capped)
const visibleSnapshots = computed(() => {
  return branchSnapshots.value.slice(0, maxVisibleSnapshots).map((s) => {
    const d = new Date(s['timestamp-ms']);
    const shortTime =
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return {
      id: String(s['snapshot-id']),
      seq: s['sequence-number'] ?? 0,
      operation: s.summary?.operation ?? 'unknown',
      shortTime,
    };
  });
});

// Min/max for datetime picker
const maxTimestamp = computed(() => {
  const snaps = branchSnapshots.value;
  if (snaps.length === 0) return '';
  return toLocalDatetime(snaps[0]['timestamp-ms']);
});

const minTimestamp = computed(() => {
  const snaps = branchSnapshots.value;
  if (snaps.length === 0) return '';
  return toLocalDatetime(snaps[snaps.length - 1]['timestamp-ms']);
});

function toLocalDatetime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function operationIcon(op: string): string {
  const map: Record<string, string> = {
    append: 'mdi-plus-circle-outline',
    overwrite: 'mdi-pencil-outline',
    delete: 'mdi-delete-outline',
    replace: 'mdi-swap-horizontal',
    merge: 'mdi-merge',
  };
  return map[op] ?? 'mdi-circle-small';
}

function selectSnapshot(snapId: string) {
  if (snapId === currentTipId.value) {
    // Clicking current tip = go back to latest
    selectedSnapshot.value = null;
    selectedTimestamp.value = '';
  } else {
    selectedSnapshot.value = snapId;
    // Sync datetime picker to this snapshot's timestamp
    const snap = branchSnapshots.value.find((s) => String(s['snapshot-id']) === snapId);
    if (snap) {
      selectedTimestamp.value = toLocalDatetime(snap['timestamp-ms']);
    }
  }
  loadPreview();
}

function onTimestampChange() {
  if (!selectedTimestamp.value) {
    clearTimeTravel();
    return;
  }
  // Find the nearest snapshot at or before the selected timestamp
  const targetMs = new Date(selectedTimestamp.value).getTime();
  const snaps = branchSnapshots.value;
  let best: BigIntSnapshot | null = null;
  for (const s of snaps) {
    if (s['timestamp-ms'] <= targetMs) {
      best = s;
      break; // snaps are tip-first (newest first), so first match <= target is closest
    }
  }
  if (best) {
    selectedSnapshot.value = String(best['snapshot-id']);
  } else if (snaps.length > 0) {
    // All snapshots are after the selected time — use oldest
    selectedSnapshot.value = String(snaps[snaps.length - 1]['snapshot-id']);
  }
  loadPreview();
}

function clearTimeTravel() {
  selectedSnapshot.value = null;
  selectedTimestamp.value = '';
  loadPreview();
}

// Compute headers from results
const tableHeaders = computed(() => {
  if (!queryResults.value?.columns) return [];
  return queryResults.value.columns.map((col: string) => ({
    title: col,
    key: col,
    sortable: true,
  }));
});

// Compute rows from results
const tableRows = computed(() => {
  if (!queryResults.value?.rows) return [];
  return queryResults.value.rows.map((row: any[]) => {
    const obj: Record<string, any> = {};
    queryResults.value.columns.forEach((col: string, index: number) => {
      obj[col] = row[index];
    });
    return obj;
  });
});

// Check if preview is available
const isPreviewAvailable = computed(() => {
  // Wait for storage type to be loaded first
  if (!props.storageType) {
    return { available: false, reason: 'Loading warehouse information...' };
  }

  // Use composable for storage validation
  if (!storageValidation.isOperationAvailable.value.available) {
    return {
      available: false,
      reason: storageValidation.isOperationAvailable.value.reason,
    };
  }

  return { available: true, reason: null };
});

// Check if we should show S3/GCS + HTTP warning
const showS3HttpWarning = storageValidation.shouldShowHttpWarning;

async function loadPreview() {
  isLoading.value = true;
  error.value = null;
  queryResults.value = null;

  // Wait for storage type to be available, then check if it's supported using composable
  if (!props.storageType) {
    // Storage type not loaded yet, wait
    isLoading.value = false;
    return;
  }

  // Use composable to check if operation is available
  if (!storageValidation.isOperationAvailable.value.available) {
    isLoading.value = false;
    return;
  }
  try {
    // Load warehouse
    const wh = await functions.getWarehouse(props.warehouseId);
    warehouseName.value = wh.name;

    // Load table metadata via loadTableCustomized (uses json-bigint to preserve snapshot IDs)
    if (!loadedTable.value) {
      try {
        loadedTable.value = (await functions.loadTableCustomized(
          props.warehouseId,
          props.namespaceId,
          props.tableName,
        )) as BigIntLoadTableResult;
      } catch {
        // Non-critical — time travel just won't be available
        loadedTable.value = null;
      }
    }

    // Configure Iceberg catalog (this initializes DuckDB if needed)
    await icebergDB.configureCatalog({
      catalogName: warehouseName.value,
      projectId: wh['project-id'],
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
    });

    const tablePath = `"${warehouseName.value}"."${props.namespaceId}"."${props.tableName}"`;

    // Build query with optional time travel
    let query: string;
    if (selectedSnapshot.value) {
      // snapshot IDs are BigInt-safe strings from loadTableCustomized (json-bigint)
      query = `SELECT * FROM ${tablePath} AT (VERSION => ${selectedSnapshot.value}) LIMIT 1000;`;
    } else {
      query = `SELECT * FROM ${tablePath} LIMIT 1000;`;
    }

    const results = await icebergDB.executeQuery(query);
    queryResults.value = results;
  } catch (err: any) {
    console.error('Failed to load table preview:', err);
    error.value = err.message || 'Unknown error occurred';
  } finally {
    isLoading.value = false;
  }
}

function downloadCSV() {
  csvDownload.downloadCSV(queryResults.value, {
    baseFilename: `${props.tableName}_preview`,
  });
}

onMounted(() => {
  loadPreview();
});

// Watch for table/namespace/warehouse changes and reload preview
watch([() => props.tableName, () => props.namespaceId, () => props.warehouseId], () => {
  loadedTable.value = null;
  selectedSnapshot.value = null;
  selectedTimestamp.value = '';
  selectedBranch.value = 'main';
  loadPreview();
});

// Watch for storage type changes and reload preview when it becomes available and supported
watch(
  () => props.storageType,
  () => {
    if (props.storageType && storageValidation.isOperationAvailable.value.available) {
      loadPreview();
    }
  },
);

onBeforeUnmount(async () => {
  await icebergDB.cleanup();
});
</script>

<style scoped>
:deep(.v-data-table) {
  font-size: 0.875rem;
}

:deep(.v-data-table th) {
  font-weight: 600;
  background-color: rgba(var(--v-theme-primary), 0.1);
}

:deep(.v-data-table td) {
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time-travel-input {
  font-size: 0.8125rem;
  padding: 4px 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 4px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  outline: none;
  height: 32px;
}

.time-travel-input:focus {
  border-color: rgb(var(--v-theme-primary));
}

.snapshot-strip {
  scrollbar-width: thin;
}

.snapshot-chip {
  cursor: pointer;
}
</style>
