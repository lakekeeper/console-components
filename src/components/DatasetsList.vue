<template>
  <div>
    <v-alert
      v-if="error"
      :type="errorRefused ? 'warning' : 'error'"
      variant="tonal"
      density="compact"
      class="ma-4">
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
        { title: '50', value: 50 },
        { title: '100', value: 100 },
      ]"
      item-value="name"
      hover>
      <template #top>
        <v-toolbar color="transparent" density="compact" flat>
          <!-- Only once some selected row is one this user may drop. -->
          <v-btn
            v-if="selected.some((n) => canDropName(n))"
            color="error"
            variant="text"
            size="small"
            prepend-icon="mdi-delete-outline"
            :loading="bulkDeleting"
            @click="confirmBulkDelete">
            Delete ({{ selected.length }})
          </v-btn>
          <v-spacer></v-spacer>
          <!-- A dataset is a generic table: creating one needs
               create_generic_table on the namespace. -->
          <DatasetCreate
            v-if="rights.can(namespaceTarget, 'create_generic_table') === true"
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
          <v-btn
            v-if="canRenameName(item.name)"
            icon="mdi-pencil-outline"
            size="small"
            variant="text"
            title="Rename"
            @click.stop="openRename(item)"></v-btn>
          <v-btn
            v-if="canDropName(item.name)"
            icon="mdi-delete-outline"
            size="small"
            variant="text"
            color="error"
            title="Delete"
            @click.stop="openDelete(item)"></v-btn>
        </div>
      </template>

      <template #no-data>
        <!-- A refused list is said above; "No datasets" would contradict it. -->
        <div v-if="error"></div>
        <v-empty-state
          v-else
          icon="mdi-folder-multiple-outline"
          text="No datasets in this namespace"></v-empty-state>
      </template>
    </v-data-table>

    <!-- Rename dialog -->
    <v-dialog v-model="renameOpen" max-width="440" persistent>
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
          <v-alert v-if="renameError" type="error" variant="tonal" density="compact" class="mt-3">
            {{ renameError }}
          </v-alert>
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
    <v-dialog v-model="deleteOpen" max-width="440">
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
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
          <v-alert v-if="deleteError" type="error" variant="tonal" density="compact" class="mt-3">
            {{ deleteError }}
          </v-alert>
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
    <v-dialog v-model="bulkDeleteOpen" max-width="440">
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
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
              :subtitle="
                bulkErrors[name] ??
                (canDropName(name) ? '' : 'You are not allowed to delete it; it stays.')
              "
              :class="bulkErrors[name] ? 'text-error' : ''"
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
import { computed, ref, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { isForbiddenError } from '@/common/errorUtils';
import { useItemRights, type ItemTarget } from '@/composables/useItemRights';
import { tagRefusal } from '@/composables/useTagRights';
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
const errorRefused = ref(false);
const selected = ref<string[]>([]);

// --- Rights per row ---------------------------------------------------------
const rights = useItemRights();
const namespaceTarget = computed<ItemTarget>(() => ({
  kind: 'namespace',
  warehouseId: props.warehouseId,
  namespace: props.namespacePath.split('\x1F'),
}));
function rowTarget(name: string): ItemTarget {
  return {
    kind: 'generic-table',
    warehouseId: props.warehouseId,
    namespace: props.namespacePath.split('\x1F'),
    name,
  };
}
function canDropName(name: string): boolean {
  return rights.can(rowTarget(name), 'drop') === true;
}
function canRenameName(name: string): boolean {
  return (
    rights.can(rowTarget(name), 'rename') === true &&
    rights.can(namespaceTarget.value, 'create_generic_table') === true
  );
}

const headers = [
  { title: 'Name', key: 'name', align: 'start' as const },
  { title: 'Actions', key: 'actions', align: 'end' as const, sortable: false },
];

// Rename
const renameOpen = ref(false);
const renameTarget = ref('');
const renameValue = ref('');
const renameLoading = ref(false);
const renameError = ref('');

// Single delete
const deleteOpen = ref(false);
const deleteTarget = ref('');
const deleteConfirmInput = ref('');
const deleteLoading = ref(false);
const deleteError = ref('');

// Bulk delete
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);
const bulkErrors = ref<Record<string, string>>({});

async function load() {
  loading.value = true;
  error.value = null;
  errorRefused.value = false;
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
    // In place only: the alert above is the report, a snackbar would repeat it.
    datasets.value = [];
    errorRefused.value = isForbiddenError(e);
    error.value = errorRefused.value
      ? 'You are not allowed to list datasets in this namespace.'
      : tagRefusal(e, 'list datasets');
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
  renameError.value = '';
  renameOpen.value = true;
}

async function executeRename() {
  if (!renameValue.value || renameValue.value === renameTarget.value) return;
  renameLoading.value = true;
  renameError.value = '';
  try {
    await functions.renameGenericTable(
      props.warehouseId,
      props.namespacePath,
      renameTarget.value,
      props.namespacePath,
      renameValue.value,
      false,
    );
    renameOpen.value = false;
    await load();
  } catch (e) {
    renameError.value = tagRefusal(e, 'rename this dataset');
  } finally {
    renameLoading.value = false;
  }
}

function openDelete(item: any) {
  deleteTarget.value = item.name;
  deleteConfirmInput.value = '';
  deleteError.value = '';
  deleteOpen.value = true;
}

async function executeDelete() {
  deleteLoading.value = true;
  deleteError.value = '';
  try {
    await functions.dropGenericTable(
      props.warehouseId,
      props.namespacePath,
      deleteTarget.value,
      false,
    );
    deleteOpen.value = false;
    await load();
  } catch (e) {
    deleteError.value = tagRefusal(e, 'delete this dataset');
  } finally {
    deleteLoading.value = false;
  }
}

function confirmBulkDelete() {
  bulkErrors.value = {};
  bulkDeleteOpen.value = true;
}

async function executeBulkDelete() {
  bulkDeleting.value = true;
  bulkErrors.value = {};
  try {
    // Rows from other pages may not have been asked yet; the refused stay.
    await rights.ensure(selected.value.map(rowTarget), ['drop']);
    const allowed = selected.value.filter((n) => rights.can(rowTarget(n), 'drop') !== false);
    const outcomes = await Promise.allSettled(
      allowed.map((name) =>
        functions.dropGenericTable(props.warehouseId, props.namespacePath, name, false),
      ),
    );
    // A failure is reported on its row in the dialog, which stays open for it.
    const errors: Record<string, string> = {};
    outcomes.forEach((o, i) => {
      if (o.status === 'rejected') errors[allowed[i]] = tagRefusal(o.reason, 'delete it');
    });
    bulkErrors.value = errors;
    if (!Object.keys(errors).length) bulkDeleteOpen.value = false;
    await load();
    selected.value = selected.value.filter((n) => errors[n] || !allowed.includes(n));
  } finally {
    bulkDeleting.value = false;
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);
</script>
