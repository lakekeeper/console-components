<!-- The property editor also renders as a pane inside the table settings modal,
     so the content lives in EntityPropertiesPanel and this is the standalone
     dialog around it. -->
<template>
  <v-dialog v-model="isDialogActive" max-width="800" scrollable>
    <template v-if="!hideActivator" #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon="mdi-pencil-outline"
        size="x-small"
        variant="text"
        color="primary">
        <v-icon></v-icon>
        <v-tooltip activator="parent" location="bottom">Edit Properties</v-tooltip>
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="text-subtitle-1 d-flex align-center py-3">
        <v-icon color="primary" class="mr-2">mdi-text-box-multiple-outline</v-icon>
        {{ entityLabel }} Properties
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="isDialogActive = false"></v-btn>
      </v-card-title>
      <v-divider></v-divider>

      <v-card-text style="max-height: 70vh">
        <EntityPropertiesPanel
          v-if="isDialogActive"
          :entity-type="entityType"
          :warehouse-id="warehouseId"
          :namespace-path="namespacePath"
          :entity-name="entityName"
          :can-edit="canEdit"
          height="auto"
          @updated="emit('updated')"
          @saved="isDialogActive = false" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import EntityPropertiesPanel from './EntityPropertiesPanel.vue';

const props = defineProps<{
  /** 'table' | 'view' | 'namespace' */
  entityType: 'table' | 'view' | 'namespace';
  warehouseId: string;
  namespacePath: string;
  /** Table or view name — required for table/view, omit for namespace */
  entityName?: string;
  /** Kept for call-site compatibility; the panel always reads fresh from the server. */
  properties?: Record<string, string>;
  canEdit?: boolean;
  /** Hide the built-in pencil activator; open programmatically via `open()`. */
  hideActivator?: boolean;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const isDialogActive = ref(false);
defineExpose({ open: () => (isDialogActive.value = true) });

const entityLabel = computed(() => {
  switch (props.entityType) {
    case 'table':
      return 'Table';
    case 'view':
      return 'View';
    case 'namespace':
      return 'Namespace';
    default:
      return 'Entity';
  }
});
</script>
