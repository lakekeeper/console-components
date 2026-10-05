<template>
  <!-- The host's window item is already bounded and scrolls; this passes that
       height through so the details pane can end where the tab ends. -->
  <div style="height: 100%; min-height: 0">
    <TableDetails
      :table="table"
      :warehouse-id="props.warehouseId"
      :namespace-path="props.namespaceId"
      :table-name="props.tableName"
      :can-edit="canCommit"
      @open-tab="$emit('open-tab', $event)"
      @updated="loadTableData" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import TableDetails from './TableDetails.vue';
import type { LoadTableResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

defineEmits<{
  /** Raised when the pane points at one of the table's other tabs. */
  'open-tab': [tab: string];
}>();

const functions = useFunctions();
const tableId = ref('');

// Table permissions (rename / properties edit are gated on commit)
const { canCommit } = useTablePermissions(
  computed(() => tableId.value),
  computed(() => props.warehouseId),
);

const table = reactive<LoadTableResult>({
  metadata: {
    'format-version': 0,
    'table-uuid': '',
  },
});

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  try {
    Object.assign(
      table,
      await functions.loadTableCustomized(props.warehouseId, props.namespaceId, props.tableName),
    );
    tableId.value = table.metadata['table-uuid'];
  } catch (error) {
    console.error('Failed to load table data:', error);
  }
}

defineExpose({
  loadTableData,
});
</script>
