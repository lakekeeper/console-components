<template>
  <v-menu v-model="menuOpen" location="start" offset-y="20px">
    <template #activator="{ props }">
      <v-btn icon="mdi-cog" variant="text" v-bind="props"></v-btn>
    </template>

    <v-list activatable>
      <RenameWarehouseDialog :warehouse-name="warehouse.name" @rename-warehouse="emitRename" />

      <WarehouseAddDialog
        :project-id="projectId"
        :intent="Intent.UPDATE"
        :object-type="ObjectType.STORAGE_CREDENTIAL"
        :process-status="processStatus"
        :warehouse="warehouse"
        @cancel="menuOpen = false"
        @close="$emit('close')"
        @update-credentials="updateStorageCredential" />

      <WarehouseAddDialog
        :project-id="projectId"
        :warehouse="warehouse"
        :processStatus="processStatus"
        :intent="Intent.UPDATE"
        :object-type="ObjectType.STORAGE_PROFILE"
        @close="$emit('close')"
        @update-profile="updateStorageProfile"
        @cancel="menuOpen = false" />

      <WarehouseAddDialog
        :project-id="projectId"
        :intent="Intent.UPDATE"
        :object-type="ObjectType.DELETION_PROFILE"
        :process-status="processStatus"
        :warehouse="warehouse"
        @cancel="menuOpen = false"
        @update-deletion-profile="updateDeletionProfile" />

      <ComputeConnectDialog
        :warehouse="warehouse"
        :idp-authority="idpAuthority"
        :enabled-authentication="enabledAuthentication"
        :project-id="projectId"
        :user="user"
        :metadata-url="metadataUrl" />
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

import { User } from '../types/interfaces';
import { ref, onMounted } from 'vue';
import { Intent, ObjectType } from '../types/enums';
import RenameWarehouseDialog from './RenameWarehouseDialog.vue';
import WarehouseAddDialog from './WarehouseAddDialog.vue';
import ComputeConnectDialog from './ComputeConnectDialog.vue';

const menuOpen = ref(false);

const emit = defineEmits<{
  (e: 'renameWarehouse', warehouse: string): void;
  (e: 'updateCredentials', credentials: StorageCredential): void;
  (
    e: 'updateProfile',
    newProfile: { profile: StorageProfile; credentials: StorageCredential },
  ): void;
  (e: 'updateDelprofile', profile: TabularDeleteProfile): void;
  (e: 'close'): void;
}>();

const {
  warehouse,
  processStatus,
  projectId,
  idpAuthority,
  enabledAuthentication,
  user,
  metadataUrl,
} = defineProps<{
  warehouse: GetWarehouseResponse;
  processStatus: string;
  projectId: string;
  idpAuthority: string;
  enabledAuthentication: boolean;
  user: User;
  metadataUrl: string;
}>();

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

function updateDeletionProfile(e: TabularDeleteProfile) {
  emit('updateDelprofile', e);
  menuOpen.value = false;
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
