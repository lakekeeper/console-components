<template>
  <div>
    <ViewDetails
      v-if="loaded"
      :view="view"
      :warehouse-id="props.warehouseId"
      :namespace-path="props.namespaceId"
      :view-name="props.viewName"
      :can-edit="canCommit"
      :protected-state="protectedState"
      :protection-error="protectionError"
      @updated="loadViewData" />
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, reactive, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useConfig, useViewPermissions } from '@/composables/useCatalogPermissions';
import { isForbiddenError } from '@/common/errorUtils';
import { tagRefusal } from '@/composables/useTagRights';
import ViewDetails from './ViewDetails.vue';
import type { LoadViewResultWritable } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  viewName: string;
}>();

const functions = useFunctions();
const loaded = ref(false);
const viewId = ref('');
const protectedState = ref<boolean | null>(null);
const protectionError = ref('');

// Use view permissions composable (rename/edit gating; protection and tags live
// in the cog menu)
const {
  canCommit,
  answered,
  loading: permsLoading,
  hasPermission,
} = useViewPermissions(
  computed(() => viewId.value),
  computed(() => props.warehouseId),
);
const config = useConfig();

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
    loaded.value = true;
    await loadProtection();
  } catch (error) {
    console.error('Failed to load view data:', error);
    loaded.value = true;
  }
}

// The protection endpoint wants `get_metadata` on the view, and its wrapper
// raises a snackbar on refusal whatever it is told — so it is asked only once
// the view's rights say it can answer, and a no is shown on the tile.
async function loadProtection() {
  protectedState.value = null;
  protectionError.value = '';
  // Let the rights composable see a changed id first, so a previous view's
  // answer is not read as this one's.
  await nextTick();
  if (!viewId.value || !answered.value || permsLoading.value) return;
  const unrestricted = !config.enabledAuthentication.value || !config.enabledPermissions.value;
  if (!unrestricted && !hasPermission('get_metadata')) {
    protectionError.value = 'Not visible to you';
    return;
  }
  try {
    protectedState.value = (
      await functions.getViewProtection(props.warehouseId, viewId.value, false)
    ).protected;
  } catch (e) {
    protectionError.value = isForbiddenError(e)
      ? 'Not visible to you'
      : tagRefusal(e, 'read the protection state');
  }
}
watch([answered, permsLoading], loadProtection);

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
