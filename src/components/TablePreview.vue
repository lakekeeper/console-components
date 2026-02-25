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
      <div class="d-flex justify-space-between align-center mb-4">
        <div class="text-h6">Preview: {{ warehouseName }}.{{ namespaceId }}.{{ tableName }}</div>
        <div class="d-flex align-center gap-2">
          <v-select
            v-if="timeTravelOptions.length > 1"
            v-model="selectedSnapshot"
            :items="timeTravelOptions"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 340px"
            label="Time Travel"
            prepend-inner-icon="mdi-clock-outline"
            clearable
            @update:model-value="loadPreview"></v-select>
          <v-chip v-if="queryResults.truncated" color="warning" variant="flat">
            {{ queryResults.rowCount.toLocaleString() }} of
            {{ queryResults.totalRowCount.toLocaleString() }} rows (truncated)
          </v-chip>
          <v-chip v-else color="primary" variant="flat">{{ queryResults.rows.length }} rows</v-chip>
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
      </div>

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

interface SnapshotOption {
  title: string;
  value: string;
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
const selectedSnapshot = ref<string | null>(null);
const timeTravelOptions = ref<SnapshotOption[]>([]);

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

    // Configure Iceberg catalog (this initializes DuckDB if needed)
    await icebergDB.configureCatalog({
      catalogName: warehouseName.value,
      projectId: wh['project-id'],
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
    });

    const tablePath = `"${warehouseName.value}"."${props.namespaceId}"."${props.tableName}"`;

    // Load snapshot list from DuckDB (BigInt-safe) for time travel dropdown
    if (timeTravelOptions.value.length === 0) {
      try {
        const snapResult = await icebergDB.executeQuery(
          `SELECT sequence_number, snapshot_id, timestamp_ms FROM iceberg_snapshots(${tablePath}) ORDER BY sequence_number DESC;`,
        );
        if (snapResult?.rows?.length) {
          // snapshot_id comes back as BigInt string from DuckDB — no precision loss
          const seqIdx = snapResult.columns.indexOf('sequence_number');
          const idIdx = snapResult.columns.indexOf('snapshot_id');
          const tsIdx = snapResult.columns.indexOf('timestamp_ms');
          const options: SnapshotOption[] = [{ title: 'Latest (current)', value: '' }];
          for (const row of snapResult.rows) {
            const seq = String(row[seqIdx]);
            const snapId = String(row[idIdx]);
            const tsMs = Number(row[tsIdx]);
            const ts = new Date(tsMs).toISOString().replace('T', ' ').replace('Z', '');
            options.push({
              title: `#${seq} — ${ts} (${snapId})`,
              value: snapId,
            });
          }
          timeTravelOptions.value = options;
        }
      } catch {
        // Non-critical — time travel just won't be available
        timeTravelOptions.value = [];
      }
    }

    // Build query with optional time travel
    let query: string;
    if (selectedSnapshot.value) {
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
</style>
