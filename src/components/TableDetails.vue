<template>
  <v-card-text class="pa-4">
    <!-- Identity on the left, how the data is laid out and what is set on it
         on the right: both fit above the fold, which is where a reader looks
         for "which table is this and what is it made of". -->
    <v-row dense class="mb-4">
      <v-col cols="12" md="6">
        <section id="tdx-identity" class="tdx-section">
          <div class="tdx-head">
            <v-icon icon="mdi-information-outline" size="16" color="primary" class="mr-2"></v-icon>
            Identity &amp; location
          </div>
          <dl class="tdx-kv">
            <template v-for="row in identityRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd :title="row.title">
                <v-icon v-if="row.icon" :color="row.iconColor" size="16">{{ row.icon }}</v-icon>
                <v-tooltip v-if="row.tip" location="bottom" :text="row.full">
                  <template #activator="{ props: tp }">
                    <span v-bind="tp" class="font-mono" style="cursor: help">{{ row.value }}</span>
                  </template>
                </v-tooltip>
                <span v-else :class="{ 'font-mono': row.mono }">{{ row.value }}</span>
                <v-btn
                  v-if="row.copy"
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="tdx-kv__copy"
                  @click="copyToClipboard(row.full ?? String(row.value))"></v-btn>
              </dd>
            </template>

            <!-- The internal counters share one line: each is a number nobody
                 reads on its own, and a row apiece doubled the block. -->
            <template v-if="identityCounters.length">
              <dt>Counters</dt>
              <dd class="tdx-counters">
                <span v-for="c in identityCounters" :key="c.label" class="tdx-counter">
                  <span class="text-medium-emphasis">{{ c.label }}</span>
                  <span class="font-mono">{{ c.value }}</span>
                </span>
              </dd>
            </template>
          </dl>
        </section>
      </v-col>

      <v-col cols="12" md="6">
        <!-- Layout & ordering -->
        <section id="tdx-layout" class="tdx-section mb-4">
          <div class="tdx-head">
            <v-icon icon="mdi-view-grid-outline" size="16" color="primary" class="mr-2"></v-icon>
            Layout &amp; ordering
          </div>
          <dl class="tdx-kv">
            <dt>Partitioning</dt>
            <dd>
              <template v-if="activePartitionSpec && activePartitionSpec.fields.length">
                <v-chip
                  v-for="field in activePartitionSpec.fields"
                  :key="field.name"
                  size="x-small"
                  color="primary"
                  variant="tonal">
                  {{ formatPartitionField(field) }}
                </v-chip>
              </template>
              <span v-else class="text-medium-emphasis">Unpartitioned</span>
              <v-chip v-if="activePartitionSpec" size="x-small" variant="tonal">
                spec {{ activePartitionSpec['spec-id'] }}
              </v-chip>
            </dd>

            <dt>Sort order</dt>
            <dd>
              <template v-if="activeSortOrder && activeSortOrder.fields.length">
                <v-chip
                  v-for="(field, idx) in activeSortOrder.fields"
                  :key="idx"
                  size="x-small"
                  color="info"
                  variant="tonal">
                  {{ formatSortField(field) }}
                </v-chip>
              </template>
              <span v-else class="text-medium-emphasis">Unsorted</span>
              <v-chip v-if="activeSortOrder" size="x-small" variant="tonal">
                order {{ activeSortOrder['order-id'] }}
              </v-chip>
            </dd>
          </dl>
        </section>

        <!-- Properties -->
        <section
          v-if="allPropertyItems.length > 0 || canEdit"
          id="tdx-properties"
          class="tdx-section">
          <div class="tdx-head">
            <v-icon icon="mdi-cog-outline" size="16" color="primary" class="mr-2"></v-icon>
            Properties
            <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyItems.length }}</v-chip>
            <v-spacer></v-spacer>
            <!-- The filter sits on the heading rather than on a line of its
                 own above a table that is often empty. -->
            <v-switch
              v-if="systemPropCount > 0"
              v-model="hideSystemProps"
              color="primary"
              density="compact"
              hide-details
              class="tdx-head__switch"
              :label="`Hide system (${systemPropCount})`"></v-switch>
          </div>
          <v-data-table-virtual
            v-if="propertyItems.length"
            :headers="propertyHeaders"
            :items="propertyItems"
            density="compact"
            fixed-header
            height="180px"
            item-value="key"
            hide-default-footer
            :items-per-page="-1">
            <template #item.value="{ item }">
              <span class="font-mono text-wrap">{{ item.value }}</span>
            </template>
          </v-data-table-virtual>
          <div v-else class="text-medium-emphasis text-body-2">No properties set</div>
        </section>
      </v-col>
    </v-row>

    <!-- Structure & governance (fields + tags/stats + evolution) -->
    <section id="tdx-schema" class="tdx-section">
      <TableColumnProfiler
        :metadata="table.metadata"
        :warehouse-id="warehouseId"
        :namespace-id="namespacePath"
        :table-name="tableName"
        :catalog-url="catalogUrl"
        :table-id="tableId" />

      <!-- Schema evolution (only when there is more than one schema) -->
      <v-expansion-panels v-if="allSchemas.length > 1" v-model="schemaPanels" multiple class="mb-6">
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

    <!-- Snapshots -->
    <section v-if="snapshotRows.length" id="tdx-snapshots" class="tdx-section mb-4">
      <div class="tdx-head">
        <v-icon icon="mdi-camera-outline" size="16" color="info" class="mr-2"></v-icon>
        Snapshots
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ snapshotRows.length }}</v-chip>
        <v-spacer></v-spacer>
        <v-select
          v-if="branchOptions.length > 1"
          v-model="selectedBranch"
          :items="branchOptions"
          density="compact"
          variant="outlined"
          hide-details
          prepend-inner-icon="mdi-source-branch"
          label="Branch"
          style="max-width: 220px"
          no-data-text="No branches available"></v-select>
      </div>
      <v-data-table
        :headers="snapshotHeaders"
        :items="snapshotRows"
        :items-per-page="10"
        density="compact"
        item-value="id"
        hover
        fixed-header
        class="snapshot-table"
        @click:row="openSnapshot">
        <template #item.refs="{ item }">
          <v-chip
            v-for="r in item.refs"
            :key="r"
            size="x-small"
            :color="r === 'main' ? 'primary' : 'default'"
            variant="tonal"
            class="mr-1">
            <v-icon start size="x-small">mdi-source-branch</v-icon>
            {{ r }}
          </v-chip>
          <span v-if="item.refs.length === 0" class="text-disabled">—</span>
        </template>
        <template #item.committed="{ item }">
          <span :title="item.committedAbs" style="white-space: nowrap">
            {{ item.committedAbs }}
          </span>
          <v-chip v-if="item.current" size="x-small" color="success" variant="flat" class="ml-1">
            current
          </v-chip>
        </template>
        <template #item.operation="{ item }">
          <v-chip :color="getOperationColor(item.operation)" size="x-small" variant="flat">
            {{ item.operation }}
          </v-chip>
        </template>
        <template #item.records="{ item }">{{ fmtNum(item.totalRecords) }}</template>
        <template #item.delta="{ item }">
          <span v-if="Number(item.addedRecords) > 0" class="text-success">
            +{{ fmtNum(item.addedRecords) }}
          </span>
          <span v-if="Number(item.deletedRecords) > 0" class="text-error ml-1">
            −{{ fmtNum(item.deletedRecords) }}
          </span>
          <span v-if="!(Number(item.addedRecords) > 0) && !(Number(item.deletedRecords) > 0)">
            —
          </span>
        </template>
        <template #item.files="{ item }">{{ fmtNum(item.totalDataFiles) }}</template>
        <template #item.id="{ item }">
          <span class="font-mono">{{ item.id }}</span>
        </template>
        <template #item.actions>
          <v-icon size="small" class="text-medium-emphasis">mdi-open-in-new</v-icon>
        </template>
      </v-data-table>
    </section>

    <!-- Snapshot detail popup -->
    <v-dialog v-model="snapshotDialog" max-width="800" scrollable>
      <TableSnapshotDetails
        v-if="selectedSnapshot"
        :snapshot="selectedSnapshot"
        title="Snapshot detail">
        <template #append>
          <v-btn icon="mdi-close" variant="text" @click="snapshotDialog = false"></v-btn>
        </template>
      </TableSnapshotDetails>
    </v-dialog>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import TableSnapshotDetails from './TableSnapshotDetails.vue';
