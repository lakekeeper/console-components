<template>
  <!-- The tab is the pane: the fields table takes the height, the evolution
       panel sits under it at its own size. -->
  <div class="tds-page">
    <TableColumnProfiler
      :metadata="table.metadata"
      :warehouse-id="warehouseId"
      :namespace-id="namespacePath"
      :table-name="tableName"
      :catalog-url="catalogUrl"
      :table-id="tableId" />

    <!-- Schema evolution (only when there is more than one schema) -->
    <section v-if="allSchemas.length > 1" class="tds-evolution">
      <v-expansion-panels v-model="schemaPanels" multiple>
        <v-expansion-panel value="evolution">
          <v-expansion-panel-title>
            <v-icon class="mr-2" size="small">mdi-history</v-icon>
            Schema evolution
            <v-chip size="x-small" color="primary" variant="tonal" class="ml-2">
              {{ allSchemas.length }} versions
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="d-flex mb-2">
              <v-spacer></v-spacer>
              <v-btn
                size="small"
                variant="flat"
                color="primary"
                prepend-icon="mdi-compare-horizontal"
                @click="openCompare">
                Compare schemas
              </v-btn>
            </div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th style="width: 100px">Schema ID</th>
                  <th style="width: 80px">Fields</th>
                  <th>Changes</th>
                  <th style="width: 48px"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="schema in allSchemas"
                  :key="schema['schema-id']"
                  :class="{
                    'font-weight-medium':
                      schema['schema-id'] === table.metadata['current-schema-id'],
                  }">
                  <td>
                    {{ schema['schema-id'] }}
                    <v-chip
                      v-if="schema['schema-id'] === table.metadata['current-schema-id']"
                      size="x-small"
                      color="success"
                      variant="flat"
                      class="ml-1">
                      current
                    </v-chip>
                  </td>
                  <td>{{ schema.fields?.length || 0 }}</td>
                  <td>
                    <template v-if="schemaFieldDiffs[schema['schema-id'] ?? 0]">
                      <v-chip
                        v-for="name in schemaFieldDiffs[schema['schema-id'] ?? 0].added"
                        :key="'add-' + name"
                        size="x-small"
                        color="success"
                        variant="flat"
                        class="mr-1 mb-1">
                        + {{ name }}
                      </v-chip>
                      <v-chip
                        v-for="name in schemaFieldDiffs[schema['schema-id'] ?? 0].removed"
                        :key="'rm-' + name"
                        size="x-small"
                        color="error"
                        variant="flat"
                        class="mr-1 mb-1">
                        - {{ name }}
                      </v-chip>
                      <span
                        v-if="
                          schemaFieldDiffs[schema['schema-id'] ?? 0].added.length === 0 &&
                          schemaFieldDiffs[schema['schema-id'] ?? 0].removed.length === 0
                        "
                        class="text-medium-emphasis">
                        {{ schema['schema-id'] === 0 ? 'Initial schema' : 'No field changes' }}
                      </span>
                    </template>
                  </td>
                  <td>
                    <v-btn
                      icon="mdi-eye-outline"
                      size="x-small"
                      variant="text"
                      @click="openSchema(schema)">
                      <v-icon></v-icon>
                      <v-tooltip activator="parent" location="top">View schema</v-tooltip>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </section>

    <!-- View a single schema as a fields table or its raw JSON (toggle) -->
    <v-dialog v-model="schemaViewOpen" max-width="800" scrollable>
      <v-card v-if="schemaViewData">
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-file-tree</v-icon>
          Schema {{ schemaViewData['schema-id'] }}
          <v-chip size="x-small" variant="tonal" class="ml-2">
            {{ schemaViewData.fields?.length || 0 }} fields
          </v-chip>
          <v-spacer></v-spacer>
          <v-btn-toggle
            v-model="schemaViewMode"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="mr-2">
            <v-btn value="table" size="small" prepend-icon="mdi-table">Table</v-btn>
            <v-btn value="json" size="small" prepend-icon="mdi-code-json">JSON</v-btn>
          </v-btn-toggle>
          <v-btn
            v-if="schemaViewMode === 'json'"
            variant="text"
            size="small"
            prepend-icon="mdi-content-copy"
            @click="copyToClipboard(JSON.stringify(schemaViewData, null, 2))">
            Copy
          </v-btn>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="schemaViewOpen = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <!-- Fields table -->
          <v-table v-if="schemaViewMode === 'table'" density="compact">
            <thead>
              <tr>
                <th style="width: 56px">ID</th>
                <th>Field</th>
                <th>Type</th>
                <th style="width: 80px">Required</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in schemaViewData.fields" :key="f.id">
                <td class="text-caption text-medium-emphasis">{{ f.id }}</td>
                <td class="font-mono">{{ f.name }}</td>
                <td class="font-mono text-caption">{{ typeLabel(f.type) }}</td>
                <td>
                  <v-icon v-if="f.required" size="small" color="error">mdi-asterisk</v-icon>
                  <span v-else class="text-disabled">—</span>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Raw JSON -->
          <div v-else class="schema-json">
            <vue-json-pretty
              :data="schemaViewData"
              :deep="4"
              :theme="visual.themeLight ? 'light' : 'dark'"
              :show-line-number="true"
              :virtual="false" />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Compare two schemas -->
    <v-dialog v-model="compareOpen" max-width="800" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-compare-horizontal</v-icon>
          Compare schemas
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" size="small" @click="compareOpen = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <div class="d-flex align-center mb-3" style="gap: 12px">
            <v-select
              v-model="compareLeft"
              :items="schemaIdItems"
              label="Base"
              density="compact"
              variant="outlined"
              hide-details
              no-data-text="No schema versions available"
              style="max-width: 200px"></v-select>
            <v-icon>mdi-arrow-right</v-icon>
            <v-select
              v-model="compareRight"
              :items="schemaIdItems"
              label="Compare"
              density="compact"
              variant="outlined"
              hide-details
              no-data-text="No schema versions available"
              style="max-width: 200px"></v-select>
          </div>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Field</th>
                <th>Base type</th>
                <th>Compare type</th>
                <th style="width: 110px">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in schemaCompareRows" :key="row.name">
                <td class="font-mono">{{ row.name }}</td>
                <td class="font-mono text-caption">{{ row.leftType ?? '—' }}</td>
                <td class="font-mono text-caption">{{ row.rightType ?? '—' }}</td>
                <td>
                  <v-chip size="x-small" variant="flat" :color="row.color">
                    {{ row.status }}
                  </v-chip>
                </td>
              </tr>
              <tr v-if="schemaCompareRows.length === 0">
                <td colspan="4" class="text-center text-medium-emphasis py-4">
                  Select two schema versions to compare.
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, watch } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import TableColumnProfiler from './TableColumnProfiler.vue';
import type { LoadTableResult, Type, Schema } from '../gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();

