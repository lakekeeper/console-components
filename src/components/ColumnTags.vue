<template>
  <v-card flat>
    <v-toolbar v-if="!hideHeader" class="mb-1" color="transparent" density="compact" flat>
      <template #prepend>
        <v-icon>mdi-table-column</v-icon>
      </template>
      <v-toolbar-title>
        <span class="text-subtitle-1">Column tags</span>
      </v-toolbar-title>
    </v-toolbar>

    <v-data-table
      :headers="headers"
      :items="columns"
      :loading="loading"
      density="compact"
      item-value="name">
      <template #item.tags="{ item }">
        <template v-if="tagsByColumn[item.name]?.length">
          <v-tooltip
            v-for="tag in tagsByColumn[item.name]"
            :key="tag['tag-definition-id']"
            location="top"
            max-width="500">
            <template #activator="{ props: tp }">
              <v-chip v-bind="tp" class="mr-1 mb-1" size="small" variant="tonal">
                {{ tag.name }}
                <span v-if="tag.value">: {{ truncate(tag.value, 30) }}</span>
              </v-chip>
            </template>
            <div style="white-space: pre-wrap; word-break: break-word">
              <div class="font-weight-medium">{{ tag.name }}</div>
              <div v-if="tag.value">{{ tag.value }}</div>
            </div>
          </v-tooltip>
        </template>
        <span v-else class="text-disabled">—</span>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="canManage"
          icon="mdi-tag-edit-outline"
          size="x-small"
          variant="text"
          title="Manage tags"
          @click="openManage(item)"></v-btn>
      </template>
      <template #no-data>
        <span class="text-disabled">No columns.</span>
      </template>
    </v-data-table>

    <!-- Per-column manage dialog. -->
    <v-dialog v-model="manageDialog" max-width="600">
      <v-card :title="`Manage tags — column '${activeColumn?.name}'`">
        <v-card-text>
          <div v-if="activeTags.length" class="mb-3 d-flex flex-wrap ga-1">
            <v-chip
              v-for="tag in activeTags"
              :key="tag['tag-definition-id']"
              size="small"
              variant="tonal"
              closable
              @click:close="requestRemove(tag)">
              {{ tag.name }}
              <span v-if="tag.value">: {{ truncate(tag.value, 40) }}</span>
            </v-chip>
          </div>
          <div v-else class="text-caption text-disabled mb-3">No tags on this column.</div>

          <v-divider class="mb-3"></v-divider>
          <div class="text-overline mb-1">Apply a tag</div>
          <v-autocomplete
            v-model="form.tagDefinitionId"
            label="Tag"
            placeholder="Type to find a tag"
            :items="applicableDefinitions"
            item-title="name"
            item-value="id"
            auto-select-first
            density="compact"
            no-data-text="No tags available"
            @update:model-value="onDefinitionSelected"></v-autocomplete>

          <v-text-field
            v-if="selectedKind === 'free-text'"
            v-model="form.value"
            label="Value"
            density="compact"
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
            density="compact"
            :items="allowedValues"
            :loading="loadingDefinition"
            no-data-text="No values available"
            :rules="[(v) => (v !== null && v !== '') || 'Value is required']"></v-select>
          <div v-else-if="selectedKind === 'marker'" class="text-caption text-disabled">
            Marker tag — no value.
          </div>

          <div class="d-flex justify-end">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              :disabled="!canSubmit"
              @click="submit">
              apply
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" text="Close" @click="manageDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remove confirmation -->
    <v-dialog v-model="confirmRemoveOpen" max-width="440">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="error">mdi-delete-outline</v-icon>
          Remove tag
        </v-card-title>
        <v-card-text>
          <p class="mb-3">
            Remove
            <strong>{{ pendingRemove?.name }}</strong>
            from column
            <strong>{{ activeColumn?.name }}</strong>
            ?
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
          <v-btn variant="text" text="Cancel" @click="confirmRemoveOpen = false"></v-btn>
          <v-btn
            color="error"
            variant="flat"
            text="Remove"
            :disabled="!removeConfirmed"
            @click="doRemove"></v-btn>
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
import { TagValueKind, TargetTag, TagDefinition } from '../gen/management/types.gen';

export interface ColumnRef {
  name: string;
  fieldId: number;
}

