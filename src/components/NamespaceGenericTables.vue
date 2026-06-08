<template>
  <v-alert v-if="forbidden" type="warning" variant="tonal" class="ma-4">
    You do not have permission to list generic tables in this namespace.
  </v-alert>
  <v-data-table
    v-else
    height="65vh"
    items-per-page="50"
    :search="searchTbl"
    fixed-header
    :items-per-page-options="[
      { title: '50 items', value: 50 },
      { title: '100 items', value: 100 },
    ]"
    @update:options="paginationCheck($event)"
    :headers="headers"
    hover
    :items="loadedTables"
    :sort-by="[{ key: 'name', order: 'asc' }]">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchTbl"
          label="Filter results"
          prepend-inner-icon="mdi-filter"
          variant="underlined"
          hide-details
          clearable></v-text-field>
      </v-toolbar>
    </template>
    <template #item.name="{ item }">
      <td @click="routeToGenericTable(item)" style="cursor: pointer !important">
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2">mdi-table-multiple</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>
    <template #item.format="{ item }">
      <v-chip v-if="item.format" size="small" variant="tonal" color="orange">
        {{ item.format }}
      </v-chip>
    </template>
    <template #item.actions="{ item }">
      <div class="d-flex justify-end align-center">
        <v-btn rounded="pill" variant="flat" @click="openRenameDialog(item)">
          <v-icon color="primary">mdi-pencil-outline</v-icon>
        </v-btn>
        <DeleteDialog
          type="generic-table"
          :name="item.name"
          @delete-table-with-options="deleteGenericTable(item)"></DeleteDialog>
      </div>
    </template>
    <template #no-data>
      <div>No generic tables in this namespace</div>
    </template>
  </v-data-table>

  <v-dialog v-model="renameDialog" max-width="500" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-pencil-outline</v-icon>
        Rename Generic Table
      </v-card-title>
      <v-card-text>
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          Rename generic table
          <strong>"{{ renameOldName }}"</strong>
          within the same namespace.
        </v-alert>
        <v-text-field
          v-model="renameNewName"
          label="New generic table name"
          density="compact"
          hide-details="auto"
          variant="outlined"
          :rules="[
            (v: string) => !!v || 'Required',
            (v: string) => !/\s/.test(v) || 'No spaces allowed',
            (v: string) => v !== renameOldName || 'Must be different from current name',
          ]"
          :placeholder="renameOldName"></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          :disabled="
            !renameNewName ||
            /\s/.test(renameNewName) ||
            renameNewName === renameOldName ||
            renameLoading
          "
          :loading="renameLoading"
          @click="executeRename">
          Rename
        </v-btn>
        <v-btn @click="closeRenameDialog">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { Type } from '@/common/enums';
import type { Header, Options } from '@/common/interfaces';
import type { GenericTableIdentifier } from '@/gen/generic-table/types.gen';
import { isForbiddenError } from '@/common/errorUtils';
import DeleteDialog from './DeleteDialog.vue';

export type GenericTableIdentifierExtended = GenericTableIdentifier & {
  actions: string[];
  type: string;
};

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const router = useRouter();
const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const searchTbl = ref('');
const forbidden = ref(false);
const loadedTables: GenericTableIdentifierExtended[] = reactive([]);
const paginationToken = ref('');

const renameDialog = ref(false);
const renameOldName = ref('');
const renameNewName = ref('');
const renameLoading = ref(false);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Format', key: 'format', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

onMounted(loadGenericTables);
watch(() => [props.namespacePath, props.warehouseId], loadGenericTables);

async function loadGenericTables() {
  forbidden.value = false;
  try {
    const data = await functions.listGenericTables(
      props.warehouseId,
      props.namespacePath,
      undefined,
      false,
    );
    const tmp: GenericTableIdentifierExtended[] = (data.identifiers ?? []).map(
      (g: GenericTableIdentifier) => ({
        ...g,
        actions: ['delete'],
        type: 'generic-table',
      }),
    );
    paginationToken.value = data['next-page-token'] || '';
    loadedTables.splice(0, loadedTables.length);
    Object.assign(loadedTables, tmp);
  } catch (error) {
    if (isForbiddenError(error)) {
      forbidden.value = true;
      return;
    }
    functions.handleError(error, 'listGenericTables');
  }
}

async function paginationCheck(option: Options) {
  if (loadedTables.length >= 10000) return;

  if (option.page * option.itemsPerPage == loadedTables.length && paginationToken.value != '') {
    try {
      const data = await functions.listGenericTables(
        props.warehouseId,
        props.namespacePath,
        paginationToken.value,
      );
      const tmp: GenericTableIdentifierExtended[] = (data.identifiers ?? []).map(
        (g: GenericTableIdentifier) => ({
          ...g,
          actions: ['delete'],
          type: 'generic-table',
        }),
      );
      paginationToken.value = data['next-page-token'] || '';
      loadedTables.push(...tmp);
    } catch (error) {
      if (isForbiddenError(error)) {
        forbidden.value = true;
        return;
      }
      functions.handleError(error, 'listGenericTables');
    }
  }
}

async function deleteGenericTable(item: GenericTableIdentifierExtended) {
  try {
    await functions.dropGenericTable(props.warehouseId, props.namespacePath, item.name, notify);
    await loadGenericTables();
  } catch (error) {
    functions.handleError(error, `Failed to drop generic-table ${item.name}`, true);
  }
}

async function routeToGenericTable(item: GenericTableIdentifierExtended) {
  try {
    await functions.loadGenericTable(props.warehouseId, props.namespacePath, item.name, false);
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visual.setSnackbarMsg({
        function: 'routeToGenericTable',
        text: `Access denied: generic table "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visual.setSnackbarMsg({
        function: 'routeToGenericTable',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    return;
  }
  router.push(
    `/warehouse/${props.warehouseId}/namespace/${props.namespacePath}/generic-table/${encodeURIComponent(item.name)}`,
  );
}

function openRenameDialog(item: GenericTableIdentifierExtended) {
  renameOldName.value = item.name;
  renameNewName.value = '';
  renameDialog.value = true;
}

function closeRenameDialog() {
  renameDialog.value = false;
  renameOldName.value = '';
  renameNewName.value = '';
}

async function executeRename() {
  if (!renameNewName.value) return;

  renameLoading.value = true;
  try {
    await functions.renameGenericTable(
      props.warehouseId,
      props.namespacePath,
      renameOldName.value,
      props.namespacePath,
      renameNewName.value,
      notify,
    );
    closeRenameDialog();
    await loadGenericTables();
  } catch {
    // error handled by functions plugin
  } finally {
    renameLoading.value = false;
  }
}

defineExpose({
  loadGenericTables,
});
</script>
