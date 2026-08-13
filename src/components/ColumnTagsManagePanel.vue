<template>
  <div class="d-flex flex-column" :style="{ height }">
    <!-- The schema is the view: every field visible, its tags on its row, and a
         plus on the row to add more. Nested struct fields are rows too — the API
         addresses them with a dotted path (address.zip). -->
    <div class="px-4 pt-3 pb-2 flex-shrink-0">
      <div class="d-flex align-center flex-wrap mb-2" style="gap: 8px">
        <div class="text-caption text-medium-emphasis">SCHEMA {{ columnCount }}</div>
        <v-spacer></v-spacer>
        <v-btn size="x-small" variant="text" @click="expandAll(true)">Expand all</v-btn>
        <v-btn size="x-small" variant="text" @click="expandAll(false)">Collapse</v-btn>
        <!-- Both directions are real questions: what is left to classify, and
             what has been classified so far. -->
        <v-btn-toggle v-model="tagFilter" mandatory density="compact" variant="outlined" divided>
          <v-btn size="x-small" value="all">All</v-btn>
          <v-btn size="x-small" value="tagged">Tagged</v-btn>
          <v-btn size="x-small" value="untagged">Untagged</v-btn>
        </v-btn-toggle>
      </div>
      <v-text-field
        v-model="search"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="Filter fields"></v-text-field>
      <div v-if="orphanTagCount" class="text-caption text-medium-emphasis mt-2">
        {{ orphanTagCount }} tag{{ orphanTagCount === 1 ? '' : 's' }} belong to columns that no
        longer exist in the current schema and are not shown.
      </div>
    </div>

    <!-- Selection bar: always present so "select all" has a home, and it grows
         the bulk actions only once something is ticked. -->
    <div class="px-4 pb-2 flex-shrink-0">
      <v-sheet
        class="d-flex align-center flex-wrap px-3 py-1"
        :color="selected.length ? 'surface-light' : 'transparent'"
        rounded="lg"
        style="gap: 8px">
        <v-checkbox-btn
          class="schema-check"
          :model-value="allVisibleSelected"
          :indeterminate="someVisibleSelected && !allVisibleSelected"
          density="compact"
          color="primary"
          @update:model-value="toggleSelectAll"></v-checkbox-btn>
        <span class="text-body-2">
          {{
            selected.length ? `${selected.length} selected` : `Select all (${visibleRows.length})`
          }}
        </span>
        <v-spacer></v-spacer>
        <template v-if="selected.length">
          <v-menu v-model="bulkMenu" :close-on-content-click="false" location="bottom end">
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                size="small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-tag-plus-outline">
                Add tag
              </v-btn>
            </template>
            <v-card width="420">
              <TagPickerList
                :definitions="applicableDefinitions"
                :busy="busy"
                @apply="(name, value) => applyTo(selected, name, value)"
                @close="bulkMenu = false" />
            </v-card>
          </v-menu>
          <v-btn
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-tag-off-outline"
            :disabled="!selectedTagCount"
            @click="openBulkRemove">
            Remove all tags
          </v-btn>
          <v-btn size="small" variant="text" @click="selected = []">Clear</v-btn>
        </template>
      </v-sheet>
    </div>

    <div class="flex-shrink-0 px-4">
      <div class="schema-row schema-head text-caption text-medium-emphasis">
        <div></div>
        <div></div>
        <div>FIELD</div>
        <div>TYPE</div>
        <div>TAGS</div>
      </div>
    </div>

    <div class="px-4 pb-3" style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
      <!-- Filtering by tagged/untagged needs every field read first. Rendering
           the list meanwhile would have rows appear and vanish one request at a
           time, so the list waits behind this instead. -->
      <div v-if="loading" class="d-flex flex-column align-center pa-8">
        <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
        <span class="mt-4 text-body-2 text-medium-emphasis">Reading column tags…</span>
      </div>
      <div v-else-if="!visibleRows.length" class="text-body-2 text-medium-emphasis pa-4">
        {{ rows.length ? 'No field matches this filter.' : 'This table has no columns.' }}
      </div>
      <!-- Every cell is its own div: Vuetify's checkbox and menu do not each
           render exactly one element, and letting them be the grid children put
           the checkbox in the last column. -->
      <template v-else>
        <div
          v-for="(row, index) in visibleRows"
          :key="row.path"
          class="schema-row"
          :class="[
            index % 2 ? 'schema-row--alt' : '',
            selected.includes(row.path) ? 'schema-row--selected' : '',
          ]">
          <div class="schema-cell">
            <v-checkbox-btn
              class="schema-check"
              :model-value="selected.includes(row.path)"
              density="compact"
              color="primary"
              @update:model-value="toggleColumn(row.path)"></v-checkbox-btn>
          </div>

          <!-- Plus sits next to the checkbox, before the name: the two controls
             that act on the row stay together on the left. -->
          <div class="schema-cell">
            <v-menu
              v-model="addMenu[row.path]"
              :close-on-content-click="false"
              location="bottom start">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  icon="mdi-plus"
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  :title="`Add tags to ${row.path}`"></v-btn>
              </template>
              <v-card width="420">
                <div class="text-caption text-medium-emphasis px-3 pt-3">
                  Tags for
                  <strong>{{ row.path }}</strong>
                </div>
                <TagPickerList
                  :definitions="applicableDefinitions"
                  :assigned-names="(columnTags[row.path] ?? []).map((t) => t.name)"
                  :busy="busy"
                  @apply="(name, value) => applyTo([row.path], name, value)"
                  @close="addMenu[row.path] = false" />
              </v-card>
            </v-menu>
          </div>

          <div class="schema-cell" :style="{ paddingLeft: `${row.depth * 18}px` }">
            <v-btn
              v-if="row.hasChildren"
              :icon="expanded.has(row.path) ? 'mdi-chevron-down' : 'mdi-chevron-right'"
              size="x-small"
              variant="text"
              class="mr-1"
              @click.stop="toggleExpand(row.path)"></v-btn>
            <span v-else-if="row.depth" class="mr-1" style="width: 24px"></span>
            <span class="text-body-2 text-truncate" :title="row.path">{{ row.name }}</span>
          </div>

          <div class="schema-cell">
            <span class="text-caption text-medium-emphasis text-truncate" :title="row.type">
              {{ row.type }}
            </span>
          </div>

          <div class="schema-cell flex-wrap" style="gap: 4px">
            <template v-if="(columnTags[row.path] ?? []).length">
              <v-menu
                v-for="tag in columnTags[row.path]"
                :key="tag['tag-definition-id']"
                v-model="chipMenu[`${row.path}|${tag.name}`]"
                :disabled="!isEditable(tag.name)"
                :close-on-content-click="false"
                location="bottom start">
                <template #activator="{ props: chipProps }">
                  <v-chip
                    v-bind="isEditable(tag.name) ? chipProps : {}"
                    size="x-small"
                    color="info"
                    variant="tonal"
                    closable
                    :disabled="busy === tag.name"
                    @click:close.stop="requestRemove(row.path, tag.name)">
                    {{ tag.name }}
                    <span v-if="tag.value">= {{ tag.value }}</span>
                  </v-chip>
                </template>
                <v-card width="420">
                  <TagPickerList
                    :definitions="definitionsFor(tag.name)"
                    :assigned-names="[tag.name]"
                    :current-value="tag.value"
                    :auto-expand-id="tag['tag-definition-id']"
                    :busy="busy"
                    @apply="(name, value) => applyTo([row.path], name, value)"
                    @close="chipMenu[`${row.path}|${tag.name}`] = false" />
                </v-card>
              </v-menu>
            </template>
            <span v-else class="text-caption text-disabled">untagged</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Single removal keeps its typed confirmation. -->
    <v-dialog v-model="confirmRemoveOpen" max-width="440">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="error">mdi-delete-outline</v-icon>
          Remove tag
        </v-card-title>
        <v-card-text>
          <p class="mb-3">
            Remove
            <strong>{{ pendingRemove?.tagName }}</strong>
            from
            <strong>{{ pendingRemove?.column }}</strong>
            ?
          </p>
          <v-text-field
            v-model="confirmRemoveName"
            density="compact"
            variant="outlined"
            autocomplete="off"
            :label="`Type “${pendingRemove?.tagName}” to confirm`"
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

    <!-- Stripping every tag from a selection is the one action here with no
         single thing to name, so it asks for a word instead. -->
    <v-dialog v-model="bulkRemoveOpen" max-width="480">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="error">mdi-tag-off-outline</v-icon>
          Remove all tags
        </v-card-title>
        <v-card-text>
          <p class="mb-3">
            This removes
            <strong>{{ selectedTagCount }}</strong>
            tag{{ selectedTagCount === 1 ? '' : 's' }} from
            <strong>{{ selectedWithTags.length }}</strong>
            of the {{ selected.length }} selected field{{ selected.length === 1 ? '' : 's' }}.
          </p>
          <v-text-field
            v-model="bulkRemoveConfirm"
            density="compact"
            variant="outlined"
            autocomplete="off"
            label="Type REMOVE to confirm"
            :error="bulkRemoveConfirm.length > 0 && !bulkRemoveConfirmed"
            @keyup.enter="bulkRemoveConfirmed && doBulkRemove()"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" text="Cancel" @click="bulkRemoveOpen = false"></v-btn>
          <v-btn
            color="error"
            variant="flat"
            :text="`Remove ${selectedTagCount} tags`"
            :disabled="!bulkRemoveConfirmed"
            :loading="bulkRemoving"
            @click="doBulkRemove"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';
