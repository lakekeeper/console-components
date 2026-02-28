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
    <v-card v-if="healthChecks.length > 0" variant="outlined" class="mb-4" elevation="1">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" :color="overallHealthColor">mdi-heart-pulse</v-icon>
          Table Health
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-select
          v-if="branchOptions.length > 1"
          v-model="selectedBranch"
          :items="branchOptions"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 180px"
          class="mr-2"
          prepend-inner-icon="mdi-source-branch"></v-select>
        <v-chip
          v-else
          size="x-small"
          variant="outlined"
          class="mr-2"
          prepend-icon="mdi-source-branch">
          {{ selectedBranch }}
        </v-chip>
        <v-dialog max-width="600">
          <template #activator="{ props: dialogProps }">
            <v-btn
              v-bind="dialogProps"
              icon="mdi-information-outline"
              size="x-small"
              variant="text"
              color="info"
              class="mr-1"></v-btn>
          </template>
          <template #default="{ isActive }">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2" color="info">mdi-information-outline</v-icon>
                Health Check Logic
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text class="text-body-2">
                <p class="mb-3">
                  Health checks are derived from the current snapshot's summary statistics. No
                  additional API calls are made.
                </p>

                <h4 class="text-subtitle-2 mb-1">
                  <v-icon size="small" color="warning" class="mr-1">mdi-file-alert-outline</v-icon>
                  Small Files
                </h4>
                <p class="mb-3">
                  Compares average file size (total size ÷ file count) against targets. Files under
                  <strong>1 MB</strong>
                  avg are flagged as very small; under
                  <strong>8 MB</strong>
                  avg (with 10+ files) as small. Optimal Iceberg file sizes are
                  <strong>128–512 MB</strong>
                  . Small files increase query planning time and metadata overhead. Fix with
                  compaction or larger write batches.
                </p>

                <h4 class="text-subtitle-2 mb-1">
                  <v-icon size="small" color="warning" class="mr-1">
                    mdi-delete-clock-outline
                  </v-icon>
                  Delete Files
                </h4>
                <p class="mb-3">
                  Checks for positional or equality delete files. These cause merge-on-read overhead
                  at query time. Severity increases with the ratio of delete files to data files.
                  Running compaction merges deletes into data files.
                </p>

                <h4 class="text-subtitle-2 mb-1">
                  <v-icon size="small" color="warning" class="mr-1">mdi-camera-burst</v-icon>
                  Snapshot Count
                </h4>
                <p class="mb-3">
                  Counts total snapshots in table metadata. Over
                  <strong>100</strong>
                  snapshots increases metadata file sizes and load times. Over
                  <strong>500</strong>
                  is critical. Fix with snapshot expiration (
                  <code>expire_snapshots</code>
                  ).
                </p>

                <h4 class="text-subtitle-2 mb-1">
                  <v-icon size="small" color="info" class="mr-1">mdi-file-multiple-outline</v-icon>
                  High File Count
                </h4>
                <p class="mb-3">
                  Flags tables with over
                  <strong>1,000</strong>
                  data files (even if file sizes are healthy). High file counts increase query
                  planning time. Fix with compaction.
                </p>

                <h4 class="text-subtitle-2 mb-1">
                  <v-icon size="small" color="success" class="mr-1">mdi-database-outline</v-icon>
                  Table Size
                </h4>
                <p>
                  Informational — shows total record count and data size from the snapshot summary.
                </p>
              </v-card-text>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="isActive.value = false">Close</v-btn>
              </v-card-actions>
            </v-card>
          </template>
        </v-dialog>
        <v-chip :color="overallHealthColor" size="small" variant="flat" class="mr-2">
          {{ overallHealthLabel }}
        </v-chip>
      </v-toolbar>
      <v-divider></v-divider>
      <v-expansion-panels variant="accordion" flat>
        <v-expansion-panel v-for="check in healthChecks" :key="check.label">
          <v-expansion-panel-title class="py-2">
            <template #default>
              <div class="d-flex align-center flex-grow-1">
                <v-icon :color="check.color" size="small" class="mr-3">{{ check.icon }}</v-icon>
                <div class="flex-grow-1">
                  <div class="text-body-2 font-weight-medium">{{ check.label }}</div>
                  <div class="text-caption text-medium-emphasis text-wrap">{{ check.detail }}</div>
                </div>
                <v-chip :color="check.color" size="x-small" variant="flat" class="ml-2 mr-2">
                  {{ check.severity }}
                </v-chip>
              </div>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr>
                  <th class="text-left" style="width: 45%">Metric</th>
                  <th class="text-left">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in check.reasoning" :key="idx">
                  <td class="font-mono text-medium-emphasis">{{ row.label }}</td>
                  <td class="font-mono">{{ row.value }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Snapshot Trends Chart -->
      <div v-if="healthBranchSnapshots.length > 1">
        <v-divider></v-divider>
        <div class="pa-3">
          <div class="d-flex align-center mb-2">
            <v-icon size="small" class="mr-2" color="primary">mdi-chart-areaspline</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Snapshot Trends</span>
            <v-spacer></v-spacer>
            <v-select
              v-model="selectedMetric"
              :items="availableMetrics"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 220px"
              class="mr-2"></v-select>
          </div>
          <div ref="healthChartRef" class="health-chart-container"></div>
          <div v-if="allChartPoints.length > 1" class="mt-2 d-flex align-center">
            <v-btn-toggle
              v-model="chartWindowSize"
              mandatory
              density="compact"
              variant="outlined"
              divided
              color="primary">
              <v-btn v-for="opt in chartWindowOptions" :key="opt" :value="opt" size="x-small">
                {{ opt }}
              </v-btn>
              <v-btn :value="allChartPoints.length" size="x-small">All</v-btn>
            </v-btn-toggle>
            <span
              v-if="allChartPoints.length > effectiveWindowSize"
              class="text-caption text-medium-emphasis ml-3">
              showing {{ effectiveWindowSize }} of {{ allChartPoints.length }} snapshots
            </span>
          </div>
        </div>
      </div>
    </v-card>

    <!-- Current Snapshot Details -->
    <TableSnapshotDetails
      v-if="currentSnapshot"
      :snapshot="currentSnapshot"
      title="Current Snapshot Details" />
  </v-card-text>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import { useFunctions } from '../plugins/functions';
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

// --- Table Health ---
interface HealthCheck {
  label: string;
  detail: string;
  severity: 'Good' | 'Info' | 'Warning' | 'Critical';
  color: string;
  icon: string;
  reasoning: { label: string; value: string }[];
}

// Branch selector for health analysis
const branchOptions = computed(() => {
  const refs = props.table.metadata.refs;
  if (!refs) return [{ title: 'main', value: 'main' }];
  return Object.entries(refs)
    .filter(([, ref]) => ref.type === 'branch')
    .map(([name]) => ({ title: name, value: name }));
});

const selectedBranch = ref<string>('main');

const healthBranchSnapshot = computed<Snapshot | null>(() => {
  const refs = props.table.metadata.refs;
  const allSnapshots = props.table.metadata.snapshots;
  if (!refs || !allSnapshots) return currentSnapshot.value;
  const branchRef = refs[selectedBranch.value];
  if (!branchRef) return currentSnapshot.value;
  const snapId = String(branchRef['snapshot-id']);
  return allSnapshots.find((s) => String(s['snapshot-id']) === snapId) || currentSnapshot.value;
});

const healthSummaryNum = (...keys: string[]): number | null => {
  for (const key of keys) {
    const val = healthBranchSnapshot.value?.summary?.[key];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!isNaN(n)) return n;
    }
  }
  return null;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Walk the selected branch by following parent-snapshot-id from branch tip
