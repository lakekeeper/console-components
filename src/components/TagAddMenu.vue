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
      <!-- The whole list at once. Rights are asked only for the rows on
           screen and for a row that is clicked before its answer is in, so
           opening this costs a handful of requests rather than one per tag. -->
      <TagPickerList
        v-else
        :definitions="definitions"
        :assigned-names="assignedNames"
        lock-assigned
        :busy="busy"
        :can-apply="canApply"
        :check-rights="checkRights"
        @apply="(name, value) => emit('apply', name, value)"
        @close="open = false" />
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
  // Refused ones are listed greyed with the reason, never offered for a write.
  canApply?: (definitionId: string) => boolean | undefined;
  // Asks for the rights of the given definitions; see TagPickerList.
  checkRights?: (definitionIds: string[]) => Promise<unknown>;
  // The last write refused, said in place.
  error?: string | null;
  // The definitions could not be listed at all.
  definitionsError?: string | null;
}>();

const emit = defineEmits<{
  (e: 'apply', tagName: string, value?: string | null): void;
  // A fresh visit: the host clears a refusal left from the last one.
  (e: 'open'): void;
}>();

const open = ref(false);
const label = computed(() => (props.target ? `Add tag to ${props.target}` : 'Add tag'));

watch(open, (isOpen) => {
  if (isOpen) emit('open');
});
</script>
<style scoped>
.v-chip.tag-add {
  border-style: dashed;
}
</style>