// The tab loads its own copy of the metadata rather than taking it from the
// overview: the two tabs are visited independently, and a tab that renders
// nothing until another one has been opened is a tab that looks broken.
const table = reactive<LoadTableResult>({
  metadata: {
    'format-version': 0,
    'table-uuid': '',
  },
});
const tableId = computed(() => table.metadata['table-uuid'] || '');
const namespacePath = computed(() => props.namespaceId);
const catalogUrl = computed(() => `${functions.icebergCatalogUrl()}catalog`);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  try {
    Object.assign(
      table,
      await functions.loadTableCustomized(props.warehouseId, props.namespaceId, props.tableName),
    );
  } catch (error) {
    console.error('Failed to load table data:', error);
  }
}

const copyToClipboard = (text: string) => {
  functions.copyToClipboard(text);
};

// Schema evolution panel starts collapsed.
const schemaPanels = ref<string[]>([]);

const allSchemas = computed(() => {
  const schemas = table.metadata.schemas;
  if (!schemas) return [];
  return [...schemas].sort((a, b) => (a['schema-id'] ?? 0) - (b['schema-id'] ?? 0));
});

// Human label for a field type (primitive string, or struct/list/map).
function typeLabel(t: Type): string {
  if (typeof t === 'string') return t;
  if (t.type === 'struct') {
    const inner = t.fields.map((f) => `${f.name}: ${typeLabel(f.type)}`).join(', ');
    return `struct<${inner}>`;
  }
  if (t.type === 'list') return `array<${typeLabel(t.element)}>`;
  if (t.type === 'map') return `map<${typeLabel(t.key)}, ${typeLabel(t.value)}>`;
  return 'complex';
}