import TableColumnProfiler from './TableColumnProfiler.vue';
import type {
  LoadTableResult,
  PartitionField,
  SortField,
  Type,
  Schema,
} from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  table: LoadTableResult;
  warehouseId?: string;
  namespacePath?: string;
  tableName?: string;
  catalogUrl?: string;
  canEdit?: boolean;
}>();

// Emits
defineEmits<{
  updated: [];
}>();

// Governance tags: bind against the table UUID.
const tableId = computed(() => props.table.metadata?.['table-uuid'] || '');

// Composables
const functions = useFunctions();
const visual = useVisualStore();

// Methods
const truncatePath = (path: string, maxLen = 10): string => {
  if (!path || path.length <= maxLen + 3) return path;
  return path.slice(0, maxLen) + '…';
};

const copyToClipboard = (text: string) => {
  functions.copyToClipboard(text);
};

// Properties as data-table items
const propertyHeaders = [
  { title: 'Property', key: 'key', width: '300px' },
  { title: 'Value', key: 'value' },
];

// System/managed properties (e.g. Lakekeeper maintenance overrides) — hidden by
// default behind a toggle so user-set properties aren't buried.
const SYSTEM_PROP_PREFIXES = ['lakekeeper.'];
const isSystemProp = (key: string) => SYSTEM_PROP_PREFIXES.some((p) => key.startsWith(p));
const hideSystemProps = ref(true);

