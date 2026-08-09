<template>
  <div>
    <!-- Thin bar on refreshes so the graph stays visible while reloading -->
    <v-progress-linear v-if="loading && loaded" indeterminate color="primary"></v-progress-linear>

    <!-- Full spinner on the first load (metadata can be large for long histories) -->
    <div
      v-if="loading && !loaded"
      class="d-flex flex-column align-center justify-center text-medium-emphasis py-12">
      <v-progress-circular
        indeterminate
        color="primary"
        size="48"
        class="mb-3"></v-progress-circular>
      Loading version history…
    </div>

    <TableVersioningVisualization
      v-if="loaded"
      :table="table"
      :snapshot-history="snapshotHistory"
      :can-rollback="canCommit"
      :warehouse-id="props.warehouseId"
      :namespace-path="props.namespaceId"
      :table-name="props.tableName"
      @rollback="loadTableData"
      @fast-forward="loadTableData"
      @create-branch="loadTableData"
      @rename-branch="loadTableData"
      @delete-branch="loadTableData"
      @create-tag="loadTableData"
      @rename-tag="loadTableData"
      @delete-tag="loadTableData"
      @refresh="loadTableData" />
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, computed, ref } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import TableVersioningVisualization from './TableVersioningVisualization.vue';
import type { LoadTableResult, Snapshot } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();

const table = reactive<LoadTableResult>({
  metadata: {
    'format-version': 0,
    'table-uuid': '',
  },
});

const tableId = computed(() => table.metadata['table-uuid'] || '');
const { canCommit } = useTablePermissions(
  tableId,
  computed(() => props.warehouseId),
);

const snapshotHistory = reactive<Snapshot[]>([]);

const loading = ref(false);
// Whether the table metadata has been loaded at least once.
const loaded = computed(() => !!table.metadata['table-uuid']);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  loading.value = true;
  try {
    Object.assign(
      table,
      await functions.loadTableCustomized(props.warehouseId, props.namespaceId, props.tableName),
    );

    // Process snapshot history - sort by timestamp descending (newest first)
    snapshotHistory.splice(0, snapshotHistory.length);
    if (table.metadata.snapshots) {
      const sortedSnapshots = [...table.metadata.snapshots].sort((a, b) => {
        return (b['timestamp-ms'] || 0) - (a['timestamp-ms'] || 0);
      });
      snapshotHistory.push(...sortedSnapshots);
    }
  } catch (error) {
    functions.handleError(error, 'loadTableData', true);
  } finally {
    loading.value = false;
  }
}

defineExpose({
  loadTableData,
});
</script>
