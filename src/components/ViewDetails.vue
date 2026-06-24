<template>
  <v-card-text>
    <!-- At a glance -->
    <v-row dense class="mb-2">
      <v-col v-for="s in statTiles" :key="s.label" cols="6" sm="4" md="2">
        <v-sheet
          rounded="lg"
          border
          class="pa-3 h-100"
          style="display: flex; flex-direction: column">
          <v-icon :color="s.color" size="20" class="mb-1">{{ s.icon }}</v-icon>
          <div
            :title="String(s.value)"
            style="
              font-size: 0.9rem;
              line-height: 1.3;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">
            {{ s.value }}
          </div>
          <div style="font-size: 0.78rem; opacity: 0.6">{{ s.label }}</div>
        </v-sheet>
      </v-col>
    </v-row>

    <!-- Identity & location -->
    <div
      class="d-flex align-center mb-2"
      style="font-size: 0.95rem; opacity: 0.8; min-height: 32px">
      <v-icon size="18" class="mr-2" color="primary">mdi-information-outline</v-icon>
      Identity &amp; location
    </div>
    <v-sheet rounded="lg" border class="mb-6">
      <v-table density="compact">
        <tbody>
          <tr v-for="row in identityRows" :key="row.label">
            <td style="width: 200px; white-space: nowrap; font-weight: 600; opacity: 0.7">
              {{ row.label }}
            </td>
            <td style="word-break: break-all">
              <div class="d-flex align-center">
                <v-tooltip v-if="row.tip" location="bottom" :text="row.value">
                  <template #activator="{ props: tp }">
                    <span
                      v-bind="tp"
                      class="font-mono text-truncate"
                      style="cursor: help; max-width: 560px">
                      {{ row.value }}
                    </span>
                  </template>
                </v-tooltip>
                <span v-else class="font-mono">{{ row.value }}</span>
                <v-btn
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="ml-1"
                  @click="copyToClipboard(row.value)"></v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-sheet>

    <!-- Collapsible details: View definition (SQL) + schema fields -->
    <v-expansion-panels class="mb-4" multiple>
      <!-- View Definition (SQL) -->
      <v-expansion-panel v-if="sqlVersionOptions.length > 0">
        <v-expansion-panel-title>
          <div class="d-flex align-center" style="width: 100%">
            <v-icon class="mr-2" color="primary">mdi-database-search-outline</v-icon>
            View Definition
            <v-chip v-if="sqlDialect" size="x-small" variant="outlined" class="ml-2">
              {{ sqlDialect }}
            </v-chip>
            <v-spacer></v-spacer>
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-content-copy"
              class="mr-2"
              @click.stop="copyToClipboard(formattedSql)">
              Copy
            </v-btn>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex align-center mb-2" style="gap: 12px">
            <v-select
              v-model="selectedVersionId"
              :items="sqlVersionOptions"
              label="Version"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 280px"></v-select>
          </div>
          <SqlEditor :model-value="formattedSql" disabled min-height="40vh" />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Current Version -->
      <v-expansion-panel v-if="currentViewVersion">
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small" color="warning">mdi-eye-outline</v-icon>
          Current Version
          <v-chip size="x-small" variant="tonal" class="ml-2">
            v{{ currentViewVersion['version-id'] }}
          </v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact">
            <tbody>
              <tr v-if="currentViewVersion['timestamp-ms']">
                <td class="font-weight-medium" style="width: 160px">Created</td>
                <td>{{ formatTimestamp(currentViewVersion['timestamp-ms']) }}</td>
              </tr>
              <tr>
                <td class="font-weight-medium">Schema ID</td>
                <td>{{ currentViewVersion['schema-id'] }}</td>
              </tr>
              <tr v-if="currentViewVersion['default-catalog']">
                <td class="font-weight-medium">Default Catalog</td>
                <td class="font-mono">{{ currentViewVersion['default-catalog'] }}</td>
              </tr>
              <tr
                v-if="
                  currentViewVersion['default-namespace'] &&
                  currentViewVersion['default-namespace'].length > 0
                ">
                <td class="font-weight-medium">Default Namespace</td>
                <td class="font-mono">{{ currentViewVersion['default-namespace'].join('.') }}</td>
              </tr>
            </tbody>
          </v-table>
          <div v-if="currentViewVersion.summary" class="mt-2">
            <v-chip
              v-for="(value, key) in currentViewVersion.summary"
              :key="key"
              size="small"
              variant="outlined"
              class="mr-1 mb-1">
              {{ key }}: {{ value }}
            </v-chip>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- View Properties -->
      <v-expansion-panel v-if="allPropertyItems.length > 0">
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-cog-outline</v-icon>
          View Properties
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyItems.length }}</v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-if="systemPropCount > 0" class="d-flex align-center mb-2">
            <v-switch
              v-model="hideSystemProps"
              color="primary"
              density="compact"
              hide-details
              :label="`Hide system properties (${systemPropCount})`"></v-switch>
          </div>
          <v-data-table-virtual
            v-if="propertyItems.length"
            :headers="propertyHeaders"
            :items="propertyItems"
            density="compact"
            fixed-header
            height="220px"
            item-value="key"
            hide-default-footer
            :items-per-page="-1">
            <template #item.value="{ item }">
              <span class="font-mono text-wrap">{{ item.value }}</span>
            </template>
          </v-data-table-virtual>
          <div v-else class="text-medium-emphasis pa-3">No properties set</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Schema Fields -->
      <v-expansion-panel v-if="currentSchemaInfo?.fields && currentSchemaInfo.fields.length > 0">
        <v-expansion-panel-title>
          <div class="d-flex align-center">
            <v-icon class="mr-2">mdi-file-tree</v-icon>
            Schema Fields
            <v-chip size="x-small" variant="outlined" class="ml-2">
              {{ currentSchemaInfo.fields.length }} fields
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-treeview :items="schemaFieldsTransformed" open-on-click>
            <template #prepend="{ item }">
              <v-icon v-if="item.datatype == 'string'" size="small">mdi-alphabetical</v-icon>
              <v-icon v-else-if="item.datatype == 'int'" size="small">mdi-numeric</v-icon>
              <v-icon v-else-if="item.datatype == 'long' || item.datatype == 'double'" size="small">
                mdi-decimal
              </v-icon>
              <v-icon v-else-if="item.datatype == 'array'" size="small">
                mdi-format-list-group
              </v-icon>
              <v-icon v-else size="small">mdi-pound-box-outline</v-icon>
            </template>
            <template #append="{ item }">
              <span>
                <span v-if="item.required" style="font-size: 0.575rem">required</span>
                <v-icon v-if="item.required" color="error" size="x-small">mdi-asterisk</v-icon>
              </span>
            </template>
          </v-treeview>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Schema evolution (multiple schema versions) -->
      <v-expansion-panel v-if="allSchemas.length > 1">
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
              variant="tonal"
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
                :class="{ 'font-weight-medium': schema['schema-id'] === currentSchemaId }">
                <td>
                  {{ schema['schema-id'] }}
                  <v-chip
                    v-if="schema['schema-id'] === currentSchemaId"
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
                      class="text-grey">
                      {{ schema['schema-id'] === 0 ? 'Initial schema' : 'No field changes' }}
                    </span>
                  </template>
                </td>
                <td>
                  <v-btn icon size="x-small" variant="text" @click="openSchema(schema)">
                    <v-icon size="small">mdi-eye-outline</v-icon>
                    <v-tooltip activator="parent" location="top">View schema</v-tooltip>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- View a single schema's fields -->
    <v-dialog v-model="schemaViewOpen" max-width="640" scrollable>
      <v-card v-if="schemaViewData">
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-file-tree</v-icon>
          Schema {{ schemaViewData['schema-id'] }}
          <v-chip size="x-small" variant="tonal" class="ml-2">
            {{ schemaViewData.fields?.length || 0 }} fields
          </v-chip>
          <v-spacer></v-spacer>
          <v-btn icon variant="text" size="small" @click="schemaViewOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <v-table density="compact">
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
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Compare two schemas -->
    <v-dialog v-model="compareOpen" max-width="760" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-compare-horizontal</v-icon>
          Compare schemas
          <v-spacer></v-spacer>
          <v-btn icon variant="text" size="small" @click="compareOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
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
              style="max-width: 200px"></v-select>
            <v-icon>mdi-arrow-right</v-icon>
            <v-select
              v-model="compareRight"
              :items="schemaIdItems"
              label="Compare"
              density="compact"
              variant="outlined"
              hide-details
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
                  <v-chip size="x-small" variant="flat" :color="row.color">{{ row.status }}</v-chip>
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
  </v-card-text>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { format as formatSQL } from 'sql-formatter';
