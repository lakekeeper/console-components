<template>
  <v-card flat>
    <v-toolbar class="mb-2" color="transparent" density="compact" flat>
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
      density="comfortable"
      item-value="name">
      <template #item.tags="{ item }">
        <template v-if="tagsByColumn[item.name]?.length">
          <v-chip
            v-for="tag in tagsByColumn[item.name]"
            :key="tag['tag-definition-id']"
            class="mr-1 mb-1"
            size="small"
            variant="tonal"
            :closable="canManage"
            @click:close="removeTag(item, tag)">
            {{ tag.name }}
            <span v-if="tag.value">: {{ tag.value }}</span>
          </v-chip>
        </template>
        <span v-else class="text-disabled">—</span>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="canManage"
          icon="mdi-tag-plus-outline"
          size="x-small"
          variant="text"
          title="Apply tag"
          @click="openApplyDialog(item)"></v-btn>
      </template>
      <template #no-data>
        <span class="text-disabled">No columns.</span>
      </template>
    </v-data-table>

    <v-dialog v-model="dialog" max-width="500">
      <v-card :title="`Apply tag to column '${activeColumn?.name}'`">
        <v-card-text>
          <v-select
            v-model="form.tagDefinitionId"
            label="Tag definition"
            :items="applicableDefinitions"
            item-title="name"
            item-value="id"
            :rules="[(v) => !!v || 'Select a tag definition']"
            @update:model-value="onDefinitionSelected"></v-select>

          <v-text-field
            v-if="selectedKind === 'free-text'"
            v-model="form.value"
            label="Value"
            :rules="[(v) => (v !== null && v !== '') || 'Value is required']"></v-text-field>
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
          <v-btn color="error" text="Cancel" @click="dialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useFunctions } from '../plugins/functions';
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
}>();

const functions = useFunctions();
const notify = true;

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
    const res = await functions.listTagDefinitions(1000, undefined, undefined, false);
    definitions.value = res['tag-definitions'] ?? [];
  } catch {
    // handled
  }
}

async function loadAllColumnTags() {
  loading.value = true;
  try {
    await Promise.all(
      props.columns.map(async (col) => {
        const res = await functions.listTableColumnTags(
          props.warehouseId,
          props.tableId,
          col.name,
          false,
          false,
        );
        tagsByColumn[col.name] = res.tags ?? [];
      }),
    );
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

// ---- apply dialog ----
const dialog = ref(false);
const activeColumn = ref<ColumnRef | null>(null);
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
  return form.value !== null && form.value !== '';
});

function openApplyDialog(col: ColumnRef) {
  activeColumn.value = col;
  form.tagDefinitionId = null;
  form.name = '';
  form.value = null;
  selectedKind.value = undefined;
  allowedValues.value = [];
  dialog.value = true;
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
    dialog.value = false;
    await refreshColumn(col);
  } catch {
    // handled
  }
}

async function removeTag(col: ColumnRef, tag: TargetTag) {
  try {
    await functions.deleteTableColumnTag(
      props.warehouseId,
      props.tableId,
      col.name,
      tag.name,
      notify,
    );
    await refreshColumn(col);
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
