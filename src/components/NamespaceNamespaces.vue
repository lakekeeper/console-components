<template>
  <v-data-table
    height="65vh"
    items-per-page="50"
    :search="searchNamespace"
    fixed-header
    :headers="headers"
    hover
    :items="loadedNamespaces"
    :sort-by="[{ key: 'name', order: 'asc' }]"
    :items-per-page-options="[
      { title: '50 items', value: 50 },
      { title: '100 items', value: 100 },
    ]"
    @update:options="paginationCheck($event)">
    <template #top>
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
          :parent-path="namespacePath"
          :status-intent="addNamespaceStatus"
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
        v-if="item.type === 'namespace'"
        :type="item.type"
        :name="item.name"
        @delete-with-options="deleteNamespaceWithOptions($event, item)"></DeleteDialog>
    </template>
    <template #no-data>
      <NamespaceAddDialog
        v-if="canCreateNamespace"
        :parent-path="namespacePath"
        :status-intent="StatusIntent.STARTING"
        @add-namespace="addNamespace" />
    </template>
  </v-data-table>

  <ProtectionConfirmDialog
    v-model="confirmDialog"
    :confirm-color="recursiveDeleteProtection ? 'warning' : 'info'"
    :message="
      recursiveDeleteProtection
        ? 'Are you sure you want to disable recursive delete protection? This will allow the namespace to be deleted.'
        : 'Are you sure you want to enable recursive delete protection? This will prevent the namespace from being deleted.'
    "
    :title="recursiveDeleteProtection ? 'Disable Delete Protection?' : 'Enable Delete Protection?'"
    @cancel="cancelProtectionChange"
    @confirm="confirmProtectionChange"></ProtectionConfirmDialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useNamespacePermissions } from '@/composables/useCatalogPermissions';
import type { Header, Item, Options } from '@/common/interfaces';
import { StatusIntent } from '@/common/enums';
import ProtectionConfirmDialog from './ProtectionConfirmDialog.vue';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const router = useRouter();
const functions = useFunctions();
const notify = true;

const namespaceId = ref('');
const confirmDialog = ref(false);
const pendingProtectionValue = ref(false);

onMounted(loadNamespaceAndData);
watch(() => props.namespacePath, loadNamespaceAndData);

async function loadNamespaceAndData() {
  try {
    const namespace = await functions.loadNamespaceMetadata(props.warehouseId, props.namespacePath);
    namespaceId.value = namespace.properties?.namespace_id || '';
    await Promise.all([loadNamespaces(), getProtection()]);
  } catch (error) {
    console.error('Failed to load namespace:', error);
  }
}

// Use namespace permissions composable
const { canCreateNamespace, canSetProtection } = useNamespacePermissions(
  computed(() => namespaceId.value),
);

const searchNamespace = ref('');
const recursiveDeleteProtection = ref(false);
const addNamespaceStatus = ref<StatusIntent>(StatusIntent.INACTIVE);
const loadedNamespaces: Item[] = reactive([]);
const paginationToken = ref('');

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

async function loadNamespaces(parent?: string) {
  try {
    const { namespaces, ['next-page-token']: nextPageToken } = await functions.listNamespaces(
      props.warehouseId,
      parent || props.namespacePath,
    );

    paginationToken.value = nextPageToken || '';

    if (namespaces) {
      const mappedItems: Item[] = namespaces.map((nsArray) => ({
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        parentPath: [...nsArray],
        actions: ['delete'],
      }));

      loadedNamespaces.splice(0, loadedNamespaces.length);
      Object.assign(loadedNamespaces, mappedItems);
    }
  } catch (error) {
    console.error(error);
  }
}

async function paginationCheck(option: Options) {
  if (loadedNamespaces.length >= 10000) return;

  if (option.page * option.itemsPerPage == loadedNamespaces.length && paginationToken.value != '') {
    const { namespaces, ['next-page-token']: nextPageToken } = await functions.listNamespaces(
      props.warehouseId,
      props.namespacePath,
      paginationToken.value,
    );

    paginationToken.value = nextPageToken || '';
    if (namespaces) {
      const mappedItems: Item[] = namespaces.map((nsArray) => ({
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        parentPath: [...nsArray],
        actions: ['delete'],
      }));

      loadedNamespaces.push(...mappedItems.flat());
    }
  }
}

async function addNamespace(namespaceIdent: string[]) {
  addNamespaceStatus.value = StatusIntent.STARTING;
  try {
    await functions.createNamespace(props.warehouseId, namespaceIdent, notify);

    addNamespaceStatus.value = StatusIntent.SUCCESS;
    await loadNamespaces();
  } catch (error) {
    addNamespaceStatus.value = StatusIntent.FAILURE;
    console.error('Failed to create namespace:', error);
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
  } catch (error) {
    console.error(`Failed to drop namespace-${item.name}`, error);
  }
}

async function routeToNamespace(item: Item) {
  if (item.type !== 'namespace') return;

  const namespacePath =
    item.parentPath.length > 0 ? `${item.parentPath.join(String.fromCharCode(0x1f))}` : item.name;
  router.push(`/warehouse/${props.warehouseId}/namespace/${namespacePath}`);
}

async function getProtection() {
  try {
    if (!namespaceId.value) return;
    recursiveDeleteProtection.value = (
      await functions.getNamespaceProtection(props.warehouseId, namespaceId.value)
    ).protected;
  } catch (error) {
    console.error(error);
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
    if (!namespaceId.value) return;
    await functions.setNamespaceProtection(
      props.warehouseId,
      namespaceId.value,
      recursiveDeleteProtection.value,
      true,
    );
    // Value already set in confirmProtectionChange
  } catch (error) {
    console.error(error);
    // Revert on error
    recursiveDeleteProtection.value = !recursiveDeleteProtection.value;
  }
}

// Expose method for parent to trigger reload
defineExpose({
  loadNamespaces,
});
</script>