import TagPickerList from './TagPickerList.vue';
import { TagDefinition, TargetTag } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent (no-ops if another
// component, e.g. WarehouseManager, already registered it).
helix.register();

// A field is either a plain name or an Iceberg schema field, whose `type` is a
// string for primitives and an object for list/map/struct.
export type ColumnInput = string | { name: string; type?: any };

const props = defineProps<{
  warehouseId: string;
  tableId: string;
  columns: ColumnInput[];
  height?: string;
}>();

const height = computed(() => props.height ?? '60vh');

const functions = useFunctions();
const visual = useVisualStore();

const columnTags = reactive<Record<string, TargetTag[]>>({});
const definitions = ref<TagDefinition[]>([]);
const search = ref('');
const tagFilter = ref<'all' | 'tagged' | 'untagged'>('all');
const selected = ref<string[]>([]);
const busy = ref<string | null>(null);
const expanded = reactive(new Set<string>());
// Menu open state is held per row: the picker keeps the menu open on click so
// several tags can be applied, so its Done button needs something to close.
const bulkMenu = ref(false);
const addMenu = reactive<Record<string, boolean>>({});
const chipMenu = reactive<Record<string, boolean>>({});

// ---- schema -> rows --------------------------------------------------------
// Nested columns are addressed with `.` (address.zip), so a struct becomes an
// expandable row and its children become rows of their own.
function typeLabel(type: any): string {
  if (!type) return '';
  if (typeof type === 'string') return type;
  if (type.type === 'list') return `list<${typeLabel(type.element)}>`;
  if (type.type === 'map') return `map<${typeLabel(type.key)}, ${typeLabel(type.value)}>`;
  if (type.type === 'struct') return `struct<${(type.fields ?? []).length} fields>`;
  return String(type.type ?? '');
}

type Row = {
  path: string;
  name: string;
  type: string;
  depth: number;
  hasChildren: boolean;
  // Tags come back keyed by field-id, so every row carries its own.
  fieldId?: number;
};

function flatten(fields: any[], parent = '', depth = 0): Row[] {
  const out: Row[] = [];
  for (const field of fields ?? []) {
    const entry = typeof field === 'string' ? { name: field, type: '' } : field;
    const path = parent ? `${parent}.${entry.name}` : entry.name;
    const struct = typeof entry.type === 'object' && entry.type?.type === 'struct';
    out.push({
      path,
      name: entry.name,
      type: typeLabel(entry.type),
      depth,
      hasChildren: struct,
      fieldId: typeof entry.id === 'number' ? entry.id : undefined,
    });
    if (struct) out.push(...flatten(entry.type.fields ?? [], path, depth + 1));
  }
  return out;
}

const rows = computed(() => flatten(props.columns as any[]));

// A row shows only when every ancestor is expanded; filtering by name lifts that
// so a match deep in a struct is still reachable.
const visibleRows = computed(() => {
  const term = (search.value ?? '').trim().toLowerCase();
  return rows.value.filter((r) => {
    if (term) {
      if (!r.path.toLowerCase().includes(term)) return false;
    } else if (r.depth > 0) {
      const parts = r.path.split('.');
      for (let i = 1; i < parts.length; i++) {
        if (!expanded.has(parts.slice(0, i).join('.'))) return false;
      }
    }
    // Everything is loaded in one call, so the filter can be applied directly.
    if (tagFilter.value !== 'all') {
      const tagged = (columnTags[r.path] ?? []).length > 0;
      if (tagFilter.value === 'tagged' && !tagged) return false;
      if (tagFilter.value === 'untagged' && tagged) return false;
    }
    return true;
  });
});

const columnCount = computed(() =>
  visibleRows.value.length === rows.value.length
    ? `(${rows.value.length})`
    : `(${visibleRows.value.length} of ${rows.value.length})`,
);

function toggleExpand(path: string) {
  if (expanded.has(path)) expanded.delete(path);
  else expanded.add(path);
}

function expandAll(open: boolean) {
  expanded.clear();
  if (!open) return;
  for (const row of rows.value) if (row.hasChildren) expanded.add(row.path);
}

const applicableDefinitions = computed(() =>
  definitions.value.filter((d) => d.scope.includes('column')),
);

function definitionsFor(tagName: string): TagDefinition[] {
  return definitions.value.filter((d) => d.name === tagName);
}

function isEditable(tagName: string): boolean {
  const kind = definitions.value.find((d) => d.name === tagName)?.['value-kind'];
  return !!kind && kind !== 'marker';
}

// ---- loading ---------------------------------------------------------------
// One request for the whole table. The response is keyed by field-id, which
// survives renames, so it is matched against the current schema here rather than
// asked for column by column.
const loading = ref(false);
// Tags whose field-id is no longer in the current schema: the column was dropped
// but its tags outlived it, and there is no column name left to address them by.
const orphanTagCount = ref(0);

async function loadColumnTags() {
  if (!props.tableId) return;
  loading.value = true;
  try {
    const columns = await functions.listAllColumnTags(props.warehouseId, props.tableId, false);
    const byFieldId = new Map<number, TargetTag[]>();
    for (const entry of columns) byFieldId.set(entry['field-id'], entry.tags ?? []);

    for (const key of Object.keys(columnTags)) delete columnTags[key];
    let matched = 0;
    for (const row of rows.value) {
      const tags = row.fieldId !== undefined ? byFieldId.get(row.fieldId) : undefined;
      columnTags[row.path] = tags ?? [];
      if (tags) matched++;
    }
    // Reported rather than silently dropped: the tags exist server-side even
    // though no current column claims them.
    orphanTagCount.value = columns.length - matched;
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
  } catch {
    // handled
  }
  await loadColumnTags();
});