import { useFunctions } from '../plugins/functions';
import SqlEditor from './SqlEditor.vue';
import { transformFields } from '../common/schemaUtils';
import type { LoadViewResult } from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  view: LoadViewResult;
  warehouseId?: string;
  namespacePath?: string;
  viewName?: string;
  canEdit?: boolean;
  protectedState?: boolean | null;
}>();

// Emits
defineEmits<{
  updated: [];
}>();

// Composables
const functions = useFunctions();

// Methods
const copyToClipboard = (text: string) => {
  functions.copyToClipboard(text);
};

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

// Properties as data-table items
const propertyHeaders = [
  { title: 'Property', key: 'key', width: '300px' },
  { title: 'Value', key: 'value' },
];

const SYSTEM_PROP_PREFIXES = ['lakekeeper.'];
const isSystemProp = (key: string) => SYSTEM_PROP_PREFIXES.some((p) => key.startsWith(p));
const hideSystemProps = ref(true);

const allPropertyItems = computed(() => {
  const p = props.view.metadata.properties;
  if (!p) return [];
  return Object.entries(p).map(([key, value]) => ({ key, value, system: isSystemProp(key) }));
});
const systemPropCount = computed(() => allPropertyItems.value.filter((i) => i.system).length);
const propertyItems = computed(() =>
  hideSystemProps.value ? allPropertyItems.value.filter((i) => !i.system) : allPropertyItems.value,
);

