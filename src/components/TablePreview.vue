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

    <!-- Drag and Drop Zone -->
    <v-card
      v-if="!queryResults && !isLoading && !error && isPreviewAvailable.available"
      class="mb-4 dropzone"
      :class="{ 'dropzone-active': isDragOver }"
      variant="outlined"
      style="border: 2px dashed #ccc; min-height: 200px"
      @dragover.prevent="handleDragOver"
      @dragenter.prevent="handleDragEnter"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleFileDrop">
      <v-card-text class="text-center pa-8">
        <v-icon size="64" color="grey-lighten-1">mdi-cloud-upload-outline</v-icon>
        <div class="text-h6 mt-4 text-grey">Drop CSV or Parquet files here</div>
        <div class="text-body-2 text-grey">
          Or click to upload files to create temporary tables for querying
        </div>
        <v-btn color="primary" variant="outlined" class="mt-4" @click="triggerFileInput">
          <v-icon start>mdi-file-upload</v-icon>
          Select Files
        </v-btn>
        <input
          ref="fileInput"
          type="file"
          style="display: none"
          accept=".csv,.parquet"
          multiple
          @change="handleFileSelect" />
      </v-card-text>
    </v-card>

    <!-- File Processing Status -->
    <v-alert v-if="uploadingFiles.length > 0" type="info" variant="tonal" class="mb-4">
      <div class="text-body-1 font-weight-bold mb-2">
        <v-icon class="mr-2">mdi-loading mdi-spin</v-icon>
        Processing Files
      </div>
      <div v-for="file in uploadingFiles" :key="file.name" class="text-body-2">
        {{ file.name }} - {{ file.status }}
      </div>
    </v-alert>

    <!-- Results -->
    <div v-else-if="queryResults">
      <div class="d-flex justify-space-between align-center mb-4">
        <div class="text-h6">Preview: {{ warehouseName }}.{{ namespaceId }}.{{ tableName }}</div>
        <v-chip color="primary" variant="flat">{{ queryResults.rows.length }} rows</v-chip>
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
import { ref, computed, onMounted, onBeforeUnmount, toRef, watch } from 'vue';
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
console.log('🔍 TablePreview props:', {
  storageType: props.storageType,
  catalogUrl: props.catalogUrl,
});
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
);

const isLoading = ref(true);
const error = ref<string | null>(null);
const queryResults = ref<any>(null);
const warehouseName = ref<string | undefined>(undefined);

// Drag and drop state
const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement>();
const uploadingFiles = ref<Array<{ name: string; status: string }>>([]);

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

// Check if preview is available - following same logic as WarehouseSqlQuery
const isPreviewAvailable = computed(() => {
  // Wait for storage type to be loaded first
  if (!props.storageType) {
    return { available: false, reason: 'Loading warehouse information...' };
  }

  // Use composable for storage validation (same as WarehouseSqlQuery)
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

// Drag and drop methods
function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
}

function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  // Only set to false if we're leaving the dropzone container
  if (e.target === e.currentTarget) {
    isDragOver.value = false;
  }
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;

  if (e.dataTransfer?.files) {
    processFiles(Array.from(e.dataTransfer.files));
  }
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files) {
    processFiles(Array.from(input.files));
  }
}

async function processFiles(files: File[]) {
  const validFiles = files.filter((file) => {
    const extension = file.name.toLowerCase().split('.').pop();
    return extension === 'csv' || extension === 'parquet';
  });

  if (validFiles.length === 0) {
    error.value = 'Please select CSV or Parquet files only';
    return;
  }

  uploadingFiles.value = validFiles.map((file) => ({
    name: file.name,
    status: 'Processing...',
  }));

  try {
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      uploadingFiles.value[i].status = 'Reading file...';

      // Create a temporary table name based on the file name
      const tableName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');

      uploadingFiles.value[i].status = 'Processing file content...';

      // Read file content
      const text = await file.text();

      uploadingFiles.value[i].status = 'Creating temporary table...';

      // Create a temporary table from the file content
      const extension = file.name.toLowerCase().split('.').pop();
      let createQuery = '';

      if (extension === 'csv') {
        // For CSV, we'll use DuckDB's CSV reading capabilities with inline data
        // This is a simplified approach - in a full implementation you'd want to
        // use DuckDB's file system or blob storage capabilities
        createQuery = `
          CREATE OR REPLACE TABLE temp_${tableName} AS 
          SELECT * FROM read_csv_auto('data:text/csv;base64,${btoa(text)}', header=true);
        `;
      } else if (extension === 'parquet') {
        // For Parquet files, we'd need more sophisticated handling
        // This is a placeholder - real implementation would require
        // proper binary data handling in DuckDB WASM
        uploadingFiles.value[i].status = 'Parquet files not yet supported';
        continue;
      }

      if (createQuery) {
        try {
          await icebergDB.executeQuery(createQuery);
          uploadingFiles.value[i].status = 'Complete';
        } catch (err: any) {
          console.error('Failed to create table:', err);
          uploadingFiles.value[i].status = `Error: ${err.message}`;
        }
      }
    }

    // Clear uploading files after a delay
    setTimeout(() => {
      uploadingFiles.value = [];
    }, 3000);

    // Show success message
    error.value = null;
    console.log(
      'Files processed successfully. You can now query the temporary tables using temp_[filename].',
    );
  } catch (err: any) {
    console.error('Failed to process files:', err);
    error.value = `Failed to process files: ${err.message}`;
    uploadingFiles.value = [];
  }
}

onMounted(() => {
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

/* Drag and drop styles */
.dropzone {
  transition: all 0.3s ease;
}

.dropzone-active {
  border-color: #1976d2 !important;
  background-color: rgba(25, 118, 210, 0.05);
  transform: scale(1.02);
}

.dropzone:hover {
  border-color: #1976d2 !important;
  background-color: rgba(25, 118, 210, 0.02);
}
</style>
