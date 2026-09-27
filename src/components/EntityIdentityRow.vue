<template>
  <!-- The row that names the thing the page is about. Every entity page opens
       with this one component so a warehouse, a namespace and a table are
       recognisably the same kind of screen: glyph, path, name, then the facts
       that identify it, then the actions that address it. -->
  <div
    class="d-flex flex-wrap align-center ga-2 py-2 pl-1 pr-2 lk-identity"
    style="flex: 0 0 auto; min-width: 0">
    <v-btn
      v-if="collapsible"
      :icon="isNavigationCollapsed ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left'"
      size="small"
      variant="text"
      density="comfortable"
      :title="isNavigationCollapsed ? 'Show navigation tree' : 'Hide navigation tree'"
      @click="isNavigationCollapsed = !isNavigationCollapsed"></v-btn>

    <!-- The glyph sits on a tinted tile rather than loose in the text: it is
         what the eye lands on first when the page changes, and a bare icon
         beside a bare string reads as a line of prose. -->
    <span class="lk-identity__glyph d-inline-flex align-center justify-center">
      <slot name="icon">
        <v-icon :color="iconColor" size="20">{{ icon }}</v-icon>
      </slot>
    </span>

    <span class="d-flex align-baseline ga-0 lk-identity__name" :title="fullName">
      <!-- The parents stay, de-emphasised: where a table lives is part of its
           name, but the leaf is what the reader came for. -->
      <span v-if="parentPath" class="text-body-2 text-medium-emphasis">{{ parentPath }}.</span>
      <span class="text-subtitle-1 font-weight-medium">{{ name }}</span>
    </span>

    <v-chip
      v-for="(chip, i) in chips"
      :key="`chip-${i}`"
      size="x-small"
      label
      :color="chip.color"
      :variant="chip.variant ?? 'tonal'"
      :prepend-icon="chip.icon">
      {{ chip.text }}
      <v-tooltip v-if="chip.tooltip" activator="parent" location="bottom">
        {{ chip.tooltip }}
      </v-tooltip>
    </v-chip>

    <!-- The id is the one fact that disambiguates two things with the same
         name, and the one nobody can retype from a screenshot — so it is on
         the row, and one click copies it. -->
    <v-chip
      v-if="id"
      size="x-small"
      label
      variant="tonal"
      class="text-caption lk-identity__id"
      @click="copyId">
      {{ id }}
      <v-icon size="12" class="ml-1 lk-identity__copy">mdi-content-copy</v-icon>
      <v-tooltip activator="parent" location="bottom">{{ idLabel }} — click to copy</v-tooltip>
    </v-chip>

    <slot name="chips"></slot>

    <v-spacer></v-spacer>

    <slot name="actions"></slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVisualStore } from '@/stores/visual';
import { useFunctions } from '@/plugins/functions';
import type { IdentityChip } from '@/common/interfaces';

const props = withDefaults(
  defineProps<{
    /** Glyph for the entity type. Ignored when the `icon` slot is filled. */
    icon?: string;
    iconColor?: string;
    /** Dotted path of the parents, without the leaf. */
    parentPath?: string;
    name: string;
    /** UUID of the entity, rendered as a copyable chip when present. */
    id?: string;
    idLabel?: string;
    /** Status facts: protection, activation, format — never actions. */
    chips?: IdentityChip[];
    /** Show the navigation-tree fold control at the head of the row. */
    collapsible?: boolean;
  }>(),
  {
    icon: 'mdi-shape-outline',
    iconColor: 'secondary',
    parentPath: '',
    id: '',
    idLabel: 'ID',
    chips: () => [],
    collapsible: false,
  },
);

const visual = useVisualStore();
const functions = useFunctions();

const isNavigationCollapsed = computed({
  get: () => visual.isNavigationCollapsed,
  set: (value: boolean) => {
    visual.isNavigationCollapsed = value;
  },
});

const fullName = computed(() =>
  props.parentPath ? `${props.parentPath}.${props.name}` : props.name,
);

function copyId() {
  if (props.id) functions.copyToClipboard(props.id);
}
</script>

<style scoped>
.lk-identity__glyph {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(var(--v-theme-secondary), 0.12);
  flex: 0 0 auto;
}

/* The name may be long; it wraps with the row rather than pushing the chips
   and the actions off the right edge. */
.lk-identity__name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.lk-identity__id {
  cursor: pointer;
  font-family: 'Roboto Mono', 'SFMono-Regular', Menlo, monospace;
}

.lk-identity__copy {
  opacity: 0.5;
}

.lk-identity__id:hover .lk-identity__copy {
  opacity: 1;
}
</style>