const allPropertyItems = computed(() => {
  const props_ = props.table.metadata.properties;
  if (!props_) return [];
  return Object.entries(props_).map(([key, value]) => ({ key, value, system: isSystemProp(key) }));
});
const systemPropCount = computed(() => allPropertyItems.value.filter((i) => i.system).length);
const propertyItems = computed(() =>
  hideSystemProps.value ? allPropertyItems.value.filter((i) => !i.system) : allPropertyItems.value,
);

const formatTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 7 * 86_400_000) {
    const mins = Math.round(abs / 60_000);
    const hours = Math.round(abs / 3_600_000);
    const days = Math.round(abs / 86_400_000);
    let label: string;
    if (abs < 60_000) label = 'just now';
    else if (mins < 60) label = `${mins} min`;
    else if (hours < 48) label = `${hours} h`;
    else label = `${days} d`;
    return diff > 0 ? `in ${label}` : `${label} ago`;
  }
  return date.toLocaleString();
};

const absoluteTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  return new Date(timestampMs).toLocaleString();
};

const refsSummary = computed(() => {
  const refs = (props.table.metadata as any)?.refs;
  if (!refs || typeof refs !== 'object') return '';
  const entries = Object.entries(refs) as [string, any][];
  if (entries.length === 0) return '';
  const branches = entries.filter(([, v]) => v?.type === 'branch').length;
  const tags = entries.filter(([, v]) => v?.type === 'tag').length;
  const parts: string[] = [];
  if (branches > 0) parts.push(`${branches} branch${branches === 1 ? '' : 'es'}`);
  if (tags > 0) parts.push(`${tags} tag${tags === 1 ? '' : 's'}`);
  return parts.join(' · ');
});

// Build a map of field-id → field-name across all schemas for resolving source-ids
const fieldNameMap = computed(() => {
  const map: Record<number, string> = {};
  if (props.table.metadata.schemas) {
    for (const schema of props.table.metadata.schemas) {
      if (schema.fields) {
        for (const field of schema.fields) {
          map[field.id] = field.name;
        }
      }
    }
  }
  return map;
});

const resolveFieldName = (sourceId: number): string => {
  return fieldNameMap.value[sourceId] || `field-${sourceId}`;
};