watch(
  () => [props.warehouseId, props.tableId, props.columns],
  async () => {
    selected.value = [];
    tagFilter.value = 'all';
    expanded.clear();
    await loadColumnTags();
  },
);

// ---- selection -------------------------------------------------------------
function toggleColumn(path: string) {
  if (selected.value.includes(path)) {
    selected.value = selected.value.filter((c) => c !== path);
  } else {
    selected.value = [...selected.value, path];
  }
}

const allVisibleSelected = computed(
  () =>
    visibleRows.value.length > 0 && visibleRows.value.every((r) => selected.value.includes(r.path)),
);
const someVisibleSelected = computed(() =>
  visibleRows.value.some((r) => selected.value.includes(r.path)),
);

function toggleSelectAll(value: boolean | null) {
  if (value) {
    selected.value = visibleRows.value.map((r) => r.path);
  } else {
    selected.value = [];
  }
}

const selectedWithTags = computed(() =>
  selected.value.filter((c) => (columnTags[c] ?? []).length > 0),
);
const selectedTagCount = computed(() =>
  selected.value.reduce((sum, c) => sum + (columnTags[c] ?? []).length, 0),
);

// ---- writing ---------------------------------------------------------------
// One gesture, one request per column: the API has no bulk write, so the fan-out
// happens here — with the silent wrappers, so N columns raise one snackbar
// rather than N.
async function applyTo(columns: string[], tagName: string, value?: string | null) {
  if (busy.value || !columns.length) return;
  busy.value = tagName;
  const def = definitions.value.find((d) => d.name === tagName);
  const payload = def?.['value-kind'] === 'marker' ? undefined : value;
  try {
    for (const column of columns) {
      await functions.setTableColumnTagSilent(
        props.warehouseId,
        props.tableId,
        column,
        tagName,
        payload,
      );
    }
    await loadColumnTags();
    visual.setSnackbarMsg({
      function: 'setTableColumnTag',
      text:
        columns.length === 1
          ? `Tag '${tagName}' applied to ${columns[0]}`
          : `Tag '${tagName}' applied to ${columns.length} columns`,
      ttl: 3000,
      ts: Date.now(),
      type: Type.SUCCESS,
    });
    visual.bumpTagsRefresh();
  } catch {
    // handled
  } finally {
    busy.value = null;
  }
}

