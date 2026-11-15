<template>
  <!-- Every run, from every tab, as one table: a folding filter column on the
       left, the runs on the right, and a run's details beside them. -->
  <div class="lqh" @pointerdown="closeOnOutside">
    <!-- ── Filters (folds by width, DESIGN.md "Folding") ── -->
    <div class="lqh-fold" :class="{ 'lqh-fold--out': filters.foldOut }">
      <div class="lqh-filters" :inert="filters.foldOut">
        <div class="d-flex align-center px-3 pt-3 pb-2">
          <v-icon size="small" color="secondary" class="mr-2">mdi-filter-variant</v-icon>
          <span class="text-subtitle-2">Filters</span>
          <v-spacer />
          <v-btn
            v-if="filtersSet"
            size="small"
            variant="text"
            class="text-none"
            @click="clearFilters">
            Clear
          </v-btn>
        </div>
        <div class="px-3 d-flex flex-column ga-3">
          <v-text-field
            v-model="filters.search"
            label="Search name or SQL"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable />
          <v-btn-toggle
            v-model="filters.status"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="lqh-status"
            aria-label="Run status">
            <v-btn value="all" aria-label="All runs">
              <v-icon>mdi-format-list-bulleted</v-icon>
              <v-tooltip activator="parent" location="bottom">All runs</v-tooltip>
            </v-btn>
            <v-btn value="succeeded" aria-label="Succeeded only">
              <v-icon color="success">mdi-check-circle</v-icon>
              <v-tooltip activator="parent" location="bottom">Succeeded only</v-tooltip>
            </v-btn>
            <v-btn value="failed" aria-label="Failed only">
              <v-icon color="error">mdi-close-circle</v-icon>
              <v-tooltip activator="parent" location="bottom">Failed only</v-tooltip>
            </v-btn>
          </v-btn-toggle>
          <v-select
            v-model="filters.tab"
            :items="tabItems"
            label="Tab"
            variant="outlined"
            density="compact"
            hide-details />
        </div>
      </div>
    </div>

    <!-- ── Runs ── -->
    <div class="lqh-content">
      <div class="lqh-header d-flex align-center ga-2 px-3">
        <v-tooltip location="bottom" :text="filters.foldOut ? 'Show filters' : 'Hide filters'">
          <template #activator="{ props: tip }">
            <v-btn
              v-bind="tip"
              :icon="filters.foldOut ? 'mdi-arrow-expand-right' : 'mdi-arrow-collapse-left'"
              size="small"
              variant="text"
              :aria-label="filters.foldOut ? 'Show filters' : 'Hide filters'"
              @click="filters.foldOut = !filters.foldOut" />
          </template>
        </v-tooltip>
        <span class="text-body-2">
          {{ shown.length }} of {{ entries.length }} {{ entries.length === 1 ? 'run' : 'runs' }}
        </span>
        <v-chip v-if="filters.foldOut && filtersSet" size="x-small" variant="tonal" label>
          filtered
        </v-chip>
        <v-spacer />
        <v-btn
          v-if="entries.length"
          variant="text"
          color="error"
          class="text-none"
          prepend-icon="mdi-delete-sweep-outline"
          @click="confirmClear = true">
          Clear history
        </v-btn>
      </div>

      <div class="lqh-body">
        <div class="lqh-table">
          <!-- Virtual: only the rows on screen are drawn, so thousands of runs stay quick. -->
          <v-data-table-virtual
            :headers="headers"
            :items="shown"
            item-value="id"
            density="compact"
            fixed-header
            height="100%"
            style="height: 100%"
            hover
            :loading="!store.historyLoaded"
            :sort-by="[{ key: 'executedAt', order: 'desc' }]"
            :row-props="rowProps"
            @click:row="onRowClick">
            <template #item.status="{ item }">
              <v-icon size="small" :color="item.error ? 'error' : 'success'">
                {{ item.error ? 'mdi-close-circle' : 'mdi-check-circle' }}
              </v-icon>
            </template>
            <template #item.name="{ item }">
              <span v-if="item.name" class="font-weight-medium">{{ item.name }}</span>
              <span v-else class="text-medium-emphasis">—</span>
            </template>
            <template #item.executedAt="{ item }">
              <span class="text-no-wrap">{{ date(item.executedAt) }}</span>
            </template>
            <template #item.durationMs="{ item }">
              <span class="text-no-wrap">{{ duration(item.durationMs) }}</span>
            </template>
            <template #item.rowCount="{ item }">
              <span v-if="item.error" class="text-error">error</span>
              <span v-else>{{ item.rowCount.toLocaleString() }}</span>
            </template>
            <template #item.tab="{ item }">
              <span class="text-no-wrap" :class="{ 'text-medium-emphasis': !tabOpen(item) }">
                {{ tabLabel(item) }}
              </span>
            </template>
            <template #item.sql="{ item }">
              <span class="lqh-sql">{{ oneLine(item.sql) }}</span>
            </template>
            <template #item.actions="{ item }">
              <v-menu location="start">
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    icon="mdi-dots-vertical"
                    size="x-small"
                    variant="text"
                    :aria-label="`Actions for ${item.name ?? 'this run'}`"
                    @click.stop></v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item
                    v-if="tabOpen(item)"
                    prepend-icon="mdi-arrow-right-bold-box-outline"
                    :title="`Go to tab ${tabNames.get(item.tabId!)}`"
                    @click="emit('goToTab', item.tabId!)" />
                  <v-list-item
                    prepend-icon="mdi-tab-plus"
                    title="Open in new tab"
                    @click="emit('openNewTab', item)" />
                  <v-list-item
                    prepend-icon="mdi-file-replace-outline"
                    title="Replace editor text"
                    @click="emit('replace', item.sql)" />
                  <v-list-item
                    prepend-icon="mdi-content-copy"
                    title="Copy SQL"
                    @click="copy(item.sql)" />
                </v-list>
              </v-menu>
            </template>
            <template #no-data>
              <div class="pa-6 text-medium-emphasis">
                {{ entries.length ? 'No run matches these filters.' : 'No queries yet.' }}
              </div>
            </template>
          </v-data-table-virtual>
        </div>

        <!-- ── A run's details ── -->
        <DetailsSidePanel
          :open="!!selected"
          storage-key="lakekeeper.loqe.historyDetailsWidth"
          :default-width="440">
          <div v-if="selected" class="lqh-details">
            <div class="d-flex align-center ga-2 px-3 pt-3">
              <v-icon size="small" :color="selected.error ? 'error' : 'success'">
                {{ selected.error ? 'mdi-close-circle' : 'mdi-check-circle' }}
              </v-icon>
              <span class="text-subtitle-1 text-truncate flex-grow-1">
                {{ selected.name || 'Untitled run' }}
              </span>
              <v-btn
                icon="mdi-close"
                size="small"
                variant="text"
                aria-label="Close"
                @click="closeDetails" />
            </div>
            <div class="text-caption text-medium-emphasis px-3 mb-3">
              {{ date(selected.executedAt) }} · {{ duration(selected.durationMs) }} ·
              {{ selected.error ? 'error' : `${selected.rowCount.toLocaleString()} rows` }} ·
              {{ tabLabel(selected) }}
            </div>

            <div class="px-3 d-flex flex-column ga-3 lqh-details-top">
              <div class="d-flex align-center ga-2">
                <v-text-field
                  v-model="draftName"
                  label="Name"
                  placeholder="Untitled run"
                  persistent-placeholder
                  prepend-inner-icon="mdi-pencil-outline"
                  variant="outlined"
                  density="compact"
                  hide-details
                  aria-label="Run name"
                  @keydown.enter.prevent="saveName"
                  @blur="saveName" />
                <v-btn
                  v-if="!confirmRemove"
                  variant="text"
                  color="error"
                  class="text-none"
                  prepend-icon="mdi-delete-outline"
                  aria-label="Remove from history"
                  @click="confirmRemove = true">
                  Remove
                </v-btn>
              </div>
              <v-alert
                v-if="confirmRemove"
                type="error"
                variant="tonal"
                density="compact"
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
                    @click="confirmRemove = false">
                    Cancel
                  </v-btn>
                  <v-btn
                    density="comfortable"
                    variant="flat"
                    color="error"
                    class="text-none"
                    aria-label="Confirm remove"
                    @click="remove(selected)">
                    Remove
                  </v-btn>
                </div>
              </v-alert>
            </div>

            <!-- What the run was, the plan as a graph, and its operators as a list. -->
            <v-tabs
              v-model="detailsTab"
              density="compact"
              class="px-3 mt-2 border-b lqh-details-tabs">
              <v-tab value="overview" class="text-none">Overview</v-tab>
              <v-tab value="plan" class="text-none" :disabled="!selected.stats">Plan</v-tab>
              <v-tab value="operators" class="text-none" :disabled="!selected.stats">
                Operators
              </v-tab>
            </v-tabs>

            <div
              v-if="detailsTab === 'overview' || !selected.stats"
              class="px-3 py-3 d-flex flex-column ga-3 lqh-details-body">
              <v-alert
                v-if="selected.error"
                type="error"
                variant="tonal"
                density="compact"
                class="lqh-error-box">
                <span class="lqh-error">{{ errorText(selected.error) }}</span>
              </v-alert>
              <!-- What the run read, kept, held and cost: DuckDB's profile of it. -->
              <div v-if="selected.stats" class="lqh-stats" aria-label="Run statistics">
                <div v-for="s in statTiles(selected)" :key="s.label" class="lqh-stat">
                  <div class="text-caption text-medium-emphasis">{{ s.label }}</div>
                  <div class="lqh-stat-value">{{ s.value }}</div>
                </div>
              </div>
              <div v-else class="text-caption text-medium-emphasis">
                {{
                  selected.error
                    ? 'No profile: DuckDB writes none for a statement that fails.'
                    : 'No profile: this run was recorded before LoQE kept profiles, or its profile could not be read (the browser console says why).'
                }}
              </div>

              <!-- What can be done with the SQL sits right above it. -->
              <div class="d-flex flex-wrap align-center ga-1 lqh-sql-actions">
                <v-btn
                  v-if="tabOpen(selected)"
                  density="comfortable"
                  variant="tonal"
                  color="primary"
                  class="text-none"
                  prepend-icon="mdi-arrow-right-bold-box-outline"
                  @click="emit('goToTab', selected.tabId!)">
                  Go to tab
                </v-btn>
                <v-btn
                  density="comfortable"
                  :variant="tabOpen(selected) ? 'text' : 'tonal'"
                  :color="tabOpen(selected) ? undefined : 'primary'"
                  class="text-none"
                  prepend-icon="mdi-tab-plus"
                  @click="emit('openNewTab', selected)">
                  Open in new tab
                </v-btn>
                <v-btn
                  density="comfortable"
                  variant="text"
                  class="text-none"
                  prepend-icon="mdi-file-replace-outline"
                  @click="emit('replace', selected.sql)">
                  Replace editor text
                </v-btn>
                <v-btn
                  density="comfortable"
                  variant="text"
                  class="text-none"
                  prepend-icon="mdi-content-copy"
                  @click="copy(selected.sql)">
                  Copy
                </v-btn>
              </div>
              <pre class="lqh-details-sql" tabindex="0" aria-label="SQL of this run">{{
                selected.sql.trim()
              }}</pre>
            </div>
            <div v-else class="px-3 py-3 lqh-details-body lqh-details-body--plan">
              <template v-if="plan">
                <LoQEPlanGraph v-if="detailsTab === 'plan'" :plan="plan" />
                <LoQEPlanTree
                  v-else
                  :node="plan"
                  :total-ms="planTotalMs"
                  :slowest-ms="planSlowestMs" />
              </template>
              <div v-else-if="planLoading" class="text-caption text-medium-emphasis">Loading…</div>
              <div v-else class="text-caption text-medium-emphasis">
                The plan is not in this browser's storage: it was recorded in a private window, in
                another browser, or the site's data was cleared since. The figures on Overview are
                kept with the run and still hold.
              </div>
            </div>
          </div>
        </DetailsSidePanel>
      </div>

      <div class="text-caption text-medium-emphasis px-3 py-2 lqh-footnote">
        Kept in this browser only: the last {{ perTab }} runs of each tab, and
        {{ maxTotal.toLocaleString() }} in all (LoQE settings).
      </div>
    </div>

    <v-dialog v-model="confirmClear" max-width="440">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center py-3">
          <v-icon color="error" class="mr-2">mdi-delete-sweep-outline</v-icon>
          Clear history
          <v-spacer />
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            aria-label="Close"
            @click="confirmClear = false" />
        </v-card-title>
        <v-card-text>
          Remove all {{ entries.length }} runs, from every tab, including named ones? This cannot be
          undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirmClear = false">Cancel</v-btn>
          <v-btn
            variant="flat"
            color="error"
            class="text-none"
            aria-label="Confirm clear history"
            @click="clearAll">
            Clear history
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DetailsSidePanel from './DetailsSidePanel.vue';
import LoQEPlanTree from './LoQEPlanTree.vue';
import LoQEPlanGraph from './LoQEPlanGraph.vue';
import type { LoQEHistoryEntry } from '../composables/loqe/types';
import type { LoQEPlanNode } from '../composables/loqe/runProfile';
import { loadPlan } from '../composables/loqe/loqeDb';
import { useLoQEStore } from '../stores/loqe';
import { useDuckDBSettingsStore } from '../stores/duckdbSettings';