const formatPartitionField = (field: PartitionField): string => {
  const name = resolveFieldName(field['source-id']);
  if (field.transform === 'identity') return name;
  return `${field.transform}(${name})`;
};

const formatSortField = (field: SortField): string => {
  const name = resolveFieldName(field['source-id']);
  const transform = field.transform === 'identity' ? name : `${field.transform}(${name})`;
  return `${transform} ${field.direction} ${field['null-order']}`;
};

// Active partition spec
const activePartitionSpec = computed(() => {
  const specs = props.table.metadata['partition-specs'];
  const defaultId = props.table.metadata['default-spec-id'];
  if (!specs) return null;
  return specs.find((s) => s['spec-id'] === defaultId) || specs[0] || null;
});

// Active sort order
const activeSortOrder = computed(() => {
  const orders = props.table.metadata['sort-orders'];
  const defaultId = props.table.metadata['default-sort-order-id'];
  if (!orders) return null;
  return orders.find((o) => o['order-id'] === defaultId) || orders[0] || null;
});

// Schema evolution — collect all schemas and diff fields
const allSchemas = computed(() => {
  const schemas = props.table.metadata.schemas;
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
    title: `Schema ${s['schema-id']}${s['schema-id'] === props.table.metadata['current-schema-id'] ? ' (current)' : ''}`,
    value: s['schema-id'] ?? 0,
  })),
);
function openCompare() {
  const ids = allSchemas.value.map((s) => s['schema-id'] ?? 0);
  compareRight.value = props.table.metadata['current-schema-id'] ?? ids[ids.length - 1] ?? null;
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

// --- All snapshots, as a digestible table + detail popup --------------------
const snapshotDialog = ref(false);
const selectedSnapshot = ref<any>(null);
function openSnapshot(_event: unknown, row: { item: { raw: any } }) {
  selectedSnapshot.value = row.item.raw;
  snapshotDialog.value = true;
}
const snapshotHeaders = [
  { title: 'Committed', key: 'committed' },
  { title: 'Refs', key: 'refs', sortable: false },
  { title: 'Operation', key: 'operation' },
  { title: 'Records', key: 'records', align: 'end' as const },
  { title: 'Δ Records', key: 'delta', align: 'end' as const },
  { title: 'Data files', key: 'files', align: 'end' as const },
  { title: 'Snapshot ID', key: 'id' },
  { title: '', key: 'actions', align: 'end' as const, sortable: false },
];

// Branch/tag refs (name → { snapshot-id, type }).
const branchRefs = computed(() => {
  const refs = (props.table.metadata as any)?.refs as Record<string, any> | undefined;
  return refs && typeof refs === 'object' ? refs : {};
});
const branchOptions = computed(() => [
  { title: 'All snapshots', value: '__all__' },
  ...Object.keys(branchRefs.value).map((name) => ({
    title: `${name} · ${branchRefs.value[name]?.type ?? 'branch'}`,
    value: name,
  })),
]);
const selectedBranch = ref('__all__');
// Default to the `main` branch when the table has one (set once refs load).
let branchInitialized = false;
watch(
  branchRefs,
  (refs) => {
    if (branchInitialized || !refs || Object.keys(refs).length === 0) return;
    if (refs['main']) selectedBranch.value = 'main';
    branchInitialized = true;
  },
  { immediate: true },
);
// snapshot-id → ref names that point at it (tips)
const refTips = computed(() => {
  const map: Record<string, string[]> = {};
  for (const [name, r] of Object.entries(branchRefs.value)) {
    const sid = String((r as any)?.['snapshot-id']);
    (map[sid] ??= []).push(name);
  }
  return map;
});

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
// Format integer counters string-safely so i64 values above
// Number.MAX_SAFE_INTEGER are grouped without precision loss.
const fmtNum = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '0';
  const s = String(v);
  if (/^-?\d+$/.test(s)) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = Number(s);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};

