<template>
  <v-dialog v-model="dialogOpen" max-width="860">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

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
          color="info"
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
            inherited
          </v-chip>
          <v-chip v-else color="info" size="x-small" variant="tonal">direct</v-chip>
        </template>
        <template #item.actions="{ item }">
          <template v-if="!item['inherited-from']">
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
        <v-btn text="Close" @click="dialogOpen = false"></v-btn>
      </v-card-actions>
    </v-card>

    <!-- Remove confirmation -->
    <v-dialog v-model="confirmRemoveOpen" max-width="440">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="error">mdi-delete-outline</v-icon>
          Remove tag
        </v-card-title>
        <v-card-text>
          <p class="mb-3">
            Remove
            <strong>{{ pendingRemove?.name }}</strong>
            from this {{ scope }}?
          </p>
          <v-text-field
            v-model="confirmRemoveName"
            density="compact"
            variant="outlined"
            autocomplete="off"
            :label="`Type “${pendingRemove?.name}” to confirm`"
            :error="confirmRemoveName.length > 0 && !removeConfirmed"
            @keyup.enter="removeConfirmed && doRemove()"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Cancel" @click="confirmRemoveOpen = false"></v-btn>
          <v-btn
            color="error"
            variant="flat"
            text="Remove"
            :disabled="!removeConfirmed"
            @click="doRemove"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Apply / edit form -->
    <v-dialog v-model="formDialog" max-width="500">
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
            :rules="[(v) => !!v || 'Select a tag']"
            @update:model-value="onDefinitionSelected"></v-autocomplete>

          <v-text-field
            v-if="selectedKind === 'free-text'"
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
          <v-select
            v-else-if="selectedKind === 'enumerated'"
            v-model="form.value"
            label="Value"
            :items="allowedValues"
            :loading="loadingDefinition"
            :rules="[(v) => (v !== null && v !== '') || 'Value is required']"></v-select>
          <div v-else-if="selectedKind === 'marker'" class="text-caption text-disabled">
            Marker tag — no value.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="success" :disabled="!canSubmit" @click="submit">save</v-btn>
          <v-btn color="error" text="Cancel" @click="formDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Header } from '../common/interfaces';
import { TagScope, TagValueKind, TargetTag, TagDefinition } from '../gen/management/types.gen';

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const dialogOpen = ref(false);
const tags = ref<TargetTag[]>([]);
const loading = ref(false);
const effective = ref(false);
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

type SetFn = (tagName: string, value?: string | null, notify?: boolean) => Promise<unknown>;
type DelFn = (tagName: string, notify?: boolean) => Promise<unknown>;
type ListFn = (effective?: boolean, notify?: boolean) => Promise<{ tags: TargetTag[] }>;

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
    // handled
  } finally {
    loading.value = false;
  }
}

async function loadDefinitions() {
  try {
    const res = await functions.listTagDefinitions(1000, undefined, undefined, false);
    definitions.value = res['tag-definitions'] ?? [];
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

// Load when the dialog opens.
watch(dialogOpen, async (open) => {
  if (open) {
    await loadDefinitions();
    await loadTags();
  }
});

// ---- apply / edit form ----
const formDialog = ref(false);
const editing = ref(false);
const loadingDefinition = ref(false);
const allowedValues = ref<string[]>([]);
const selectedKind = ref<TagValueKind | undefined>(undefined);
const form = reactive<{ tagDefinitionId: string | null; name: string; value: string | null }>({
  tagDefinitionId: null,
  name: '',
  value: null,
});

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
  formDialog.value = true;
}

async function openEditDialog(tag: TargetTag) {
  editing.value = true;
  form.tagDefinitionId = tag['tag-definition-id'];
  form.name = tag.name;
  form.value = tag.value ?? null;
  selectedKind.value = tagKind(tag);
  if (selectedKind.value === 'enumerated') await loadAllowedValues(tag['tag-definition-id']);
  formDialog.value = true;
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
    formDialog.value = false;
    await loadTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

const confirmRemoveOpen = ref(false);
const pendingRemove = ref<TargetTag | null>(null);
const confirmRemoveName = ref('');
const removeConfirmed = computed(
  () => !!pendingRemove.value && confirmRemoveName.value.trim() === pendingRemove.value.name,
);

function requestRemove(tag: TargetTag) {
  pendingRemove.value = tag;
  confirmRemoveName.value = '';
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
</script>
