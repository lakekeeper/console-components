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
      <v-btn
        v-if="canManage"
        color="primary"
        size="small"
        variant="flat"
        prepend-icon="mdi-tag-edit-outline"
        text="Manage tags"
        @click="manageDialog = true"></v-btn>
    </v-toolbar>

    <!-- Compact read-only chip summary. -->
    <div class="px-2 pb-3 d-flex flex-wrap align-center ga-2">
      <v-progress-circular
        v-if="loading"
        indeterminate
        color="info"
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

    <!-- Manage dialog: full apply / edit / remove table. -->
    <v-dialog v-model="manageDialog" max-width="860">
      <v-card>
        <v-toolbar color="transparent" density="compact" flat class="pl-4">
          <v-icon class="mr-2">mdi-tag-multiple-outline</v-icon>
          <v-toolbar-title><span class="text-subtitle-1">Manage tags</span></v-toolbar-title>
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
          <v-btn
            color="primary"
            size="small"
            variant="flat"
            prepend-icon="mdi-plus"
            text="Apply tag"
            @click="openApplyDialog"></v-btn>
        </v-toolbar>
        <v-data-table
          :headers="headers"
          :items="tags"
          :loading="loading"
          density="comfortable"
          item-value="tag-definition-id"
          :sort-by="[{ key: 'name', order: 'asc' }]">
          <template #item.name="{ item }">
            <span style="display: flex; align-items: center">
              <v-icon class="mr-2" color="info" size="small">mdi-tag-outline</v-icon>
              {{ item.name }}
            </span>
          </template>
          <template #item.value="{ item }">
            <v-tooltip
              v-if="item.value !== null && item.value !== undefined"
              location="top"
              max-width="500">
              <template #activator="{ props: tp }">
                <span
                  v-bind="tp"
                  class="d-inline-block text-truncate"
                  style="max-width: 320px; vertical-align: bottom">
                  {{ item.value }}
                </span>
              </template>
              <span style="white-space: pre-wrap; word-break: break-word">{{ item.value }}</span>
            </v-tooltip>
            <span v-else class="text-disabled">—</span>
          </template>
          <template #item.origin="{ item }">
            <v-chip v-if="item['inherited-from']" color="grey" size="x-small" variant="tonal">
              <v-icon start size="x-small">mdi-arrow-top-left</v-icon>
              inherited from {{ inheritedFromLabel(item['inherited-from']) }}
            </v-chip>
            <v-chip v-else color="info" size="x-small" variant="tonal">direct</v-chip>
          </template>
          <template #item.actions="{ item }">
            <template v-if="canManage && !item['inherited-from']">
              <v-btn
                v-if="tagKind(item) !== 'marker'"
                icon="mdi-pencil"
                size="x-small"
                variant="text"
                @click="openEditDialog(item)"></v-btn>
              <v-btn
                color="error"
                icon="mdi-delete-outline"
                size="x-small"
                variant="text"
                @click="requestRemove(item)"></v-btn>
            </template>
          </template>
          <template #no-data>
            <span class="text-disabled">No tags applied.</span>
          </template>
        </v-data-table>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Close" @click="manageDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Apply / edit dialog -->
    <v-dialog v-model="dialog" max-width="500">
      <v-card :title="editing ? `Edit tag '${form.name}'` : 'Apply tag'">
        <v-card-text>
          <v-autocomplete
            v-if="!editing"
            v-model="form.tagDefinitionId"
            label="Tag"
            placeholder="Type to find a tag"
            :items="applicableDefinitions"
            item-title="name"
            item-value="id"
            auto-select-first
            no-data-text="No tags available"
            :rules="[(v) => !!v || 'Select a tag']"
            @update:model-value="onDefinitionSelected"></v-autocomplete>

          <template v-if="selectedKind === 'free-text'">
            <v-text-field
              v-model="form.value"
              label="Value"
              maxlength="256"
              counter="256"
              :rules="[
                (v) => (v !== null && v !== '') || 'Value is required',
                (v) => (v?.length ?? 0) <= 256 || 'Max 256 characters',
              ]">
              <template #counter="{ value, max }">
                <span
                  class="text-caption mr-3"
                  :class="Number(value) >= Number(max) ? 'text-warning' : 'text-medium-emphasis'">
                  {{ value }} / {{ max }}
                </span>
              </template>
            </v-text-field>
          </template>
          <template v-else-if="selectedKind === 'enumerated'">
            <v-select
              v-model="form.value"
              label="Value"
              :items="allowedValues"
              :loading="loadingDefinition"
              no-data-text="No values available"
              :rules="[(v) => (v !== null && v !== '') || 'Value is required']"></v-select>
          </template>
          <template v-else-if="selectedKind === 'marker'">
            <div class="text-caption text-disabled">Marker tag — no value.</div>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="success" :disabled="!canSubmit" @click="submit">save</v-btn>
          <v-btn color="error" text="Cancel" @click="dialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remove confirmation -->
    <v-dialog v-model="confirmRemoveOpen" max-width="440">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="error">mdi-delete-outline</v-icon>
          Remove tag
        </v-card-title>
        <v-card-text>
          Remove
          <strong>{{ pendingRemove?.name }}</strong>
          from this {{ scope }}?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Cancel" @click="confirmRemoveOpen = false"></v-btn>
          <v-btn color="error" variant="flat" text="Remove" @click="doRemove"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Header } from '../common/interfaces';
import {
  TagScope,
  TagValueKind,
  TargetTag,
  TagDefinition,
  TagInheritanceSource,
} from '../gen/management/types.gen';

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  canManage?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const tags = ref<TargetTag[]>([]);
const loading = ref(false);
const effective = ref(false);
const manageDialog = ref(false);

