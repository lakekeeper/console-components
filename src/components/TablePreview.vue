<template>
  <v-container fluid>
    <v-card>
      <v-card-text>
        <!-- S3/GCS + HTTP Warning -->
        <v-alert v-if="showS3HttpWarning" type="warning" variant="tonal" class="mb-4" closable>
          <div class="text-body-1 font-weight-bold mb-2">Security Warning</div>
          <div class="text-body-2">
            {{ storageValidation.httpWarningMessage }}
          </div>
        </v-alert>

        <!-- Preview Not Available Warning -->
        <v-alert
          v-if="storageValidation.shouldShowUnsupportedWarning"
          type="warning"
          variant="tonal"
          prominent
          class="mb-4">
          <div class="text-body-1 font-weight-bold mb-2">
            <v-icon class="mr-2">mdi-alert</v-icon>
            Preview Not Available
          </div>
          <div class="text-body-2">{{ storageValidation.isStorageSupported.value.reason }}</div>
          <div class="text-body-2 mt-3">
            <strong>Requirements for DuckDB WASM:</strong>
            <ul class="mt-2">
              <li>{{ storageValidation.requirementsText.value.storageRequirement }}</li>
              <li>{{ storageValidation.requirementsText.value.protocolRequirement }}</li>
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
            <div class="text-h6">Preview: {{ warehouseId }}.{{ namespaceId }}.{{ tableName }}</div>
            <v-chip color="primary" variant="flat">{{ queryResults.rows.length }} rows</v-chip>
          </div>

          <!-- Results Table -->
          <v-data-table
            :headers="tableHeaders"
            :items="tableRows"
            :items-per-page="50"
            :items-per-page-options="[25, 50, 100, 200]"
            density="compact"
            class="elevation-1"
            fixed-header
            height="600px"></v-data-table>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, toRef } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import { useStorageValidation } from '@/composables/useStorageValidation';

interface Props {
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  catalogUrl: string; // Now required from parent
  storageType?: string; // Storage type: s3, adls, gcs, etc.
}

const props = defineProps<Props>();

const functions = useFunctions();
const userStore = useUserStore();
const icebergDB = useIcebergDuckDB();
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
);

const isLoading = ref(true);
const error = ref<string | null>(null);
const queryResults = ref<any>(null);
const warehouseName = ref<string | undefined>(undefined);

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

// Check if preview is available based on storage type and protocol
const isPreviewAvailable = computed(() => ({
  available: storageValidation.isOperationAvailable.value.available,
  reason: storageValidation.isOperationAvailable.value.reason,
}));

// Check if we should show S3/GCS + HTTP warning
const showS3HttpWarning = storageValidation.shouldShowHttpWarning;

async function loadPreview() {
  isLoading.value = true;
  error.value = null;

  // Check if preview is available before attempting to load
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
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
    });

    // Execute preview query - include ATTACH in same connection
    // This ensures the catalog is available for the SELECT query
    const query = `
      -- Attach catalog on this connection
      ATTACH IF NOT EXISTS '${warehouseName.value}' AS ${warehouseName.value} (
        TYPE iceberg,
        SUPPORT_NESTED_NAMESPACES true,
        SUPPORT_STAGE_CREATE true,
        SECRET iceberg_secret,
        ENDPOINT '${props.catalogUrl}'
      );
      
      -- Query the table
      SELECT * FROM "${warehouseName.value}"."${props.namespaceId}"."${props.tableName}" LIMIT 1000;
    `;

    console.log('Executing preview query:', query);
    const results = await icebergDB.executeQuery(query);
    queryResults.value = results;
  } catch (err: any) {
    console.error('Failed to load table preview:', err);
    error.value = err.message || 'Unknown error occurred';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadPreview();
});

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