const props = defineProps<{
  entries: LoQEHistoryEntry[];
  /** Open query tabs, id → name. */
  tabNames: Map<string, string>;
}>();

const emit = defineEmits<{
  (e: 'goToTab', tabId: string): void;
  (e: 'openNewTab', entry: LoQEHistoryEntry): void;
  (e: 'replace', sql: string): void;
  (e: 'rename', id: string, name: string): void;
  (e: 'delete', id: string): void;
  (e: 'clear'): void;
}>();

const store = useLoQEStore();
const settings = useDuckDBSettingsStore();
const filters = computed(() => store.historyFilters);
// Filters saved before the three-way status had none.
if (!['all', 'succeeded', 'failed'].includes(store.historyFilters.status)) {
  store.historyFilters.status = 'all';
}

const perTab = computed(() => Math.max(1, Math.round(settings.historyPerTab) || 50));
const maxTotal = computed(() => Math.max(1, Math.round(settings.historyMax) || 1000));

const filtersSet = computed(
  () => !!filters.value.search || filters.value.status !== 'all' || !!filters.value.tab,
);

function clearFilters() {
  filters.value.search = '';
  filters.value.status = 'all';
  filters.value.tab = '';
}

const tabItems = computed(() => [
  { title: 'All tabs', value: '' },
  ...[...props.tabNames].map(([value, title]) => ({ title, value })),
  { title: 'Closed tabs', value: 'closed' },
]);

