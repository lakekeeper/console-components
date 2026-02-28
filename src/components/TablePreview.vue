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
      <template v-if="error.includes('CORS')" #append>
        <CorsConfigDialog />
      </template>
    </v-alert>

    <!-- Results -->
    <div v-else-if="queryResults">
      <div class="text-h6 mb-3">Preview: {{ warehouseName }}.{{ namespaceId }}.{{ tableName }}</div>

      <!-- Branch & Time Travel Toolbar -->
      <v-card variant="outlined" class="mb-4" density="compact">
        <div class="d-flex align-center flex-wrap ga-3 pa-3">
          <!-- Branch selector -->
          <v-select
            v-if="branchOptions.length > 1"
            v-model="selectedBranch"
            :items="branchOptions"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 180px"
            label="Branch"
            prepend-inner-icon="mdi-source-branch"
            @update:model-value="
              selectedSnapshot = null;
              loadPreview();
            "></v-select>

          <!-- Snapshot time travel -->
          <v-select
            v-if="allTimeTravelOptions.length > 1"
            v-model="selectedSnapshot"
            :items="allTimeTravelOptions"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 400px; min-width: 280px"
            label="Time Travel"
            prepend-inner-icon="mdi-clock-outline"
            clearable
            @update:model-value="loadPreview"></v-select>

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
import { ref, computed, onMounted, toRef, watch, inject } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useLoQE } from '@/composables/useLoQE';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { useCsvDownload } from '@/composables/useCsvDownload';
import CorsConfigDialog from './CorsConfigDialog.vue';

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
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
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

// Full time travel options from branch snapshots
const allTimeTravelOptions = computed(() => {
  const snaps = branchSnapshots.value;
  if (snaps.length === 0) return [];
  return snaps.map((s) => {
    const d = new Date(s['timestamp-ms']);
    const ts = d.toISOString().replace('T', ' ').replace('Z', '');
    const op = s.summary?.operation ?? '';
    const seq = s['sequence-number'] ?? '';
    const snapId = String(s['snapshot-id']);
    return {
      title: `#${seq} — ${ts} — ${op}`,
      value: snapId,
    };
  });
});

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

    // Initialize LoQE and attach the catalog (shared engine with LoQE Explorer)
    await loqe.initialize();

    // Check if catalog is already attached
    const attached = loqe.attachedCatalogs.value;
    const alreadyAttached = attached.some((c) => c.catalogName === warehouseName.value);
    if (!alreadyAttached) {
      await loqe.attachCatalog({
        catalogName: warehouseName.value,
        restUri: props.catalogUrl,
        accessToken: userStore.user.access_token,
        projectId: wh['project-id'],
      });
    }

    const tablePath = `"${warehouseName.value}"."${props.namespaceId}"."${props.tableName}"`;

    // Build query with optional time travel
    let sql: string;
    if (selectedSnapshot.value) {
      // snapshot IDs are BigInt-safe strings from loadTableCustomized (json-bigint)
      sql = `SELECT * FROM ${tablePath} AT (VERSION => ${selectedSnapshot.value}) LIMIT 1000;`;
    } else {
      sql = `SELECT * FROM ${tablePath} LIMIT 1000;`;
    }

    const results = await loqe.query(sql);
    queryResults.value = results;
  } catch (err: any) {
    console.error('Failed to load table preview:', err);
    const errorMsg = err.message || 'Unknown error occurred';

    // Detect CORS errors that manifest as DuckDB read/download errors
    if (
      errorMsg.includes('Cannot read') ||
      errorMsg.includes('memory buffer') ||
      errorMsg.includes('Invalid Input Error') ||
      errorMsg.includes('HTTP Error') ||
      errorMsg.includes('Full download failed') ||
      errorMsg.includes('CORS error') ||
      errorMsg.toLowerCase().includes('cors')
    ) {
      error.value =
        `CORS Error: Cannot access object storage from the browser.\n\n` +
        `DuckDB tried to read Iceberg metadata files from object storage but ` +
        `the request was blocked by CORS policy.\n\n` +
        `Please contact your administrator to configure CORS on your storage bucket.`;
    } else {
      error.value = errorMsg;
    }
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
</style>
