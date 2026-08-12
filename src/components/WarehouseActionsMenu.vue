<template>
  <v-menu v-model="menuOpen" location="start" offset-y="20px">
    <template #activator="{ props }">
      <v-btn icon="mdi-cog" variant="text" v-bind="props"></v-btn>
    </template>

    <v-list activatable density="compact">
      <v-list-item v-if="locked" disabled prepend-icon="mdi-shield-lock">
        <v-list-item-title>Managed by instance admin</v-list-item-title>
        <v-list-item-subtitle>Spec changes are restricted</v-list-item-subtitle>
      </v-list-item>

      <v-list-subheader class="text-uppercase">General</v-list-subheader>
      <!-- One entry covers the whole warehouse: name, retention, format policy,
           protection, credentials and profile — each pane saves for itself. -->
      <WarehouseAddDialog
        v-if="!locked"
        :intent="Intent.UPDATE"
        :object-type="ObjectType.CATALOG_SETTINGS"
        :process-status="processStatus"
        :warehouse="warehouse"
        @cancel="menuOpen = false"
        @close="$emit('close')"
        @rename-warehouse="emitRename"
        @update-catalog-settings="updateCatalogSettings"
        @update-credentials="updateStorageCredential"
        @update-profile="updateStorageProfile" />
      <!-- Connection strings and storage checks are panes of that modal now. A
           locked warehouse has no modal to open, so it keeps the standalone
           dialog rather than losing the connection strings entirely. -->
      <ComputeConnectDialog v-if="locked" :warehouse="warehouse" />

      <template v-if="canManageTags">
        <v-list-subheader class="text-uppercase">Governance</v-list-subheader>
        <EntityTagsManageDialog
          scope="warehouse"
          :warehouse-id="warehouse.id"
          :entity-id="warehouse.id">
          <template #activator="{ props: aProps }">
            <v-list-item
              v-bind="aProps"
              prepend-icon="mdi-tag-multiple-outline"
              title="Manage tags"></v-list-item>
          </template>
        </EntityTagsManageDialog>
      </template>

      <!-- Premium maintenance actions (schedule / configure) injected by the app. -->
      <slot name="maintenance" :close="() => (menuOpen = false)"></slot>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
import {
  GetWarehouseResponse,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
} from '../gen/management/types.gen';
import { ref, computed, onMounted } from 'vue';
import { Intent, ObjectType } from '../common/enums';
import { useUserStore } from '../stores/user';
import { useWarehousePermissions } from '../composables/useCatalogPermissions';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';

const menuOpen = ref(false);
const userStore = useUserStore();
// Lock spec-mutating actions on instance-admin-managed warehouses for non-admins.
const locked = computed(
  () =>
    (warehouse['managed-by'] as string) === 'instance-admin' && userStore.isInstanceAdmin !== true,
);

interface CatalogSettingsUpdate {
  deleteProfile?: TabularDeleteProfile;
  formatPolicy?: { allowed: number[]; default: number };
}

const emit = defineEmits<{
  (e: 'renameWarehouse', warehouse: string): void;
  (e: 'updateCredentials', credentials: StorageCredential): void;
  (
    e: 'updateProfile',
    newProfile: { profile: StorageProfile; credentials?: StorageCredential },
  ): void;
  (e: 'updateCatalogSettings', payload: CatalogSettingsUpdate): void;
  (e: 'warehouseStatusChanged'): void;
  (e: 'close'): void;
}>();

const { warehouse, processStatus } = defineProps<{
  warehouse: GetWarehouseResponse;
  processStatus: string;
}>();

const { canManageTags } = useWarehousePermissions(computed(() => warehouse.id));

onMounted(async () => {});

// The settings dialog saves per pane and stays open afterwards, so none of these
// close the menu — closing it would unmount the dialog mid-edit.
function emitRename(name: string) {
  emit('renameWarehouse', name);
}

function updateStorageCredential(e: StorageCredential) {
  emit('updateCredentials', e);
}

function updateStorageProfile(e: { profile: StorageProfile; credentials?: StorageCredential }) {
  emit('updateProfile', e);
}

function updateCatalogSettings(e: CatalogSettingsUpdate) {
  emit('updateCatalogSettings', e);
}

// watch(
//   () => processStatus,
//   (newVal) => {
//     if (newVal === 'success') {
//
//       // menuOpen.value = false;
//     }
//   },
//   {
//     immediate: true,
//     deep: true,
//   },
// );
</script>
