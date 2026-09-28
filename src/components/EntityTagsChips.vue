<template>
  <div class="d-flex flex-wrap align-center ga-2">
    <v-progress-circular
      v-if="loading"
      indeterminate
      color="primary"
      size="18"></v-progress-circular>
    <template v-else-if="tags.length">
      <!-- The chip already says the name, the value and where an inherited tag
           came from, so a tooltip repeating it is a hover that costs a reader
           the time to find out it says nothing. It is kept only where the chip
           had to cut the value short. -->
      <v-chip
        v-for="t in tags"
        :key="t['tag-definition-id']"
        size="small"
        :color="t['inherited-from'] ? undefined : 'info'"
        :variant="t['inherited-from'] ? 'outlined' : 'tonal'"
        :prepend-icon="t['inherited-from'] ? 'mdi-arrow-top-left-bold-outline' : 'mdi-tag-outline'">
        {{ t.name }}
        <span v-if="t.value !== null && t.value !== undefined">
          :&nbsp;{{ truncate(t.value, 40) }}
        </span>
        <span v-if="t['inherited-from']" class="ml-1 text-caption font-italic">
          · from {{ t['inherited-from'].type }}
        </span>
        <v-tooltip v-if="isCut(t.value)" activator="parent" location="top" max-width="500">
          <div style="white-space: pre-wrap; word-break: break-word">{{ t.value }}</div>
        </v-tooltip>
      </v-chip>
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

/** Whether the chip is showing less than the whole value. */
function isCut(v: string | null | undefined, n = 40): boolean {
  return typeof v === 'string' && v.length > n;
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
