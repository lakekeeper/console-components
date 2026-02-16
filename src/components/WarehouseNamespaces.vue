<template>
  <v-data-table
    height="60vh"
    :search="searchNamespace"
    fixed-header
    :headers="headers"
    hover
    items-per-page="50"
    :items="loadedWarehouseItems"
    :sort-by="[{ key: 'name', order: 'asc' }]"
    :items-per-page-options="[
      { title: '50 items', value: 50 },
      { title: '100 items', value: 100 },
    ]"
    @update:options="paginationCheckNamespace($event)">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-switch
          v-if="canSetProtection"
          v-model="recursiveDeleteProtection"
          class="ml-4 mt-4"
          color="info"
          :label="
            !recursiveDeleteProtection
              ? 'Recursive Delete Protection disabled'
              : 'Recursive Delete Protection enabled'
          "
          @click.prevent="showConfirmDialog"></v-switch>
        <v-spacer v-if="canSetProtection"></v-spacer>
        <v-text-field
          v-model="searchNamespace"
          label="Filter results"
          prepend-inner-icon="mdi-filter"
          variant="underlined"
          hide-details
          clearable></v-text-field>
        <NamespaceAddDialog
          v-if="canCreateNamespace"
          :parent-path="''"
          :status-intent="createNamespaceStatus"
          @add-namespace="addNamespace" />
      </v-toolbar>
    </template>
    <template #item.name="{ item }">
      <td @click="routeToNamespace(item)" style="cursor: pointer !important">
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2">mdi-folder</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>

    <template #item.actions="{ item }">
      <DeleteDialog
        v-if="item.type === 'namespace' && canDelete"
        :type="item.type"
        :name="item.name"
        @delete-with-options="deleteNamespaceWithOptions($event, item)"></DeleteDialog>
    </template>
  </v-data-table>

  <ProtectionConfirmDialog
    v-model="confirmDialog"
    :confirm-color="recursiveDeleteProtection ? 'warning' : 'info'"
    :message="
      recursiveDeleteProtection
        ? 'Are you sure you want to disable recursive delete protection? This will allow the warehouse to be deleted.'
        : 'Are you sure you want to enable recursive delete protection? This will prevent the warehouse from being deleted.'
    "
    :title="recursiveDeleteProtection ? 'Disable Delete Protection?' : 'Enable Delete Protection?'"
    @cancel="cancelProtectionChange"
    @confirm="confirmProtectionChange"></ProtectionConfirmDialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { useWarehousePermissions } from '../composables/useCatalogPermissions';
import type { Header, Item, Options } from '@/common/interfaces';
import { StatusIntent, Type } from '@/common/enums';
import ProtectionConfirmDialog from './ProtectionConfirmDialog.vue';

const props = defineProps<{
  warehouseId: string;
}>();

const emit = defineEmits<{
  (e: 'namespace-updated'): void;
}>();

const router = useRouter();
const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

// Use warehouse permissions composable
const { canDelete, canCreateNamespace, canSetProtection } = useWarehousePermissions(
  props.warehouseId,
);

const searchNamespace = ref('');
const recursiveDeleteProtection = ref(false);
const createNamespaceStatus = ref<StatusIntent>(StatusIntent.INACTIVE);
const loadedWarehouseItems: Item[] = reactive([]);
const paginationTokenNamespace = ref('');
const confirmDialog = ref(false);
const pendingProtectionValue = ref(false);

// Load namespaces and warehouse protection status on mount
onMounted(() => {
  loadWarehouse();
  loadNamespaces();
});

// Reload when warehouse ID changes
watch(
  () => props.warehouseId,
  () => {
    loadWarehouse();
    loadNamespaces();
  },
);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

async function addNamespace(namespace: string[]) {
  createNamespaceStatus.value = StatusIntent.STARTING;
  try {
    await functions.createNamespace(props.warehouseId, namespace, notify);

    createNamespaceStatus.value = StatusIntent.SUCCESS;
    await loadNamespaces();
    emit('namespace-updated');
  } catch (error) {
    createNamespaceStatus.value = StatusIntent.FAILURE;
    console.error('Failed to create namespace:', error);
  }
}

async function loadWarehouse() {
  try {
    const whResponse = await functions.getWarehouse(props.warehouseId);
    if (whResponse) {
      recursiveDeleteProtection.value = whResponse.protected;
    }
  } catch (error) {
    console.error('Failed to load warehouse:', error);
  }
}

async function loadNamespaces(parent?: string) {
  try {
    const { namespaces, ['next-page-token']: nextPageToken } = await functions.listNamespaces(
      props.warehouseId,
      parent,
    );

    paginationTokenNamespace.value = nextPageToken || '';

    if (namespaces) {
      const mappedItems: Item[] = namespaces.map((nsArray) => ({
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        parentPath: [...nsArray],
        actions: ['delete'],
      }));

      loadedWarehouseItems.splice(0, loadedWarehouseItems.length);
      Object.assign(loadedWarehouseItems, mappedItems);
    }
  } catch (error) {
    console.error(error);
  }
}

async function paginationCheckNamespace(option: Options) {
  if (loadedWarehouseItems.length >= 10000) return;

  if (
    option.page * option.itemsPerPage == loadedWarehouseItems.length &&
    paginationTokenNamespace.value != ''
  ) {
    const { namespaces, ['next-page-token']: nextPageToken } = await functions.listNamespaces(
      props.warehouseId,
      undefined,
      paginationTokenNamespace.value,
    );

    paginationTokenNamespace.value = nextPageToken || '';
    if (namespaces) {
      const mappedItems: Item[] = namespaces.map((nsArray) => ({
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        parentPath: [...nsArray],
        actions: ['delete'],
      }));

      loadedWarehouseItems.push(...mappedItems.flat());
    }
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
  recursiveDeleteProtection.value = pendingProtectionValue.value;
  await setProtection();
}

async function setProtection() {
  try {
    await functions.setWarehouseProtection(
      props.warehouseId,
      recursiveDeleteProtection.value,
      true,
    );
    emit('namespace-updated');
  } catch (error) {
    console.error(error);
    // Revert on error
    recursiveDeleteProtection.value = !recursiveDeleteProtection.value;
  }
}

async function deleteNamespaceWithOptions(e: any, item: Item) {
  try {
    await functions.dropNamespace(
      props.warehouseId,
      item.parentPath.join(String.fromCharCode(0x1f)),
      e,
      notify,
    );

    await loadNamespaces();
    emit('namespace-updated');
  } catch (error: any) {
    console.error(`Failed to drop namespace-${item.name}  - `, error);
  }
}

async function routeToNamespace(item: Item) {
  const namespacePath = item.parentPath.join(String.fromCharCode(0x1f));

  try {
    await functions.loadNamespaceMetadata(props.warehouseId, namespacePath, false);
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visual.setSnackbarMsg({
        function: 'routeToNamespace',
        text: `Access denied: ${item.type} "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visual.setSnackbarMsg({
        function: 'routeToNamespace',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    return;
  }
  router.push(`/warehouse/${props.warehouseId}/namespace/${namespacePath}`);
}

// Expose method for parent to trigger reload
defineExpose({
  loadNamespaces,
});
</script>
