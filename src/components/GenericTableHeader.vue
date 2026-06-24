<template>
  <v-toolbar color="transparent" density="compact" flat>
    <v-toolbar-title>
      <span class="text-subtitle-1">
        {{ namespacePath.split(String.fromCharCode(0x1f)).join('.') }}
      </span>
    </v-toolbar-title>
    <template #prepend>
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
      <v-icon>mdi-table-multiple</v-icon>
    </template>
    <v-spacer></v-spacer>

    <GenericTableActionsMenu
      :warehouse-id="warehouseId"
      :namespace-id="namespaceId"
      :table-name="tableName"
      :entity-label="entityLabel"
      @updated="$emit('updated')" />
  </v-toolbar>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVisualStore } from '@/stores/visual';
import GenericTableActionsMenu from './GenericTableActionsMenu.vue';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  entityLabel?: string;
}>();

defineEmits<{ (e: 'updated'): void }>();

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
