<template>
  <!-- One applied tag, wherever it is shown. Direct tags are neutral tonal —
       on-surface text on its own tint, readable in either theme and under any
       brand colour, where a light accent (info, a branded primary) washed out
       to near invisible. They can be
       edited where they sit. Inherited ones are deliberately the quietest thing
       on the row — faint outline, small arrow — because nothing can be done
       with them here; they belong to the ancestor that applied them. No tag
       glyph on direct chips: the section around them already says Tags. -->
  <v-menu
    v-model="editOpen"
    :disabled="!canEditValue"
    :close-on-content-click="false"
    location="bottom start">
    <template #activator="{ props: menuProps }">
      <v-chip
        v-bind="canEditValue ? menuProps : {}"
        :size="size ?? 'small'"
        :variant="inherited ? 'outlined' : 'tonal'"
        :disabled="busy"
        class="tag-chip"
        :class="{ 'tag-chip--inherited': inherited, 'tag-chip--confirming': confirmOpen }">
        <v-icon v-if="inherited" size="12" class="mr-1">mdi-arrow-top-left</v-icon>
        <span class="tag-chip__name">{{ tag.name }}</span>
        <span v-if="hasValue && !hideValue" class="tag-chip__value">:&nbsp;{{ shown }}</span>
        <span v-if="inherited && showOrigin" class="ml-1 text-caption font-italic">
          · from {{ tag['inherited-from']!.type }}
        </span>
        <v-tooltip v-if="tooltip" activator="parent" location="top" max-width="500">
          <div style="white-space: pre-wrap; word-break: break-word">{{ tooltip }}</div>
        </v-tooltip>

        <template v-if="removable && !inherited" #append>
          <v-menu v-model="confirmOpen" location="bottom end" :close-on-content-click="false">
            <template #activator="{ props: confirmProps }">
              <v-icon
                v-bind="confirmProps"
                class="tag-chip__remove ml-1"
                size="14"
                :aria-label="`Remove ${tag.name}`"
                @click.stop>
                mdi-close
              </v-icon>
            </template>
            <!-- A tag can be what a policy matches on, so taking one off is
                 asked once — but in place, not in a dialog over the page. -->
            <v-card min-width="240" class="pa-3">
              <div class="text-body-2 mb-3">
                Remove
                <strong>{{ tag.name }}</strong>
                <template v-if="target">
                  from
                  <strong>{{ target }}</strong>
                </template>
                ?
              </div>
              <div class="d-flex justify-end ga-2">
                <v-btn size="small" variant="text" @click="confirmOpen = false">Cancel</v-btn>
                <v-btn size="small" color="error" variant="flat" @click="remove">Remove</v-btn>
              </div>
            </v-card>
          </v-menu>
        </template>
      </v-chip>
    </template>

    <v-card width="420">
      <TagPickerList
        v-if="definition"
        :definitions="[definition]"
        :assigned-names="[tag.name]"
        :current-value="tag.value"
        :auto-expand-id="definition.id"
        :busy="busy ? tag.name : null"
        @apply="onApply"
        @close="editOpen = false" />
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import TagPickerList from './TagPickerList.vue';
import type { TagDefinition, TargetTag } from '../gen/management/types.gen';

const props = defineProps<{
  tag: TargetTag;
  // Needed to edit a value in place: the applied tag does not carry its kind.
  definition?: TagDefinition;
  // Offers the remove (✕).
  removable?: boolean;
  // For valued kinds, a click to change the value. Defaults to `removable`.
  editable?: boolean;
  busy?: boolean;
  // Named in the remove confirmation ("from email"), where it is not obvious.
  target?: string;
  // Values longer than this are cut on the chip and given whole in a tooltip.
  maxValue?: number;
  // "· from warehouse" on the chip itself; off where the row says it already.
  showOrigin?: boolean;
  size?: 'x-small' | 'small' | 'default';
  // The host shows the value beside the chip, in full.
  hideValue?: boolean;
}>();

const emit = defineEmits<{
  (e: 'apply', tagName: string, value?: string | null): void;
  (e: 'remove', tagName: string): void;
}>();

const editOpen = ref(false);
const confirmOpen = ref(false);

const inherited = computed(() => !!props.tag['inherited-from']);
const hasValue = computed(() => props.tag.value !== null && props.tag.value !== undefined);
const limit = computed(() => props.maxValue ?? 40);
const cut = computed(() => hasValue.value && props.tag.value!.length > limit.value);
const shown = computed(() =>
  cut.value ? `${props.tag.value!.slice(0, limit.value)}…` : (props.tag.value ?? ''),
);

const canEditValue = computed(
  () =>
    !!(props.editable ?? props.removable) &&
    !inherited.value &&
    !!props.definition &&
    props.definition['value-kind'] !== 'marker',
);

// The chip already says the name, the value and where an inherited tag came
// from, so a tooltip only earns its place where the chip had to cut something.
const tooltip = computed(() => {
  if (cut.value && !props.hideValue) return props.tag.value;
  if (inherited.value && !props.showOrigin)
    return `Inherited from the ${props.tag['inherited-from']!.type} — change it there.`;
  return '';
});

function onApply(name: string, value?: string | null) {
  emit('apply', name, value);
  editOpen.value = false;
}

function remove() {
  confirmOpen.value = false;
  emit('remove', props.tag.name);
}
</script>

<style scoped>
.tag-chip {
  max-width: 100%;
}
.tag-chip__value {
  opacity: 0.85;
}
.tag-chip--inherited {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  border-color: rgba(var(--v-border-color), 0.24);
}
.tag-chip__remove {
  opacity: 0.6;
  cursor: pointer;
}
.tag-chip__remove:hover {
  opacity: 1;
}
/* Fourteen always-on crosses read as a list of things to delete. The cross
   comes with the chip under the pointer (or keyboard focus); touch screens have
   no hover, so they keep it. */
@media (hover: hover) {
  .tag-chip:not(:hover):not(:focus-within):not(.tag-chip--confirming) .tag-chip__remove {
    opacity: 0;
  }
}
</style>
