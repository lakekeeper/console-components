<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="Table actions"></v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <!-- One entry for everything about the dataset itself: name, protection
           and metadata. Generic tables have no properties endpoint, so that pane
           does not appear for them. -->
      <EntitySettingsDialog
        entity-type="generic-table"
        :warehouse-id="warehouseId"
        :namespace-path="namespaceId"
        :entity-name="tableName"
        :entity-id="tableId"
        :entity-label="label"
        :metadata="genericTable"
        :protected-state="protectedState"
        :can-commit="canRename"
        :can-set-protection="canSetProtection"
        @updated="$emit('updated')"
        @protection-changed="protectedState = $event">
        <template #activator="{ props: aProps }">
          <v-list-item
            v-bind="aProps"
            prepend-icon="mdi-cog-outline"
            :title="`${label[0].toUpperCase()}${label.slice(1)} settings`"
            subtitle="Rename · protection · metadata" />
        </template>
      </EntitySettingsDialog>

      <template v-if="canManageTags && tableId">
        <v-divider class="my-1"></v-divider>
        <v-list-subheader class="text-uppercase">Governance</v-list-subheader>
        <EntityTagsManageDialog
          scope="generic-table"
          :warehouse-id="warehouseId"
          :entity-id="tableId"
          :entity-name="tableName">
          <template #activator="{ props: aProps }">
            <v-list-item
              v-bind="aProps"
              prepend-icon="mdi-tag-multiple-outline"
              title="Manage tags" />
          </template>
        </EntityTagsManageDialog>
      </template>

      <template v-if="canDrop">
        <v-divider class="my-1"></v-divider>
        <v-list-item
          base-color="error"
          prepend-icon="mdi-delete-outline"
          :title="`Delete ${label}`"
          @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="440">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
        Delete {{ label }}
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the {{ label }}
          <strong class="font-mono">{{ tableName }}</strong>
          from the catalog.
          <span class="text-error font-weight-bold">This cannot be undone.</span>
        </p>
        <v-text-field
          v-model="confirmName"
          class="mt-1"
          density="compact"
          variant="outlined"
          autocomplete="off"
          :label="`Type “${tableName}” to confirm`"
          :error="confirmName.length > 0 && !deleteConfirmed"></v-text-field>
        <v-alert v-if="deleteError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ deleteError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="deleting" @click="deleteOpen = false">Cancel</v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="deleting"
          :disabled="!deleteConfirmed"
          @click="confirmDelete">
          Delete {{ label }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useGenericTablePermissions, useConfig } from '@/composables/useCatalogPermissions';
import EntitySettingsDialog from './EntitySettingsDialog.vue';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  entityLabel?: string;
}>();

const label = computed(() => props.entityLabel ?? 'table');

defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const config = useConfig();

const menuOpen = ref(false);

const genericTable = ref<Record<string, any> | null>(null);
const tableId = ref('');
const protectedState = ref(false);

const { canSetProtection, canDrop, canManageTags, hasPermission } = useGenericTablePermissions(
  tableId,
  props.warehouseId,
);
const canRename = computed(
  () =>
    hasPermission('rename') ||
    !config.enabledAuthentication.value ||
    !config.enabledPermissions.value,
);

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const confirmName = ref('');
const deleteConfirmed = computed(() => confirmName.value.trim() === props.tableName);

async function load() {
  try {
    const response = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
      false,
    );
    genericTable.value = response.table ?? null;
    protectedState.value = !!response.table?.protected;
    // loadGenericTable does not return the id; resolve it via listGenericTables
    // for the permission/protection lookups which are keyed by generic_table_id.
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
  } catch (e) {
    console.error('[GenericTableActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], load);

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  confirmName.value = '';
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropGenericTable(props.warehouseId, props.namespaceId, props.tableName, true);
    deleteOpen.value = false;
    // Table is gone — leave the table route for its namespace.
    await router.replace({
      path: route.path.replace(/\/(generic-table|dataset)\/[^/]+$/, ''),
      query: { tab: label.value === 'dataset' ? 'datasets' : 'tables' },
    });
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete table';
  } finally {
    deleting.value = false;
  }
}
</script>
