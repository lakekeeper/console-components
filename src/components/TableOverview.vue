<template>
  <div>
    <v-toolbar color="transparent" density="compact" flat>
      <v-switch
        v-if="canSetProtection"
        v-model="recursiveDeleteProtection"
        class="ml-4 mt-4"
        color="info"
        :label="
          recursiveDeleteProtection
            ? 'Recursive Delete Protection enabled'
            : 'Recursive Delete Protection disabled'
        "
        @click.prevent="showConfirmDialog"></v-switch>
    </v-toolbar>

    <TableDetails
      :table="table"
      :warehouse-id="warehouseId"
      :namespace-id="namespaceId"
      :table-name="tableName"
      :catalog-url="functions.icebergCatalogUrlSuffixed()" />

    <ProtectionConfirmDialog
      v-model="confirmDialog"
      :confirm-color="recursiveDeleteProtection ? 'warning' : 'info'"
      :message="
        recursiveDeleteProtection
          ? 'Are you sure you want to disable recursive delete protection? This will allow the table to be deleted.'
          : 'Are you sure you want to enable recursive delete protection? This will prevent the table from being deleted.'
      "
      :title="
        recursiveDeleteProtection ? 'Disable Delete Protection?' : 'Enable Delete Protection?'
      "
      @cancel="cancelProtectionChange"
      @confirm="confirmProtectionChange"></ProtectionConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import TableDetails from './TableDetails.vue';
import ProtectionConfirmDialog from './ProtectionConfirmDialog.vue';
import type { LoadTableResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();
const recursiveDeleteProtection = ref(false);
const tableId = ref('');
const confirmDialog = ref(false);
const pendingProtectionValue = ref(false);

// Use table permissions composable
const { canSetProtection } = useTablePermissions(
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
    if (tableId.value) {
      await getProtection();
    }
  } catch (error) {
    console.error('Failed to load table data:', error);
  }
}

async function getProtection() {
  try {
    recursiveDeleteProtection.value = (
      await functions.getTableProtection(props.warehouseId, tableId.value)
    ).protected;
  } catch (error) {
    console.error(error);
  }
}

async function setProtection() {
  try {
    await functions.setTableProtection(
      props.warehouseId,
      tableId.value,
      pendingProtectionValue.value,
      true,
    );
    await getProtection();
  } catch (error) {
    console.error(error);
    // Revert the switch if API call failed
    recursiveDeleteProtection.value = !recursiveDeleteProtection.value;
  }
}

function showConfirmDialog() {
  // Store the desired value (opposite of current)
  pendingProtectionValue.value = !recursiveDeleteProtection.value;
  confirmDialog.value = true;
}

function cancelProtectionChange() {
  // Do nothing - switch will stay at current value
  confirmDialog.value = false;
}

async function confirmProtectionChange() {
  confirmDialog.value = false;
  // Toggle the switch
  recursiveDeleteProtection.value = pendingProtectionValue.value;
  // Make the API call
  await setProtection();
}

defineExpose({
  loadTableData,
});
</script>
