<template>
  <v-card class="pa-4">
    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center align-center pa-8">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <span class="ml-4 text-h6">Loading table preview...</span>
    </div>

    <!-- Error State -->
    <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
      <div class="text-h6">Failed to load preview</div>
      <div>{{ error }}</div>
    </v-alert>

    <!-- Results Display -->
    <div v-else-if="results">
      <div class="d-flex justify-space-between align-center mb-4">
        <div class="text-h6">Preview: {{ warehouseId }}.{{ namespaceId }}.{{ tableName }}</div>
        <v-chip color="primary" variant="flat">
          {{ results.rows.length }} rows (limited to 1000)
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
        <template #bottom>
          <div class="text-center pa-2">
            <v-pagination
              v-if="results.rows.length > 50"
              v-model="page"
              :length="Math.ceil(results.rows.length / itemsPerPage)"
              :total-visible="7"></v-pagination>
          </div>
        </template>
      </v-data-table>
    </div>

    <!-- Empty State -->
    <v-alert v-else type="info" variant="tonal">
      <div class="text-h6">No data available</div>
      <div>The table appears to be empty</div>
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import { useUserStore } from '@/stores/user';
import { useFunctions } from '@/plugins/functions';

interface Props {
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}

const props = defineProps<Props>();

const loading = ref(true);
const error = ref<string | null>(null);
const results = ref<any>(null);
const page = ref(1);
const itemsPerPage = ref(50);

const userStore = useUserStore();
const functions = useFunctions();
const icebergDB = useIcebergDuckDB();

// Compute headers from results
const tableHeaders = computed(() => {
  if (!results.value?.columns) return [];
  return results.value.columns.map((col: string) => ({
    title: col,
    key: col,
    sortable: true,
  }));
});

// Compute rows from results
const tableRows = computed(() => {
  if (!results.value?.rows) return [];
  return results.value.rows.map((row: any[]) => {
    const obj: Record<string, any> = {};
    results.value.columns.forEach((col: string, index: number) => {
      obj[col] = row[index];
    });
    return obj;
  });
});

async function loadPreview() {
  loading.value = true;
  error.value = null;

  try {
    // Get warehouse details to build catalog URL
    const warehouse = await functions.getWarehouse(props.warehouseId);
    if (!warehouse) {
      throw new Error('Warehouse not found');
    }

    const catalogUrl = import.meta.env.VITE_ICEBERG_CATALOG_URL;
    if (!catalogUrl) {
      throw new Error('Catalog URL not configured');
    }

    // Initialize DuckDB with Iceberg catalog
    const available = await icebergDB.initialize({
      catalogUrl,
      warehouseName: props.warehouseId,
      accessToken: userStore.user.access_token,
    });

    if (!available.available) {
      throw new Error(available.error || 'DuckDB not available');
    }

    // Execute preview query with LIMIT 1000
    const tableFQN = `${props.warehouseId}.${props.namespaceId}.${props.tableName}`;
    const query = `SELECT * FROM ${tableFQN} LIMIT 1000`;

    console.log('Executing preview query:', query);
    const queryResults = await icebergDB.executeQuery(query);

    if (queryResults.error) {
      throw new Error(queryResults.error);
    }

    results.value = queryResults;
  } catch (err: any) {
    console.error('Failed to load table preview:', err);
    error.value = err.message || 'Unknown error occurred';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadPreview();
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
