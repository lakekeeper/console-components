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
    :items="filteredRows"
    :sort-by="[{ key: 'name', order: 'asc' }]">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-btn-toggle
          v-model="typeFilter"
          density="compact"
          variant="outlined"
          mandatory
          color="primary"
          class="ml-2">
          <v-btn value="all" size="small">All</v-btn>
          <v-btn value="iceberg" size="small">Iceberg</v-btn>
          <v-btn value="generic" size="small">Generic</v-btn>
        </v-btn-toggle>
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
      <td @click="routeToRow(item)" style="cursor: pointer !important">
        <span style="display: flex; align-items: center">
          <v-icon v-if="formatIcon(item.format)" size="small" class="mr-2">
            <v-img :src="formatIcon(item.format)!" width="18" height="18" />
          </v-icon>
          <v-icon v-else size="small" color="grey" class="mr-2">mdi-alpha-g</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>
    <template #item.actions="{ item }">
      <div class="d-flex justify-end align-center">
        <v-btn rounded="pill" variant="flat" @click="openRenameDialog(item)">
          <v-icon color="primary">mdi-pencil-outline</v-icon>
        </v-btn>
        <DeleteDialog
          :type="item.source === 'generic' ? 'generic-table' : 'table'"
          :name="item.name"
          @delete-table-with-options="onDelete($event, item)"></DeleteDialog>
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
        Rename {{ renameTarget?.source === 'generic' ? 'Generic Table' : 'Table' }}
      </v-card-title>
      <v-card-text>
        <template v-if="isDefaultLayout || renameTarget?.source === 'generic'">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Rename
            <strong>"{{ renameOldName }}"</strong>
            within the same namespace.
          </v-alert>
          <v-text-field
            v-model="renameNewName"
            label="New name"
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
          v-if="isDefaultLayout || renameTarget?.source === 'generic'"
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
        <v-btn @click="closeRenameDialog">
          {{ isDefaultLayout || renameTarget?.source === 'generic' ? 'Cancel' : 'Close' }}
        </v-btn>
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
import type { GenericTableIdentifier } from '@/gen/generic-table/types.gen';
import { isForbiddenError } from '@/common/errorUtils';
import icebergIcon from '@/assets/iceberg.svg';
import deltaIcon from '@/assets/delta.svg';
import vortexLightIcon from '@/assets/vortex_logo.svg';
import vortexDarkIcon from '@/assets/vortex_logo_dark_theme.svg';
import lanceIcon from '@/assets/lance.png';

