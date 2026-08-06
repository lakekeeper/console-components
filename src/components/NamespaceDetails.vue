<template>
  <v-card-text class="pa-4">
    <!-- Identity -->
    <v-card variant="outlined" class="mb-6">
      <v-card-title class="bg-surface-light d-flex align-center text-subtitle-1 py-3">
        <v-icon icon="mdi-information-outline" class="mr-2" color="primary"></v-icon>
        Identity
      </v-card-title>
      <v-table density="compact">
        <tbody>
          <tr>
            <td class="text-medium-emphasis" style="width: 200px">Namespace</td>
            <td class="font-mono">{{ displayPath }}</td>
          </tr>
          <tr>
            <td class="text-medium-emphasis">Namespace ID</td>
            <td>
              <div class="d-flex align-center">
                <span class="font-mono">{{ namespaceId || '—' }}</span>
                <v-btn
                  v-if="namespaceId"
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="ml-1"
                  @click="functions.copyToClipboard(namespaceId)"></v-btn>
              </div>
            </td>
          </tr>
          <tr>
            <td class="text-medium-emphasis">Warehouse ID</td>
            <td>
              <div class="d-flex align-center">
                <span class="font-mono">{{ warehouseId }}</span>
                <v-btn
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="ml-1"
                  @click="functions.copyToClipboard(warehouseId)"></v-btn>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Governance -->
    <v-card variant="outlined" class="mb-6">
      <v-card-title class="bg-surface-light d-flex align-center text-subtitle-1 py-3">
        <v-icon icon="mdi-tag-multiple-outline" class="mr-2" color="primary"></v-icon>
        Governance
      </v-card-title>
      <v-card-text>
        <div class="text-overline text-medium-emphasis">Tags</div>
        <div class="mt-2">
          <EntityTagsChips
            v-if="namespaceId"
            scope="namespace"
            :warehouse-id="warehouseId"
            :entity-id="namespaceId"
            effective />
          <span v-else class="text-disabled">—</span>
        </div>
      </v-card-text>
    </v-card>

    <!-- Properties -->
    <v-card variant="outlined" class="mb-6">
      <v-card-title class="bg-surface-light d-flex align-center text-subtitle-1 py-3">
        <v-icon icon="mdi-cog-outline" class="mr-2" color="primary"></v-icon>
        Properties
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyItems.length }}</v-chip>
      </v-card-title>
      <v-table v-if="propertyItems.length" density="compact">
        <tbody>
          <tr v-for="p in propertyItems" :key="p.key">
            <td class="text-medium-emphasis" style="width: 200px">{{ p.key }}</td>
            <td class="font-mono text-wrap">{{ p.value }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-else class="text-medium-emphasis pa-3">No properties set</div>
    </v-card>
  </v-card-text>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import EntityTagsChips from './EntityTagsChips.vue';
import type { GetNamespaceResponse } from '../gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();
const namespaceId = ref('');
const properties = ref<Record<string, string>>({});

// eslint-disable-next-line no-control-regex
const displayPath = computed(() => props.namespacePath.replace(/\x1F/g, '.'));
const propertyItems = computed(() =>
  Object.entries(properties.value)
    .filter(([k]) => k !== 'namespace_id')
    .map(([key, value]) => ({ key, value })),
);

async function load() {
  namespaceId.value = '';
  properties.value = {};
  if (!props.warehouseId || !props.namespacePath) return;
  try {
    const meta = (await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    )) as GetNamespaceResponse;
    properties.value = meta?.properties ?? {};
    namespaceId.value = meta?.properties?.namespace_id || meta?.['namespace-uuid'] || '';
  } catch {
    // handled by functions.handleError
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);
</script>

<style scoped>
.text-wrap {
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
