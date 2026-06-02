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

    <v-card flat class="mx-4 mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis">Format</div>
            <v-chip v-if="table?.format" size="small" variant="tonal" color="orange">
              {{ table.format }}
            </v-chip>
            <span v-else class="text-disabled">—</span>
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis">Base Location</div>
            <code class="text-body-2">{{ table?.['base-location'] || '—' }}</code>
          </v-col>
          <v-col v-if="table?.doc" cols="12">
            <div class="text-caption text-medium-emphasis">Description</div>
            <div class="text-body-2">{{ table.doc }}</div>
          </v-col>
          <v-col v-if="hasProperties" cols="12">
            <div class="text-caption text-medium-emphasis mb-2">Properties</div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in table?.properties" :key="key">
                  <td>{{ key }}</td>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <ProtectionConfirmDialog
      v-model="confirmDialog"
      :confirm-color="recursiveDeleteProtection ? 'warning' : 'info'"
      :message="
        recursiveDeleteProtection
          ? 'Are you sure you want to disable recursive delete protection? This will allow the generic table to be deleted.'
          : 'Are you sure you want to enable recursive delete protection? This will prevent the generic table from being deleted.'
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
import { useGenericTablePermissions } from '@/composables/useCatalogPermissions';
import ProtectionConfirmDialog from './ProtectionConfirmDialog.vue';
import type { GenericTableData } from '@/gen/generic-table/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();
const recursiveDeleteProtection = ref(false);
const genericTableId = ref('');
const confirmDialog = ref(false);
const pendingProtectionValue = ref(false);

const { canSetProtection } = useGenericTablePermissions(
  computed(() => genericTableId.value),
  computed(() => props.warehouseId),
);

const table = reactive<Partial<GenericTableData>>({});

const hasProperties = computed(() => table.properties && Object.keys(table.properties).length > 0);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  try {
    const response = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
    );
    Object.assign(table, response.table);
    recursiveDeleteProtection.value = response.table.protected;
    // loadGenericTable does not return id; resolve via listGenericTables for
    // permission/protection lookups which are keyed by generic_table_id.
    const data = await functions.listGenericTables(
      props.warehouseId,
      props.namespaceId,
      undefined,
      false,
    );
    const match = (data.identifiers ?? []).find(
      (g: { name: string }) => g.name === props.tableName,
    );
    if (match?.id) genericTableId.value = match.id;
  } catch (error) {
    console.error('Failed to load generic table data:', error);
  }
}

async function setProtection() {
  if (!genericTableId.value) return;
  try {
    await functions.setGenericTableProtection(
      props.warehouseId,
      genericTableId.value,
      pendingProtectionValue.value,
      true,
    );
    recursiveDeleteProtection.value = pendingProtectionValue.value;
  } catch (error) {
    console.error(error);
    recursiveDeleteProtection.value = !recursiveDeleteProtection.value;
  }
}

function showConfirmDialog() {
  pendingProtectionValue.value = !recursiveDeleteProtection.value;
  confirmDialog.value = true;
}

function cancelProtectionChange() {
  confirmDialog.value = false;
}

async function confirmProtectionChange() {
  confirmDialog.value = false;
  await setProtection();
}

defineExpose({
  loadTableData,
});
</script>