// A tab that was closed since leaves its filter pointing at nothing.
watch(
  () => props.tabNames,
  (names) => {
    const t = filters.value.tab;
    if (t && t !== 'closed' && !names.has(t)) filters.value.tab = '';
  },
);

const tabOpen = (e: LoQEHistoryEntry) => !!e.tabId && props.tabNames.has(e.tabId);
const tabLabel = (e: LoQEHistoryEntry) =>
  e.tabId ? (props.tabNames.get(e.tabId) ?? 'closed tab') : '—';

const shown = computed(() => {
  const q = (filters.value.search ?? '').trim().toLowerCase();
  const t = filters.value.tab;
  return props.entries.filter((e) => {
    if (filters.value.status === 'failed' && !e.error) return false;
    if (filters.value.status === 'succeeded' && e.error) return false;
    if (t === 'closed' && tabOpen(e)) return false;
    if (t && t !== 'closed' && e.tabId !== t) return false;
    if (q && !e.sql.toLowerCase().includes(q) && !(e.name ?? '').toLowerCase().includes(q))
      return false;
    return true;
  });
});

const headers = [
  { title: '', key: 'status', sortable: false, width: 36 },
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Started', key: 'executedAt', sortable: true },
  { title: 'Duration', key: 'durationMs', sortable: true, align: 'end' as const },
  { title: 'Rows', key: 'rowCount', sortable: true, align: 'end' as const },
  { title: 'Tab', key: 'tab', sortable: false },
  { title: 'SQL', key: 'sql', sortable: false },
  { title: '', key: 'actions', sortable: false, width: 40 },
];

