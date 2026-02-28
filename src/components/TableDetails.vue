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
    <TableHealth
      :table="table"
      :warehouse-id="warehouseId"
      :namespace-id="namespaceId"
      :table-name="tableName"
      :catalog-url="catalogUrl"
      :storage-type="storageType" />

    <!-- Current Snapshot Details -->
    <TableSnapshotDetails
      v-if="currentSnapshot"
      :snapshot="currentSnapshot"
      title="Current Snapshot Details" />
  </v-card-text>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFunctions } from '../plugins/functions';
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
  storageType?: string;
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
