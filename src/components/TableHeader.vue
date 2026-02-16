<template>
  <v-toolbar color="transparent" density="compact" flat>
    <v-toolbar-title>
      <span class="text-subtitle-1">
        {{ namespacePath.split(String.fromCharCode(0x1f)).join('.') }}
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
      <v-icon>mdi-table</v-icon>
    </template>
    <v-spacer></v-spacer>
  </v-toolbar>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useVisualStore } from '@/stores/visual';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const visual = useVisualStore();

const isNavigationCollapsed = computed({
  get: () => visual.isNavigationCollapsed,
  set: (value: boolean) => {
    visual.isNavigationCollapsed = value;
  },
});

const namespacePath = computed(
  () => `${props.namespaceId}${String.fromCharCode(0x1f)}${props.tableName}`,
);

function toggleNavigation() {
  isNavigationCollapsed.value = !isNavigationCollapsed.value;
}
</script>