// ── Selection and its details ──
const selectedId = ref<string | null>(null);
const selected = computed(() => props.entries.find((e) => e.id === selectedId.value) ?? null);
const draftName = ref('');
const confirmRemove = ref(false);
/** The details tab, kept while moving between runs. */
const detailsTab = ref<'overview' | 'plan' | 'operators'>('overview');

// ── The selected run's plan, read from IndexedDB ──
const plan = ref<LoQEPlanNode | null>(null);
const planLoading = ref(false);
watch(selectedId, async (id) => {
  plan.value = null;
  if (!id) return;
  planLoading.value = true;
  const loaded = await loadPlan(id);
  if (selectedId.value === id) {
    plan.value = loaded;
    planLoading.value = false;
  }
});

function walk(n: LoQEPlanNode, visit: (n: LoQEPlanNode) => void) {
  visit(n);
  n.children.forEach((c) => walk(c, visit));
}
const planTotalMs = computed(() => {
  let t = 0;
  if (plan.value) walk(plan.value, (n) => (t += n.timeMs));
  return t;
});
const planSlowestMs = computed(() => {
  let t = 0;
  if (plan.value) walk(plan.value, (n) => (t = Math.max(t, n.timeMs)));
  return t;
});

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function statTiles(e: LoQEHistoryEntry) {
  const s = e.stats!;
  return [
    { label: 'Rows scanned', value: s.rowsScanned.toLocaleString() },
    { label: 'Rows returned', value: e.rowCount.toLocaleString() },
    { label: 'Files read', value: s.filesRead.toLocaleString() },
    { label: 'Peak memory', value: bytes(s.peakMemoryBytes) },
    { label: 'Spilled to disk', value: s.spilledBytes ? bytes(s.spilledBytes) : 'none' },
    { label: 'Latency · CPU', value: `${duration(s.latencyMs)} · ${duration(s.cpuMs)}` },
  ];
}

