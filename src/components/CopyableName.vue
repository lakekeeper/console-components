<template>
  <v-tooltip :text="copied ? 'Copied' : 'Copy name'" location="top">
    <template #activator="{ props: tooltipProps }">
      <button
        v-bind="tooltipProps"
        type="button"
        class="copyable-name"
        :aria-label="`Copy name ${props.name}`"
        @click="copy">
        <span class="copyable-name__text">{{ props.name }}</span>
        <v-icon
          class="copyable-name__icon"
          size="x-small"
          :color="copied ? 'success' : undefined"
          :icon="copied ? 'mdi-check' : 'mdi-content-copy'"></v-icon>
      </button>
    </template>
  </v-tooltip>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue';
import { useFunctions } from '@/plugins/functions';

// The name a type-to-confirm dialog asks for, copyable with one click so the user
// does not have to drag-select it. It only copies: filling the confirmation field
// for them would defeat the check.
const props = defineProps<{
  name: string;
}>();

const functions = useFunctions();

const copied = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function copy() {
  functions.copyToClipboard(props.name);
  copied.value = true;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    copied.value = false;
  }, 1500);
}

onBeforeUnmount(() => clearTimeout(resetTimer));
</script>

<style scoped>
.copyable-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  vertical-align: baseline;
  cursor: pointer;
}
.copyable-name:hover {
  background: rgba(var(--v-theme-on-surface), 0.14);
}
.copyable-name:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
.copyable-name__text {
  overflow-wrap: anywhere;
}
.copyable-name__icon {
  flex: none;
  opacity: 0.7;
}
</style>
