<template>
  <v-card-text>
    <!-- At a glance -->
    <v-row dense class="mb-2">
      <v-col v-for="s in statTiles" :key="s.label" cols="6" sm="4" md="2">
        <v-sheet rounded="lg" border class="pa-3 stat-tile h-100">
          <v-icon :color="s.color" size="20" class="mb-1">{{ s.icon }}</v-icon>
          <div class="stat-value" :title="String(s.value)">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </v-sheet>
      </v-col>
    </v-row>

    <!-- Identity & location -->
    <div class="section-head">
      <v-icon size="18" class="mr-2" color="primary">mdi-information-outline</v-icon>
      Identity &amp; location
    </div>
    <v-sheet rounded="lg" border class="mb-6">
      <v-table density="compact" class="identity-table">
        <tbody>
          <tr v-for="row in identityRows" :key="row.label">
            <td class="identity-key">{{ row.label }}</td>
            <td class="identity-val">
              <div class="d-flex align-center">
                <v-tooltip v-if="row.tip" location="bottom" :text="row.full">
                  <template #activator="{ props: tp }">
                    <span v-bind="tp" class="font-mono text-truncate" style="cursor: help">
                      {{ row.value }}
                    </span>
                  </template>
                </v-tooltip>
                <span v-else :class="{ 'font-mono': row.mono }">{{ row.value }}</span>
                <v-btn
                  v-if="row.copy"
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="ml-1"
                  @click="copyToClipboard(row.full ?? String(row.value))"></v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-sheet>

    <!-- Properties -->
    <v-expansion-panels v-if="allPropertyItems.length > 0 || canEdit" class="mb-6">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-cog-outline</v-icon>
          Properties
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
    </v-expansion-panels>

    <!-- Schema (fields + on-demand profiling) -->
    <TableColumnProfiler
      :metadata="table.metadata"
      :warehouse-id="warehouseId"
      :namespace-id="namespacePath"
      :table-name="tableName"
      :catalog-url="catalogUrl" />

    <!-- Schema evolution -->
    <v-expansion-panels v-model="schemaPanels" multiple class="mb-6">
      <!-- Schema evolution -->
      <v-expansion-panel v-if="allSchemas.length > 1" value="evolution">
        <v-expansion-panel-title>
          <v-icon class="mr-2" size="small">mdi-history</v-icon>
          Schema evolution
          <v-chip size="x-small" color="primary" variant="tonal" class="ml-2">
            {{ allSchemas.length }} versions
          </v-chip>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th style="width: 100px">Schema ID</th>
                <th style="width: 80px">Fields</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="schema in allSchemas"
                :key="schema['schema-id']"
                :class="{
                  'font-weight-medium': schema['schema-id'] === table.metadata['current-schema-id'],
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
                      class="text-grey">
                      {{ schema['schema-id'] === 0 ? 'Initial schema' : 'No field changes' }}
                    </span>
                  </template>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Layout & ordering -->
    <v-row class="mb-3">
      <v-col cols="12" md="6">
        <div class="section-head">
          <v-icon size="18" class="mr-2" color="warning">mdi-view-grid-outline</v-icon>
          Partitioning
          <v-chip v-if="activePartitionSpec" size="x-small" variant="tonal" class="ml-2">
            spec {{ activePartitionSpec['spec-id'] }}
          </v-chip>
        </div>
        <v-sheet rounded="lg" border class="pa-3 fill-height">
          <template v-if="activePartitionSpec && activePartitionSpec.fields.length">
            <v-chip
              v-for="field in activePartitionSpec.fields"
              :key="field.name"
              size="small"
              color="primary"
              variant="tonal"
              class="mr-1 mb-1">
              {{ formatPartitionField(field) }}
            </v-chip>
          </template>
          <v-chip v-else size="small" color="grey" variant="tonal">Unpartitioned</v-chip>
        </v-sheet>
      </v-col>

      <v-col cols="12" md="6">
        <div class="section-head">
          <v-icon size="18" class="mr-2" color="success">mdi-sort-ascending</v-icon>
          Sort order
          <v-chip v-if="activeSortOrder" size="x-small" variant="tonal" class="ml-2">
            order {{ activeSortOrder['order-id'] }}
          </v-chip>
        </div>
        <v-sheet rounded="lg" border class="pa-3 fill-height">
          <template v-if="activeSortOrder && activeSortOrder.fields.length">
            <v-chip
              v-for="(field, idx) in activeSortOrder.fields"
              :key="idx"
              size="small"
              color="info"
              variant="tonal"
              class="mr-1 mb-1">
              {{ formatSortField(field) }}
            </v-chip>
          </template>
          <v-chip v-else size="small" color="grey" variant="tonal">Unsorted</v-chip>
        </v-sheet>
      </v-col>
    </v-row>

    <!-- Snapshots -->
    <template v-if="snapshotRows.length">
      <div class="section-head mt-4">
        <v-icon size="18" class="mr-2" color="info">mdi-camera-outline</v-icon>
        Snapshots
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ snapshotRows.length }}</v-chip>
      </div>
      <v-sheet rounded="lg" border class="mb-2">
        <v-data-table
          :headers="snapshotHeaders"
          :items="snapshotRows"
          :items-per-page="10"
          density="compact"
          item-value="id"
          hover
          class="snapshot-table"
          @click:row="openSnapshot">
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
      </v-sheet>
    </template>

    <!-- Snapshot detail popup -->
    <v-dialog v-model="snapshotDialog" max-width="900" scrollable>
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
import { computed, ref } from 'vue';
import { useFunctions } from '../plugins/functions';
import TableSnapshotDetails from './TableSnapshotDetails.vue';
import TableColumnProfiler from './TableColumnProfiler.vue';
import type { LoadTableResult, PartitionField, SortField } from '../gen/iceberg/types.gen';

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

