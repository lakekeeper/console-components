<template>
  <v-card flat>
    <v-toolbar class="mb-1" color="transparent" density="compact" flat>
      <template #prepend>
        <v-icon>mdi-tag-multiple-outline</v-icon>
      </template>
      <v-toolbar-title>
        <span class="text-subtitle-1">Tags</span>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-switch
        v-if="scope !== 'warehouse'"
        v-model="effective"
        class="mr-4"
        color="info"
        density="compact"
        hide-details
        label="Show inherited"
        @update:model-value="loadTags"></v-switch>
      <!-- The same fullscreen picker every other scope uses; this card stays a
           read-only summary of what it wrote. -->
      <EntityTagsManageDialog
        v-if="canManage"
        :scope="scope"
        :warehouse-id="warehouseId"
        :entity-id="entityId"
        :entity-name="entityName">
        <template #activator="{ props: aProps }">
          <v-btn
            v-bind="aProps"
            color="primary"
            size="small"
            variant="flat"
            prepend-icon="mdi-tag-edit-outline"
            text="Manage tags"></v-btn>
        </template>
      </EntityTagsManageDialog>
    </v-toolbar>

    <!-- Compact read-only chip summary. -->
    <div class="px-2 pb-3 d-flex flex-wrap align-center ga-2">
      <v-progress-circular
        v-if="loading"
        indeterminate
        color="primary"
        size="20"></v-progress-circular>
      <template v-else-if="tags.length">
        <v-tooltip v-for="t in tags" :key="t['tag-definition-id']" location="top" max-width="500">
          <template #activator="{ props: tp }">
            <v-chip
              v-bind="tp"
              size="small"
              :color="t['inherited-from'] ? undefined : 'info'"
              :variant="t['inherited-from'] ? 'outlined' : 'tonal'">
              <v-icon start size="x-small">mdi-tag-outline</v-icon>
              {{ t.name }}
              <span v-if="t.value !== null && t.value !== undefined">
                :&nbsp;{{ truncate(t.value, 40) }}
              </span>
              <v-icon v-if="t['inherited-from']" end size="x-small">mdi-arrow-top-left</v-icon>
            </v-chip>
          </template>
          <div style="white-space: pre-wrap; word-break: break-word">
            <div class="font-weight-medium">{{ t.name }}</div>
            <div v-if="t.value !== null && t.value !== undefined">{{ t.value }}</div>
            <div v-if="t['inherited-from']" class="text-caption">
              inherited from {{ inheritedFromLabel(t['inherited-from']) }}
            </div>
          </div>
        </v-tooltip>
      </template>
      <span v-else class="text-disabled text-caption">No tags applied.</span>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';
import { TagScope, TargetTag, TagInheritanceSource } from '../gen/management/types.gen';

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  canManage?: boolean;
  // Named in the manage modal's toolbar when the caller knows it.
  entityName?: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();

const tags = ref<TargetTag[]>([]);
const loading = ref(false);
const effective = ref(false);

function truncate(v: string | null | undefined, n = 40): string {
  if (v == null) return '';
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

// Per-scope dispatch. This card only reads; writing is the manage modal's job.
type ListFn = (effective?: boolean, notify?: boolean) => Promise<{ tags: TargetTag[] }>;

const listTags = computed<ListFn>(() => {
  const w = props.warehouseId;
  const e = props.entityId;
  switch (props.scope) {
    case 'namespace':
      return (eff, n) => functions.listNamespaceTags(w, e, eff, n);
    case 'table':
      return (eff, n) => functions.listTableTags(w, e, eff, n);
    case 'view':
      return (eff, n) => functions.listViewTags(w, e, eff, n);
    case 'generic-table':
      return (eff, n) => functions.listGenericTableTags(w, e, eff, n);
    case 'warehouse':
    default:
      return (eff, n) => functions.listWarehouseTags(w, eff, n);
  }
});

async function loadTags() {
  loading.value = true;
  try {
    const res = await listTags.value(effective.value, false);
    tags.value = res.tags ?? [];
  } catch {
    // handled by functions.handleError
  } finally {
    loading.value = false;
  }
}

function inheritedFromLabel(src: TagInheritanceSource): string {
  return src.type === 'namespace' ? 'namespace' : 'warehouse';
}

onMounted(loadTags);

// The modal writes through its own calls, so the summary reloads on the shared
// signal rather than waiting for the next mount.
watch(
  () => visual.tagsRefresh,
  () => loadTags(),
);
</script>