const healthBranchSnapshots = computed<Snapshot[]>(() => {
  const allSnapshots = props.table.metadata.snapshots;
  if (!allSnapshots || allSnapshots.length === 0) return [];
  const snapshotMap = new Map<string, Snapshot>();
  for (const s of allSnapshots) {
    if (s['snapshot-id']) snapshotMap.set(String(s['snapshot-id']), s);
  }
  const chain: Snapshot[] = [];
  // Start from the selected branch's tip snapshot
  const refs = props.table.metadata.refs;
  let startId: string | number | undefined;
  if (refs && refs[selectedBranch.value]) {
    startId = refs[selectedBranch.value]['snapshot-id'];
  } else {
    startId = props.table.metadata['current-snapshot-id'];
  }
  let id: string | number | undefined = startId;
  while (id !== undefined && id !== null) {
    const snap = snapshotMap.get(String(id));
    if (!snap) break;
    chain.push(snap);
    id = snap['parent-snapshot-id'];
  }
  return chain;
});

const healthChecks = computed<HealthCheck[]>(() => {
  if (!healthBranchSnapshot.value?.summary) return [];
  const checks: HealthCheck[] = [];

  const dataFiles = healthSummaryNum('total-data-files-count', 'total-data-files');
  const deleteFiles = healthSummaryNum('total-delete-files-count', 'total-delete-files');
  const eqDeletes = healthSummaryNum('total-equality-deletes-count', 'total-equality-deletes');
  const posDeletes = healthSummaryNum('total-position-deletes-count', 'total-position-deletes');
  const totalRecords = healthSummaryNum('total-records-count', 'total-records');
  const totalSize = healthSummaryNum('total-files-size-in-bytes', 'total-files-size');
  const totalSnapshotCount = props.table.metadata.snapshots?.length ?? 0;
  const branchSnapshotCount = healthBranchSnapshots.value.length;

  // Analyze branch operation history
  const opCounts: Record<string, number> = {};
  for (const snap of healthBranchSnapshots.value) {
    const op = snap.summary?.['operation'] ?? 'unknown';
    opCounts[op] = (opCounts[op] ?? 0) + 1;
  }
  const deleteOps = opCounts['delete'] ?? 0;
  const overwriteOps = opCounts['overwrite'] ?? 0;

  const replaceOps = opCounts['replace'] ?? 0;
  const mutatingOps = deleteOps + overwriteOps + replaceOps;

  // Small files detection
  if (dataFiles !== null && totalSize !== null && dataFiles > 0) {
    const avgFileSize = totalSize / dataFiles;
    // Very tiny files (< 1 MB avg) — flag even with few files
    if (avgFileSize < 1024 * 1024 && dataFiles > 1) {
      checks.push({
        label: 'Very small files detected',
        detail: `${dataFiles} data files with avg size ${formatBytes(avgFileSize)}. Files are significantly undersized (target: 128–512 MB). Consider compaction or increasing write batch sizes.`,
        severity: dataFiles > 10 ? 'Critical' : 'Warning',
        color: dataFiles > 10 ? 'error' : 'warning',
        icon: 'mdi-file-alert-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          { label: 'Threshold', value: 'avg < 1 MB with > 1 file' },
          {
            label: 'Result',
            value: `${formatBytes(avgFileSize)} < 1 MB, ${dataFiles} files > 1 → ${dataFiles > 10 ? 'Critical (>10 files)' : 'Warning (≤10 files)'}`,
          },
        ],
      });
    } else if (avgFileSize < 8 * 1024 * 1024 && dataFiles > 10) {
      // Moderately small files — only flag when there are many
      checks.push({
        label: 'Small files detected',
        detail: `${dataFiles} data files with avg size ${formatBytes(avgFileSize)}. Consider compaction to improve read performance (target: 128–512 MB per file).`,
        severity: 'Warning',
        color: 'warning',
        icon: 'mdi-file-alert-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          { label: 'Threshold', value: 'avg < 8 MB with > 10 files' },
          {
            label: 'Result',
            value: `${formatBytes(avgFileSize)} < 8 MB, ${dataFiles} files > 10 → Warning`,
          },
        ],
      });
    } else {
      checks.push({
        label: 'File sizes healthy',
        detail: `${dataFiles} data file${dataFiles > 1 ? 's' : ''}, avg ${formatBytes(avgFileSize)}.`,
        severity: 'Good',
        color: 'success',
        icon: 'mdi-file-check-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          {
            label: 'Threshold',
            value: 'avg < 1 MB → Warning/Critical, avg < 8 MB with >10 files → Warning',
          },
          { label: 'Result', value: `${formatBytes(avgFileSize)} is within healthy range → Good` },
        ],
      });
    }
  } else {
    checks.push({
      label: 'File sizes',
      detail:
        dataFiles === 0
          ? 'No data files yet.'
          : 'File size data not available in snapshot summary.',
      severity: 'Good',
      color: 'success',
      icon: 'mdi-file-check-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${dataFiles ?? 'N/A'}` },
        { label: 'total-files-size-in-bytes', value: `${totalSize ?? 'N/A'}` },
        {
          label: 'Result',
          value:
            dataFiles === 0
              ? 'No data files — nothing to check'
              : 'Metrics unavailable in snapshot summary',
        },
      ],
    });
  }

  // Delete files accumulation
  if (deleteFiles !== null && deleteFiles > 0) {
    const deleteRatio = dataFiles ? deleteFiles / dataFiles : deleteFiles;
    const totalDeletes = (eqDeletes ?? 0) + (posDeletes ?? 0);
    const severity: HealthCheck['severity'] =
      deleteRatio > 0.5 || deleteFiles > 100 ? 'Critical' : deleteFiles > 10 ? 'Warning' : 'Info';
    checks.push({
      label: 'Delete files present',
      detail: `${deleteFiles} delete file${deleteFiles > 1 ? 's' : ''}${totalDeletes > 0 ? ` (${totalDeletes.toLocaleString()} deletes)` : ''}. Run compaction to merge deletes into data files.`,
      severity,
      color: severity === 'Critical' ? 'error' : severity === 'Warning' ? 'warning' : 'info',
      icon: 'mdi-delete-clock-outline',
      reasoning: [
        { label: 'total-delete-files-count', value: `${deleteFiles}` },
        { label: 'total-data-files-count', value: `${dataFiles ?? 'N/A'}` },
        { label: 'total-equality-deletes-count', value: `${eqDeletes ?? 'N/A'}` },
        { label: 'total-position-deletes-count', value: `${posDeletes ?? 'N/A'}` },
        {
          label: 'Delete-to-data ratio',
          value: `${deleteFiles} / ${dataFiles ?? '?'} = ${deleteRatio.toFixed(2)}`,
        },
        {
          label: 'Threshold',
          value: 'ratio > 0.5 or > 100 delete files → Critical, > 10 → Warning, else Info',
        },
        {
          label: 'Result',
          value: `ratio ${deleteRatio.toFixed(2)}, ${deleteFiles} delete files → ${severity}`,
        },
      ],
    });
  } else {
    checks.push({
      label: 'Delete files',
      detail: 'No delete files. Table is clean.',
      severity: 'Good',
      color: 'success',
      icon: 'mdi-delete-off-outline',
      reasoning: [
        { label: 'total-delete-files-count', value: `${deleteFiles ?? 0}` },
        { label: 'total-equality-deletes-count', value: `${eqDeletes ?? 0}` },
        { label: 'total-position-deletes-count', value: `${posDeletes ?? 0}` },
        { label: 'Result', value: 'No delete files present → Good' },
      ],
    });
  }

  // Branch operation history
  if (branchSnapshotCount > 0) {
    const opSummary = Object.entries(opCounts)
      .map(([op, count]) => `${count} ${op}`)
      .join(', ');
    const mutatingRatio = branchSnapshotCount > 0 ? mutatingOps / branchSnapshotCount : 0;
    let severity: HealthCheck['severity'] = 'Good';
    let color = 'success';
    if (mutatingRatio > 0.5 && mutatingOps > 5) {
      severity = 'Warning';
      color = 'warning';
    } else if (mutatingOps > 0) {
      severity = 'Info';
      color = 'info';
    }
    checks.push({
      label: mutatingOps > 0 ? 'Mutating operations detected' : 'Append-only history',
      detail:
        mutatingOps > 0
          ? `${mutatingOps} delete/overwrite/replace operation${mutatingOps > 1 ? 's' : ''} across ${branchSnapshotCount} snapshots on "${selectedBranch.value}". Frequent mutations may indicate need for compaction.`
          : `All ${branchSnapshotCount} snapshots on "${selectedBranch.value}" are appends.`,
      severity,
      color,
      icon: mutatingOps > 0 ? 'mdi-swap-horizontal' : 'mdi-plus-circle-outline',
      reasoning: [
        { label: 'Branch', value: `${selectedBranch.value}` },
        { label: 'Branch snapshots', value: `${branchSnapshotCount}` },
        { label: 'Operations breakdown', value: opSummary },
        {
          label: 'Mutating operations',
          value: `${mutatingOps} (delete: ${deleteOps}, overwrite: ${overwriteOps}, replace: ${replaceOps})`,
        },
        {
          label: 'Mutating ratio',
          value: `${mutatingOps}/${branchSnapshotCount} = ${(mutatingRatio * 100).toFixed(0)}%`,
        },
        {
          label: 'Threshold',
          value: 'ratio > 50% with > 5 mutations → Warning, any mutations → Info, none → Good',
        },
        {
          label: 'Result',
          value: `${(mutatingRatio * 100).toFixed(0)}% mutating, ${mutatingOps} mutations → ${severity}`,
        },
      ],
    });
  }

  // Snapshot accumulation
  if (totalSnapshotCount > 100) {
    checks.push({
      label: 'Many snapshots accumulated',
      detail: `${totalSnapshotCount} total snapshots (${branchSnapshotCount} on "${selectedBranch.value}"). Consider running snapshot expiration to reduce metadata size.`,
      severity: totalSnapshotCount > 500 ? 'Critical' : 'Warning',
      color: totalSnapshotCount > 500 ? 'error' : 'warning',
      icon: 'mdi-camera-burst',
      reasoning: [
        {
          label: 'Total snapshots',
          value: `${totalSnapshotCount} (all branches, from metadata.snapshots.length)`,
        },
        {
          label: `"${selectedBranch.value}" branch snapshots`,
          value: `${branchSnapshotCount} (following parent chain from branch tip)`,
        },
        { label: 'Other snapshots', value: `${totalSnapshotCount - branchSnapshotCount}` },
        { label: 'Threshold', value: '> 500 total → Critical, > 100 total → Warning' },
        {
          label: 'Result',
          value: `${totalSnapshotCount} total snapshots → ${totalSnapshotCount > 500 ? 'Critical' : 'Warning'}`,
        },
      ],
    });
  } else if (totalSnapshotCount > 0) {
    checks.push({
      label: 'Snapshot count',
      detail: `${totalSnapshotCount} total snapshot${totalSnapshotCount > 1 ? 's' : ''} (${branchSnapshotCount} on "${selectedBranch.value}").`,
      severity: 'Good',
      color: 'success',
      icon: 'mdi-camera-outline',
      reasoning: [
        {
          label: 'Total snapshots',
          value: `${totalSnapshotCount} (all branches, from metadata.snapshots.length)`,
        },
        {
          label: `"${selectedBranch.value}" branch snapshots`,
          value: `${branchSnapshotCount} (following parent chain from branch tip)`,
        },
        { label: 'Other snapshots', value: `${totalSnapshotCount - branchSnapshotCount}` },
        {
          label: 'Threshold',
          value: '> 500 total → Critical, > 100 total → Warning, ≤ 100 → Good',
        },
        { label: 'Result', value: `${totalSnapshotCount} ≤ 100 → Good` },
      ],
    });
  }

  // File count check
  if (dataFiles !== null && dataFiles > 1000) {
    checks.push({
      label: 'High file count',
      detail: `${dataFiles.toLocaleString()} data files. Large file counts increase planning time. Consider compaction.`,
      severity: dataFiles > 10000 ? 'Warning' : 'Info',
      color: dataFiles > 10000 ? 'warning' : 'info',
      icon: 'mdi-file-multiple-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${dataFiles.toLocaleString()}` },
        { label: 'Threshold', value: '> 10,000 → Warning, > 1,000 → Info, ≤ 1,000 → Good' },
        {
          label: 'Result',
          value: `${dataFiles.toLocaleString()} files → ${dataFiles > 10000 ? 'Warning' : 'Info'}`,
        },
      ],
    });
  } else {
    checks.push({
      label: 'File count',
      detail: `${(dataFiles ?? 0).toLocaleString()} data files.`,
      severity: 'Good',
      color: 'success',
      icon: 'mdi-file-multiple-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${(dataFiles ?? 0).toLocaleString()}` },
        { label: 'Threshold', value: '> 10,000 → Warning, > 1,000 → Info, ≤ 1,000 → Good' },
        { label: 'Result', value: `${(dataFiles ?? 0).toLocaleString()} ≤ 1,000 → Good` },
      ],
    });
  }

  // Table size summary (informational)
  checks.push({
    label: 'Table size',
    detail:
      totalSize !== null && totalRecords !== null
        ? `${totalRecords.toLocaleString()} records across ${formatBytes(totalSize)}.`
        : 'Size data not available in snapshot summary.',
    severity: 'Good',
    color: 'success',
    icon: 'mdi-database-outline',
    reasoning: [
      { label: 'total-records-count', value: `${totalRecords?.toLocaleString() ?? 'N/A'}` },
      {
        label: 'total-files-size-in-bytes',
        value:
          totalSize !== null ? `${totalSize.toLocaleString()} (${formatBytes(totalSize)})` : 'N/A',
      },
      { label: 'Result', value: 'Informational metric — no threshold applied' },
    ],
  });

  return checks;
});

