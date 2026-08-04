<template>
  <v-card-text>
    <div class="section-head">
      <v-icon size="18" class="mr-2" color="primary">mdi-information-outline</v-icon>
      Identity
    </div>
    <v-sheet rounded="lg" border class="mb-6">
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
    </v-sheet>

    <div class="section-head">
      <v-icon size="18" class="mr-2" color="primary">mdi-tag-multiple-outline</v-icon>
      Governance
    </div>
    <v-sheet rounded="lg" border class="mb-6 pa-3">
      <div class="text-caption text-medium-emphasis mb-1">Tags</div>
      <EntityTagsChips
        v-if="namespaceId"
        scope="namespace"
        :warehouse-id="warehouseId"
        :entity-id="namespaceId"
        effective />
      <span v-else class="text-disabled">—</span>
    </v-sheet>

    <div class="section-head">
      <v-icon size="18" class="mr-2" color="primary">mdi-cog-outline</v-icon>
      Properties
      <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyItems.length }}</v-chip>
    </div>
    <v-sheet rounded="lg" border>
      <v-table v-if="propertyItems.length" density="compact">
        <tbody>
          <tr v-for="p in propertyItems" :key="p.key">
            <td class="text-medium-emphasis" style="width: 200px">{{ p.key }}</td>
            <td class="font-mono text-wrap">{{ p.value }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-else class="text-medium-emphasis pa-3">No properties set</div>
    </v-sheet>
  </v-card-text>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import EntityTagsChips from './EntityTagsChips.vue';

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
    const meta: any = await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    );
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
.section-head {
  display: flex;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}
</style>