/**
 * The details close on a click anywhere else in the view, and on Esc. A click
 * on a run is left to the row (it selects that run instead), and so is one in
 * the panel itself or in a menu or dialog it opened.
 */
function closeOnOutside(event: PointerEvent) {
  if (!selectedId.value) return;
  const target = event.target as Element | null;
  if (target?.closest('.dsp, tbody tr, .v-overlay')) return;
  closeDetails();
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !selectedId.value || event.defaultPrevented) return;
  if (document.querySelector('.v-overlay--active')) return;
  closeDetails();
}
onMounted(() => window.addEventListener('keydown', closeOnEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));

function onRowClick(_event: unknown, row: { item: LoQEHistoryEntry }) {
  select(row.item);
}

/**
 * Close the details, keeping a name being typed. Saved here, not left to the
 * field's blur: a click outside closes on pointerdown, before the field blurs,
 * and Esc never blurs it, so the draft would go with the selection.
 */
function closeDetails() {
  saveName();
  selectedId.value = null;
}

function select(entry: LoQEHistoryEntry) {
  if (selectedId.value === entry.id) return closeDetails();
  saveName();
  selectedId.value = entry.id;
}

watch(selected, (e, before) => {
  if (e?.id !== before?.id) {
    draftName.value = e?.name ?? '';
    confirmRemove.value = false;
  }
});

