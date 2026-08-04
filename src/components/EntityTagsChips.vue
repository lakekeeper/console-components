<template>
  <div class="d-flex flex-wrap align-center ga-2">
    <v-progress-circular v-if="loading" indeterminate color="info" size="18"></v-progress-circular>
    <template v-else-if="tags.length">
      <v-tooltip v-for="t in tags" :key="t['tag-definition-id']" location="top" max-width="500">
        <template #activator="{ props: tp }">
          <v-chip
            v-bind="tp"
            size="small"
            :color="t['inherited-from'] ? 'deep-purple' : 'info'"
            variant="tonal"
            :prepend-icon="
              t['inherited-from'] ? 'mdi-arrow-top-left-bold-outline' : 'mdi-tag-outline'
            ">
            {{ t.name }}
            <span v-if="t.value !== null && t.value !== undefined">
              :&nbsp;{{ truncate(t.value, 40) }}
            </span>
            <span v-if="t['inherited-from']" class="ml-1 text-caption font-italic">
              · from {{ t['inherited-from'].type }}
            </span>
          </v-chip>
        </template>
        <div style="white-space: pre-wrap; word-break: break-word">
          <div class="font-weight-medium">{{ t.name }}</div>
          <div v-if="t.value !== null && t.value !== undefined">{{ t.value }}</div>
          <div v-if="t['inherited-from']" class="text-caption">
            Inherited from {{ t['inherited-from'].type }}
          </div>
        </div>
      </v-tooltip>
    </template>
    <span v-else class="text-disabled text-caption">No tags</span>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { TagScope, TargetTag } from '../gen/management/types.gen';

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  // When true, include inherited tags (effective). Default: direct only.
  effective?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const tags = ref<TargetTag[]>([]);
const loading = ref(false);

function truncate(v: string | null | undefined, n = 40): string {
  if (v == null) return '';
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

async function load() {
  if (!props.entityId || !props.warehouseId) return;
  loading.value = true;
  const w = props.warehouseId;
  const e = props.entityId;
  const eff = props.effective;
  try {
    let res: { tags: TargetTag[] };
    switch (props.scope) {
      case 'namespace':
        res = await functions.listNamespaceTags(w, e, eff, false);
        break;
      case 'table':
        res = await functions.listTableTags(w, e, eff, false);
        break;
      case 'view':
        res = await functions.listViewTags(w, e, eff, false);
        break;
      case 'generic-table':
        res = await functions.listGenericTableTags(w, e, eff, false);
        break;
      case 'warehouse':
      default:
        res = await functions.listWarehouseTags(w, eff, false);
        break;
    }
    tags.value = res.tags ?? [];
  } catch {
    // handled by functions.handleError
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.entityId, props.warehouseId, props.scope], load);
// Reload when a tag change is made elsewhere (e.g. the cog Manage-tags dialog).
watch(
  computed(() => visual.tagsRefresh),
  load,
);
</script>
