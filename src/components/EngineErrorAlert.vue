<template>
  <v-alert
    v-if="error"
    :type="type"
    :variant="variant"
    :density="density"
    :icon="icon"
    :closable="closable"
    @click:close="emit('close')">
    <!-- Who is speaking, before what they said. LoQE runs DuckDB in the browser,
         so a failed scan is DuckDB's verdict on its own configuration; read as
         the catalog's, it sends people to inspect Lakekeeper for a problem that
         is not there. One attribution only — in the title where there is one,
         and on its own line where there is not. -->
    <div v-if="title" class="text-body-1 font-weight-bold mb-1">
      {{ title }}{{ engineMessage ? ' — reported by DuckDB' : '' }}
    </div>
    <div v-else-if="engineMessage" class="text-caption text-medium-emphasis">
      Reported by DuckDB
    </div>

    <pre class="text-body-2 engine-error-text">{{ explanation }}</pre>

    <!-- The engine's own line, kept verbatim: it is what a reader takes to a
         search engine or an issue tracker, and our explanation is a reading of
         it, not a replacement for it. -->
    <pre v-if="engineMessage" class="text-caption text-medium-emphasis engine-error-text mt-2">{{
      engineMessage
    }}</pre>

    <!-- Offered where CORS is a credible cause, which the engine layer has
         already decided — this only reads the verdict rather than guessing at
         the message a second time. -->
    <template v-if="suggestsCors" #append>
      <CorsConfigDialog />
    </template>
  </v-alert>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { splitEngineError } from '@/composables/loqe/queryError';
import CorsConfigDialog from './CorsConfigDialog.vue';

/**
 * One way to report a failed query, wherever LoQE runs one.
 *
 * Every surface that queries goes through `LoQEEngine.query`, which diagnoses the
 * failure once and marks off the engine's own words from ours. Before this, each
 * caller re-read the finished message with its own `includes('CORS')` test and
 * often replaced a precise verdict with a vaguer one — the diagnosis mentions
 * CORS, so a sniff for the word matched it and overwrote it. Reading the marker
 * instead of the prose keeps that from happening again.
 */
const props = withDefaults(
  defineProps<{
    /** The diagnosed message, as thrown by the engine. */
    error: string | null;
    /** Heading. Omitted where the surrounding pane already says what failed. */
    title?: string;
    type?: 'error' | 'warning';
    variant?: 'tonal' | 'flat' | 'elevated' | 'outlined' | 'text' | 'plain';
    density?: 'default' | 'comfortable' | 'compact';
    icon?: string | false;
    closable?: boolean;
  }>(),
  {
    title: undefined,
    type: 'error',
    variant: 'tonal',
    density: 'default',
    icon: undefined,
    closable: false,
  },
);

const emit = defineEmits<{ close: [] }>();

const split = computed(() => splitEngineError(props.error ?? ''));
const explanation = computed(() => split.value.explanation);
const engineMessage = computed(() => split.value.engineMessage);

/**
 * Whether to offer the CORS helper. The explanation is ours and says CORS only
 * when the diagnosis reached that conclusion; the engine's raw line is excluded
 * on purpose, since DuckDB says "might be potentially a CORS error" about every
 * failed download.
 */
const suggestsCors = computed(
  () => /cors/i.test(explanation.value) || /failed to fetch/i.test(explanation.value),
);
</script>

<style scoped>
/* Wraps like prose but keeps the engine's line breaks — these messages carry
   URLs and SQL that must not be reflowed into something unsearchable. */
.engine-error-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  margin: 0;
}
</style>