const snapshotRows = computed(() => {
  const snaps = props.table.metadata.snapshots;
  if (!Array.isArray(snaps)) return [];
  const currentId = String(props.table.metadata['current-snapshot-id']);

  // When a branch/tag is selected, keep only its lineage (walk parent links from the tip).
  let allowed: Set<string> | null = null;
  if (selectedBranch.value !== '__all__') {
    const byId = new Map(snaps.map((s: any) => [String(s['snapshot-id']), s]));
    const tip = String(branchRefs.value[selectedBranch.value]?.['snapshot-id'] ?? '');
    allowed = new Set();
    let cur = tip;
    while (cur && byId.has(cur) && !allowed.has(cur)) {
      allowed.add(cur);
      cur = String(byId.get(cur)?.['parent-snapshot-id'] ?? '');
    }
  }

  return [...snaps]
    .filter((s: any) => !allowed || allowed.has(String(s['snapshot-id'])))
    .sort((a: any, b: any) => toNum(b['timestamp-ms']) - toNum(a['timestamp-ms']))
    .map((s: any) => {
      const summary = s.summary ?? {};
      const id = String(s['snapshot-id']);
      return {
        id,
        raw: s,
        refs: refTips.value[id] ?? [],
        committedAbs: s['timestamp-ms'] ? absoluteTimestamp(s['timestamp-ms']) : '—',
        operation: summary.operation ?? '—',
        current: id === currentId,
        totalRecords: summary['total-records'],
        addedRecords: summary['added-records'],
        deletedRecords: summary['deleted-records'],
        totalDataFiles: summary['total-data-files'],
      };
    });
});

const getOperationColor = (operation: string): string => {
  const colors: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };
  return colors[operation?.toLowerCase()] || 'default';
};

// Schema evolution panel starts collapsed.
const schemaPanels = ref<string[]>([]);

// Deletion protection lives behind its own endpoint, so it is loaded here
// rather than read off the table metadata.
const protectionState = ref<boolean | null>(null);
const protectionUpdatedAt = ref('');

// The host reloads with `Object.assign(table, …)`, so the table object's own
// identity never changes — `metadata` is what is replaced, and watching it is
// what makes a reload (or a protection toggle from the actions menu) re-read.
watch(
  () => [props.warehouseId, props.table.metadata] as const,
  async () => {
    const tableUuid = (props.table.metadata as any)?.['table-uuid'];
    if (!props.warehouseId || !tableUuid) {
      protectionState.value = null;
      return;
    }
    try {
      const prot = await functions.getTableProtection(props.warehouseId, tableUuid);
      protectionState.value = prot.protected;
      protectionUpdatedAt.value = prot.updated_at
        ? formatTimestamp(Date.parse(prot.updated_at))
        : '';
    } catch {
      // A reader without `get_protection` still gets every other tile; the
      // dash says "not known here", which is the truth.
      protectionState.value = null;
      protectionUpdatedAt.value = '';
    }
  },
  { immediate: true },
);

// Identity & location key/value rows
const identityRows = computed(() => {
  const m = props.table.metadata as any;
  const rows: Array<{
    label: string;
    value: string | number;
    full?: string;
    mono?: boolean;
    copy?: boolean;
    tip?: boolean;
    icon?: string;
    iconColor?: string;
    title?: string;
  }> = [];
  rows.push({
    label: 'Format',
    value: m['format-version'] ? `Iceberg v${m['format-version']}` : 'Iceberg',
    icon: 'mdi-tag-outline',
    iconColor: 'primary',
  });
  rows.push({ label: 'Table UUID', value: m['table-uuid'], mono: true, copy: true });
  if (m.location)
    rows.push({
      label: 'Data location',
      value: truncatePath(m.location, 48),
      full: m.location,
      mono: true,
      copy: true,
      tip: true,
    });
  if (props.table['metadata-location'])
    rows.push({
      label: 'Metadata location',
      value: truncatePath(props.table['metadata-location'], 48),
      full: props.table['metadata-location'],
      mono: true,
      copy: true,
      tip: true,
    });
  if (m['last-updated-ms'])
    rows.push({
      label: 'Last updated',
      value: absoluteTimestamp(m['last-updated-ms']),
    });
  if (m['current-snapshot-id'])
    rows.push({
      label: 'Current snapshot ID',
      value: String(m['current-snapshot-id']),
      mono: true,
      copy: true,
    });
  if (refsSummary.value) rows.push({ label: 'Refs', value: refsSummary.value });

  // Deletion protection is a property of the table, not of the menu that
  // toggles it, so it is read with the rest of what the table is.
  rows.push({
    label: 'Protection',
    value: protectionState.value === null ? '—' : protectionState.value ? 'On' : 'Off',
    icon: protectionState.value ? 'mdi-lock-outline' : 'mdi-lock-open-variant-outline',
    iconColor: protectionState.value ? 'info' : undefined,
    title:
      protectionState.value === null
        ? 'Deletion protection'
        : protectionState.value
          ? `Deletion protection is on${protectionUpdatedAt.value ? ` · set ${protectionUpdatedAt.value}` : ''} — drop and expiration are refused until it is turned off`
          : 'Deletion protection is off — this table can be dropped',
  });

  return rows;
});

