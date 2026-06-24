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
      @updated="loadViewData" />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, reactive, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useViewPermissions } from '@/composables/useCatalogPermissions';
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

// Use view permissions composable (rename/edit gating; protection lives in the cog menu)
const { canCommit } = useViewPermissions(
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
      try {
        protectedState.value = (
          await functions.getViewProtection(props.warehouseId, viewId.value)
        ).protected;
      } catch {
        protectedState.value = null;
      }
    }

    loaded.value = true;
  } catch (error) {
    console.error('Failed to load view data:', error);
    loaded.value = true;
  }
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
