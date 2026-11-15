<template>
  <div class="history-rail" :class="{ 'history-rail--wide': expanded }">
    <v-tooltip location="right" :text="expanded ? 'Narrow tab history' : 'Widen tab history'">
      <template #activator="{ props: tooltipProps }">
        <button
          v-bind="tooltipProps"
          type="button"
          class="history-rail__head"
          :aria-expanded="expanded"
          aria-label="Tab history"
          @click="emit('update:expanded', !expanded)">
          <v-icon size="18" color="secondary">mdi-history</v-icon>
          <span v-if="expanded" class="text-caption font-weight-medium">This tab</span>
          <span v-if="expanded && entries.length" class="text-caption text-medium-emphasis">
            {{ entries.length }}
          </span>
        </button>
      </template>
    </v-tooltip>

    <div class="history-rail__list">
      <div v-if="!entries.length" class="history-rail__empty text-caption">
        <template v-if="expanded">Runs in this tab show up here.</template>
      </div>

      <button
        v-for="(entry, index) in entries"
        :key="entry.id"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="openId === entry.id"
        class="history-rail__item"
        :class="{
          'history-rail__item--last': index === entries.length - 1,
          'history-rail__item--open': openId === entry.id,
        }"
        :aria-label="`${entry.name ?? 'Run'} ${date(entry.executedAt)}, ${outcome(entry)}`"
        @click="openFor(entry, $event)">
        <span
          class="history-rail__dot"
          :class="entry.error ? 'history-rail__dot--error' : 'history-rail__dot--ok'" />
        <span v-if="expanded" class="history-rail__meta">
          <!-- A named run leads with its name: it is the title, the date is detail. -->
          <span v-if="entry.name" class="history-rail__name">
            <v-icon size="12" class="mr-1">mdi-tag-outline</v-icon>
            {{ entry.name }}
          </span>
          <span class="text-caption">{{ when(entry.executedAt) }}</span>
          <span class="text-caption" :class="entry.error ? 'text-error' : 'text-medium-emphasis'">
            {{ outcome(entry) }}
          </span>
          <span class="history-rail__sql">{{ oneLine(entry.sql) }}</span>
        </span>
      </button>

      <!-- One menu for every run, opened beside the run clicked: a menu per run
           would mount hundreds of components once a tab keeps a long history. -->
      <v-menu
        :model-value="!!openEntry"
        :target="menuTarget"
        location="end top"
        offset="8"
        :close-on-content-click="false"
        @update:model-value="(open) => !open && close()">
        <template v-if="openEntry">
          <!-- Wide enough for the four actions on one row; wraps only on a narrow screen. -->
          <v-card width="640" max-width="calc(100vw - 32px)" class="history-rail__card">
            <v-card-text class="pb-2">
              <!-- A visible, labelled field: the name is editable, and says so. -->
              <div class="d-flex align-center ga-2 mb-3">
                <v-text-field
                  v-model="draftName"
                  label="Name"
                  placeholder="Untitled run"
                  persistent-placeholder
                  prepend-inner-icon="mdi-pencil-outline"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="history-rail__name-field"
                  aria-label="Run name"
                  @keydown.enter.prevent="saveName(openEntry)"
                  @blur="saveName(openEntry)" />
                <v-btn
                  v-if="!confirmingRemove"
                  variant="text"
                  color="error"
                  class="text-none"
                  prepend-icon="mdi-delete-outline"
                  aria-label="Remove from history"
                  @click="confirmingRemove = true">
                  Remove
                </v-btn>
              </div>
              <v-alert
                v-if="confirmingRemove"
                type="error"
                variant="tonal"
                density="compact"
                class="mb-3"
                role="alertdialog"
                aria-label="Remove this run from history?">
                <div class="d-flex align-center flex-wrap ga-2">
                  <span class="flex-grow-1">
                    Remove this run from history? This cannot be undone.
                  </span>
                  <v-btn
                    density="comfortable"
                    variant="text"
                    class="text-none"
                    @click="confirmingRemove = false">
                    Cancel
                  </v-btn>
                  <v-btn
                    density="comfortable"
                    variant="flat"
                    color="error"
                    class="text-none"
                    aria-label="Confirm remove"
                    @click="remove(openEntry)">
                    Remove
                  </v-btn>
                </div>
              </v-alert>
              <div class="d-flex align-center ga-2 text-caption mb-2">
                <v-icon size="14" :color="openEntry.error ? 'error' : 'success'">
                  {{ openEntry.error ? 'mdi-close-circle' : 'mdi-check-circle' }}
                </v-icon>
                <span>{{ date(openEntry.executedAt) }}</span>
                <span class="text-medium-emphasis">
                  · {{ outcome(openEntry) }} · {{ openEntry.durationMs.toFixed(0) }}ms
                </span>
              </div>
              <pre class="history-rail__card-sql" tabindex="0" aria-label="SQL of this run">{{
                openEntry.sql.trim()
              }}</pre>
              <div v-if="openEntry.error" class="text-caption text-error mt-2 history-rail__error">
                {{ firstLine(openEntry.error) }}
              </div>
            </v-card-text>
            <v-card-actions class="flex-wrap ga-1 px-3 pb-3 pt-0">
              <v-btn
                density="comfortable"
                variant="tonal"
                color="primary"
                class="text-none"
                prepend-icon="mdi-file-replace-outline"
                @click="act((e) => emit('replace', e.sql))">
                Replace editor text
              </v-btn>
              <v-btn
                density="comfortable"
                variant="text"
                class="text-none"
                prepend-icon="mdi-tab-plus"
                @click="act((e) => emit('openNewTab', e))">
                Open in new tab
              </v-btn>
              <v-btn
                density="comfortable"
                variant="text"
                class="text-none"
                prepend-icon="mdi-text-box-plus-outline"
                @click="act((e) => emit('insert', e.sql))">
                Insert at cursor
              </v-btn>
              <v-btn
                density="comfortable"
                variant="text"
                class="text-none"
                prepend-icon="mdi-content-copy"
                @click="act((e) => copy(e.sql))">
                Copy
              </v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { LoQEHistoryEntry } from '../composables/loqe/types';

