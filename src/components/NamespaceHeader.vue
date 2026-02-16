<template>
  <v-toolbar color="transparent" density="compact" flat>
    <v-toolbar-title>
      <span class="text-subtitle-1">
        {{
          namespacePath.length > 0
            ? namespacePath.split(String.fromCharCode(0x1f)).join('.')
            : namespaceName
        }}
      </span>
    </v-toolbar-title>
    <template #prepend>
      <!-- Collapse/Expand Button -->
      <v-btn
        icon
        size="default"
        variant="tonal"
        color="primary"
        @click="toggleNavigation"
        class="mr-3"
        :title="isNavigationCollapsed ? 'Show navigation tree' : 'Hide navigation tree'">
        <v-icon>
          {{ isNavigationCollapsed ? 'mdi-menu' : 'mdi-menu-open' }}
        </v-icon>
      </v-btn>
      <v-icon>mdi-folder-open</v-icon>
    </template>
    <v-spacer></v-spacer>
  </v-toolbar>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import type { GetNamespaceResponse } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const namespace = ref<GetNamespaceResponse>({ namespace: [] });

const isNavigationCollapsed = computed({
  get: () => visual.isNavigationCollapsed,
  set: (value: boolean) => {
    visual.isNavigationCollapsed = value;
  },
});

function toggleNavigation() {
  isNavigationCollapsed.value = !isNavigationCollapsed.value;
}

const namespaceName = computed(() => {
  const ns = namespace.value.namespace;
  return ns && ns.length > 0 ? ns[ns.length - 1] : '';
});

onMounted(loadNamespaceMetadata);
watch(() => props.namespacePath, loadNamespaceMetadata);

async function loadNamespaceMetadata() {
  try {
    namespace.value = await functions.loadNamespaceMetadata(props.warehouseId, props.namespacePath);
  } catch (error) {
    console.error('Failed to load namespace metadata:', error);
  }
}
</script>
