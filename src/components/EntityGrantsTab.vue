<template>
  <!-- What a Grants tab shows: this entity's own grants first, because that is
       the question being asked nine times in ten — and, in the same table and
       one click away in its tree, the levels above and whatever is held inside.

       `height: 100%` first, so where the host already bounds this tab — the
       warehouse page does, through its window items — the pane fills exactly
       that and nothing scrolls twice. The viewport cap is the fallback for a
       host that does not: there `height: 100%` resolves to auto, the cap stops
       the pane growing past the window, and the regions inside it scroll on
       their own. A fixed viewport height did both jobs badly, overshooting the
       bounded host by whatever its own chrome took and leaving two scrollbars
       down the right-hand side. -->
  <div
    class="d-flex flex-column"
    style="height: 100%; max-height: calc(100vh - 230px); min-height: 380px">
    <div class="px-4 py-3" style="flex: 1 1 auto; min-height: 0; overflow: hidden">
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
