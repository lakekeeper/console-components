<template>
  <div>
    <v-card flat class="mx-4 mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis">Format</div>
            <v-chip v-if="table?.format" size="small" variant="tonal" color="orange">
              {{ table.format }}
            </v-chip>
            <span v-else class="text-disabled">—</span>
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis">Base Location</div>
            <code class="text-body-2">{{ table?.['base-location'] || '—' }}</code>
          </v-col>
          <v-col v-if="table?.doc" cols="12">
            <div class="text-caption text-medium-emphasis">Description</div>
            <div class="text-body-2">{{ table.doc }}</div>
          </v-col>
          <v-col v-if="hasProperties" cols="12">
            <div class="text-caption text-medium-emphasis mb-2">Properties</div>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(value, key) in table?.properties" :key="key">
                  <td>{{ key }}</td>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-col>

          <!-- Storage Stats -->
          <v-col cols="12">
            <div class="text-caption text-medium-emphasis mb-1">Storage Stats</div>
            <div class="d-flex align-center flex-wrap" style="gap: 8px">
              <template v-if="stats">
                <v-chip size="small" variant="tonal" color="primary" prepend-icon="mdi-file-outline">
                  {{ stats.fileCount }} file{{ stats.fileCount === 1 ? '' : 's' }}
                </v-chip>
                <v-chip
                  size="small"
                  variant="tonal"
                  color="secondary"
                  prepend-icon="mdi-database-outline">
                  {{ formatBytes(stats.totalBytes) }}
                </v-chip>
              </template>
              <v-btn
                size="small"
                variant="text"
                :loading="statsLoading"
                :prepend-icon="stats ? 'mdi-refresh' : 'mdi-calculator-variant-outline'"
                @click="calculateStats">
                {{ stats ? 'Refresh' : 'Calculate' }}
              </v-btn>
              <span v-if="statsError" class="text-caption text-error">{{ statsError }}</span>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useStorageExplorer, type StorageLoadResult } from '@/composables/useStorageExplorer';
import { useVisualStore } from '@/stores/visual';
import type { GenericTableData } from '@/gen/generic-table/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  entityLabel?: string;
}>();

const functions = useFunctions();
const explorer = useStorageExplorer();
const visual = useVisualStore();
const table = reactive<Partial<GenericTableData>>({});
const storageRes = ref<StorageLoadResult | null>(null);

const hasProperties = computed(() => table.properties && Object.keys(table.properties).length > 0);

// Storage stats
const stats = ref<{ fileCount: number; totalBytes: number } | null>(null);
const statsLoading = ref(false);
const statsError = ref<string | null>(null);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  for (const key of Object.keys(table)) delete (table as Record<string, unknown>)[key];
  stats.value = visual.getDatasetStats(props.warehouseId, props.namespaceId, props.tableName);
  statsError.value = null;
  try {
    const response = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
    );
    Object.assign(table, response.table);
    storageRes.value = {
      location: (response.table as any)?.['base-location'] || '',
      config: (response as any)?.config,
      'storage-credentials': (response as any)?.['storage-credentials'],
    };
  } catch (error) {
    functions.handleError(error, 'loading generic table data', true);
  }
}

async function collectStats(prefix: string): Promise<{ fileCount: number; totalBytes: number }> {
  const entries = await explorer.listPrefix(storageRes.value!, prefix);
  let fileCount = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.name === '.keep') continue;
    if (entry.isFolder) {
      const sub = await collectStats(entry.path);
      fileCount += sub.fileCount;
      totalBytes += sub.totalBytes;
    } else {
      fileCount++;
      totalBytes += entry.size ?? 0;
    }
  }
  return { fileCount, totalBytes };
}

async function calculateStats() {
  if (!storageRes.value?.location) {
    statsError.value = 'No storage location available.';
    return;
  }
  statsLoading.value = true;
  statsError.value = null;
  try {
    const rootPrefix = explorer.rootPrefix(storageRes.value.location);
    const result = await collectStats(rootPrefix);
    stats.value = result;
    visual.setDatasetStats(props.warehouseId, props.namespaceId, props.tableName, result);
  } catch (e: any) {
    statsError.value = e?.message || 'Failed to compute stats';
  } finally {
    statsLoading.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

defineExpose({
  loadTableData,
});
</script>
