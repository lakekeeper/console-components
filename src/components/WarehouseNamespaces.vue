<template>
  <v-alert v-if="forbidden" type="warning" variant="tonal" class="ma-4">
    You do not have permission to list namespaces in this warehouse.
  </v-alert>
  <v-data-table
    v-else
    height="calc(100vh - 340px)"
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
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { useWarehousePermissions } from '../composables/useCatalogPermissions';
import type { Header, Item, Options } from '@/common/interfaces';
import { StatusIntent } from '@/common/enums';
import { isForbiddenError, logError } from '@/common/errorUtils';

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
const { canDelete, canCreateNamespace } = useWarehousePermissions(props.warehouseId);

const searchNamespace = ref('');
const forbidden = ref(false);
const createNamespaceStatus = ref<StatusIntent>(StatusIntent.INACTIVE);
const loadedWarehouseItems: Item[] = reactive([]);
const paginationTokenNamespace = ref('');

// Load namespaces on mount
onMounted(() => {
  loadNamespaces();
});

// Reload when warehouse ID changes
watch(
  () => props.warehouseId,
  () => {
    loadNamespaces();
  },
);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

async function addNamespace(namespace: string[], properties: Record<string, string>) {
  createNamespaceStatus.value = StatusIntent.STARTING;
  try {
    await functions.createNamespace(props.warehouseId, namespace, notify, properties);

    createNamespaceStatus.value = StatusIntent.SUCCESS;
    await loadNamespaces();
    emit('namespace-updated');
    visual.refreshNavTree(props.warehouseId);
  } catch (error) {
    createNamespaceStatus.value = StatusIntent.FAILURE;
    console.error('Failed to create namespace:', error);
  }
}

async function loadNamespaces(parent?: string) {
  // Reset the forbidden flag so switching from an unauthorized warehouse to an
  // authorized one re-shows the table instead of staying on the 403 alert.
  forbidden.value = false;
  try {
    const { namespaces, ['next-page-token']: nextPageToken } = await functions.listNamespaces(
      props.warehouseId,
      parent,
      undefined,
      false,
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
    if (isForbiddenError(error)) {
      forbidden.value = true;
      return;
    }
    logError('WarehouseNamespaces.loadNamespaces', error);
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
    visual.refreshNavTree(props.warehouseId);
  } catch (error: any) {
    console.error(`Failed to drop namespace-${item.name}  - `, error);
  }
}

function routeToNamespace(item: Item) {
  const namespacePath = item.parentPath.join(String.fromCharCode(0x1f));

  router.push(`/warehouse/${props.warehouseId}/namespace/${namespacePath}`);
}

// Expose method for parent to trigger reload
defineExpose({
  loadNamespaces,
});
</script>
