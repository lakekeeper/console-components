<template>
  <!-- Same shape as the warehouse settings modal: fixed toolbar and action row,
       one bounded region between them that scrolls for itself. -->
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
          <span v-if="entityName" class="font-weight-medium">— {{ entityName }}</span>
          <span v-else class="text-medium-emphasis">— {{ scope }}</span>
        </v-toolbar-title>
      </v-toolbar>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <EntityTagsManagePanel
          v-if="dialogOpen"
          class="flex-grow-1"
          style="min-width: 0"
          :scope="scope"
          :warehouse-id="warehouseId"
          :entity-id="entityId"
          height="100%"
          hide-title />
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <!-- Every change is written as it is clicked, so there is nothing to save. -->
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
import { TagScope } from '../gen/management/types.gen';

defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  // Shown in the toolbar when the caller knows it; the ids alone say nothing.
  entityName?: string;
}>();

const dialogOpen = ref(false);
</script>
