<template>
  <!-- What a Grants tab shows: this entity's own grants, because that is the
       question being asked nine times in ten. Grants do not inherit, so the
       levels above are a separate view rather than extra rows here — reachable,
       but not in the way. -->
  <div class="d-flex flex-column" style="height: calc(100vh - 260px); min-height: 380px">
    <div class="d-flex align-center flex-wrap ga-2 px-4 pt-3">
      <v-spacer></v-spacer>
      <!-- "Who can touch this table" is not answered by this pane alone: a
           grant on the warehouse or namespace is held there and listed there.
           The rail is how that question gets answered. -->
      <GrantsDialog
        :resource="resource"
        :entity-name="entityName"
        :warehouse-name="warehouseName"
        :namespace-path="namespacePath"
        @saved="emit('saved')">
        <template #activator="{ props: aProps }">
          <v-btn
            v-bind="aProps"
            size="small"
            variant="outlined"
            prepend-icon="mdi-file-tree-outline">
            All levels
          </v-btn>
        </template>
      </GrantsDialog>
    </div>

    <div class="px-4 pb-3" style="flex: 1 1 auto; min-height: 0">
      <GrantsPanel :resource="resource" @saved="emit('saved')" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import GrantsPanel from './GrantsPanel.vue';
import GrantsDialog from './GrantsDialog.vue';
import type { GrantResourceRef } from '../common/interfaces';

defineProps<{
  /** The entity whose own grants this tab reads and writes. */
  resource: GrantResourceRef;
  /** Display name, used by the all-levels dialog. */
  entityName: string;
  /** Warehouse display name, when the hierarchy passes through one. */
  warehouseName?: string;
  /** Unit-separated namespace path, used to build the namespace levels. */
  namespacePath?: string;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();
</script>
