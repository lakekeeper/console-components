<template>
  <!-- What a Grants tab shows: this entity's own grants, because that is the
       question being asked nine times in ten. Grants do not inherit, so the
       levels above are a separate view rather than extra rows here — reachable
       from the pane's own scope switch, not from a button that leaves the
       page. -->
  <div class="d-flex flex-column" style="height: calc(100vh - 260px); min-height: 380px">
    <div class="px-4 py-3" style="flex: 1 1 auto; min-height: 0">
      <GrantsPanel
        :resource="resource"
        :resource-name="entityName"
        :warehouse-name="warehouseName"
        :namespace-path="namespacePath"
        @saved="emit('saved')">
        <!-- Forwarded so the app can pass an authorizer-specific notice through
             this tab without this component knowing what it says. -->
        <template v-if="$slots.notice" #notice>
          <slot name="notice"></slot>
        </template>
      </GrantsPanel>
    </div>
  </div>
</template>

<script lang="ts" setup>
import GrantsPanel from './GrantsPanel.vue';
import type { GrantResourceRef } from '../common/interfaces';

defineProps<{
  /** The entity whose own grants this tab reads and writes. */
  resource: GrantResourceRef;
  /** Display name, used by the assign dialog and the hierarchy's leaf entry. */
  entityName: string;
  /** Warehouse display name, when the hierarchy passes through one. */
  warehouseName?: string;
  /** Unit-separated namespace path, used to build the namespace levels. */
  namespacePath?: string;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();
</script>
