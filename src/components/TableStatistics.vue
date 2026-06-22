<template>
  <div>
    <v-alert v-if="tableError" type="warning" variant="tonal" class="mb-4">
      {{ tableError }}
    </v-alert>
    <div v-else-if="tableLoading" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
    </div>
    <!-- On-demand per-column profiling (scans data) -->
    <TableColumnProfiler
      v-else-if="metadata"
      :metadata="metadata"
      :warehouse-id="warehouseId"
      :namespace-id="namespaceId"
      :table-name="tableName"
      :catalog-url="catalogUrl" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import TableColumnProfiler from './TableColumnProfiler.vue';
import type { LoadTableResult, TableMetadata } from '../gen/iceberg/types.gen';

const props = defineProps<{
  table?: LoadTableResult;
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  catalogUrl?: string;
}>();

const functions = useFunctions();
const loadedTable = ref<LoadTableResult | null>(null);
const tableLoading = ref(false);
const tableError = ref<string | null>(null);

const metadata = computed<TableMetadata | null>(
  () => props.table?.metadata ?? loadedTable.value?.metadata ?? null,
);

async function loadTableData() {
  if (props.table?.metadata) return; // parent already provides it
  if (!props.warehouseId || !props.namespaceId || !props.tableName) return;
  tableLoading.value = true;
  tableError.value = null;
  try {
    loadedTable.value = (await functions.loadTableCustomized(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
    )) as LoadTableResult;
  } catch (err: any) {
    console.error('Failed to load table metadata:', err);
    tableError.value = err.message || String(err);
  } finally {
    tableLoading.value = false;
  }
}

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);
</script>