const overallHealthColor = computed(() => {
  if (healthChecks.value.some((c) => c.severity === 'Critical')) return 'error';
  if (healthChecks.value.some((c) => c.severity === 'Warning')) return 'warning';
  return 'success';
});

const overallHealthLabel = computed(() => {
  if (healthChecks.value.some((c) => c.severity === 'Critical')) return 'Needs Attention';
  if (healthChecks.value.some((c) => c.severity === 'Warning')) return 'Minor Issues';
  return 'Healthy';
});

// --- Snapshot Trends Chart ---

const healthChartRef = ref<HTMLDivElement | null>(null);
const chartWindowSize = ref(50);
const chartWindowOptions = [50, 100, 200, 500, 1000];
const snapshotWindowStart = ref(0);

interface MetricDef {
  title: string;
  value: string;
  keys: string[];
  format: (n: number) => string;
  color: string;
}

const availableMetrics: MetricDef[] = [
  {
    title: 'Added Data Files',
    value: 'added-data-files',
    keys: ['added-data-files-count', 'added-data-files'],
    format: (n: number) => n.toLocaleString(),
    color: '#1976d2',
  },
  {
    title: 'Added Records',
    value: 'added-records',
    keys: ['added-records-count', 'added-records'],
    format: (n: number) =>
      n >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : n.toLocaleString(),
    color: '#388e3c',
  },
  {
    title: 'Total Data Files',
    value: 'total-data-files',
    keys: ['total-data-files-count', 'total-data-files'],
    format: (n: number) => n.toLocaleString(),
    color: '#f57c00',
  },
  {
    title: 'Total Records',
    value: 'total-records',
    keys: ['total-records-count', 'total-records'],
    format: (n: number) =>
      n >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : n.toLocaleString(),
    color: '#7b1fa2',
  },
  {
    title: 'Added Files Size',
    value: 'added-files-size',
    keys: ['added-files-size-in-bytes', 'added-files-size'],
    format: (n: number) => formatBytes(n),
    color: '#00796b',
  },
  {
    title: 'Total Files Size',
    value: 'total-files-size',
    keys: ['total-files-size-in-bytes', 'total-files-size'],
    format: (n: number) => formatBytes(n),
    color: '#c2185b',
  },
];