// The internal identifiers. Each is a single small number that means nothing
// on its own, so they share one line rather than taking a labelled row each —
// nine rows of "Last partition ID 999" is most of what made this block long.
const identityCounters = computed(() => {
  const m = props.table.metadata as any;
  const out: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    if (value !== undefined && value !== null) out.push({ label, value: String(value) });
  };
  push('schema', m['current-schema-id']);
  push('seq', m['last-sequence-number']);
  push('last col', m['last-column-id']);
  push('last part', m['last-partition-id']);
  push('spec', m['default-spec-id']);
  push('sort', m['default-sort-order-id']);
  push('next row', m['next-row-id']);
  const statsFiles = (m.statistics ?? []).length;
  if (statsFiles > 0) push('stats files', statsFiles);
  const partStatsFiles = (m['partition-statistics'] ?? []).length;
  if (partStatsFiles > 0) push('part stats files', partStatsFiles);
  return out;
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

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}

/* A section is an icon, a name and a hairline — the outlined card and its
   filled title band cost ~56px of chrome per section and said nothing the
   heading did not. */
.tdx-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-height: 32px;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
/* The heading's own words are uppercase; the controls sharing its line are not
   headings and keep their own casing. */
.tdx-head :deep(.v-btn),
.tdx-head :deep(.v-chip),
.tdx-head :deep(.v-label),
.tdx-head :deep(.v-field) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
.tdx-head__switch {
  flex: 0 0 auto;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}

.tdx-section {
  margin-bottom: 0;
  min-width: 0;
}

/* Label/value pairs as a grid: the label column is as wide as its widest
   label and no wider, which is what a two-column table could not do. A hairline
   per row keeps a long value tied to its own label across the gap. */
.tdx-kv {
  display: grid;
  grid-template-columns: minmax(110px, max-content) minmax(0, 1fr);
  column-gap: 20px;
  margin: 0;
}
.tdx-kv dt,
.tdx-kv dd {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 4px 0;
  font-size: 0.8125rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.tdx-kv dt {
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}
.tdx-kv dd {
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
/* The last pair closes the block; a rule under it would read as the start of
   something that is not there. */
.tdx-kv > dt:nth-last-of-type(1),
.tdx-kv > dd:nth-last-of-type(1) {
  border-bottom: none;
}
/* The copy button appears on the row it copies, so twelve of them do not sit
   in a column of their own down the page. */
.tdx-kv__copy {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tdx-kv dd:hover .tdx-kv__copy,
.tdx-kv__copy:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .tdx-kv__copy {
    opacity: 1;
  }
}

.tdx-counters {
  gap: 4px 14px;
}
.tdx-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}
.tdx-counter > .font-mono {
  font-size: 0.8125rem;
}
/* Ten rows and then the table scrolls, header pinned: a page size of 25 or 50
   otherwise pushes the rest of the page — and the pager, the only control that
   matters there — below the fold. `max-height` on the wrapper rather than the
   `height` prop, so a table of three rows is three rows tall. */
.snapshot-table :deep(.v-table__wrapper) {
  max-height: calc(10 * 36px + 40px);
}
</style>
