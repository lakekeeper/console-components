<template>
  <!-- The fullscreen form of the hierarchy panel, kept for callers that open
       it as a detour rather than showing it as a scope of their own. The
       console's own panes use `GrantsReviewPanel` directly — a view of the
       entity you are already looking at reads better in the page than over
       it — so this is the compatibility wrapper, not the primary shape.

       The panel is mounted only while the dialog is open: building the chain
       is one listing per level, and an activator nobody clicked should not pay
       for them. -->
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-file-tree-outline</v-icon>
          Grant hierarchy
          <span class="font-weight-medium">— {{ entityName }}</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
      </v-toolbar>
      <v-divider></v-divider>

      <div style="flex: 1 1 auto; min-height: 0; overflow: hidden">
        <GrantsReviewPanel
          v-if="dialogOpen"
          :resource="resource"
          :entity-name="entityName"
          :warehouse-name="warehouseName"
          :namespace-path="namespacePath"
          @saved="emit('saved')" />
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">
          Each level saves on its own — grants are held where they are listed.
        </span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import GrantsReviewPanel from './GrantsReviewPanel.vue';
import type { GrantResourceRef } from '../common/interfaces';

defineProps<{
  /** The entity the caller opened this from — the deepest level in the rail. */
  resource: GrantResourceRef;
  /** Display name for the toolbar and the leaf rail entry. */
  entityName: string;
  /** Warehouse display name, when the chain passes through one. */
  warehouseName?: string;
  /**
   * Unit-separated namespace path of the entity, used to build the namespace
   * levels. For a namespace this is its own path; for a table or view it is
   * the containing one.
   */
  namespacePath?: string;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();

const dialogOpen = ref(false);

defineExpose({ open: () => (dialogOpen.value = true) });
</script>