const selectedMetric = ref<string>('total-files-size');

const currentMetricDef = computed(
  () => availableMetrics.find((m) => m.value === selectedMetric.value) ?? availableMetrics[0],
);

interface ChartPoint {
  index: number;
  seqNum: number;
  value: number;
  timestamp: number;
  operation: string;
}

// All chart points (chronological)
const allChartPoints = computed<ChartPoint[]>(() => {
  const metric = currentMetricDef.value;
  // healthBranchSnapshots is tip-first; reverse to chronological order
  const snapshots = [...healthBranchSnapshots.value].reverse();
  const points: ChartPoint[] = [];
  snapshots.forEach((snap, idx) => {
    let val: number | null = null;
    for (const key of metric.keys) {
      const raw = snap.summary?.[key];
      if (raw !== undefined && raw !== null) {
        const n = Number(raw);
        if (!isNaN(n)) {
          val = n;
          break;
        }
      }
    }
    if (val !== null) {
      points.push({
        index: idx,
        seqNum: snap['sequence-number'] ?? idx,
        value: val,
        timestamp: snap['timestamp-ms'] ?? 0,
        operation: String(snap.summary?.['operation'] ?? 'unknown'),
      });
    }
  });
  return points;
});

// Effective window size (capped to actual data length)
const effectiveWindowSize = computed(() =>
  Math.min(chartWindowSize.value, allChartPoints.value.length),
);

