<!-- Same shape as the warehouse settings modal: fixed toolbar and action row, one
     bounded region between them. Tables carry a second dimension — per-column
     tags — so this one keeps its tabs where the other scopes have none. -->
<template>
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-tag-multiple-outline</v-icon>
          Manage tags
          <span v-if="tableName" class="font-weight-medium">— {{ tableName }}</span>
        </v-toolbar-title>
      </v-toolbar>

      <v-tabs v-model="tab" color="primary" class="flex-shrink-0">
        <v-tab value="table">Table tags</v-tab>
        <v-tab value="columns">Column tags</v-tab>
      </v-tabs>
      <v-divider></v-divider>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <!-- keyed on the active tab so switching back remounts and reloads state -->
        <EntityTagsManagePanel
          v-if="dialogOpen && tab === 'table'"
          class="flex-grow-1"
          style="min-width: 0"
          scope="table"
          :warehouse-id="warehouseId"
          :entity-id="tableId"
          height="100%"
          hide-title />
        <ColumnTagsManagePanel
          v-else-if="dialogOpen"
          class="flex-grow-1"
          style="min-width: 0"
          :warehouse-id="warehouseId"
          :table-id="tableId"
          :columns="columns"
          height="100%" />
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">Changes apply immediately.</span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import EntityTagsManagePanel from './EntityTagsManagePanel.vue';
import ColumnTagsManagePanel from './ColumnTagsManagePanel.vue';

defineProps<{
  warehouseId: string;
  tableId: string;
  // Names alone still work; Iceberg schema fields let the list show types and
  // walk into structs.
  columns: (string | { name: string; type?: any })[];
  // Shown in the toolbar when the caller knows it; the id alone says nothing.
  tableName?: string;
}>();

const dialogOpen = ref(false);
const tab = ref('table');
</script>
