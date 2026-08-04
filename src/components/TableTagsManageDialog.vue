<template>
  <v-dialog v-model="dialogOpen" max-width="1040" scrollable>
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card>
      <v-toolbar color="transparent" density="compact" flat class="pl-4">
        <v-icon class="mr-2">mdi-tag-multiple-outline</v-icon>
        <v-toolbar-title><span class="text-subtitle-1">Manage tags</span></v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="dialogOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="table">Table tags</v-tab>
        <v-tab value="columns">Column tags</v-tab>
      </v-tabs>
      <v-divider></v-divider>

      <v-tabs-window v-if="dialogOpen" v-model="tab">
        <v-tabs-window-item value="table">
          <!-- keyed on the active tab so switching back remounts and reloads state -->
          <EntityTagsManagePanel
            v-if="tab === 'table'"
            scope="table"
            :warehouse-id="warehouseId"
            :entity-id="tableId"
            title="Table tags" />
        </v-tabs-window-item>
        <v-tabs-window-item value="columns">
          <ColumnTagsManagePanel
            v-if="tab === 'columns'"
            :warehouse-id="warehouseId"
            :table-id="tableId"
            :columns="columns" />
        </v-tabs-window-item>
      </v-tabs-window>
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
  columns: string[];
}>();

const dialogOpen = ref(false);
const tab = ref('table');
</script>