// Windowed slice of chart points
const chartData = computed<ChartPoint[]>(() => {
  const all = allChartPoints.value;
  const winSize = effectiveWindowSize.value;
  if (all.length <= winSize) return all;
  return all.slice(snapshotWindowStart.value, snapshotWindowStart.value + winSize);
});

// Reset slider when metric/branch/window-size changes
watch([selectedMetric, healthBranchSnapshots, chartWindowSize], () => {
  const total = allChartPoints.value.length;
  const winSize = effectiveWindowSize.value;
  snapshotWindowStart.value = Math.max(0, total - winSize);
});

function renderHealthChart() {
  if (!healthChartRef.value || chartData.value.length === 0) return;

  const container = healthChartRef.value;
  d3.select(container).selectAll('svg').remove();

  const metric = currentMetricDef.value;
  const data = chartData.value;

  const margin = { top: 16, right: 16, bottom: 32, left: 56 };
  const width = container.clientWidth || 600;
  const height = 200;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block');

  const defs = svg.append('defs');

  // Gradient fill
  const gradientId = `area-grad-${metric.value}`;
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0')
    .attr('y1', '0')
    .attr('x2', '0')
    .attr('y2', '1');
  gradient
    .append('stop')
    .attr('offset', '0%')
    .attr('stop-color', metric.color)
    .attr('stop-opacity', 0.35);
  gradient
    .append('stop')
    .attr('offset', '100%')
    .attr('stop-color', metric.color)
    .attr('stop-opacity', 0.03);

  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const xScale = d3
    .scaleLinear()
    .domain([0, data.length - 1])
    .range([0, chartW]);

  const yMax = d3.max(data, (d) => d.value) ?? 1;
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax * 1.1])
    .nice()
    .range([chartH, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Subtle grid lines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(4)
        .tickSize(-chartW)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .attr('stroke', 'rgba(var(--v-theme-on-surface), 0.06)');
  g.select('.grid .domain').remove();

  // Area
  const area = d3
    .area<ChartPoint>()
    .x((d, i) => xScale(i))
    .y0(chartH)
    .y1((d) => yScale(d.value))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(data).attr('fill', `url(#${gradientId})`).attr('d', area);

  // Line
  const line = d3
    .line<ChartPoint>()
    .x((d, i) => xScale(i))
    .y((d) => yScale(d.value))
    .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', metric.color)
    .attr('stroke-width', 2)
    .attr('d', line);

  // Data dots
  const opColorMap: Record<string, string> = {
    append: '#4caf50',
    overwrite: '#ff9800',
    delete: '#f44336',
    replace: '#2196f3',
    merge: '#00bcd4',
  };

  g.selectAll('circle.data-dot')
    .data(data)
    .join('circle')
    .attr('class', 'data-dot')
    .attr('cx', (d, i) => xScale(i))
    .attr('cy', (d) => yScale(d.value))
    .attr('r', data.length > 30 ? 2.5 : 4)
    .attr('fill', (d) => opColorMap[d.operation] ?? metric.color)
    .attr('stroke', 'rgba(var(--v-theme-surface), 1)')
    .attr('stroke-width', 1.5)
    .style('cursor', 'pointer');

  // Tooltip
  g.selectAll('circle.data-dot')
    .append('title')
    .text(
      (d: any) =>
        `#${d.seqNum} — ${metric.format(d.value)}\n${d.operation}${d.timestamp ? '\n' + new Date(d.timestamp).toLocaleString() : ''}`,
    );

  // X axis — sequence numbers
  const tickStep = Math.max(1, Math.floor(data.length / 8));

  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(data.map((_, i) => i).filter((i) => i % tickStep === 0 || i === data.length - 1))
    .tickFormat((i) => `#${data[i as number]?.seqNum ?? ''}`);

  g.append('g')
    .attr('transform', `translate(0,${chartH})`)
    .call(xAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(4)
    .tickFormat((d) => metric.format(d as number));

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  // Remove axis domain lines
  g.selectAll('.domain').attr('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');
}

// Watch metric selection, branch data, slider position, and window size
watch(
  [selectedMetric, healthBranchSnapshots, snapshotWindowStart, chartWindowSize],
  async () => {
    if (healthBranchSnapshots.value.length > 1) {
      await nextTick();
      renderHealthChart();
    }
  },
  { immediate: false },
);

// Initial render once data is available
watch(
  healthBranchSnapshots,
  async (snaps) => {
    if (snaps.length > 1) {
      const total = allChartPoints.value.length;
      snapshotWindowStart.value = Math.max(0, total - effectiveWindowSize.value);
      await nextTick();
      renderHealthChart();
    }
  },
  { immediate: true },
);

// Clean up
onBeforeUnmount(() => {
  if (healthChartRef.value) {
    d3.select(healthChartRef.value).selectAll('svg').remove();
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

.health-chart-container {
  width: 100%;
  height: 200px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
</style>