/**
 * One query tab's runs, newest first, as a timeline beside the editor. Narrow
 * it shows a dot per run; wide it adds the date and time, the outcome and the
 * SQL on one line. A run opens a card to put it back in the editor, open
 * it in a new tab, insert it, or copy it, and to name it or remove it; a click
 * on the dot alone changes nothing.
 */
const props = defineProps<{
  entries: LoQEHistoryEntry[];
  expanded: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:expanded', value: boolean): void;
  /** Replace the editor's text with this run's SQL, to adjust before running. */
  (e: 'replace', sql: string): void;
  (e: 'openNewTab', entry: LoQEHistoryEntry): void;
  (e: 'insert', sql: string): void;
  /** Name a run; an empty name clears it. */
  (e: 'rename', id: string, name: string): void;
  (e: 'delete', id: string): void;
}>();

/** The run whose card is open, and the name being typed for it. */
const openId = ref<string | null>(null);
const draftName = ref('');
/** Remove asks once, in place: the first click arms it, the second removes. */
const confirmingRemove = ref(false);

/** The run whose card is open, and the element its card opens beside. */
const openEntry = computed(() => props.entries.find((e) => e.id === openId.value) ?? null);
const menuTarget = ref<Element | undefined>();

function openFor(entry: LoQEHistoryEntry, event: MouseEvent) {
  if (openId.value === entry.id) return close();
  if (openEntry.value) saveName(openEntry.value);
  confirmingRemove.value = false;
  menuTarget.value = event.currentTarget as Element;
  openId.value = entry.id;
  draftName.value = entry.name ?? '';
}

function close() {
  if (openEntry.value) saveName(openEntry.value);
  confirmingRemove.value = false;
  openId.value = null;
}

function saveName(entry: LoQEHistoryEntry) {
  const name = draftName.value.trim();
  if (name !== (entry.name ?? '')) emit('rename', entry.id, name);
}

/** Run an action on the open run, keeping a typed name, then close the card. */
function act(run: (entry: LoQEHistoryEntry) => void) {
  const entry = openEntry.value;
  close();
  if (entry) run(entry);
}

function remove(entry: LoQEHistoryEntry) {
  confirmingRemove.value = false;
  openId.value = null;
  emit('delete', entry.id);
}

const date = (ms: number) =>
  new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const outcome = (entry: LoQEHistoryEntry) =>
  entry.error
    ? 'error'
    : `${entry.rowCount.toLocaleString()} row${entry.rowCount === 1 ? '' : 's'}`;

const firstLine = (text: string) => text.trim().split('\n')[0];

/** The SQL on one line, whitespace collapsed, so a formatted query reads as more than `SELECT`. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Date and time, short: `Nov 13, 08:34 PM`. */
const when = (ms: number) =>
  new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

async function copy(sql: string) {
  try {
    await navigator.clipboard.writeText(sql);
  } catch {
    // Clipboard unavailable (insecure context); nothing else to fall back to here.
  }
}
</script>

<style scoped>
.history-rail {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 32px;
  min-height: 0;
  margin-right: 6px;
  transition: width 0.2s ease;
}
.history-rail--wide {
  width: 250px;
}
@media (prefers-reduced-motion: reduce) {
  .history-rail {
    transition: none;
  }
}
.history-rail__head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 7px;
  border-radius: 6px;
  white-space: nowrap;
  color: inherit;
}
.history-rail__head:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.history-rail__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}
.history-rail__empty {
  padding: 4px 8px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.history-rail__item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 26px;
  padding: 4px 0 4px 11px;
  border-radius: 6px;
  text-align: left;
  color: inherit;
}
.history-rail__item:hover,
.history-rail__item[aria-expanded='true'] {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.history-rail__item:focus {
  outline: none;
}
.history-rail__item:focus-visible,
.history-rail__head:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.5);
  outline-offset: -2px;
}
/* The line joining one run to the next. */
.history-rail__item::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 14px;
  bottom: -14px;
  width: 2px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}
.history-rail__item--last::before {
  display: none;
}
.history-rail__dot {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 1px currentColor;
}
.history-rail__dot--ok {
  color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}
.history-rail__dot--error {
  color: rgb(var(--v-theme-error));
  background: rgb(var(--v-theme-error));
}
.history-rail__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  min-width: 0;
  width: 100%;
  white-space: nowrap;
  padding-right: 6px;
  line-height: 1.4;
}
.history-rail__name {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.history-rail__name-field :deep(input) {
  font-size: 14px;
  font-weight: 600;
}
.history-rail__sql {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.history-rail__card-sql {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  /* The whole statement, scrolling when it is taller than the window allows. */
  max-height: min(320px, 40vh);
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.history-rail__error {
  word-break: break-word;
}
.history-rail__item--open {
  background: rgba(var(--v-theme-primary), 0.08);
}
</style>
