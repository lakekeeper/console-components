<template>
  <v-dialog v-model="open" max-width="820" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center" style="gap: 8px">
        <v-icon size="small" color="primary">
          {{ state.isJson ? 'mdi-code-json' : 'mdi-text-long' }}
        </v-icon>
        <span class="text-truncate">{{ state.title }}</span>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-content-copy"
          variant="text"
          size="small"
          title="Copy"
          @click="copy"></v-btn>
        <v-btn icon="mdi-close" variant="text" size="small" @click="open = false"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <vue-json-pretty
          v-if="state.isJson"
          :data="jsonData"
          :deep="3"
          :theme="themeText"
          :show-line-number="true"
          :virtual="false" />
        <pre v-else class="cell-json">{{ state.pretty }}</pre>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import type { CellDialogState } from '@/composables/useCellViewer';

const props = defineProps<{ modelValue: boolean; state: CellDialogState }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const functions = useFunctions();
const visual = useVisualStore();
const themeText = computed(() => (visual.themeLight ? 'light' : 'dark'));
// vue-json-pretty's data prop is loosely typed; the parsed value is arbitrary JSON.
const jsonData = computed<any>(() => props.state.data);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

function copy(): void {
  functions.copyToClipboard(props.state.pretty);
}
</script>

<style scoped>
.cell-json {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Roboto Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.4;
  margin: 0;
}
</style>