const props = defineProps<{
  warehouseId: string;
  tableId: string;
  columns: ColumnRef[];
  canManage?: boolean;
  // Suppress the internal toolbar title when the caller supplies its own heading.
  hideHeader?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

function truncate(v: string | null | undefined, n = 30): string {
  if (v == null) return '';
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

const loading = ref(false);
const tagsByColumn = reactive<Record<string, TargetTag[]>>({});
const definitions = ref<TagDefinition[]>([]);

const headers: readonly Header[] = Object.freeze([
  { title: 'Column', key: 'name', align: 'start' },
  { title: 'Tags', key: 'tags', align: 'start', sortable: false },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

const applicableDefinitions = computed(() =>
  definitions.value.filter((d) => d.scope.includes('column')),
);

async function loadDefinitions() {
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
  } catch {
    // handled
  }
}

// One request for the table rather than one per column; the response is keyed by
// field-id, which each ColumnRef already carries.
async function loadAllColumnTags() {
  loading.value = true;
  try {
    const columns = await functions.listAllColumnTags(props.warehouseId, props.tableId, false);
    const byFieldId = new Map<number, TargetTag[]>();
    for (const entry of columns) byFieldId.set(entry['field-id'], entry.tags ?? []);
    for (const col of props.columns) {
      tagsByColumn[col.name] = byFieldId.get(col.fieldId) ?? [];
    }
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

// ---- per-column manage dialog ----
const manageDialog = ref(false);
const activeColumn = ref<ColumnRef | null>(null);
const activeTags = computed(() =>
  activeColumn.value ? (tagsByColumn[activeColumn.value.name] ?? []) : [],
);

const loadingDefinition = ref(false);
const allowedValues = ref<string[]>([]);
const selectedKind = ref<TagValueKind | undefined>(undefined);
const form = reactive<{ tagDefinitionId: string | null; name: string; value: string | null }>({
  tagDefinitionId: null,
  name: '',
  value: null,
});

const canSubmit = computed(() => {
  if (!form.tagDefinitionId) return false;
  if (selectedKind.value === 'marker') return true;
  if (form.value === null || form.value === '') return false;
  if (selectedKind.value === 'free-text' && form.value.length > 256) return false;
  return true;
});

function resetForm() {
  form.tagDefinitionId = null;
  form.name = '';
  form.value = null;
  selectedKind.value = undefined;
  allowedValues.value = [];
}

function openManage(col: ColumnRef) {
  activeColumn.value = col;
  resetForm();
  manageDialog.value = true;
}

async function onDefinitionSelected(id: string | null) {
  const def = definitions.value.find((d) => d.id === id);
  form.name = def?.name ?? '';
  form.value = null;
  selectedKind.value = def?.['value-kind'];
  allowedValues.value = def?.['allowed-values'] ?? [];
  if (id && selectedKind.value === 'enumerated' && !allowedValues.value.length) {
    loadingDefinition.value = true;
    try {
      const full = await functions.getTagDefinition(id, false);
      allowedValues.value = full['allowed-values'] ?? [];
    } catch {
      // handled by functions.handleError
    } finally {
      loadingDefinition.value = false;
    }
  }
}

async function submit() {
  if (!canSubmit.value || !activeColumn.value) return;
  const col = activeColumn.value;
  const value = selectedKind.value === 'marker' ? undefined : form.value;
  try {
    await functions.setTableColumnTag(
      props.warehouseId,
      props.tableId,
      col.name,
      form.name,
      value,
      notify,
    );
    resetForm();
    await refreshColumn(col);
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
  const col = activeColumn.value;
  if (!tag || !col) return;
  confirmRemoveOpen.value = false;
  try {
    await functions.deleteTableColumnTag(
      props.warehouseId,
      props.tableId,
      col.name,
      tag.name,
      notify,
    );
    await refreshColumn(col);
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

async function refreshColumn(col: ColumnRef) {
  const res = await functions.listTableColumnTags(
    props.warehouseId,
    props.tableId,
    col.name,
    false,
    false,
  );
  tagsByColumn[col.name] = res.tags ?? [];
}

onMounted(async () => {
  await loadDefinitions();
  await loadAllColumnTags();
});
</script>