// Composables
const functions = useFunctions();

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

const snapshotsCount = computed(() => props.table.metadata.snapshots?.length ?? 0);

const getCurrentSchema = () => {
  if (!props.table.metadata.schemas || props.table.metadata.schemas.length === 0) return null;
  return props.table.metadata.schemas.find(
    (schema) => schema['schema-id'] === props.table.metadata['current-schema-id'],
  );
};

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

// Computed properties
const currentSchemaInfo = computed(() => getCurrentSchema());

// --- All snapshots, as a digestible table + detail popup --------------------
const snapshotDialog = ref(false);
const selectedSnapshot = ref<any>(null);
function openSnapshot(_event: unknown, row: { item: { raw: any } }) {
  selectedSnapshot.value = row.item.raw;
  snapshotDialog.value = true;
}
const snapshotHeaders = [
  { title: 'Committed', key: 'committed' },
  { title: 'Operation', key: 'operation' },
  { title: 'Records', key: 'records', align: 'end' as const },
  { title: 'Δ Records', key: 'delta', align: 'end' as const },
  { title: 'Data files', key: 'files', align: 'end' as const },
  { title: 'Snapshot ID', key: 'id' },
  { title: '', key: 'actions', align: 'end' as const, sortable: false },
];

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
  return [...snaps]
    .sort((a: any, b: any) => toNum(b['timestamp-ms']) - toNum(a['timestamp-ms']))
    .map((s: any) => {
      const summary = s.summary ?? {};
      return {
        id: String(s['snapshot-id']),
        raw: s,
        committedAbs: s['timestamp-ms'] ? absoluteTimestamp(s['timestamp-ms']) : '—',
        operation: summary.operation ?? '—',
        current: String(s['snapshot-id']) === currentId,
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
  return colors[operation?.toLowerCase()] || 'grey';
};

// Schema evolution panel starts collapsed.
const schemaPanels = ref<string[]>([]);

// At-a-glance metric tiles
const statTiles = computed(() => {
  const m = props.table.metadata as any;
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
      label: 'Snapshots',
      value: snapshotsCount.value,
      icon: 'mdi-camera-outline',
      color: 'info',
    },
    {
      label: 'Partitions',
      value: activePartitionSpec.value?.fields?.length || 0,
      icon: 'mdi-view-grid-outline',
      color: 'warning',
    },
    {
      label: 'Sort keys',
      value: activeSortOrder.value?.fields?.length || 0,
      icon: 'mdi-sort-ascending',
      color: 'success',
    },
    {
      label: 'Updated',
      value: m['last-updated-ms'] ? formatTimestamp(m['last-updated-ms']) : '—',
      icon: 'mdi-update',
      color: 'grey',
    },
  ];
});

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
  }> = [];
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
  if (m['current-schema-id'] !== undefined)
    rows.push({ label: 'Current schema ID', value: m['current-schema-id'] });
  if (m['current-snapshot-id'])
    rows.push({
      label: 'Current snapshot ID',
      value: String(m['current-snapshot-id']),
      mono: true,
      copy: true,
    });
  if (refsSummary.value) rows.push({ label: 'Refs', value: refsSummary.value });

  // Internal identifiers
  const pushIf = (label: string, value: unknown) => {
    if (value !== undefined && value !== null) rows.push({ label, value: String(value) });
  };
  pushIf('Last sequence number', m['last-sequence-number']);
  pushIf('Last column ID', m['last-column-id']);
  pushIf('Last partition ID', m['last-partition-id']);
  pushIf('Default partition spec ID', m['default-spec-id']);
  pushIf('Default sort order ID', m['default-sort-order-id']);
  pushIf('Next row ID', m['next-row-id']);
  const statsFiles = (m.statistics ?? []).length;
  if (statsFiles > 0) pushIf('Statistics files', statsFiles);
  const partStatsFiles = (m['partition-statistics'] ?? []).length;
  if (partStatsFiles > 0) pushIf('Partition statistics files', partStatsFiles);

  return rows;
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

.section-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 8px;
  min-height: 32px;
}

.stat-tile {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.identity-table .identity-key {
  width: 220px;
  white-space: nowrap;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.identity-table .identity-val {
  word-break: break-all;
}
</style>