const confirmRemoveOpen = ref(false);
const pendingRemove = ref<{ column: string; tagName: string } | null>(null);
const confirmRemoveName = ref('');
const removeConfirmed = computed(
  () => !!pendingRemove.value && confirmRemoveName.value.trim() === pendingRemove.value.tagName,
);

function requestRemove(column: string, tagName: string) {
  pendingRemove.value = { column, tagName };
  confirmRemoveName.value = '';
  confirmRemoveOpen.value = true;
}

async function doRemove() {
  const pending = pendingRemove.value;
  if (!pending) return;
  confirmRemoveOpen.value = false;
  busy.value = pending.tagName;
  try {
    await functions.deleteTableColumnTag(
      props.warehouseId,
      props.tableId,
      pending.column,
      pending.tagName,
      false,
    );
    await loadColumnTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  } finally {
    busy.value = null;
  }
}

const bulkRemoveOpen = ref(false);
const bulkRemoveConfirm = ref('');
const bulkRemoving = ref(false);
const bulkRemoveConfirmed = computed(() => bulkRemoveConfirm.value.trim() === 'REMOVE');

function openBulkRemove() {
  bulkRemoveConfirm.value = '';
  bulkRemoveOpen.value = true;
}

async function doBulkRemove() {
  if (!bulkRemoveConfirmed.value) return;
  bulkRemoving.value = true;
  let removed = 0;
  try {
    for (const column of [...selectedWithTags.value]) {
      for (const tag of [...(columnTags[column] ?? [])]) {
        await functions.deleteTableColumnTagSilent(
          props.warehouseId,
          props.tableId,
          column,
          tag.name,
        );
        removed++;
      }
    }
    await loadColumnTags();
    visual.setSnackbarMsg({
      function: 'deleteTableColumnTag',
      text: `Removed ${removed} tag${removed === 1 ? '' : 's'}`,
      ttl: 3000,
      ts: Date.now(),
      type: Type.SUCCESS,
    });
    visual.bumpTagsRefresh();
  } catch {
    // handled
  } finally {
    bulkRemoving.value = false;
    bulkRemoveOpen.value = false;
  }
}
</script>

<style scoped>
/* A fixed grid rather than free-flowing rows: name, type and tags line up down
   the list, which is what makes 250 fields scannable. */
.schema-row {
  display: grid;
  grid-template-columns: 28px 32px minmax(0, 1.3fr) 150px minmax(0, 2fr);
  align-items: center;
  column-gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  min-height: 40px;
}
.schema-cell {
  display: flex;
  align-items: center;
  min-width: 0;
}
/* The selection control grows and pads itself by default, which pushes it out of
   its cell and lets the plus read as the first control on the row. */
.schema-check {
  flex: 0 0 auto;
}
.schema-check :deep(.v-selection-control) {
  flex: 0 0 auto;
  min-height: 0;
  justify-content: flex-start;
}
.schema-check :deep(.v-selection-control__wrapper),
.schema-check :deep(.v-selection-control__input) {
  width: 24px;
  height: 24px;
}
.schema-head {
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.24);
}
.schema-row--alt {
  background: rgba(var(--v-theme-on-surface), 0.035);
}
.schema-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
}
.schema-row--selected {
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
