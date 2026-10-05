<template>
  <!-- The add half of an inline tag row: a chip-sized control at the end of the
       chips, opening the picker in place. The menu survives a click so several
       tags can go on in one visit; Done or a click outside closes it. -->
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <slot v-if="$slots.activator" name="activator" :props="menuProps"></slot>
      <v-btn
        v-else-if="compact"
        v-bind="menuProps"
        icon="mdi-plus"
        size="x-small"
        variant="text"
        color="secondary"
        class="tag-add tag-add--compact"
        :aria-label="label"
        :title="label"></v-btn>
      <v-btn
        v-else-if="button"
        v-bind="menuProps"
        size="small"
        variant="text"
        color="secondary"
        prepend-icon="mdi-plus"
        class="tag-add">
        Add
      </v-btn>
      <v-chip
        v-else
        v-bind="menuProps"
        size="small"
        variant="outlined"
        prepend-icon="mdi-plus"
        class="tag-add">
        Add tag
      </v-chip>
    </template>

    <v-card width="420">
      <div v-if="target" class="text-caption text-medium-emphasis px-3 pt-3">
        Tags for
        <strong>{{ target }}</strong>
      </div>
      <!-- Refusals are answered here, where the reader is looking, rather
           than in a snackbar at the edge of the screen. -->
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="compact"
        class="mx-3 mt-3 text-body-2">
        {{ error }}
      </v-alert>
      <div v-if="definitionsError" class="text-body-2 text-medium-emphasis pa-3">
        {{ definitionsError }}
      </div>
      <template v-else>
        <v-progress-linear v-if="pending" indeterminate color="primary"></v-progress-linear>
        <div
          v-if="!pending && !permitted.length && candidates.length && !assignedDefs.length"
          class="text-body-2 text-medium-emphasis pa-3">
          None of the {{ candidates.length }} tags that fit here are ones you are allowed to apply.
        </div>
        <TagPickerList
          v-else
          :definitions="listed"
          :assigned-names="assignedNames"
          lock-assigned
          :busy="busy"
          @apply="(name, value) => emit('apply', name, value)"
          @close="open = false" />
        <div v-if="pending" class="text-caption text-medium-emphasis px-3 pb-2">
          Checking which tags you may apply…
        </div>
      </template>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import TagPickerList from './TagPickerList.vue';
import type { TagDefinition } from '../gen/management/types.gen';

const props = defineProps<{
  // Definitions that apply to the target's scope.
  definitions: TagDefinition[];
  // Already on the target directly: listed, ticked and locked, so a search
  // for one finds it rather than reporting no match.
  assignedNames?: string[];
  busy?: string | null;
  // Names the target in the menu, where the row it came from is out of sight.
  target?: string;
  // A bare plus for table rows, where a labelled chip per row is noise.
  compact?: boolean;
  // A text button, for a section heading row.
  button?: boolean;
  // Whether the reader may apply this definition: undefined while unknown.
  // Only what is allowed is offered — a picker must not produce a refusal.
  canApply?: (definitionId: string) => boolean | undefined;
  // The last write refused, said in place.
  error?: string | null;
  // The definitions could not be listed at all.
  definitionsError?: string | null;
}>();

const emit = defineEmits<{
  (e: 'apply', tagName: string, value?: string | null): void;
  // Opening is when the rights of every candidate are worth asking for.
  (e: 'open', definitionIds: string[]): void;
}>();

const open = ref(false);
const label = computed(() => (props.target ? `Add tag to ${props.target}` : 'Add tag'));
const candidates = computed(() => {
  const assigned = new Set(props.assignedNames ?? []);
  return props.definitions.filter((d) => !assigned.has(d.name));
});
const permitted = computed(() =>
  props.canApply
    ? candidates.value.filter((d) => props.canApply!(d.id) === true)
    : candidates.value,
);
const assignedDefs = computed(() => {
  const assigned = new Set(props.assignedNames ?? []);
  return props.definitions.filter((d) => assigned.has(d.name));
});
const listed = computed(() => [...permitted.value, ...assignedDefs.value]);
const pending = computed(
  () => !!props.canApply && candidates.value.some((d) => props.canApply!(d.id) === undefined),
);

watch(open, (isOpen) => {
  if (isOpen)
    emit(
      'open',
      candidates.value.map((d) => d.id),
    );
});
// Definitions can arrive after the menu is already open.
watch(
  () => candidates.value.length,
  () => {
    if (open.value)
      emit(
        'open',
        candidates.value.map((d) => d.id),
      );
  },
);
</script>

<style scoped>
.v-chip.tag-add {
  border-style: dashed;
}
</style>