// A row opens its details by keyboard as by click: it takes focus, and Enter
// or Space opens (or closes) them.
const rowProps = ({ item }: { item: LoQEHistoryEntry }) => ({
  class: { 'lqh-row--active': item.id === selectedId.value },
  style: 'cursor: pointer',
  tabindex: 0,
  'aria-label': `${item.name || 'Untitled run'}, ${date(item.executedAt)}, ${item.error ? 'failed' : 'succeeded'}: show details`,
  'aria-expanded': item.id === selectedId.value,
  onKeydown: (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    select(item);
  },
});

function saveName() {
  const e = selected.value;
  if (!e) return;
  const name = draftName.value.trim();
  if (name !== (e.name ?? '')) emit('rename', e.id, name);
}

function remove(e: LoQEHistoryEntry) {
  confirmRemove.value = false;
  selectedId.value = null;
  emit('delete', e.id);
}

const confirmClear = ref(false);
function clearAll() {
  confirmClear.value = false;
  selectedId.value = null;
  emit('clear');
}

async function copy(sql: string) {
  try {
    await navigator.clipboard.writeText(sql);
  } catch {
    // Clipboard unavailable (insecure context); nothing else to fall back to here.
  }
}

const date = (ms: number) =>
  new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function duration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

const oneLine = (sql: string) => sql.trim().replace(/\s+/g, ' ');

/** DuckDB pads some messages with blank lines; show the words, not the padding. */
const errorText = (error: string) => error.trim().replace(/\n{3,}/g, '\n\n');
</script>

<style scoped>
.lqh {
  display: flex;
  height: 100%;
  min-height: 0;
  min-width: 0;
}
.lqh-fold {
  width: 260px;
  flex: 0 0 auto;
  overflow: hidden;
  transition: width 0.2s ease;
  border-right: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.lqh-fold--out {
  width: 0;
  border-right: none;
}
@media (prefers-reduced-motion: reduce) {
  .lqh-fold {
    transition: none;
  }
}
.lqh-filters {
  width: 260px;
}
.lqh-status {
  width: 100%;
}
.lqh-status > .v-btn {
  flex: 1 1 0;
}
.lqh-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.lqh-header {
  flex: 0 0 auto;
  min-height: 48px;
}
.lqh-body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  min-width: 0;
}
.lqh-table {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.lqh-sql {
  display: block;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
:deep(.lqh-table tbody tr:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
:deep(.lqh-row--active) {
  background: rgba(var(--v-theme-primary), 0.08);
}
.lqh-details {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.lqh-details-top,
.lqh-details-tabs {
  flex: 0 0 auto;
}
.lqh-details-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
/* Every block keeps its own height; the body scrolls instead of squeezing them. */
.lqh-details-body > * {
  flex: 0 0 auto;
}
.lqh-details-body--plan {
  display: flex;
  flex-direction: column;
}
.lqh-details-body--plan > .lpg {
  flex: 1 1 auto;
}
.lqh-details-sql {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  max-height: 50vh;
  overflow: auto;
}
.lqh-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.lqh-stat {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.lqh-stat-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.lqh-error-box {
  flex: 0 0 auto;
}
.lqh-error {
  white-space: pre-wrap;
  word-break: break-word;
}
.lqh-footnote {
  flex: 0 0 auto;
}
</style>
