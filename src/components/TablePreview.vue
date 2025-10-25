<template>
  <v-container fluid>
    <v-card>
      <v-card-text>
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
            <div class="text-h6">
              Preview: {{ warehouseId }}.{{ namespaceId }}.{{ tableName }}
            </div>
            <v-chip color="primary" variant="flat">
              {{ queryResults.rows.length }} rows
            </v-chip>
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
            height="600px">
          </v-data-table>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';

interface Props {
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}

const props = defineProps<Props>();

const functions = useFunctions();
const userStore = useUserStore();
const icebergDB = useIcebergDuckDB();

const isLoading = ref(true);
const error = ref<string | null>(null);
const queryResults = ref<any>(null);
const warehouseName = ref<string | undefined>(undefined);

// Get catalog URL from environment variable (same as warehouse page)
const catalogUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_APP_ICEBERG_CATALOG_URL || 'http://localhost:8181';
  return `${baseUrl}/catalog`;
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

async function loadPreview() {
  isLoading.value = true;
  error.value = null;

  try {
    // Load warehouse
    const wh = await functions.getWarehouse(props.warehouseId);
    warehouseName.value = wh.name;

    // Initialize DuckDB
    await icebergDB.initialize();

    // Configure Iceberg catalog
    await icebergDB.configureCatalog({
      catalogName: props.warehouseId,
      restUri: catalogUrl.value,
      accessToken: userStore.user.access_token,
    });

    // Execute preview query
    const query = `SELECT * FROM ${props.warehouseId}.${props.namespaceId}.${props.tableName} LIMIT 1000`;
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
