<template>
  <v-alert v-if="forbidden" type="warning" variant="tonal" class="ma-4">
    You do not have permission to list tables in this namespace.
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
      <td @click="routeToTable(item)" style="cursor: pointer !important">
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2">mdi-table</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>
    <template #item.actions="{ item }">
      <div class="d-flex justify-end align-center">
        <v-btn
          v-if="item.type === 'table'"
          rounded="pill"
          variant="flat"
          @click="openRenameDialog(item)">
          <v-icon color="primary">mdi-pencil-outline</v-icon>
        </v-btn>
        <DeleteDialog
          v-if="item.type === 'table'"
          :type="item.type"
          :name="item.name"
          @delete-table-with-options="deleteTableWithOptions($event, item)"></DeleteDialog>
      </div>
    </template>
    <template #no-data>
      <div>No tables in this namespace</div>
    </template>
  </v-data-table>

  <!-- Rename dialog -->
  <v-dialog v-model="renameDialog" max-width="500" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-pencil-outline</v-icon>
        Rename Table
      </v-card-title>
      <v-card-text>
        <template v-if="isDefaultLayout">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Rename table
            <strong>"{{ renameOldName }}"</strong>
            within the same namespace.
          </v-alert>
          <v-text-field
            v-model="renameNewName"
            label="New table name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v: string) => !!v || 'Required',
              (v: string) => !/\s/.test(v) || 'No spaces allowed',
              (v: string) => v !== renameOldName || 'Must be different from current name',
            ]"
            :placeholder="renameOldName"></v-text-field>
        </template>
        <v-alert v-else type="warning" variant="tonal" density="compact">
          Renaming is not available because the warehouse uses a non-default storage layout. Table
          locations are derived from the table name, so renaming would break the storage path.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          v-if="isDefaultLayout"
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
        <v-btn @click="closeRenameDialog">{{ isDefaultLayout ? 'Cancel' : 'Close' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { Type } from '@/common/enums';
import type { Header, Options } from '@/common/interfaces';
import type { TableIdentifier } from '@/gen/iceberg/types.gen';
import { isForbiddenError } from '@/common/errorUtils';

export type TableIdentifierExtended = TableIdentifier & {
  actions: string[];
  id: string;
  type: string;
};

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
  storageLayout?: string;
}>();

const router = useRouter();
const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const isDefaultLayout = computed(() => !props.storageLayout || props.storageLayout === 'default');

const searchTbl = ref('');
const forbidden = ref(false);
const loadedTables: TableIdentifierExtended[] = reactive([]);
const paginationToken = ref('');

// Rename state
const renameDialog = ref(false);
const renameOldName = ref('');
const renameNewName = ref('');
const renameLoading = ref(false);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

onMounted(loadTables);
watch(() => props.namespacePath, loadTables);

async function loadTables() {
  forbidden.value = false;
  try {
    const loadedTablesTmp: TableIdentifierExtended[] = [];
    const data = await functions.listTables(
      props.warehouseId,
      props.namespacePath,
      undefined,
      false,
    );
    Object.assign(loadedTablesTmp, data.identifiers);
    paginationToken.value = data['next-page-token'] || '';

    loadedTablesTmp.forEach((table) => {
      table.actions = ['delete'];
      table.type = 'table';
    });

    loadedTables.splice(0, loadedTables.length);
    Object.assign(loadedTables, loadedTablesTmp);
  } catch (error) {
    if (isForbiddenError(error)) {
      forbidden.value = true;
      return;
    }
  }
}

async function paginationCheck(option: Options) {
  if (loadedTables.length >= 10000) return;

  if (option.page * option.itemsPerPage == loadedTables.length && paginationToken.value != '') {
    const loadedTablesTmp: TableIdentifierExtended[] = [];
    const data = await functions.listTables(
      props.warehouseId,
      props.namespacePath,
      paginationToken.value,
    );
    Object.assign(loadedTablesTmp, data.identifiers);
    paginationToken.value = data['next-page-token'] || '';
    loadedTablesTmp.forEach((table) => {
      table.actions = ['delete'];
      table.type = 'table';
    });

    loadedTables.push(...loadedTablesTmp.flat());
  }
}

async function deleteTableWithOptions(e: any, item: TableIdentifierExtended) {
  try {
    await functions.dropTable(props.warehouseId, props.namespacePath, item.name, e, notify);
    await loadTables();
  } catch (error) {
    console.error(`Failed to drop table-${item.name}`, error);
  }
}

async function routeToTable(item: TableIdentifierExtended) {
  try {
    await functions.loadTable(props.warehouseId, props.namespacePath, item.name, false);
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visual.setSnackbarMsg({
        function: 'routeToTable',
        text: `Access denied: table "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visual.setSnackbarMsg({
        function: 'routeToTable',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    return;
  }
  router.push(
    `/warehouse/${props.warehouseId}/namespace/${props.namespacePath}/table/${encodeURIComponent(item.name)}`,
  );
}

function openRenameDialog(item: TableIdentifierExtended) {
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
    await functions.renameTable(
      props.warehouseId,
      props.namespacePath,
      renameOldName.value,
      renameNewName.value,
      notify,
    );
    closeRenameDialog();
    await loadTables();
  } catch {
    // error handled by functions plugin
  } finally {
    renameLoading.value = false;
  }
}

defineExpose({
  loadTables,
});
</script>
