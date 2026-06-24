<template>
  <div>
    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="ma-4">
      {{ error }}
    </v-alert>

    <v-data-table
      v-model="selected"
      height="65vh"
      items-per-page="50"
      fixed-header
      show-select
      :headers="headers"
      :items="datasets"
      :loading="loading"
      :sort-by="[{ key: 'name', order: 'asc' }]"
      :items-per-page-options="[
        { title: '50 items', value: 50 },
        { title: '100 items', value: 100 },
      ]"
      item-value="name"
      hover>
      <template #top>
        <v-toolbar color="transparent" density="compact" flat>
          <v-btn
            v-if="selected.length"
            color="error"
            variant="tonal"
            size="small"
            prepend-icon="mdi-delete-outline"
            :loading="bulkDeleting"
            @click="confirmBulkDelete">
            Delete ({{ selected.length }})
          </v-btn>
          <v-spacer></v-spacer>
          <DatasetCreate
            :warehouse-id="warehouseId"
            :namespace-path="namespacePath"
            @created="reload" />
        </v-toolbar>
      </template>

      <template #item.name="{ item }">
        <td style="cursor: pointer" @click="handleSelect(item)">
          <span class="d-flex align-center">
            <v-icon color="amber-darken-2" class="mr-2" size="small">
              mdi-folder-multiple-outline
            </v-icon>
            {{ item.name }}
          </span>
        </td>
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex justify-end align-center">
          <v-btn icon size="small" variant="text" title="Rename" @click.stop="openRename(item)">
            <v-icon size="small">mdi-pencil-outline</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            color="error"
            title="Delete"
            @click.stop="openDelete(item)">
            <v-icon size="small">mdi-delete-outline</v-icon>
          </v-btn>
        </div>
      </template>

      <template #no-data>
        <div class="text-center py-6 text-medium-emphasis">
          <v-icon size="48" color="grey">mdi-folder-multiple-outline</v-icon>
          <div class="mt-2">No datasets in this namespace</div>
        </div>
      </template>
    </v-data-table>

    <!-- Rename dialog -->
    <v-dialog v-model="renameOpen" max-width="480" persistent>
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-pencil-outline</v-icon>
          Rename Dataset
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <v-text-field
            v-model="renameValue"
            label="Dataset name"
            density="compact"
            variant="outlined"
            hide-details="auto"
            :placeholder="renameTarget"
            :rules="[
              (v: string) => !!v || 'Required',
              (v: string) => !/\s/.test(v) || 'No spaces allowed',
              (v: string) => v !== renameTarget || 'Must be different from current name',
            ]" />
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="renameLoading" @click="renameOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="renameLoading"
            :disabled="!renameValue || /\s/.test(renameValue) || renameValue === renameTarget"
            @click="executeRename">
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete single dialog -->
    <v-dialog v-model="deleteOpen" max-width="480">
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
          Delete Dataset
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <p>
            Permanently delete
            <strong>{{ deleteTarget }}</strong>
            ?
            <span class="text-error font-weight-bold">This cannot be undone.</span>
          </p>
          <v-text-field
            v-model="deleteConfirmInput"
            class="mt-3"
            density="compact"
            variant="outlined"
            autocomplete="off"
            :label="`Type &quot;${deleteTarget}&quot; to confirm`"
            :error="deleteConfirmInput.length > 0 && deleteConfirmInput !== deleteTarget" />
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="deleteLoading" @click="deleteOpen = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="deleteLoading"
            :disabled="deleteConfirmInput !== deleteTarget"
            @click="executeDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Bulk delete dialog -->
    <v-dialog v-model="bulkDeleteOpen" max-width="480">
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
          Delete {{ selected.length }} Datasets
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <p>
            Permanently delete
            <strong>{{ selected.length }}</strong>
            dataset{{ selected.length === 1 ? '' : 's' }}?
            <span class="text-error font-weight-bold">This cannot be undone.</span>
          </p>
          <v-list density="compact" class="mt-2">
            <v-list-item
              v-for="name in selected"
              :key="name"
              :title="name"
              prepend-icon="mdi-folder-multiple-outline" />
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="bulkDeleting" @click="bulkDeleteOpen = false">
            Cancel
          </v-btn>
          <v-btn color="error" variant="flat" :loading="bulkDeleting" @click="executeBulkDelete">
            Delete all
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import DatasetCreate from './DatasetCreate.vue';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const emit = defineEmits<{
  (e: 'select', dataset: { name: string; namespaceId: string; tableId: string }): void;
}>();

const functions = useFunctions();

const datasets = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selected = ref<string[]>([]);

const headers = [
  { title: 'Name', key: 'name', align: 'start' as const },
  { title: 'Actions', key: 'actions', align: 'end' as const, sortable: false },
];

// Rename
const renameOpen = ref(false);
const renameTarget = ref('');
const renameValue = ref('');
const renameLoading = ref(false);

// Single delete
const deleteOpen = ref(false);
const deleteTarget = ref('');
const deleteConfirmInput = ref('');
const deleteLoading = ref(false);

// Bulk delete
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await functions.listGenericTables(
      props.warehouseId,
      props.namespacePath,
      undefined,
      false,
      1000,
    );
    datasets.value = (data.identifiers ?? []).filter((g: any) => g.format === 'dataset');
  } catch (e: any) {
    error.value = e?.error?.message || e?.message || 'Failed to load datasets';
    functions.handleError(e, 'listGenericTables');
  } finally {
    loading.value = false;
  }
}

async function reload() {
  selected.value = [];
  await load();
}

function handleSelect(item: any) {
  emit('select', {
    name: item.name,
    namespaceId: props.namespacePath,
    tableId: item.id ?? '',
  });
}

function openRename(item: any) {
  renameTarget.value = item.name;
  renameValue.value = '';
  renameOpen.value = true;
}

async function executeRename() {
  if (!renameValue.value || renameValue.value === renameTarget.value) return;
  renameLoading.value = true;
  try {
    await functions.renameGenericTable(
      props.warehouseId,
      props.namespacePath,
      renameTarget.value,
      props.namespacePath,
      renameValue.value,
      true,
    );
    renameOpen.value = false;
    await load();
  } catch {
    // handled by functions plugin
  } finally {
    renameLoading.value = false;
  }
}

function openDelete(item: any) {
  deleteTarget.value = item.name;
  deleteConfirmInput.value = '';
  deleteOpen.value = true;
}

async function executeDelete() {
  deleteLoading.value = true;
  try {
    await functions.dropGenericTable(
      props.warehouseId,
      props.namespacePath,
      deleteTarget.value,
      true,
    );
    deleteOpen.value = false;
    await load();
  } catch {
    // handled by functions plugin
  } finally {
    deleteLoading.value = false;
  }
}

function confirmBulkDelete() {
  bulkDeleteOpen.value = true;
}

async function executeBulkDelete() {
  bulkDeleting.value = true;
  try {
    await Promise.all(
      selected.value.map((name) =>
        functions.dropGenericTable(props.warehouseId, props.namespacePath, name, false),
      ),
    );
    bulkDeleteOpen.value = false;
    await reload();
  } catch {
    // handled by functions plugin
  } finally {
    bulkDeleting.value = false;
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);
</script>
