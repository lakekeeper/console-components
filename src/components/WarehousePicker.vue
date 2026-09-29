<template>
  <!-- A select with its search pinned above the options, rather than an
       autocomplete: an autocomplete looks exactly like a select, so nothing on
       screen tells a reader they may type, and past a couple of hundred
       warehouses that leaves them scrolling. The count sits under the field so
       it is clear why a search is there at all. -->
  <v-select
    :model-value="modelValue"
    :items="visibleItems"
    :loading="loading"
    :label="label"
    :clearable="clearable"
    density="compact"
    variant="outlined"
    hide-details
    :menu-props="{ maxHeight: 360 }"
    no-data-text="No warehouses match"
    prepend-inner-icon="mdi-database"
    @update:model-value="$emit('update:modelValue', $event)"
    @update:menu="onMenu">
    <template #prepend-item>
      <!-- .stop on the key and click handlers keeps the select's own type-ahead
           and its space-closes-the-menu binding off this field. -->
      <div class="px-3 pt-2 pb-1" @click.stop>
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          clearable
          placeholder="Search warehouses…"
          prepend-inner-icon="mdi-magnify"
          @keydown.stop></v-text-field>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ warehouses.length }} warehouse{{ warehouses.length === 1 ? '' : 's' }}
        </div>
      </div>
      <v-divider class="mb-1" />
    </template>
  </v-select>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  // null means the entry named by `allLabel` — every warehouse.
  modelValue: string | null;
  warehouses: Array<{ id: string; name: string }>;
  loading?: boolean;
  label?: string;
  allLabel?: string;
  /**
   * Offer a clear affordance as well as the `allLabel` entry. Worth it where the
   * picker narrows something already on screen — clearing is then a step back
   * from a filter, and hunting for "All warehouses" in the menu to undo one click
   * is a poor trade. Off by default: where the pick is a plain choice, an X that
   * silently means "all" reads as a way to make the field empty.
   */
  clearable?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const search = ref('');

const items = computed(() => [
  { title: props.allLabel ?? 'All warehouses', value: null as string | null },
  ...props.warehouses.map((w) => ({ title: w.name, value: w.id as string | null })),
]);

const visibleItems = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((i) => i.title.toLowerCase().includes(q));
});

function onMenu(open: boolean) {
  if (!open) search.value = '';
}
</script>
