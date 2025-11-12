<template>
  <div>
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
    </v-toolbar>
    <v-card-text>
      <ViewDetails v-if="loaded" :view="view" />
    </v-card-text>

    <ProtectionConfirmDialog
      v-model="confirmDialog"
      :confirm-color="recursiveDeleteProtection ? 'warning' : 'info'"
      :message="
        recursiveDeleteProtection
          ? 'Are you sure you want to disable recursive delete protection? This will allow the view to be deleted.'
          : 'Are you sure you want to enable recursive delete protection? This will prevent the view from being deleted.'
      "
      :title="
        recursiveDeleteProtection ? 'Disable Delete Protection?' : 'Enable Delete Protection?'
      "
      @cancel="cancelProtectionChange"
      @confirm="confirmProtectionChange"></ProtectionConfirmDialog>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, reactive, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useViewPermissions } from '@/composables/usePermissions';
import ViewDetails from './ViewDetails.vue';
import ProtectionConfirmDialog from './ProtectionConfirmDialog.vue';
import type { LoadViewResultWritable } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  viewName: string;
}>();

const functions = useFunctions();
const loaded = ref(false);
const recursiveDeleteProtection = ref(false);
const viewId = ref('');
const confirmDialog = ref(false);
const pendingProtectionValue = ref(false);

// Use view permissions composable
const { canSetProtection } = useViewPermissions(
  computed(() => viewId.value),
  computed(() => props.warehouseId),
);

const view = reactive<LoadViewResultWritable>({
  'metadata-location': '',
  metadata: {
    'view-uuid': '',
    'format-version': 0,
    location: '',
    'current-version-id': 0,
    versions: [],
    'version-log': [],
    schemas: [],
  },
});

async function loadViewData() {
  try {
    loaded.value = false;
    Object.assign(
      view,
      await functions.loadView(props.warehouseId, props.namespaceId, props.viewName),
    );
    viewId.value = view.metadata['view-uuid'];

    if (viewId.value) {
      await getProtection();
    }

    loaded.value = true;
  } catch (error) {
    console.error('Failed to load view data:', error);
    loaded.value = true;
  }
}

async function getProtection() {
  try {
    recursiveDeleteProtection.value = (
      await functions.getViewProtection(props.warehouseId, viewId.value)
    ).protected;
  } catch (error) {
    console.error('Failed to get protection status:', error);
  }
}

async function setProtection() {
  try {
    await functions.setViewProtection(
      props.warehouseId,
      viewId.value,
      pendingProtectionValue.value,
      true,
    );
    await getProtection();
  } catch (error) {
    console.error('Failed to set protection:', error);
    // Revert the switch if API call failed
    recursiveDeleteProtection.value = !recursiveDeleteProtection.value;
  }
}

function showConfirmDialog() {
  // Store the desired value (opposite of current)
  pendingProtectionValue.value = !recursiveDeleteProtection.value;
  confirmDialog.value = true;
}

function cancelProtectionChange() {
  // Do nothing - switch will stay at current value
  confirmDialog.value = false;
}

async function confirmProtectionChange() {
  confirmDialog.value = false;
  // Toggle the switch
  recursiveDeleteProtection.value = pendingProtectionValue.value;
  // Make the API call
  await setProtection();
}

// Watch for prop changes
watch(
  () => [props.warehouseId, props.namespaceId, props.viewName],
  () => {
    loadViewData();
  },
);

onMounted(() => {
  loadViewData();
});

defineExpose({
  loadViewData,
});
</script>