type TableRow = {
  name: string;
  namespace?: string[];
  /** Iceberg tables don't return a UUID from listTables — only generic tables do. */
  id?: string;
  /** Discriminator: 'iceberg' = Iceberg table; 'generic' = generic table. */
  source: 'iceberg' | 'generic';
  /** Display value for the Format column. */
  format: string;
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
const typeFilter = ref<'all' | 'iceberg' | 'generic'>('all');
const forbidden = ref(false);
const loadedRows: TableRow[] = reactive([]);
const paginationToken = ref('');

const renameDialog = ref(false);
const renameOldName = ref('');
const renameNewName = ref('');
const renameLoading = ref(false);
const renameTarget = ref<TableRow | null>(null);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

// Per-format brand icon. Anything outside this map falls back to `mdi-alpha-g`.
// Vortex ships dark/light variants — pick by the current theme.
function formatIcon(format?: string): string | null {
  switch ((format ?? '').toLowerCase()) {
    case 'iceberg':
      return icebergIcon;
    case 'delta':
      return deltaIcon;
    case 'lance':
      return lanceIcon;
    case 'vortex':
      return visual.themeLight ? vortexLightIcon : vortexDarkIcon;
    default:
      return null;
  }
}

const filteredRows = computed(() => {
  if (typeFilter.value === 'all') return loadedRows;
  return loadedRows.filter((r) =>
    typeFilter.value === 'iceberg' ? r.source === 'iceberg' : r.source === 'generic',
  );
});

onMounted(loadAll);
watch(() => props.namespacePath, loadAll);

async function loadAll() {
  forbidden.value = false;
  try {
    const [icebergRows, genericRows] = await Promise.all([loadIceberg(undefined), loadGeneric()]);
    loadedRows.splice(0, loadedRows.length);
    loadedRows.push(...icebergRows, ...genericRows);
  } catch (error) {
    if (isForbiddenError(error)) {
      forbidden.value = true;
      return;
    }
    functions.handleError(error, 'NamespaceTables.loadAll');
  }
}

async function loadIceberg(pageToken: string | undefined): Promise<TableRow[]> {
  try {
    const data = await functions.listTables(
      props.warehouseId,
      props.namespacePath,
      pageToken,
      false,
    );
    paginationToken.value = data['next-page-token'] || '';
    return (data.identifiers ?? []).map((t: TableIdentifier) => ({
      name: t.name,
      namespace: t.namespace,
      source: 'iceberg' as const,
      format: 'iceberg',
    }));
  } catch (error) {
    if (isForbiddenError(error)) throw error;
    functions.handleError(error, 'listTables');
    return [];
  }
}

async function loadGeneric(): Promise<TableRow[]> {
  try {
    const data = await functions.listGenericTables(
      props.warehouseId,
      props.namespacePath,
      undefined,
      false,
    );
    return (data.identifiers ?? []).map((g: GenericTableIdentifier) => ({
      name: g.name,
      namespace: g.namespace,
      id: g.id ?? undefined,
      source: 'generic' as const,
      format: g.format || 'generic',
    }));
  } catch (error) {
    if (isForbiddenError(error)) return [];
    functions.handleError(error, 'listGenericTables');
    return [];
  }
}

async function paginationCheck(option: Options) {
  if (loadedRows.length >= 10000) return;
  // Only the Iceberg list endpoint paginates; the trigger has to be based on the
  // Iceberg row count alone, otherwise generic-table rows would push the table
  // past the current page and the "fetch next page" condition would never fire.
  const icebergCount = loadedRows.filter((r) => r.source === 'iceberg').length;
  if (option.page * option.itemsPerPage == icebergCount && paginationToken.value != '') {
    const more = await loadIceberg(paginationToken.value);
    loadedRows.push(...more);
  }
}

async function onDelete(e: any, item: TableRow) {
  try {
    if (item.source === 'generic') {
      await functions.dropGenericTable(props.warehouseId, props.namespacePath, item.name, notify);
    } else {
      await functions.dropTable(props.warehouseId, props.namespacePath, item.name, e, notify);
    }
    await loadAll();
  } catch (error) {
    functions.handleError(error, `Failed to drop ${item.source}-${item.name}`, true);
  }
}

async function routeToRow(item: TableRow) {
  const segment = item.source === 'generic' ? 'generic-table' : 'table';
  try {
    if (item.source === 'generic') {
      await functions.loadGenericTable(props.warehouseId, props.namespacePath, item.name, false);
    } else {
      await functions.loadTable(props.warehouseId, props.namespacePath, item.name, false);
    }
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    const label = item.source === 'generic' ? 'generic table' : 'table';
    visual.setSnackbarMsg({
      function: 'routeToRow',
      text: code === 403 || code === 404 ? `Access denied: ${label} "${item.name}"` : message,
      ttl: 3000,
      ts: Date.now(),
      type: Type.ERROR,
    });
    return;
  }
  router.push(
    `/warehouse/${props.warehouseId}/namespace/${props.namespacePath}/${segment}/${encodeURIComponent(item.name)}`,
  );
}

function openRenameDialog(item: TableRow) {
  renameTarget.value = item;
  renameOldName.value = item.name;
  renameNewName.value = '';
  renameDialog.value = true;
}

function closeRenameDialog() {
  renameDialog.value = false;
  renameTarget.value = null;
  renameOldName.value = '';
  renameNewName.value = '';
}

async function executeRename() {
  if (!renameNewName.value || !renameTarget.value) return;

  renameLoading.value = true;
  try {
    if (renameTarget.value.source === 'generic') {
      await functions.renameGenericTable(
        props.warehouseId,
        props.namespacePath,
        renameOldName.value,
        props.namespacePath,
        renameNewName.value,
        notify,
      );
    } else {
      await functions.renameTable(
        props.warehouseId,
        props.namespacePath,
        renameOldName.value,
        renameNewName.value,
        notify,
      );
    }
    closeRenameDialog();
    await loadAll();
  } catch {
    // error handled by functions plugin
  } finally {
    renameLoading.value = false;
  }
}

defineExpose({
  loadTables: loadAll,
});
</script>
