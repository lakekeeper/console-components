<template>
  <TableBranchVisualization
    :table="table"
    :snapshot-history="snapshotHistory"
    :can-rollback="canCommit"
    :warehouse-id="props.warehouseId"
    :namespace-path="props.namespaceId"
    :table-name="props.tableName"
    @rollback="loadTableData" />
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import TableBranchVisualization from './TableBranchVisualization.vue';
import type { LoadTableResult, Snapshot } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();

const tableId = computed(() => table.metadata['table-uuid'] || '');
const { canCommit } = useTablePermissions(
  tableId,
  computed(() => props.warehouseId),
);

const table = reactive<LoadTableResult>({
  metadata: {
    'format-version': 0,
    'table-uuid': '',
  },
});

const snapshotHistory = reactive<Snapshot[]>([]);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
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
    console.error('Failed to load table data:', error);
  }
}

defineExpose({
  loadTableData,
});
</script>