const getCurrentViewVersion = () => {
  if (!props.view.metadata.versions || props.view.metadata.versions.length === 0) return null;
  return props.view.metadata.versions.find(
    (version: any) => version['version-id'] === props.view.metadata['current-version-id'],
  );
};

const getCurrentViewSchema = () => {
  if (!props.view.metadata.schemas || props.view.metadata.schemas.length === 0) return null;
  const currentVersion = getCurrentViewVersion();
  if (!currentVersion) return null;
  return props.view.metadata.schemas.find(
    (schema: any) => schema['schema-id'] === currentVersion['schema-id'],
  );
};

// Computed properties
const currentViewVersion = computed(() => getCurrentViewVersion());
const currentSchemaInfo = computed(() => getCurrentViewSchema());

// "At a glance" tiles (mirrors TableDetails).
const statTiles = computed(() => {
  const m = props.view.metadata as any;
  return [
    {
      label: 'Format',
      value: m['format-version'] ? `Iceberg v${m['format-version']}` : 'Iceberg',
      icon: 'mdi-tag-outline',
      color: 'primary',
    },
    {
      label: 'Columns',
      value: currentSchemaInfo.value?.fields?.length ?? 0,
      icon: 'mdi-table-column',
      color: 'primary',
    },
    {
      label: 'Versions',
      value: m.versions?.length || 0,
      icon: 'mdi-history',
      color: 'info',
    },
    {
      label: 'Schemas',
      value: m.schemas?.length || 0,
      icon: 'mdi-file-tree',
      color: 'warning',
    },
    {
      label: 'Updated',
      value: currentViewVersion.value?.['timestamp-ms']
        ? formatTimestamp(currentViewVersion.value['timestamp-ms'])
        : '—',
      icon: 'mdi-update',
      color: 'grey',
    },
    {
      label: 'Protection',
      value: props.protectedState == null ? '—' : props.protectedState ? 'On' : 'Off',
      icon: props.protectedState ? 'mdi-lock' : 'mdi-lock-open-variant-outline',
      color: props.protectedState ? 'success' : 'grey',
    },
  ];
});
const identityRows = computed(() =>
  [
    { label: 'View UUID', value: props.view.metadata['view-uuid'], tip: false },
    { label: 'Data location', value: props.view.metadata.location, tip: true },
    { label: 'Metadata location', value: props.view['metadata-location'], tip: true },
  ].filter((r) => !!r.value),
);

// --- Schema evolution: multiple schema versions, diffs, view + compare --------
// Views key the "current" schema off the current version's schema-id (there is
// no top-level current-schema-id like tables have).
const currentSchemaId = computed<number | null>(
  () => (currentViewVersion.value as any)?.['schema-id'] ?? null,
);

const allSchemas = computed(() => {
  const schemas = props.view.metadata.schemas;
  if (!schemas) return [];
  return [...schemas].sort((a: any, b: any) => (a['schema-id'] ?? 0) - (b['schema-id'] ?? 0));
});

