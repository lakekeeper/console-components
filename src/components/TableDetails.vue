<template>
  <v-card-text>
    <v-row>
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-information-outline</v-icon>
            Table Information
          </v-card-title>
          <v-divider></v-divider>
          <v-list density="compact">
            <v-list-item>
              <v-list-item-title>Table UUID</v-list-item-title>
              <v-list-item-subtitle class="d-flex align-center">
                <span class="mr-2 font-mono">{{ table.metadata['table-uuid'] }}</span>
                <v-btn
                  icon="mdi-content-copy"
                  size="small"
                  variant="flat"
                  @click="copyToClipboard(table.metadata['table-uuid'])"></v-btn>
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item>
              <v-list-item-title>Format Version</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata['format-version'] }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="table.metadata.location">
              <v-list-item-title>Location</v-list-item-title>
              <v-list-item-subtitle class="d-flex align-center">
                <span class="mr-2 font-mono text-wrap">
                  {{ table.metadata.location }}
                </span>
                <v-btn
                  icon="mdi-content-copy"
                  size="small"
                  variant="flat"
                  @click="copyToClipboard(table.metadata.location)"></v-btn>
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="table.metadata['last-updated-ms']">
              <v-list-item-title>Last Updated</v-list-item-title>
              <v-list-item-subtitle>
                {{ formatTimestamp(table.metadata['last-updated-ms']) }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="table.metadata['current-schema-id']">
              <v-list-item-title>Current Schema ID</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata['current-schema-id'] }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="table.metadata['current-snapshot-id']">
              <v-list-item-title>Current Snapshot ID</v-list-item-title>
              <v-list-item-subtitle class="font-mono">
                {{ table.metadata['current-snapshot-id'] }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-table-cog</v-icon>
            Schema Information
          </v-card-title>
          <v-divider></v-divider>
          <v-list density="compact">
            <v-list-item v-if="table.metadata.schemas && table.metadata.schemas.length > 0">
              <v-list-item-title>Total Schemas</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata.schemas.length }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="currentSchemaInfo">
              <v-list-item-title>Current Schema Fields</v-list-item-title>
              <v-list-item-subtitle>
                {{ currentSchemaInfo?.fields?.length || 0 }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item v-if="table.metadata.snapshots && table.metadata.snapshots.length > 0">
              <v-list-item-title>Total Snapshots</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata.snapshots.length }}
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item
              v-if="
                table.metadata['partition-specs'] && table.metadata['partition-specs'].length > 0
              ">
              <v-list-item-title>Partition Specs</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata['partition-specs'].length }}
              </v-list-item-subtitle>
            </v-list-item>

            <!-- Active Partition Details -->
            <v-list-item v-if="activePartitionSpec">
              <v-list-item-title>Active Partition (spec {{ activePartitionSpec['spec-id'] }})</v-list-item-title>
              <v-list-item-subtitle>
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
              </v-list-item-subtitle>
            </v-list-item>

            <v-list-item
              v-if="table.metadata['sort-orders'] && table.metadata['sort-orders'].length > 0">
              <v-list-item-title>Sort Orders</v-list-item-title>
              <v-list-item-subtitle>
                {{ table.metadata['sort-orders'].length }}
              </v-list-item-subtitle>
            </v-list-item>

            <!-- Active Sort Order Details -->
            <v-list-item v-if="activeSortOrder">
              <v-list-item-title>Active Sort Order (order {{ activeSortOrder['order-id'] }})</v-list-item-title>
              <v-list-item-subtitle>
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
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>

    <!-- Properties Section -->
    <v-row v-if="table.metadata.properties && Object.keys(table.metadata.properties).length > 0">
      <v-col cols="12">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-cog-outline</v-icon>
            Table Properties
          </v-card-title>
          <v-divider></v-divider>
          <v-card-text>
            <v-row>
              <v-col v-for="(value, key) in table.metadata.properties" :key="key" cols="12" md="6">
                <v-list-item class="pa-0">
                  <v-list-item-title class="text-body-2 font-weight-medium">
                    {{ key }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="font-mono text-wrap">
                    {{ value }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Schema Tree View Section -->
    <v-row>
      <v-col cols="12">
        <v-expansion-panels class="mb-4">
          <v-expansion-panel>
            <v-expansion-panel-title>
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-file-tree</v-icon>
                Schema Fields
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-treeview :items="schemaFieldsTransformed" open-on-click>
                <template #prepend="{ item }">
                  <v-icon v-if="item.datatype == 'string'" size="small">mdi-alphabetical</v-icon>
                  <v-icon v-else-if="item.datatype == 'int'" size="small">mdi-numeric</v-icon>
                  <v-icon
                    v-else-if="item.datatype == 'long' || item.datatype == 'double'"
                    size="small">
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
      </v-col>
    </v-row>

    <!-- Current Snapshot Details -->
    <v-row v-if="currentSnapshot">
      <v-col cols="12">
        <TableSnapshotDetails :snapshot="currentSnapshot" title="Current Snapshot Details" />
      </v-col>
    </v-row>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFunctions } from '../plugins/functions';
import TableSnapshotDetails from './TableSnapshotDetails.vue';
import { transformFields } from '../common/schemaUtils';
import type { LoadTableResult, Snapshot, PartitionField, SortField } from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  table: LoadTableResult;
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
      (schemas[i - 1].fields || []).map((f) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`),
    );
    const currFields = new Set(
      (schema.fields || []).map((f) => `${f.name}:${typeof f.type === 'string' ? f.type : 'complex'}`),
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
