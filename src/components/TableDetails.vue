<template>
  <v-card-text>
    <v-row>
      <v-col cols>
        <!-- Table Information -->
        <v-card variant="outlined" elevation="1" class="mb-4">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="primary">mdi-information-outline</v-icon>
              Table Information
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip
              v-if="table.metadata['format-version']"
              size="small"
              color="primary"
              variant="outlined"
              class="mr-2">
              v{{ table.metadata['format-version'] }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact" fixed-header height="288px">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 200px">Table UUID</td>
                <td>
                  <span class="font-mono">{{ table.metadata['table-uuid'] }}</span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(table.metadata['table-uuid'])"></v-btn>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Format Version</td>
                <td>{{ table.metadata['format-version'] }}</td>
              </tr>
              <tr v-if="table.metadata.location">
                <td class="font-weight-medium">Data Location</td>
                <td>
                  <v-tooltip location="bottom" :text="table.metadata.location">
                    <template #activator="{ props: tipProps }">
                      <span v-bind="tipProps" class="font-mono text-wrap" style="cursor: help">
                        {{ truncatePath(table.metadata.location) }}
                      </span>
                    </template>
                  </v-tooltip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(table.metadata.location)"></v-btn>
                </td>
              </tr>
              <tr v-if="table['metadata-location']">
                <td class="font-weight-medium">Metadata Location</td>
                <td>
                  <v-tooltip location="bottom" :text="table['metadata-location']">
                    <template #activator="{ props: tipProps }">
                      <span v-bind="tipProps" class="font-mono text-wrap" style="cursor: help">
                        {{ truncatePath(table['metadata-location']) }}
                      </span>
                    </template>
                  </v-tooltip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(table['metadata-location'])"></v-btn>
                </td>
              </tr>
              <tr v-if="table.metadata['last-updated-ms']">
                <td class="font-weight-medium">Last Updated</td>
                <td>{{ formatTimestamp(table.metadata['last-updated-ms']) }}</td>
              </tr>
              <tr v-if="table.metadata['current-schema-id'] !== undefined">
                <td class="font-weight-medium">Current Schema ID</td>
                <td>{{ table.metadata['current-schema-id'] }}</td>
              </tr>
              <tr v-if="table.metadata['current-snapshot-id']">
                <td class="font-weight-medium">Current Snapshot ID</td>
                <td>
                  <span class="font-mono">{{ table.metadata['current-snapshot-id'] }}</span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(String(table.metadata['current-snapshot-id']))"></v-btn>
                </td>
              </tr>
              <tr v-if="table.metadata['last-sequence-number'] !== undefined">
                <td class="font-weight-medium">Last Sequence Number</td>
                <td>{{ table.metadata['last-sequence-number'] }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols>
        <!-- Properties Section -->
        <v-card
          v-if="table.metadata.properties && Object.keys(table.metadata.properties).length > 0"
          variant="outlined"
          elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2">mdi-cog-outline</v-icon>
              Table Properties
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" variant="outlined" class="mr-2">
              {{ Object.keys(table.metadata.properties).length }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-data-table-virtual
            :headers="propertyHeaders"
            :items="propertyItems"
            density="compact"
            fixed-header
            height="288px"
            item-value="key"
            hide-default-footer
            :items-per-page="-1">
            <template #item.value="{ item }">
              <span class="font-mono text-wrap">{{ item.value }}</span>
            </template>
          </v-data-table-virtual>
        </v-card>
      </v-col>
    </v-row>

    <!-- Stats & Structure row -->
    <v-row class="mb-4">
      <!-- Counts -->
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="fill-height" elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="info">mdi-chart-box-outline</v-icon>
              Statistics
            </v-toolbar-title>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact">
            <tbody>
              <tr v-if="table.metadata.schemas">
                <td class="font-weight-medium" style="width: 140px">Schemas</td>
                <td>{{ table.metadata.schemas.length }}</td>
              </tr>
              <tr v-if="currentSchemaInfo">
                <td class="font-weight-medium">Fields</td>
                <td>{{ currentSchemaInfo.fields?.length || 0 }}</td>
              </tr>
              <tr v-if="table.metadata.snapshots">
                <td class="font-weight-medium">Snapshots</td>
                <td>{{ table.metadata.snapshots.length }}</td>
              </tr>
              <tr v-if="table.metadata['partition-specs']">
                <td class="font-weight-medium">Partition Specs</td>
                <td>{{ table.metadata['partition-specs'].length }}</td>
              </tr>
              <tr v-if="table.metadata['sort-orders']">
                <td class="font-weight-medium">Sort Orders</td>
                <td>{{ table.metadata['sort-orders'].length }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <!-- Partitioning -->
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="fill-height" elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="warning">mdi-view-grid-outline</v-icon>
              Partitioning
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip v-if="activePartitionSpec" size="x-small" variant="outlined" class="mr-2">
              spec {{ activePartitionSpec['spec-id'] }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-card-text v-if="activePartitionSpec">
            <template v-if="activePartitionSpec.fields.length === 0">
              <v-chip size="small" color="grey" variant="flat">Unpartitioned</v-chip>
            </template>
            <template v-else>
              <v-chip
                v-for="field in activePartitionSpec.fields"
                :key="field.name"
                size="small"
                color="primary"
                variant="outlined"
                class="mr-1 mb-1">
                {{ formatPartitionField(field) }}
              </v-chip>
            </template>
          </v-card-text>
          <v-card-text v-else class="text-grey">No partition spec</v-card-text>
        </v-card>
      </v-col>

      <!-- Sort Order -->
      <v-col cols="12" md="4">
        <v-card variant="outlined" class="fill-height" elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="success">mdi-sort-ascending</v-icon>
              Sort Order
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip v-if="activeSortOrder" size="x-small" variant="outlined" class="mr-2">
              order {{ activeSortOrder['order-id'] }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-card-text v-if="activeSortOrder">
            <template v-if="activeSortOrder.fields.length === 0">
              <v-chip size="small" color="grey" variant="flat">Unsorted</v-chip>
            </template>
            <template v-else>
              <v-chip
                v-for="(field, idx) in activeSortOrder.fields"
                :key="idx"
                size="small"
                color="info"
                variant="outlined"
                class="mr-1 mb-1">
                {{ formatSortField(field) }}
              </v-chip>
            </template>
          </v-card-text>
          <v-card-text v-else class="text-grey">No sort order</v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <!-- Schema Fields & Evolution -->
    <v-expansion-panels class="mb-4">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <div class="d-flex align-center">
            <v-icon class="mr-2">mdi-file-tree</v-icon>
            Schema Fields
            <v-chip size="x-small" variant="outlined" class="ml-2">
              {{ selectedSchemaInfo?.fields?.length || 0 }} fields
            </v-chip>
            <v-chip
              v-if="
                selectedSchemaId !== null &&
                selectedSchemaId !== table.metadata['current-schema-id']
              "
              size="x-small"
              color="warning"
              variant="flat"
              class="ml-2">
              schema {{ selectedSchemaId }}
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-select
            v-if="allSchemas.length > 1"
            v-model="selectedSchemaId"
            :items="schemaVersionOptions"
            density="compact"
            variant="outlined"
            label="Schema Version"
            class="mb-3"
            style="max-width: 400px"
            hide-details></v-select>
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

      <!-- Schema Evolution -->
      <v-expansion-panel v-if="allSchemas.length > 1">
        <v-expansion-panel-title>
          <div class="d-flex align-center">
            <v-icon class="mr-2">mdi-history</v-icon>
            Schema Evolution
            <v-chip size="x-small" color="primary" variant="outlined" class="ml-2">
              {{ allSchemas.length }} versions
            </v-chip>
          </div>
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

    <!-- Table Health -->
    <TableHealth :table="table" />

    <!-- Current Snapshot Details -->
    <!-- Partition Distribution -->
    <v-card v-if="partitionChartAvailable" variant="outlined" class="mb-4" elevation="1">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-chart-bar</v-icon>
          Partition Distribution
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn-toggle
          v-model="partitionMetric"
          mandatory
          density="compact"
          variant="outlined"
          divided
          color="primary"
          class="mr-2">
          <v-btn value="records" size="x-small">Records</v-btn>
          <v-btn value="files" size="x-small">Files</v-btn>
        </v-btn-toggle>
      </v-toolbar>
      <v-divider></v-divider>
      <div v-if="partitionLoading" class="d-flex justify-center align-center pa-6">
        <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
        <span class="ml-3 text-body-2 text-medium-emphasis">
          Querying partition metadata via DuckDB…
        </span>
      </div>
      <div v-else-if="partitionError" class="pa-4">
        <v-alert type="warning" variant="tonal" density="compact" class="text-body-2">
          {{ partitionError }}
          <template v-if="partitionError.includes('CORS')" #append>
            <CorsConfigDialog />
          </template>
        </v-alert>
      </div>
      <div v-else-if="partitionData.length > 0" class="pa-3">
        <div ref="partitionChartRef" class="partition-chart-container"></div>
        <div v-if="partitionSkewRatio !== null" class="mt-2 d-flex align-center flex-wrap">
          <v-chip
            :color="
              partitionSkewRatio > 5 ? 'error' : partitionSkewRatio > 2 ? 'warning' : 'success'
            "
            size="x-small"
            variant="flat"
            class="mr-2">
            {{
              partitionSkewRatio > 5 ? 'High Skew' : partitionSkewRatio > 2 ? 'Skewed' : 'Balanced'
            }}
          </v-chip>
          <span class="text-caption text-medium-emphasis mr-4">
            Largest / median ratio: {{ partitionSkewRatio.toFixed(1) }}x ·
            {{ partitionData.length }} partition{{ partitionData.length !== 1 ? 's' : '' }}
          </span>
          <span class="d-inline-flex align-center ga-3 text-caption text-medium-emphasis">
            <span class="d-inline-flex align-center">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 2px;
                  background: #66bb6a;
                  display: inline-block;
                "
                class="mr-1"></span>
              Balanced
            </span>
            <span class="d-inline-flex align-center">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 2px;
                  background: #fdd835;
                  display: inline-block;
                "
                class="mr-1"></span>
              Moderate
            </span>
            <span class="d-inline-flex align-center">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 2px;
                  background: #fb8c00;
                  display: inline-block;
                "
                class="mr-1"></span>
              High
            </span>
            <span class="d-inline-flex align-center">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 2px;
                  background: #e53935;
                  display: inline-block;
                "
                class="mr-1"></span>
              Extreme
            </span>
            <span class="d-inline-flex align-center">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 2px;
                  background: #42a5f5;
                  display: inline-block;
                "
                class="mr-1"></span>
              Undersized
            </span>
          </span>
        </div>
      </div>
    </v-card>

    <TableSnapshotDetails
      v-if="currentSnapshot"
      :snapshot="currentSnapshot"
      title="Current Snapshot Details" />
  </v-card-text>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount, inject } from 'vue';
import * as d3 from 'd3';
import { useFunctions } from '../plugins/functions';
import { useLoQE } from '../composables/useLoQE';
import { useUserStore } from '../stores/user';
import CorsConfigDialog from './CorsConfigDialog.vue';
import TableHealth from './TableHealth.vue';
import TableSnapshotDetails from './TableSnapshotDetails.vue';
import { transformFields } from '../common/schemaUtils';
import type {
  LoadTableResult,
  Snapshot,
  PartitionField,
  SortField,
} from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  table: LoadTableResult;
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  catalogUrl?: string;
}>();

// Composables
const functions = useFunctions();
const config = inject<any>('appConfig', { enabledAuthentication: false });
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
const userStore = useUserStore();

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

const propertyItems = computed(() => {
  const props_ = props.table.metadata.properties;
  if (!props_) return [];
  return Object.entries(props_).map(([key, value]) => ({ key, value }));
});

const formatTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  return date.toLocaleString();
};

const getCurrentSchema = () => {
  if (!props.table.metadata.schemas || props.table.metadata.schemas.length === 0) return null;
  return props.table.metadata.schemas.find(
    (schema) => schema['schema-id'] === props.table.metadata['current-schema-id'],
  );
};

const getCurrentSnapshot = (): Snapshot | null => {
  if (!props.table.metadata.snapshots || props.table.metadata.snapshots.length === 0) return null;
  return (
    props.table.metadata.snapshots.find(
      (snapshot: Snapshot) =>
        snapshot['snapshot-id'] === props.table.metadata['current-snapshot-id'],
    ) || null
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
const currentSnapshot = computed(() => getCurrentSnapshot());
const currentSchemaInfo = computed(() => getCurrentSchema());

const selectedSchemaId = ref<number | null>(null);

const schemaVersionOptions = computed(() => {
  return allSchemas.value.map((s) => ({
    title: `Schema ${s['schema-id']}${s['schema-id'] === props.table.metadata['current-schema-id'] ? ' (current)' : ''} — ${s.fields?.length || 0} fields`,
    value: s['schema-id'] ?? 0,
  }));
});

const selectedSchemaInfo = computed(() => {
  const id = selectedSchemaId.value;
  if (id === null) return currentSchemaInfo.value;
  return allSchemas.value.find((s) => s['schema-id'] === id) || currentSchemaInfo.value;
});

const schemaFieldsTransformed = computed(() => {
  if (!selectedSchemaInfo.value?.fields) return [];
  return transformFields(selectedSchemaInfo.value.fields);
});

// ── Partition Distribution ────────────────────────────────────────────────────

// formatBytes is also needed by Partition Distribution
// const formatBytes = (bytes: number): string => {
//   if (bytes < 1024) return `${bytes} B`;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
//   if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
//   return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
// };

interface PartitionBucket {
  partition: string;
  fileCount: number;
  totalRecords: number;
}

const partitionChartRef = ref<HTMLElement | null>(null);
const partitionData = ref<PartitionBucket[]>([]);
const partitionLoading = ref(false);
const partitionError = ref<string | null>(null);
const partitionMetric = ref<'files' | 'records'>('records');

const partitionChartAvailable = computed(() => {
  // Only show if we have the required props and the table is partitioned
  if (!props.warehouseId || !props.namespaceId || !props.tableName || !props.catalogUrl)
    return false;
  const specs = props.table.metadata['partition-specs'];
  const defaultId = props.table.metadata['default-spec-id'];
  if (!specs) return false;
  const currentSpec = specs.find((s: any) => s['spec-id'] === defaultId) ?? specs[specs.length - 1];
  return currentSpec?.fields && currentSpec.fields.length > 0;
});

const partitionSkewRatio = computed<number | null>(() => {
  if (partitionData.value.length < 2) return null;
  const metric = partitionMetric.value;
  const values = partitionData.value
    .map((d) => (metric === 'files' ? d.fileCount : d.totalRecords))
    .sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const max = values[values.length - 1];
  return median > 0 ? max / median : max > 0 ? Infinity : 1;
});

async function loadPartitionData() {
  if (!props.warehouseId || !props.catalogUrl) return;
  partitionLoading.value = true;
  partitionError.value = null;

  try {
    await loqe.initialize();

    // Load warehouse for name + project-id
    const wh = await functions.getWarehouse(props.warehouseId);
    const warehouseName = wh.name;

    // Attach catalog if needed
    const attached = loqe.attachedCatalogs.value;
    if (!attached.some((c) => c.catalogName === warehouseName)) {
      await loqe.attachCatalog({
        catalogName: warehouseName,
        restUri: props.catalogUrl,
        accessToken: userStore.user.access_token,
        projectId: wh['project-id'],
      });
    }

    const tablePath = `"${warehouseName}"."${props.namespaceId}"."${props.tableName}"`;

    // Extract partition path segments from hive-style file paths
    // e.g. .../data/region=US/date=2024-01-01/00001.parquet → "region=US/date=2024-01-01"
    // iceberg_metadata columns: file_path, file_format, manifest_sequence_number,
    //                           manifest_content, record_count
    const sql = `
      WITH files AS (
        SELECT
          record_count AS rcount,
          CASE
            WHEN file_path LIKE '%/data/%'
            THEN regexp_extract(file_path, '.*/data/(.*)/[^/]+$', 1)
            ELSE NULL
          END AS partition_path
        FROM iceberg_metadata(${tablePath})
        WHERE manifest_content = 'DATA'
      )
      SELECT
        COALESCE(NULLIF(partition_path, ''), '__unpartitioned__') AS partition_value,
        COUNT(*) AS file_count,
        SUM(rcount) AS total_records
      FROM files
      GROUP BY partition_value
      ORDER BY total_records DESC
    `;

    const result = await loqe.query(sql);

    const partColIdx = result.columns.indexOf('partition_value');
    const filesColIdx = result.columns.indexOf('file_count');
    const recsColIdx = result.columns.indexOf('total_records');

    // Parse values — DuckDB BigInt comes back as quoted strings like '"5293"'
    const parseBigInt = (v: any): number => {
      if (v === null || v === undefined) return 0;
      const s = String(v).replace(/"/g, '');
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    partitionData.value = result.rows.map((row: any[]) => ({
      partition: String(row[partColIdx] ?? 'unknown'),
      fileCount: parseBigInt(row[filesColIdx]),
      totalRecords: parseBigInt(row[recsColIdx]),
    }));
  } catch (err: any) {
    console.error('Failed to load partition data:', err);
    const msg = err.message || String(err);
    if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
      partitionError.value =
        'Cannot query table metadata — CORS not configured for direct browser access to storage.';
    } else {
      partitionError.value = msg;
    }
  } finally {
    partitionLoading.value = false;
  }
}

function renderPartitionChart() {
  const container = partitionChartRef.value;
  if (!container || partitionData.value.length === 0) return;

  d3.select(container).selectAll('*').remove();

  const metric = partitionMetric.value;
  const data = partitionData.value.map((d) => ({
    label: d.partition.replace(/^[^=]+=/, ''), // strip key= prefix for display
    fullLabel: d.partition,
    value: metric === 'files' ? d.fileCount : d.totalRecords,
  }));

  // Sort by value descending
  data.sort((a, b) => b.value - a.value);
  const displayData = data;

  const margin = { top: 16, right: 16, bottom: 80, left: 60 };
  const visibleWidth = container.clientWidth || 600;
  const barWidth = 32;
  const maxVisibleBars = 20;
  // Chart width = enough for all bars, minimum = container width
  const neededWidth = margin.left + margin.right + displayData.length * (barWidth + 6);
  const svgWidth = Math.max(visibleWidth, neededWidth);
  const height = 280;
  const chartW = svgWidth - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', svgWidth)
    .attr('height', height)
    .style('font-family', "'Roboto Mono', monospace")
    .style('font-size', '10px')
    .style('color', 'inherit');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // If more bars than visible area, enable horizontal scroll on container
  if (displayData.length > maxVisibleBars) {
    container.style.overflowX = 'auto';
  } else {
    container.style.overflowX = 'hidden';
  }
  const maxVal = d3.max(displayData, (d) => d.value) ?? 1;

  const xScale = d3
    .scaleBand()
    .domain(displayData.map((d) => d.label))
    .range([0, chartW])
    .padding(0.15);

  const yScale = d3
    .scaleLinear()
    .domain([0, maxVal * 1.1])
    .nice()
    .range([chartH, 0]);

  // Compute median for skew detection
  const sortedValues = displayData.map((d) => d.value).sort((a, b) => a - b);
  const median = sortedValues[Math.floor(sortedValues.length / 2)] || 1;

  // Subtle grid lines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickSize(-chartW)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .style('stroke', 'rgba(var(--v-theme-on-surface), 0.06)');
  g.select('.grid .domain').remove();

  // Median reference line
  g.append('line')
    .attr('x1', 0)
    .attr('x2', chartW)
    .attr('y1', yScale(median))
    .attr('y2', yScale(median))
    .attr('stroke', '#90A4AE')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .attr('opacity', 0.7);

  g.append('text')
    .attr('x', chartW - 2)
    .attr('y', yScale(median) - 4)
    .attr('text-anchor', 'end')
    .attr('fill', '#90A4AE')
    .attr('font-size', '9px')
    .text(`median: ${median.toLocaleString()}`);

  // Bars
  g.selectAll('rect.bar')
    .data(displayData)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', (d) => xScale(d.label)!)
    .attr('y', (d) => yScale(d.value))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => Math.max(1, chartH - yScale(d.value)))
    .attr('rx', 2)
    .attr('fill', (d) => {
      const ratio = median > 0 ? d.value / median : 1;
      if (ratio > 5) return '#E53935'; // red — extreme skew
      if (ratio > 2) return '#FB8C00'; // orange — high skew
      if (ratio > 1.3) return '#FDD835'; // yellow — moderate skew
      if (ratio < 0.5) return '#42A5F5'; // blue — undersized
      return '#66BB6A'; // green — balanced
    })
    .attr('opacity', 0.85);

  // Value labels on top of bars (only if enough space)
  if (xScale.bandwidth() > 14 || displayData.length <= 15) {
    g.selectAll('text.value')
      .data(displayData)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => xScale(d.label)! + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.value) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor')
      .attr('opacity', 0.6)
      .attr('font-size', '9px')
      .text((d) => d.value.toLocaleString());
  }

  // X axis — partition labels
  const xAxis = g
    .append('g')
    .attr('transform', `translate(0,${chartH})`)
    .call(d3.axisBottom(xScale));

  xAxis
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.7)
    .attr('transform', 'rotate(-45)')
    .attr('text-anchor', 'end')
    .attr('dx', '-0.5em')
    .attr('dy', '0.25em')
    .each(function (this: any) {
      const text = d3.select(this).text();
      if (text.length > 16) {
        d3.select(this).text(text.slice(0, 14) + '…');
      }
    });

  xAxis.selectAll('.domain').style('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(5)
    .tickFormat((d) => {
      const n = d as number;
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return `${n}`;
    });

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .style('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  g.selectAll('.domain').style('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');
}

// Re-render when metric changes
watch(partitionMetric, async () => {
  if (partitionData.value.length > 0) {
    await nextTick();
    renderPartitionChart();
  }
});

// Render chart once partition data is loaded and DOM is ready
watch(
  partitionData,
  async (newData) => {
    if (newData.length > 0) {
      await nextTick();
      // Double nextTick ensures Vue has mounted the v-else-if branch
      await nextTick();
      renderPartitionChart();
    }
  },
  { flush: 'post' },
);

// Auto-load partition data when chart becomes available
watch(
  partitionChartAvailable,
  (available) => {
    if (available && partitionData.value.length === 0) {
      loadPartitionData();
    }
  },
  { immediate: true },
);

// Clean up
onBeforeUnmount(() => {
  if (partitionChartRef.value) {
    d3.select(partitionChartRef.value).selectAll('svg').remove();
  }
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

.partition-chart-container {
  width: 100%;
  height: 280px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 1);
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