// Human label for a field type (primitive string, or struct/list/map).
function typeLabel(t: any): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return t.type || 'complex';
  return String(t ?? '');
}

// View a single schema's fields.
const schemaViewOpen = ref(false);
const schemaViewData = ref<any>(null);
function openSchema(schema: any) {
  schemaViewData.value = schema;
  schemaViewOpen.value = true;
}

// Compare two schema versions.
const compareOpen = ref(false);
const compareLeft = ref<number | null>(null);
const compareRight = ref<number | null>(null);
const schemaIdItems = computed(() =>
  allSchemas.value.map((s: any) => ({
    title: `Schema ${s['schema-id']}${s['schema-id'] === currentSchemaId.value ? ' (current)' : ''}`,
    value: s['schema-id'] ?? 0,
  })),
);
function openCompare() {
  const ids = allSchemas.value.map((s: any) => s['schema-id'] ?? 0);
  compareRight.value = currentSchemaId.value ?? ids[ids.length - 1] ?? null;
  compareLeft.value = ids.filter((id) => id !== compareRight.value).pop() ?? ids[0] ?? null;
  compareOpen.value = true;
}
const schemaCompareRows = computed(() => {
  if (compareLeft.value === null || compareRight.value === null) return [];
  const byId = (id: number | null) => allSchemas.value.find((s: any) => s['schema-id'] === id);
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
    const schema = schemas[i] as any;
    const id = schema['schema-id'] ?? i;
    if (i === 0) {
      diffs[id] = { added: [], removed: [] };
      continue;
    }
    const prevFields = new Set(
      ((schemas[i - 1] as any).fields || []).map(
        (f: any) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`,
      ),
    );
    const currFields = new Set(
      (schema.fields || []).map(
        (f: any) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`,
      ),
    );
    const added: string[] = [];
    const removed: string[] = [];
    for (const f of currFields) {
      if (!prevFields.has(f)) added.push((f as string).split(':')[0]);
    }
    for (const f of prevFields) {
      if (!currFields.has(f)) removed.push((f as string).split(':')[0]);
    }
    diffs[id] = { added, removed };
  }
  return diffs;
});

// View SQL definition — selectable per version (defaults to the current version).
const selectedVersionId = ref<number | null>(null);
const sqlVersionOptions = computed(() => {
  const versions = props.view.metadata.versions ?? [];
  const currentId = props.view.metadata['current-version-id'];
  return [...versions]
    .filter((v: any) => v.representations?.some((r: any) => r.sql))
    .sort((a: any, b: any) => (b['version-id'] ?? 0) - (a['version-id'] ?? 0))
    .map((v: any) => ({
      title:
        `v${v['version-id']}` +
        (v['version-id'] === currentId ? ' (current)' : '') +
        (v['timestamp-ms'] ? ` · ${formatTimestamp(v['timestamp-ms'])}` : ''),
      value: v['version-id'],
    }));
});
const selectedVersion = computed(() => {
  const versions = props.view.metadata.versions ?? [];
  return (
    versions.find((v: any) => v['version-id'] === selectedVersionId.value) ??
    currentViewVersion.value
  );
});
// Default (and re-default) the picker to the current version when the view loads/changes.
watch(
  () => props.view.metadata['current-version-id'],
  (id) => {
    selectedVersionId.value = id ?? null;
  },
  { immediate: true },
);

const rawSql = computed<string>(() => selectedVersion.value?.representations?.[0]?.sql ?? '');
const sqlDialect = computed<string>(
  () => selectedVersion.value?.representations?.[0]?.dialect ?? '',
);
const SQL_FORMATTER_LANGUAGES = new Set([
  'sql',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'bigquery',
  'db2',
  'hive',
  'spark',
  'trino',
  'redshift',
  'snowflake',
  'tsql',
  'plsql',
  'singlestoredb',
  'n1ql',
]);
const formattedSql = computed<string>(() => {
  const raw = rawSql.value;
  if (!raw) return '';
  const lang = sqlDialect.value.toLowerCase();
  try {
    return formatSQL(raw, {
      language: (SQL_FORMATTER_LANGUAGES.has(lang) ? lang : 'sql') as any,
      keywordCase: 'upper',
    });
  } catch {
    // Unparseable SQL — show it verbatim rather than dropping the card.
    return raw;
  }
});

const schemaFieldsTransformed = computed(() => {
  if (!currentSchemaInfo.value?.fields) return [];
  return transformFields(currentSchemaInfo.value.fields);
});
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