function truncate(v: string | null | undefined, n = 40): string {
  if (v == null) return '';
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

const definitions = ref<TagDefinition[]>([]);
const definitionByName = computed(() => {
  const map = new Map<string, TagDefinition>();
  for (const d of definitions.value) map.set(d.name, d);
  return map;
});

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Value', key: 'value', align: 'start' },
  { title: 'Origin', key: 'origin', align: 'start', sortable: false },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

// Per-scope dispatch to the right API wrappers.
type ListFn = (effective?: boolean, notify?: boolean) => Promise<{ tags: TargetTag[] }>;
type SetFn = (tagName: string, value?: string | null, notify?: boolean) => Promise<unknown>;
type DelFn = (tagName: string, notify?: boolean) => Promise<unknown>;

const api = computed<{ list: ListFn; set: SetFn; del: DelFn }>(() => {
  const w = props.warehouseId;
  const e = props.entityId;
  switch (props.scope) {
    case 'namespace':
      return {
        list: (eff, n) => functions.listNamespaceTags(w, e, eff, n),
        set: (t, v, n) => functions.setNamespaceTag(w, e, t, v, n),
        del: (t, n) => functions.deleteNamespaceTag(w, e, t, n),
      };
    case 'table':
      return {
        list: (eff, n) => functions.listTableTags(w, e, eff, n),
        set: (t, v, n) => functions.setTableTag(w, e, t, v, n),
        del: (t, n) => functions.deleteTableTag(w, e, t, n),
      };
    case 'view':
      return {
        list: (eff, n) => functions.listViewTags(w, e, eff, n),
        set: (t, v, n) => functions.setViewTag(w, e, t, v, n),
        del: (t, n) => functions.deleteViewTag(w, e, t, n),
      };
    case 'generic-table':
      return {
        list: (eff, n) => functions.listGenericTableTags(w, e, eff, n),
        set: (t, v, n) => functions.setGenericTableTag(w, e, t, v, n),
        del: (t, n) => functions.deleteGenericTableTag(w, e, t, n),
      };
    case 'warehouse':
    default:
      return {
        list: (eff, n) => functions.listWarehouseTags(w, eff, n),
        set: (t, v, n) => functions.setWarehouseTag(w, t, v, n),
        del: (t, n) => functions.deleteWarehouseTag(w, t, n),
      };
  }
});

async function loadTags() {
  loading.value = true;
  try {
    const res = await api.value.list(effective.value, false);
    tags.value = res.tags ?? [];
  } catch {
    // handled by functions.handleError
  } finally {
    loading.value = false;
  }
}

async function loadDefinitions() {
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
  } catch {
    // handled
  }
}

const applicableDefinitions = computed(() =>
  definitions.value.filter((d) => d.scope.includes(props.scope)),
);

function tagKind(tag: TargetTag): TagValueKind | undefined {
  return definitionByName.value.get(tag.name)?.['value-kind'];
}

function inheritedFromLabel(src: TagInheritanceSource): string {
  return src.type === 'namespace' ? 'namespace' : 'warehouse';
}

// ---- apply / edit dialog ----
const dialog = ref(false);
const editing = ref(false);
const loadingDefinition = ref(false);
const allowedValues = ref<string[]>([]);
const selectedKind = ref<TagValueKind | undefined>(undefined);

const form = reactive<{
  tagDefinitionId: string | null;
  name: string;
  value: string | null;
}>({ tagDefinitionId: null, name: '', value: null });

const canSubmit = computed(() => {
  if (!editing.value && !form.tagDefinitionId) return false;
  if (selectedKind.value === 'marker') return true;
  if (form.value === null || form.value === '') return false;
  if (selectedKind.value === 'free-text' && form.value.length > 256) return false;
  return true;
});

async function openApplyDialog() {
  editing.value = false;
  form.tagDefinitionId = null;
  form.name = '';
  form.value = null;
  selectedKind.value = undefined;
  allowedValues.value = [];
  if (!definitions.value.length) await loadDefinitions();
  dialog.value = true;
}

async function openEditDialog(tag: TargetTag) {
  editing.value = true;
  form.tagDefinitionId = tag['tag-definition-id'];
  form.name = tag.name;
  form.value = tag.value ?? null;
  selectedKind.value = tagKind(tag);
  if (selectedKind.value === 'enumerated') await loadAllowedValues(tag['tag-definition-id']);
  dialog.value = true;
}

async function onDefinitionSelected(id: string | null) {
  const def = definitions.value.find((d) => d.id === id);
  form.name = def?.name ?? '';
  form.value = null;
  selectedKind.value = def?.['value-kind'];
  allowedValues.value = def?.['allowed-values'] ?? [];
  if (id && selectedKind.value === 'enumerated' && !allowedValues.value.length) {
    await loadAllowedValues(id);
  }
}

async function loadAllowedValues(id: string) {
  loadingDefinition.value = true;
  try {
    const def = await functions.getTagDefinition(id, false);
    allowedValues.value = def['allowed-values'] ?? [];
  } catch {
    // handled
  } finally {
    loadingDefinition.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  const value = selectedKind.value === 'marker' ? undefined : form.value;
  try {
    await api.value.set(form.name, value, notify);
    dialog.value = false;
    await loadTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

const confirmRemoveOpen = ref(false);
const pendingRemove = ref<TargetTag | null>(null);

function requestRemove(tag: TargetTag) {
  pendingRemove.value = tag;
  confirmRemoveOpen.value = true;
}

async function doRemove() {
  const tag = pendingRemove.value;
  if (!tag) return;
  confirmRemoveOpen.value = false;
  try {
    await api.value.del(tag.name, notify);
    await loadTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

onMounted(async () => {
  await loadDefinitions();
  await loadTags();
});
</script>
