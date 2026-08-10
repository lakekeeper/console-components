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
      <WarehouseAddDialog
        v-if="!locked"
        :intent="Intent.UPDATE"
        :object-type="ObjectType.CATALOG_SETTINGS"
        :process-status="processStatus"
        :warehouse="warehouse"
        @cancel="menuOpen = false"
        @rename-warehouse="emitRename"
        @update-catalog-settings="updateCatalogSettings" />
      <ComputeConnectDialog :warehouse="warehouse" />

      <template v-if="!locked">
        <v-list-subheader class="text-uppercase">Security</v-list-subheader>
        <WarehouseAddDialog
          :intent="Intent.UPDATE"
          :object-type="ObjectType.STORAGE_CREDENTIAL"
          :process-status="processStatus"
          :warehouse="warehouse"
          @cancel="menuOpen = false"
          @close="$emit('close')"
          @update-credentials="updateStorageCredential" />

        <WarehouseAddDialog
          :warehouse="warehouse"
          :processStatus="processStatus"
          :intent="Intent.UPDATE"
          :object-type="ObjectType.STORAGE_PROFILE"
          @close="$emit('close')"
          @update-profile="updateStorageProfile"
          @cancel="menuOpen = false" />

        <v-list-item prepend-icon="mdi-shield-search" @click="testStorageAccess">
          <v-list-item-title>Test Storage Access</v-list-item-title>
        </v-list-item>
      </template>

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

  <v-dialog v-model="validationDialogOpen" max-width="700">
    <WarehouseValidationReport
      :report="validationReport"
      :loading="validationLoading"
      :error="validationError"
      @close="validationDialogOpen = false"></WarehouseValidationReport>
  </v-dialog>
</template>

<script lang="ts" setup>
import {
  GetWarehouseResponse,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
  ValidateWarehouseResponse,
} from '../gen/management/types.gen';
import { ref, computed, onMounted } from 'vue';
import { Intent, ObjectType } from '../common/enums';
import { useUserStore } from '../stores/user';
import { useWarehousePermissions } from '../composables/useCatalogPermissions';
import { useFunctions } from '../plugins/functions';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';
import WarehouseValidationReport from './WarehouseValidationReport.vue';

const menuOpen = ref(false);
const userStore = useUserStore();
const functions = useFunctions();
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
    newProfile: { profile: StorageProfile; credentials: StorageCredential },
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

function emitRename(name: string) {
  emit('renameWarehouse', name);
  menuOpen.value = false;
}

function updateStorageCredential(e: StorageCredential) {
  emit('updateCredentials', e);
}

function updateStorageProfile(e: { profile: StorageProfile; credentials: StorageCredential }) {
  emit('updateProfile', e);
}

function updateCatalogSettings(e: CatalogSettingsUpdate) {
  emit('updateCatalogSettings', e);
  menuOpen.value = false;
}

const validationDialogOpen = ref(false);
const validationLoading = ref(false);
const validationReport = ref<ValidateWarehouseResponse | null>(null);
const validationError = ref<string | null>(null);

async function testStorageAccess() {
  menuOpen.value = false;
  validationDialogOpen.value = true;
  validationLoading.value = true;
  validationReport.value = null;
  validationError.value = null;
  try {
    validationReport.value = await functions.validateStorageAccess(warehouse.id);
  } catch (error: any) {
    validationError.value = error?.error?.message || error?.message || 'Validation request failed.';
  } finally {
    validationLoading.value = false;
  }
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
