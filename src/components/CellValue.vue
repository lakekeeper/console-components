<template>
  <span
    v-if="kind === 'object' || kind === 'array'"
    class="cell-token"
    title="Click to view"
    @click="$emit('open')">
    <v-icon size="x-small" class="mr-1">
      {{ kind === 'array' ? 'mdi-code-brackets' : 'mdi-code-json' }}
    </v-icon>
    {{ label }}
    <v-icon size="x-small" class="ml-1">mdi-arrow-expand</v-icon>
  </span>
  <span
    v-else-if="kind === 'long'"
    class="cell-link"
    title="Click to view full value"
    @click="$emit('open')">
    {{ value }}
  </span>
  <span v-else>{{ value }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ value: unknown }>();
defineEmits<{ (e: 'open'): void }>();

const str = computed(() => (props.value == null ? '' : String(props.value)));

const kind = computed<'object' | 'array' | 'long' | 'plain'>(() => {
  const s = str.value.trimStart();
  if (s.startsWith('{')) return 'object';
  if (s.startsWith('[')) return 'array';
  return str.value.length > 60 ? 'long' : 'plain';
});

const label = computed(() => {
  try {
    const parsed = JSON.parse(str.value);
    if (Array.isArray(parsed)) return `Array [${parsed.length}]`;
    if (parsed && typeof parsed === 'object') return `Object {${Object.keys(parsed).length}}`;
  } catch {
    /* not strict JSON — fall back to a generic label */
  }
  return kind.value === 'array' ? 'Array' : 'Object';
});
</script>

<style scoped>
.cell-token {
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.cell-link {
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
</style>
