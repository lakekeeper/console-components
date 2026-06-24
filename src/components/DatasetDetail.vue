<template>
  <div>
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="mb-0"></v-progress-linear>

    <v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="ma-4">
      {{ loadError }}
    </v-alert>

    <template v-if="!loading && !loadError && tableData">
      <!-- Header row -->
      <v-toolbar color="transparent" density="compact" flat class="px-2">
        <v-icon color="amber-darken-2" class="mr-2">mdi-folder-multiple-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">{{ props.tableName }}</span>
        <v-spacer></v-spacer>
        <GenericTableActionsMenu
          :warehouse-id="warehouseId"
          :namespace-id="namespaceId"
          :table-name="tableName"
          entity-label="dataset"
          @updated="load" />
      </v-toolbar>

      <!-- Info chips row -->
      <div class="d-flex flex-wrap align-center gap-2 px-4 pb-2">
        <v-chip
          v-if="tableData['base-location']"
          size="small"
          variant="outlined"
          prepend-icon="mdi-map-marker-outline"
          class="font-mono">
          {{ tableData['base-location'] }}
        </v-chip>
        <v-chip size="small" variant="tonal" color="amber-darken-2">dataset</v-chip>
        <v-chip
          v-if="tableData.protected"
          size="small"
          variant="tonal"
          color="warning"
          prepend-icon="mdi-shield-check">
          Protected
        </v-chip>
      </div>

      <!-- Description -->
      <div v-if="tableData.doc" class="px-4 pb-3 text-body-2 text-medium-emphasis">
        {{ tableData.doc }}
      </div>

      <v-divider class="mb-2"></v-divider>

      <!-- Storage Explorer -->
      <StorageExplorer
        :warehouse-id="warehouseId"
        :namespace-id="namespaceId"
        :entity-name="tableName"
        entity-type="generic-table"
        :can-write="permissions.canWriteData.value" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useGenericTablePermissions } from '@/composables/useCatalogPermissions';
import StorageExplorer from './StorageExplorer.vue';
import GenericTableActionsMenu from './GenericTableActionsMenu.vue';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();

const loading = ref(false);
const loadError = ref<string | null>(null);
const tableData = ref<Record<string, any> | null>(null);
const tableId = ref('');

// Resolve the generic table UUID after load so permissions composable can fetch grants
const tableIdRef = computed(() => tableId.value);

const permissions = useGenericTablePermissions(tableIdRef, props.warehouseId);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
      false,
    );
    tableData.value = response.table ?? null;

    // Resolve table id for permissions — loadGenericTable doesn't return it,
    // so we look it up via the list endpoint.
    const list = await functions.listGenericTables(
      props.warehouseId,
      props.namespaceId,
      undefined,
      false,
    );
    const match = (list.identifiers ?? []).find(
      (g: { name: string }) => g.name === props.tableName,
    );
    tableId.value = match?.id ?? '';
  } catch (e: any) {
    loadError.value = e?.error?.message || e?.message || 'Failed to load dataset';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], load);
</script>