// View a single schema's fields.
const schemaViewOpen = ref(false);
const schemaViewData = ref<Schema | null>(null);
const schemaViewMode = ref<'table' | 'json'>('table');
function openSchema(schema: Schema) {
  schemaViewData.value = schema;
  schemaViewOpen.value = true;
}

// Compare two schema versions.
const compareOpen = ref(false);
const compareLeft = ref<number | null>(null);
const compareRight = ref<number | null>(null);
const schemaIdItems = computed(() =>
  allSchemas.value.map((s) => ({
    title: `Schema ${s['schema-id']}${s['schema-id'] === table.metadata['current-schema-id'] ? ' (current)' : ''}`,
    value: s['schema-id'] ?? 0,
  })),
);
function openCompare() {
  const ids = allSchemas.value.map((s) => s['schema-id'] ?? 0);
  compareRight.value = table.metadata['current-schema-id'] ?? ids[ids.length - 1] ?? null;
  compareLeft.value = ids.filter((id) => id !== compareRight.value).pop() ?? ids[0] ?? null;
  compareOpen.value = true;
}
const schemaCompareRows = computed(() => {
  if (compareLeft.value === null || compareRight.value === null) return [];
  const byId = (id: number | null) => allSchemas.value.find((s) => s['schema-id'] === id);
  const left = byId(compareLeft.value);
  const right = byId(compareRight.value);
  if (!left || !right) return [];
  const leftMap = new Map((left.fields ?? []).map((f: any) => [f.name, typeLabel(f.type)]));
  const rightMap = new Map((right.fields ?? []).map((f: any) => [f.name, typeLabel(f.type)]));
  const names = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));
  return names
    .map((name) => {
      const leftType = leftMap.get(name) ?? null;
      const rightType = rightMap.get(name) ?? null;
      let status = 'same';
      let color = 'default';
      if (leftType === null) {
        status = 'added';
        color = 'success';
      } else if (rightType === null) {
        status = 'removed';
        color = 'error';
      } else if (leftType !== rightType) {
        status = 'changed';
        color = 'warning';
      }
      return { name, leftType, rightType, status, color };
    })
    .sort((a, b) => (a.status === 'same' ? 1 : 0) - (b.status === 'same' ? 1 : 0));
});

const schemaFieldDiffs = computed(() => {
  const schemas = allSchemas.value;
  const diffs: Record<number, { added: string[]; removed: string[] }> = {};

  for (let i = 0; i < schemas.length; i++) {
    const schema = schemas[i];
    const id = schema['schema-id'] ?? i;
    if (i === 0) {
      diffs[id] = { added: [], removed: [] };
      continue;
    }
    const prevFields = new Set(
      (schemas[i - 1].fields || []).map(
        (f) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`,
      ),
    );
    const currFields = new Set(
      (schema.fields || []).map(
        (f) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`,
      ),
    );
    const added: string[] = [];
    const removed: string[] = [];
    for (const f of currFields) {
      if (!prevFields.has(f)) added.push(f.split(':')[0]);
    }
    for (const f of prevFields) {
      if (!currFields.has(f)) removed.push(f.split(':')[0]);
    }
    diffs[id] = { added, removed };
  }
  return diffs;
});

defineExpose({
  loadTableData,
});
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

.schema-json {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 6px;
  padding: 4px 8px;
}

.tds-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px;
}
/* The fields table takes what is left after the evolution panel, which is
   collapsed until someone opens it. */
.tds-evolution {
  flex: 0 0 auto;
}
</style>
