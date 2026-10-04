<template>
  <!-- Pinned: what you keep coming back to, one click from anywhere in the tree.
       Tinted and closed off by a full divider so it does not read as the top of
       the tree; the header stays put while the list scrolls. -->
  <template v-if="pins.length">
    <v-sheet class="flex-shrink-0 pinned-section d-flex flex-column">
      <!-- Folding keeps the count in view, so pins are not forgotten the way a
           hidden section would be. Remembered across reloads. -->
      <div
        class="pinned-header text-caption text-medium-emphasis px-3 py-1 d-flex align-center"
        role="button"
        :aria-expanded="!collapsed"
        @click="$emit('update:collapsed', !collapsed)">
        <v-icon size="x-small" class="mr-1">mdi-pin-outline</v-icon>
        Pinned
        <span class="ml-1">({{ pins.length }})</span>
        <v-spacer />
        <v-icon size="x-small">{{ collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-list
        v-show="!collapsed"
        density="compact"
        bg-color="transparent"
        class="py-0 px-2"
        style="max-height: 180px; min-height: 0; overflow-y: auto">
        <v-list-item
          v-for="pin in pins"
          :key="pinKey(pin)"
          density="compact"
          @click="$emit('open', pin)"
          @dblclick.stop="canInsert(pin) && $emit('insert', pin)">
          <template #prepend>
            <v-icon v-if="iconOf(pin).src" size="x-small" class="mr-2">
              <v-img :src="iconOf(pin).src" width="16" :height="iconOf(pin).height ? 12 : 16" />
            </v-icon>
            <v-icon v-else size="x-small" class="mr-2" :color="iconOf(pin).color">
              {{ iconOf(pin).icon }}
            </v-icon>
          </template>
          <v-list-item-title style="font-size: 0.8125rem">
            {{ pin.type === 'namespace' ? pin.namespaceId : pin.name }}
          </v-list-item-title>
          <v-list-item-subtitle v-if="pin.type !== 'warehouse'" class="text-caption">
            {{ pin.type === 'namespace' ? nameOf(pin) : `${nameOf(pin)} · ${pin.namespaceId}` }}
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              v-if="canInsert(pin)"
              icon="mdi-arrow-right-bold-box-outline"
              size="x-small"
              variant="text"
              title="Insert path into query"
              @click.stop="$emit('insert', pin)"
              @dblclick.stop></v-btn>
            <v-btn
              icon="mdi-pin-off-outline"
              size="x-small"
              variant="text"
              title="Unpin"
              @click.stop="$emit('unpin', pin)"
              @dblclick.stop></v-btn>
          </template>
        </v-list-item>
      </v-list>
    </v-sheet>
    <v-divider />
  </template>
</template>

<script setup lang="ts">
import { pinKey, type PinnedObject } from '@/composables/usePinnedObjects';
import type { IconSpec } from '@/common/storageIcon';

/**
 * The Pinned section both object trees share. The tree owns what a pin means —
 * which mark it wears, whether it can be inserted, where opening it goes — and
 * this renders the list.
 */
const props = defineProps<{
  pins: PinnedObject[];
  collapsed: boolean;
  /** The pin's mark. A warehouse pin should wear its tree row's provider mark. */
  iconFor: (pin: PinnedObject) => IconSpec;
  /** The warehouse's current name; the pin only holds the one it had when pinned. */
  warehouseNameFor?: (pin: PinnedObject) => string;
  /** Whether the pin offers insert (button and double-click). Off when omitted. */
  insertable?: (pin: PinnedObject) => boolean;
}>();

defineEmits<{
  (e: 'open', pin: PinnedObject): void;
  (e: 'insert', pin: PinnedObject): void;
  (e: 'unpin', pin: PinnedObject): void;
  (e: 'update:collapsed', value: boolean): void;
}>();

function iconOf(pin: PinnedObject): IconSpec {
  return props.iconFor(pin);
}

function nameOf(pin: PinnedObject): string {
  return props.warehouseNameFor?.(pin) ?? pin.warehouseName;
}

function canInsert(pin: PinnedObject): boolean {
  return !!props.insertable?.(pin);
}
</script>

<style scoped>
/* At most a third of the tree's pane: in a short host (a 400px picker dialog)
   a fixed 180px of pins left the tree itself a sliver. The list scrolls past it. */
.pinned-section {
  max-height: 33%;
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.pinned-header {
  cursor: pointer;
  user-select: none;
}
</style>
