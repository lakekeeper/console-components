<template>
  <v-toolbar color="transparent" density="compact" flat>
    <v-toolbar-title>
      <span class="text-subtitle-1">
        {{ warehouse.name }}
      </span>
    </v-toolbar-title>
    <template #prepend>
      <!-- Collapse/Expand Button -->
      <v-btn
        icon
        size="default"
        variant="tonal"
        color="primary"
        @click="toggleNavigation"
        class="mr-3"
        :title="isNavigationCollapsed ? 'Show navigation tree' : 'Hide navigation tree'">
        <v-icon>
          {{ isNavigationCollapsed ? 'mdi-menu' : 'mdi-menu-open' }}
        </v-icon>
      </v-btn>
      <v-icon>mdi-database</v-icon>
    </template>
    <v-spacer></v-spacer>

    <WarehouseActionsMenu
      :process-status="processStatus"
      :warehouse="warehouse"
      @close="processStatus = 'starting'"
      @rename-warehouse="renameWarehouse"
      @update-credentials="updateCredentials"
      @update-delprofile="updateDelProfile"
      @update-profile="updateProfile" />
  </v-toolbar>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import type {
  GetWarehouseResponse,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
} from '@/gen/management/types.gen';
import { Type } from '@/common/enums';
import { logError } from '@/common/errorUtils';

const props = defineProps<{
  warehouseId: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;
const processStatus = ref('starting');

const warehouse = reactive<GetWarehouseResponse>({
  'delete-profile': { type: 'hard' },
  id: '',
  'warehouse-id': '',
  name: '',
  'project-id': '',
  status: 'active',
  'storage-profile': {
    type: 's3',
    bucket: '',
    'key-prefix': '',
    'assume-role-arn': '',
    endpoint: '',
    region: '',
    'path-style-access': null,
    'sts-role-arn': '',
    'sts-enabled': false,
    flavor: undefined,
  },
  protected: false,
});

const isNavigationCollapsed = computed({
  get: () => visual.isNavigationCollapsed,
  set: (value: boolean) => {
    visual.isNavigationCollapsed = value;
  },
});
function toggleNavigation() {
  isNavigationCollapsed.value = !isNavigationCollapsed.value;
}

async function loadWarehouse() {
  try {
    const whResponse = await functions.getWarehouse(props.warehouseId);
    if (whResponse) {
      Object.assign(warehouse, whResponse);
      visual.wahrehouseName = whResponse.name;
      visual.whId = whResponse.id;
    }
  } catch (error) {
    logError('WarehouseHeader.loadWarehouse', error);
  }
}

async function renameWarehouse(name: string) {
  try {
    await functions.renameWarehouse(props.warehouseId, name, notify);
    await loadWarehouse();
  } catch (error) {
    console.error('Failed to rename warehouse:', error);
  }
}

async function updateCredentials(credentials: StorageCredential) {
  processStatus.value = 'running';
  try {
    await functions.updateStorageCredential(props.warehouseId, credentials, true);
    processStatus.value = 'success';
    await loadWarehouse();
  } catch (error) {
    processStatus.value = 'error';
    console.error('Failed to update credentials:', error);
  }
}

async function updateProfile(newProfile: {
  profile: StorageProfile;
  credentials: StorageCredential;
}) {
  processStatus.value = 'running';
  try {
    await functions.updateStorageProfile(
      props.warehouseId,
      newProfile.credentials,
      newProfile.profile,
      true,
    );
    processStatus.value = 'success';
    await loadWarehouse();
  } catch (error) {
    processStatus.value = 'error';
    console.error('Failed to update storage profile:', error);
  }
}

async function updateDelProfile(profile: TabularDeleteProfile) {
  try {
    await functions.updateWarehouseDeleteProfile(props.warehouseId, profile, true);
    await loadWarehouse();
    visual.setSnackbarMsg({
      function: 'updateDelProfile',
      text: 'Deletion profile updated successfully',
      ttl: 3000,
      ts: Date.now(),
      type: Type.SUCCESS,
    });
  } catch (error) {
    console.error('Failed to update deletion profile:', error);
  }
}

// Load warehouse and statistics on mount and when warehouse ID changes
onMounted(() => {
  loadWarehouse();
});
watch(
  () => props.warehouseId,
  () => {
    loadWarehouse();
  },
);
</script>
