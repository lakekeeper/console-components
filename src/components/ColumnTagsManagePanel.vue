<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="allColumnTagRows"
      :loading="loading"
      density="comfortable"
      :items-per-page="-1"
      hide-default-footer>
      <template #item.value="{ item }">
        <span v-if="item.value !== null && item.value !== undefined">{{ item.value }}</span>
        <span v-else class="text-disabled">—</span>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          color="error"
          icon="mdi-delete-outline"
          size="x-small"
          variant="text"
          @click="requestRemove(item.column, item.tag)"></v-btn>
      </template>
      <template #no-data>
        <span class="text-disabled">No column tags applied yet.</span>
      </template>
    </v-data-table>

    <v-divider></v-divider>
    <div class="pa-4">
      <div class="text-overline mb-2">Apply a tag</div>
      <div class="d-flex flex-wrap align-start ga-2">
        <v-select
          v-model="form.column"
          label="Column"
          :items="columns"
          density="compact"
          hide-details
          style="min-width: 180px"></v-select>
        <v-autocomplete
          v-model="form.tagDefinitionId"
          label="Tag"
          placeholder="Type to find a tag"
          :items="applicableDefinitions"
          item-title="name"
          item-value="id"
          auto-select-first
          density="compact"
          hide-details
          style="min-width: 200px"
          @update:model-value="onDefinitionSelected"></v-autocomplete>
        <v-text-field
          v-if="selectedKind === 'free-text'"
          v-model="form.value"
          label="Value"
          density="compact"
          maxlength="256"
          hide-details
          style="min-width: 200px"></v-text-field>
        <v-select
          v-else-if="selectedKind === 'enumerated'"
          v-model="form.value"
          label="Value"
          density="compact"
          :items="allowedValues"
          :loading="loadingDefinition"
          hide-details
          style="min-width: 200px"></v-select>
        <span
          v-else-if="selectedKind === 'marker'"
          class="text-caption text-disabled align-self-center">
          Marker — no value
        </span>
        <v-btn color="success" :disabled="!canSubmit" @click="submit">apply</v-btn>
      </div>
    </div>

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
            <strong>{{ pendingRemove?.tag?.name }}</strong>
            from column
            <strong>{{ pendingRemove?.column }}</strong>
            ?
          </p>
          <v-text-field
            v-model="confirmRemoveName"
            density="compact"
            variant="outlined"
            autocomplete="off"
            :label="`Type “${pendingRemove?.tag?.name}” to confirm`"
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
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Header } from '../common/interfaces';
import { TagDefinition, TagValueKind, TargetTag } from '../gen/management/types.gen';

const props = defineProps<{
  warehouseId: string;
  tableId: string;
  columns: string[];
}>();

const functions = useFunctions();
const visual = useVisualStore();

const loading = ref(false);
const columnTags = reactive<Record<string, TargetTag[]>>({});
const definitions = ref<TagDefinition[]>([]);

const headers: readonly Header[] = Object.freeze([
  { title: 'Column', key: 'column', align: 'start' },
  { title: 'Tag', key: 'name', align: 'start' },
  { title: 'Value', key: 'value', align: 'start' },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

const applicableDefinitions = computed(() =>
  definitions.value.filter((d) => d.scope.includes('column')),
);

const allColumnTagRows = computed(() => {
  const rows: { column: string; name: string; value: string | null | undefined; tag: TargetTag }[] =
    [];
  for (const col of props.columns) {
    for (const tag of columnTags[col] ?? []) {
      rows.push({ column: col, name: tag.name, value: tag.value, tag });
    }
  }
  return rows;
});

async function loadDefinitions() {
  try {
    const res = await functions.listTagDefinitions(1000, undefined, undefined, false);
    definitions.value = res['tag-definitions'] ?? [];
  } catch {
    // handled
  }
}

async function refreshColumn(name: string) {
  try {
    const res = await functions.listTableColumnTags(
      props.warehouseId,
      props.tableId,
      name,
      false,
      false,
    );
    columnTags[name] = res.tags ?? [];
  } catch {
    // handled
  }
}

async function loadAll() {
  loading.value = true;
  try {
    await Promise.all(props.columns.map((c) => refreshColumn(c)));
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadDefinitions();
  await loadAll();
});

// ---- apply form ----
const loadingDefinition = ref(false);
const allowedValues = ref<string[]>([]);
const selectedKind = ref<TagValueKind | undefined>(undefined);
const form = reactive<{
  column: string | null;
  tagDefinitionId: string | null;
  name: string;
  value: string | null;
}>({
  column: null,
  tagDefinitionId: null,
  name: '',
  value: null,
});

const canSubmit = computed(() => {
  if (!form.column || !form.tagDefinitionId) return false;
  if (selectedKind.value === 'marker') return true;
  if (form.value === null || form.value === '') return false;
  if (selectedKind.value === 'free-text' && form.value.length > 256) return false;
  return true;
});

function resetForm() {
  form.column = null;
  form.tagDefinitionId = null;
  form.name = '';
  form.value = null;
  selectedKind.value = undefined;
  allowedValues.value = [];
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
  if (!canSubmit.value || !form.column) return;
  const column = form.column;
  const value = selectedKind.value === 'marker' ? undefined : form.value;
  try {
    await functions.setTableColumnTag(
      props.warehouseId,
      props.tableId,
      column,
      form.name,
      value,
      true,
    );
    resetForm();
    await refreshColumn(column);
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

const confirmRemoveOpen = ref(false);
const pendingRemove = ref<{ column: string; tag: TargetTag } | null>(null);
const confirmRemoveName = ref('');
const removeConfirmed = computed(
  () => !!pendingRemove.value && confirmRemoveName.value.trim() === pendingRemove.value.tag.name,
);

function requestRemove(column: string, tag: TargetTag) {
  pendingRemove.value = { column, tag };
  confirmRemoveName.value = '';
  confirmRemoveOpen.value = true;
}

async function doRemove() {
  const pending = pendingRemove.value;
  if (!pending) return;
  confirmRemoveOpen.value = false;
  try {
    await functions.deleteTableColumnTag(
      props.warehouseId,
      props.tableId,
      pending.column,
      pending.tag.name,
      true,
    );
    await refreshColumn(pending.column);
    visual.bumpTagsRefresh();
  } catch {
    // handled
  }
}

watch(
  () => [props.warehouseId, props.tableId, props.columns],
  async () => {
    await loadAll();
  },
);
</script>
