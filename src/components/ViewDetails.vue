<template>
  <v-card-text>
    <!-- Row 1: View Information + View Properties -->
    <v-row>
      <v-col cols>
        <v-card variant="outlined" elevation="1" class="mb-4">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="primary">mdi-information-outline</v-icon>
              View Information
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip
              v-if="view.metadata['format-version']"
              size="small"
              color="primary"
              variant="outlined"
              class="mr-2">
              v{{ view.metadata['format-version'] }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact" fixed-header height="288px">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 200px">View UUID</td>
                <td>
                  <span class="font-mono">{{ view.metadata['view-uuid'] }}</span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(view.metadata['view-uuid'])"></v-btn>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Format Version</td>
                <td>{{ view.metadata['format-version'] }}</td>
              </tr>
              <tr v-if="view.metadata.location">
                <td class="font-weight-medium">Data Location</td>
                <td>
                  <v-tooltip location="bottom" :text="view.metadata.location">
                    <template #activator="{ props: tipProps }">
                      <span v-bind="tipProps" class="font-mono text-wrap" style="cursor: help">
                        {{ truncatePath(view.metadata.location) }}
                      </span>
                    </template>
                  </v-tooltip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(view.metadata.location)"></v-btn>
                </td>
              </tr>
              <tr v-if="view['metadata-location']">
                <td class="font-weight-medium">Metadata Location</td>
                <td>
                  <v-tooltip location="bottom" :text="view['metadata-location']">
                    <template #activator="{ props: tipProps }">
                      <span v-bind="tipProps" class="font-mono text-wrap" style="cursor: help">
                        {{ truncatePath(view['metadata-location']) }}
                      </span>
                    </template>
                  </v-tooltip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(view['metadata-location'])"></v-btn>
                </td>
              </tr>
              <tr v-if="view.metadata['current-version-id']">
                <td class="font-weight-medium">Current Version ID</td>
                <td class="font-mono">{{ view.metadata['current-version-id'] }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
      <v-col cols>
        <v-card
          v-if="view.metadata.properties && Object.keys(view.metadata.properties).length > 0"
          variant="outlined"
          elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2">mdi-cog-outline</v-icon>
              View Properties
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" variant="outlined" class="mr-2">
              {{ Object.keys(view.metadata.properties).length }}
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

    <!-- Row 2: Statistics + Current Version Details -->
    <v-row class="mb-4">
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
              <tr v-if="view.metadata.schemas">
                <td class="font-weight-medium" style="width: 140px">Schemas</td>
                <td>{{ view.metadata.schemas.length }}</td>
              </tr>
              <tr v-if="currentSchemaInfo">
                <td class="font-weight-medium">Fields</td>
                <td>{{ currentSchemaInfo.fields?.length || 0 }}</td>
              </tr>
              <tr v-if="view.metadata.versions">
                <td class="font-weight-medium">Versions</td>
                <td>{{ view.metadata.versions.length }}</td>
              </tr>
              <tr v-if="currentViewVersion">
                <td class="font-weight-medium">Current Schema ID</td>
                <td>{{ currentViewVersion['schema-id'] }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-card v-if="currentViewVersion" variant="outlined" class="fill-height" elevation="1">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="warning">mdi-eye-outline</v-icon>
              Current Version
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" variant="outlined" class="mr-2">
              v{{ currentViewVersion['version-id'] }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 140px">Version ID</td>
                <td>
                  <span class="font-mono">{{ currentViewVersion['version-id'] }}</span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(String(currentViewVersion['version-id']))"></v-btn>
                </td>
              </tr>
              <tr v-if="currentViewVersion['timestamp-ms']">
                <td class="font-weight-medium">Created</td>
                <td>{{ formatTimestamp(currentViewVersion['timestamp-ms']) }}</td>
              </tr>
              <tr
                v-if="currentViewVersion.representations && currentViewVersion.representations[0]">
                <td class="font-weight-medium">SQL Query</td>
                <td>
                  <span class="font-mono text-wrap">
                    {{ currentViewVersion.representations[0].sql }}
                  </span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(currentViewVersion.representations[0].sql)"></v-btn>
                </td>
              </tr>
              <tr
                v-if="
                  currentViewVersion.representations &&
                  currentViewVersion.representations[0]?.dialect
                ">
                <td class="font-weight-medium">SQL Dialect</td>
                <td>{{ currentViewVersion.representations[0].dialect }}</td>
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
                <td class="font-mono">
                  {{ currentViewVersion['default-namespace'].join('.') }}
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Version summary as chips -->
          <template v-if="currentViewVersion.summary">
            <v-divider></v-divider>
            <v-card-text class="pt-2 pb-2">
              <v-chip
                v-for="(value, key) in currentViewVersion.summary"
                :key="key"
                size="small"
                variant="outlined"
                class="mr-1 mb-1">
                {{ key }}: {{ value }}
              </v-chip>
            </v-card-text>
          </template>
        </v-card>
      </v-col>
    </v-row>

    <!-- Schema Fields -->
    <v-expansion-panels class="mb-4">
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
    </v-expansion-panels>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFunctions } from '../plugins/functions';
import { transformFields } from '../common/schemaUtils';
import type { LoadViewResult } from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  view: LoadViewResult;
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

const formatTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  return date.toLocaleString();
};

// Properties as data-table items
const propertyHeaders = [
  { title: 'Property', key: 'key', width: '300px' },
  { title: 'Value', key: 'value' },
];

const propertyItems = computed(() => {
  const p = props.view.metadata.properties;
  if (!p) return [];
  return Object.entries(p).map(([key, value]) => ({ key, value }));
});

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
