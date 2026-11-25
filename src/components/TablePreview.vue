<template>
  <!-- No bottom padding: the results pane bounds itself to the viewport, and
       padding under it would push the page past the footer. -->
  <v-container fluid class="pb-0">
    <!-- S3/GCS + HTTP Warning -->
    <v-alert v-if="showS3HttpWarning" type="warning" variant="tonal" class="mb-4" closable>
      <div class="text-body-1 font-weight-bold mb-2">Security Warning</div>
      <div class="text-body-2">
        {{ storageValidation.httpWarningMessage }}
      </div>
    </v-alert>

    <!-- Preview Not Available Warning -->
    <v-alert
      v-if="!isPreviewAvailable.available"
      type="warning"
      variant="tonal"
      prominent
      class="mb-4">
      <div class="text-body-1 font-weight-bold mb-2">
        <v-icon class="mr-2">mdi-alert</v-icon>
        Preview Not Available
      </div>
      <div class="text-body-2">{{ isPreviewAvailable.reason }}</div>
      <div class="text-body-2 mt-3">
        <strong>Requirements for DuckDB WASM:</strong>
        <ul class="mt-2">
          <li>{{ storageValidation.storageRequirement }}</li>
          <li>{{ storageValidation.protocolRequirement }}</li>
          <li>Warehouse must have vended credentials (STS) enabled</li>
        </ul>
      </div>
    </v-alert>

    <!-- Always mounted, so usePaneHeight can observe it from the start; it only
         takes the measured height once there are results to bound. -->
    <div
      ref="paneRef"
      :class="{ 'd-flex flex-column': showResults }"
      :style="showResults ? { height: boundedPaneHeight ?? '60vh', minHeight: 0 } : undefined">
      <!-- Loading: a skeleton in the shape of the result, so the layout does not jump -->
      <div v-if="isLoading">
        <div class="d-flex align-center mb-3" role="status" aria-live="polite">
          <v-progress-circular indeterminate size="16" width="2" class="mr-2"></v-progress-circular>
          <span class="text-caption text-medium-emphasis">Running preview query…</span>
        </div>
        <v-card variant="outlined">
          <v-skeleton-loader type="table-thead, table-tbody"></v-skeleton-loader>
        </v-card>
      </div>

      <!-- Error State -->
      <EngineErrorAlert
        v-else-if="error"
        :error="error"
        title="Failed to load preview"
        class="mb-4" />

      <!-- Results -->
      <div
        v-else-if="queryResults"
        class="d-flex flex-column"
        style="flex: 1 1 auto; min-height: 0; min-width: 0">
        <!-- One toolbar: what is being read, from where, and what came back -->
        <v-card variant="outlined" class="mb-4" style="flex: 0 0 auto">
          <div class="d-flex align-center flex-wrap ga-3 pa-3">
            <div class="d-flex align-center text-truncate" style="min-width: 0">
              <v-icon size="small" class="mr-2 text-medium-emphasis">mdi-table-eye</v-icon>
              <span class="text-body-2 font-weight-medium text-truncate">{{ tableName }}</span>
              <span class="text-caption text-medium-emphasis ml-2 text-truncate d-none d-sm-inline">
                {{ resolvedWarehouseName }}.{{ namespaceDisplay }}
              </span>
            </div>

            <!-- Branch selector -->
            <v-select
              v-if="branchOptions.length > 1"
              v-model="selectedBranch"
              :items="branchOptions"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 180px"
              label="Branch"
              no-data-text="No branches available"
              prepend-inner-icon="mdi-source-branch"
              @update:model-value="
                selectedSnapshot = null;
                loadPreview();
              "></v-select>

            <!-- Snapshot time travel -->
            <v-select
              v-if="allTimeTravelOptions.length > 1"
              v-model="selectedSnapshot"
              :items="allTimeTravelOptions"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 400px; min-width: 280px"
              label="Time Travel"
              no-data-text="No snapshots available"
              prepend-inner-icon="mdi-clock-outline"
              clearable
              @update:model-value="loadPreview"></v-select>

            <v-spacer></v-spacer>

            <!-- How many rows to read: small by default, so a wide table opens fast. -->
            <v-select
              v-model="previewRowLimit"
              :items="PREVIEW_ROW_LIMITS"
              density="compact"
              variant="outlined"
              hide-details
              label="Max preview rows"
              style="max-width: 170px; min-width: 160px"
              @update:model-value="onRowLimitChange"></v-select>

            <span class="text-caption text-medium-emphasis">{{ resultSummary }}</span>
            <v-tooltip v-if="queryResults.truncated" :text="truncationHint" location="top">
              <template #activator="{ props: tipProps }">
                <v-icon v-bind="tipProps" size="small" color="warning">
                  mdi-information-outline
                </v-icon>
              </template>
            </v-tooltip>

            <v-btn
              icon="mdi-refresh"
              size="small"
              variant="text"
              title="Reload preview"
              @click="loadPreview"></v-btn>
            <v-btn
              size="small"
              variant="outlined"
              prepend-icon="mdi-download-outline"
              :disabled="!csvDownload.isDownloadAvailable(queryResults)"
              @click="downloadCSV">
              CSV
            </v-btn>
            <!-- "Field docs", not "Docs": on its own the word reads as product
               documentation. Pressed state is carried by the variant. -->
            <v-btn
              v-if="hasColumnDocs"
              size="small"
              :variant="showColumnDocs ? 'tonal' : 'outlined'"
              :prepend-icon="showColumnDocs ? 'mdi-text-box' : 'mdi-text-box-outline'"
              :title="
                showColumnDocs
                  ? 'Hide field descriptions'
                  : 'Show the schema field description under each column'
              "
              @click="showColumnDocs = !showColumnDocs">
              Field docs
            </v-btn>
          </div>
        </v-card>

        <!-- A readable table can still hold nothing: say so rather than "No data available" -->
        <v-alert
          v-if="queryResults.rows.length === 0"
          type="info"
          variant="tonal"
          prominent
          class="mb-4"
          style="flex: 0 0 auto">
          <div class="text-body-1 font-weight-bold mb-2">
            <v-icon class="mr-2">mdi-table-off</v-icon>
            {{ emptyResult.title }}
          </div>
          <div class="text-body-2">{{ emptyResult.detail }}</div>
        </v-alert>

        <!-- Results Table. Virtual: only the rows in view are in the DOM, so a wide
           table costs a screenful of rows × its columns, not every row read.
           The table is the scroller; the box around it only bounds it. -->
        <v-card
          v-else
          variant="outlined"
          class="d-flex flex-column"
          style="flex: 1 1 auto; min-height: 0; min-width: 0; overflow: hidden">
          <v-data-table-virtual
            ref="tableRef"
            :headers="tableHeaders"
            :items="queryResults.rows"
            density="compact"
            class="preview-table"
            item-height="36"
            :row-props="stripeRow"
            fixed-header
            height="100%"
            style="height: 100%">
            <template
              v-for="h in tableHeaders"
              :key="`header-${h.key}`"
              #[`header.${h.key}`]="{ column, isSorted, getSortIcon }">
              <div class="d-flex align-center ga-1">
                <div class="d-flex flex-column column-head align-start">
                  <span class="d-flex align-center ga-1">
                    {{ column.title }}
                    <v-tooltip
                      v-if="columnDocs[h.key] && !showColumnDocs"
                      :text="columnDocs[h.key]"
                      location="bottom"
                      max-width="320">
                      <template #activator="{ props: docProps }">
                        <v-icon v-bind="docProps" size="x-small" class="doc-hint">
                          mdi-information-outline
                        </v-icon>
                      </template>
                    </v-tooltip>
                  </span>
                  <span v-if="columnTypes[h.key]" class="column-type">
                    {{ columnTypes[h.key] }}
                  </span>
                  <template v-if="showColumnDocs">
                    <span v-if="columnDocs[h.key]" class="column-doc">{{ columnDocs[h.key] }}</span>
                    <span v-else class="column-doc column-doc--empty">No docs available</span>
                  </template>
                </div>
                <v-icon
                  v-if="column.sortable"
                  size="x-small"
                  :class="isSorted(column) ? 'sort-icon sort-icon--active' : 'sort-icon'"
                  :icon="getSortIcon(column)"></v-icon>
              </div>
            </template>
            <template v-for="h in tableHeaders" :key="h.key" #[`item.${h.key}`]="{ value }">
              <span v-if="value === null || value === undefined" class="null-cell">NULL</span>
              <CellValue v-else :value="value" @open="openCell(h.title, value)" />
            </template>
          </v-data-table-virtual>
        </v-card>

        <!-- Full-value / JSON viewer -->
        <CellValueDialog v-model="cellDialog.open" :state="cellDialog" />
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import {
  ref,
  shallowRef,
  computed,
  onMounted,
  onBeforeUnmount,
  toRef,
  watch,
  inject,
  nextTick,
} from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useLoQE } from '@/composables/useLoQE';
import type { LoQEQueryResult } from '@/composables/loqe/types';
import { num, sql, tableIdent } from '@/composables/loqe/sql';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { useCsvDownload } from '@/composables/useCsvDownload';
import { useCellViewer } from '@/composables/useCellViewer';
import { hasVendedCredentials, useVendedCredentials } from '@/composables/useVendedCredentials';
import { usePaneHeight } from '@/common/paneHeight';
import EngineErrorAlert from './EngineErrorAlert.vue';
import CellValue from './CellValue.vue';
import CellValueDialog from './CellValueDialog.vue';

// Local types for json-bigint parsed metadata (BigInt IDs stored as strings)
interface BigIntSnapshot {
  'snapshot-id': string;
  'parent-snapshot-id'?: string;
  'timestamp-ms': number;
  'sequence-number'?: number;
  summary?: { operation?: string; [key: string]: string | undefined };
}

interface BigIntRef {
  type: 'branch' | 'tag';
  'snapshot-id': string;
}

interface BigIntSchemaField {
  name: string;
  /** Primitive types are plain strings ('long'); nested ones are objects. */
  type: string | { type?: string };
  /** Iceberg field comment, when the writer set one. */
  doc?: string;
}

interface BigIntSchema {
  'schema-id'?: number;
  fields?: BigIntSchemaField[];
}

interface BigIntTableMetadata {
  /** Identifies the table to the management API, which keys permissions by UUID. */
  'table-uuid'?: string;
  snapshots?: BigIntSnapshot[];
  refs?: Record<string, BigIntRef>;
  'current-snapshot-id'?: string;
  schemas?: BigIntSchema[];
  'current-schema-id'?: number;
}

interface BigIntLoadTableResult {
  metadata: BigIntTableMetadata;
  /** Per the Iceberg spec, credentials live here first and in `config` only as a fallback. */
  'storage-credentials'?: unknown[];
  config?: Record<string, string>;
}

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  catalogUrl: string;
  storageType?: string;
  warehouseName?: string;
}>();

const config = inject<any>('appConfig', { enabledAuthentication: false });
const functions = useFunctions();
const userStore = useUserStore();
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
const csvDownload = useCsvDownload();

// The results pane ends at the viewport, measured from its own top edge — or
// earlier, where the host bounds it: a tab inside a card that stops short of the
// footer would otherwise push the table's bottom edge (and its horizontal
// scrollbar) out of sight.
const { paneRef, paneHeight, measurePane } = usePaneHeight(320);
const PANE_MIN = 320;
const PANE_GAP = 12;
const boundedPaneHeight = ref<string | null>(null);

/** The nearest ancestor that clips or scrolls and has a fixed (not max-) height. */
function boundingHost(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    // A max-height box is as tall as its content (this pane), so measuring it
    // would feed the pane's own size back in; only fixed bounds count.
    if (/(auto|scroll|hidden)/.test(cs.overflowY) && cs.maxHeight === 'none' && p.clientHeight > 0)
      return p;
  }
  return null;
}

function boundToHost() {
  const measured = paneHeight.value ? parseInt(paneHeight.value, 10) : NaN;
  const el = (paneRef.value?.$el ?? paneRef.value) as HTMLElement | null;
  const host = el ? boundingHost(el) : null;
  if (!el || !host || !Number.isFinite(measured)) {
    boundedPaneHeight.value = paneHeight.value;
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const padBottom = parseFloat(getComputedStyle(host).paddingBottom) || 0;
  const room = Math.round(hostRect.bottom - padBottom - el.getBoundingClientRect().top - PANE_GAP);
  boundedPaneHeight.value = `${Math.max(PANE_MIN, Math.min(measured, room))}px`;
}
watch(paneHeight, () => nextTick(boundToHost), { immediate: true });

// Namespace display: convert \x1F separators to dots
const namespaceDisplay = computed(() => {
  const ns = props.namespaceId;
  if (ns.includes('\x1F')) return ns.split('\x1F').join('.');
  return ns;
});

// The warehouse's profile, loaded before the first preview attempt: whether the
// warehouse vends credentials at all is not derivable from `storageType`, and it
// decides between "STS is off" and a CORS diagnosis.
const storageProfile = ref<Record<string, any> | null>(null);

const { explainMissingCredentials } = useVendedCredentials();

const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
  storageProfile,
);

// Loaded with credential delegation, so the body doubles as the data-access check
// below: DuckDB cannot report a missing privilege in those terms — with nothing
// vended, the iceberg extension complains about an absent region, which reads like
// a client misconfiguration and sends people to debug the ATTACH.
const loadedTable = ref<BigIntLoadTableResult | null>(null);

const isLoading = ref(true);
const error = ref<string | null>(null);
// Shallow: a preview of a wide table is rows × columns cells, and none of them
// change after the query returns. Deep reactivity would proxy every one.
const queryResults = shallowRef<LoQEQueryResult | null>(null);
const resolvedWarehouseName = ref<string | undefined>(undefined);
const selectedSnapshot = ref<string | null>(null);
const selectedBranch = ref<string>('main');

// Resolved table metadata (fetched with json-bigint to preserve snapshot IDs)
const tableMetadata = computed<BigIntLoadTableResult | null>(() => loadedTable.value);

// Available branches from refs
const branchOptions = computed(() => {
  const refs = tableMetadata.value?.metadata?.refs;
  if (!refs) return [{ title: 'main', value: 'main' }];
  return Object.entries(refs)
    .filter(([, r]) => r.type === 'branch')
    .map(([name]) => ({ title: name, value: name }));
});

// Walk branch parent chain to get snapshots on the selected branch
const branchSnapshots = computed<BigIntSnapshot[]>(() => {
  const meta = tableMetadata.value?.metadata;
  if (!meta?.snapshots) return [];
  const snapshotMap = new Map<string, BigIntSnapshot>();
  for (const s of meta.snapshots) {
    if (s['snapshot-id']) snapshotMap.set(String(s['snapshot-id']), s);
  }
  // Find branch tip
  const refs = meta.refs;
  let tipId: string | undefined;
  if (refs && refs[selectedBranch.value]) {
    tipId = String(refs[selectedBranch.value]['snapshot-id']);
  } else if (meta['current-snapshot-id']) {
    tipId = String(meta['current-snapshot-id']);
  }
  if (!tipId) return [];
  // Walk parent chain
  const chain: BigIntSnapshot[] = [];
  let id: string | undefined = tipId;
  while (id) {
    const snap = snapshotMap.get(id);
    if (!snap) break;
    chain.push(snap);
    id = snap['parent-snapshot-id'] ? String(snap['parent-snapshot-id']) : undefined;
  }
  return chain;
});

// Full time travel options from branch snapshots
const allTimeTravelOptions = computed(() => {
  const snaps = branchSnapshots.value;
  if (snaps.length === 0) return [];
  return snaps.map((s) => {
    const d = new Date(s['timestamp-ms']);
    const ts = d.toISOString().replace('T', ' ').replace('Z', '');
    const op = s.summary?.operation ?? '';
    const seq = s['sequence-number'] ?? '';
    const snapId = String(s['snapshot-id']);
    return {
      title: `#${seq} — ${ts} — ${op}`,
      value: snapId,
    };
  });
});

/**
 * Column name → Iceberg type, for the type line under each header.
 *
 * Taken from the table's current schema rather than from the query result:
 * DuckDB reports its own type names, and the Iceberg type is what the reader
 * is actually looking at.
 */
const columnTypes = computed<Record<string, string>>(() => {
  const meta = tableMetadata.value?.metadata;
  const schemas = meta?.schemas;
  if (!schemas?.length) return {};
  const schema =
    schemas.find((s) => s['schema-id'] === meta?.['current-schema-id']) ??
    schemas[schemas.length - 1];
  const types: Record<string, string> = {};
  for (const field of schema?.fields ?? []) {
    types[field.name] =
      typeof field.type === 'string' ? field.type : (field.type?.type ?? 'complex');
  }
  return types;
});

/** Column name → Iceberg field doc, for the columns that carry one. */
const columnDocs = computed<Record<string, string>>(() => {
  const meta = tableMetadata.value?.metadata;
  const schemas = meta?.schemas;
  if (!schemas?.length) return {};
  const schema =
    schemas.find((s) => s['schema-id'] === meta?.['current-schema-id']) ??
    schemas[schemas.length - 1];
  const docs: Record<string, string> = {};
  for (const field of schema?.fields ?? []) {
    if (field.doc) docs[field.name] = field.doc;
  }
  return docs;
});

/** Whether any column carries a doc — no toggle is offered when none do. */
const hasColumnDocs = computed(() => Object.keys(columnDocs.value).length > 0);

/**
 * Docs inline under the header when on, as a hover tooltip when off. Off by
 * default: a description is often a sentence, and a preview is read for its
 * data first.
 */
const showColumnDocs = ref(false);

const isNumericColumn = (col: string) =>
  /^(int|long|float|double|decimal)/.test(columnTypes.value[col] ?? '');

// Headers from the result. Rows stay the engine's plain arrays — no per-row
// object keyed by column — and each header reads its cell by index.
const tableHeaders = computed(() => {
  if (!queryResults.value?.columns) return [];
  return queryResults.value.columns.map((col: string, index: number) => ({
    title: col,
    key: col,
    value: (row: unknown[]) => row[index],
    sortable: true,
    // Numbers read as a column when they share an edge and a tabular figure.
    align: (isNumericColumn(col) ? 'end' : 'start') as 'start' | 'end',
    // …but the header stays left whatever the cells do: name, type and doc are
    // read as a stack, and a right-aligned stack over a wide column drifts far
    // from the column it names. `headerProps` is merged after `align`, so it wins.
    headerProps: { align: 'start' as const },
    cellProps: isNumericColumn(col) ? { class: 'numeric-cell' } : undefined,
  }));
});

/** Zebra class by the row's place in the whole result (see the style block). */
function stripeRow({ internalItem }: { internalItem: { index: number } }) {
  return internalItem.index % 2 === 1 ? { class: 'preview-row--even' } : {};
}

// A sideways trackpad swipe over the table moved nothing: the swipe reached the
// table, but its default scroll did not happen, while dragging the scrollbar
// worked. So a mostly-horizontal wheel moves the table here; vertical wheels
// stay with the browser and its smooth scrolling.
const tableRef = ref<any>(null);
let wheelTarget: HTMLElement | null = null;

function onTableWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement;
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
  const max = el.scrollWidth - el.clientWidth;
  const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaX));
  if (next === el.scrollLeft) return;
  el.scrollLeft = next;
  e.preventDefault();
}

function bindTableWheel() {
  const wrapper = (tableRef.value?.$el as HTMLElement | undefined)?.querySelector?.(
    '.v-table__wrapper',
  ) as HTMLElement | null;
  if (wrapper === wheelTarget) return;
  wheelTarget?.removeEventListener('wheel', onTableWheel);
  wheelTarget = wrapper;
  wheelTarget?.addEventListener('wheel', onTableWheel, { passive: false });
}

onBeforeUnmount(() => wheelTarget?.removeEventListener('wheel', onTableWheel));

/** Whether the results pane is showing, and so takes the measured height. */
const showResults = computed(() => !isLoading.value && !error.value && !!queryResults.value);

// The pane gains its height when results arrive; measure once they are laid out.
watch(showResults, (shown) => {
  if (shown)
    nextTick(() => {
      measurePane();
      boundToHost();
    });
  nextTick(bindTableWheel);
});

const formatMs = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

// "First 10,000 rows · 310 ms" — what came back, and what it cost. The query
// reads one row past the limit only to learn there are more, so the total is
// not known and is not shown.
const resultSummary = computed(() => {
  const r = queryResults.value;
  if (!r) return '';
  const rows = r.truncated
    ? `First ${r.rowCount.toLocaleString()} rows`
    : `${r.rowCount.toLocaleString()} ${r.rowCount === 1 ? 'row' : 'rows'}`;
  return typeof r.executionTimeMs === 'number' ? `${rows} · ${formatMs(r.executionTimeMs)}` : rows;
});

/** Why the preview stops where it does, and how to read past it. */
const truncationHint = computed(
  () =>
    `Preview reads the first ${previewRowLimit.value.toLocaleString()} rows only. ` +
    'Pick a larger number under "Max preview rows" to read more.',
);

// Rows the preview reads. Small by default so even a wide table opens fast; the
// choice is remembered in this browser.
const PREVIEW_ROW_LIMITS = [100, 250, 1000, 5000];
const ROW_LIMIT_STORAGE_KEY = 'lakekeeper:table-preview-row-limit';
function storedRowLimit(): number {
  try {
    const v = Number(localStorage.getItem(ROW_LIMIT_STORAGE_KEY));
    return PREVIEW_ROW_LIMITS.includes(v) ? v : PREVIEW_ROW_LIMITS[0];
  } catch {
    return PREVIEW_ROW_LIMITS[0];
  }
}
const previewRowLimit = ref<number>(storedRowLimit());
function onRowLimitChange(v: number) {
  try {
    localStorage.setItem(ROW_LIMIT_STORAGE_KEY, String(v));
  } catch {
    /* storage unavailable: the choice holds for this page only */
  }
  loadPreview();
}

/**
 * Why the query came back empty. An unwritten table and a snapshot that
 * happens to hold nothing are different situations, and the default
 * "No data available" explains neither.
 */
const emptyResult = computed(() =>
  selectedSnapshot.value
    ? {
        title: 'No rows in this snapshot',
        detail:
          'The selected snapshot contains no rows. Choose a later one, or clear time travel to ' +
          'read the tip of the branch.',
      }
    : {
        title: 'No rows yet',
        detail:
          'The table and its schema are readable, but nothing has been written to it yet. ' +
          'Rows appear here after the first write.',
      },
);

// Cell value viewer: long / JSON-looking values are clickable and open a dialog
// showing the full value (shared with the LoQE results grid).
const { cellDialog, openCell } = useCellViewer();

// Check if preview is available
const isPreviewAvailable = computed(() => {
  // Wait for storage type to be loaded first
  if (!props.storageType) {
    return { available: false, reason: 'Loading warehouse information...' };
  }

  // Use composable for storage validation
  if (!storageValidation.isOperationAvailable.value.available) {
    return {
      available: false,
      reason: storageValidation.isOperationAvailable.value.reason,
    };
  }

  return { available: true, reason: null };
});

// Check if we should show S3/GCS + HTTP warning
const showS3HttpWarning = storageValidation.shouldShowHttpWarning;

async function loadPreview() {
  isLoading.value = true;
  error.value = null;
  queryResults.value = null;

  // Wait for storage type to be available, then check if it's supported using composable
  if (!props.storageType) {
    // Storage type not loaded yet, wait
    isLoading.value = false;
    return;
  }

  // Use composable to check if operation is available
  if (!storageValidation.isOperationAvailable.value.available) {
    isLoading.value = false;
    return;
  }
  try {
    // Load warehouse — snapshot name immediately so later async steps use a stable value
    const wh = await functions.getWarehouse(props.warehouseId);
    storageProfile.value = (wh['storage-profile'] as Record<string, any>) ?? null;
    const warehouseName = wh.name;
    if (!warehouseName) {
      error.value = 'Warehouse name is unavailable.';
      return;
    }
    resolvedWarehouseName.value = warehouseName;

    // Asked again now the profile is known: the check above ran without it, and a
    // warehouse that vends nothing must not reach DuckDB — it would fail as an
    // opaque download error and be reported as a CORS problem.
    if (storageValidation.vendedCredentialsReason.value) {
      return;
    }

    // Load the table asking for vended credentials — the same request DuckDB is about
    // to make. json-bigint preserves the snapshot IDs time travel needs.
    if (!loadedTable.value) {
      try {
        loadedTable.value = (await functions.loadTableVendedCredentials(
          props.warehouseId,
          props.namespaceId,
          props.tableName,
        )) as BigIntLoadTableResult;
      } catch {
        // Non-critical here — the query below will fail with its own diagnosis, and
        // time travel just won't be available.
        loadedTable.value = null;
      }
    }

    // Metadata came back but no credentials with it. STS being off was ruled out
    // above, so the catalog is declining to vend to *this* caller.
    if (loadedTable.value && !hasVendedCredentials(loadedTable.value)) {
      error.value = await explainMissingCredentials(
        props.warehouseId,
        loadedTable.value.metadata?.['table-uuid'],
      );
      return;
    }

    // Initialize LoQE and attach the catalog (shared engine with LoQE Explorer)
    await loqe.initialize();

    // Always (re)attach with the current token: vended storage credentials
    // expire on a short TTL, so a stale attach causes 404s on manifest/data
    // fetches. force re-attaches to re-vend fresh credentials.
    await loqe.attachCatalog({
      catalogName: warehouseName,
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
      projectId: wh['project-id'],
      force: true,
    });

    const tablePath = tableIdent(warehouseName, props.namespaceId, props.tableName);

    // Optional time-travel clause (snapshot IDs are BigInt-safe strings).
    // VARIANT columns that can't be Arrow-serialized are handled by the engine
    // (it retries with a text cast), so a plain SELECT * is enough here.
    const fromClause = selectedSnapshot.value
      ? sql`${tablePath} AT (VERSION => ${num(BigInt(selectedSnapshot.value))})`
      : tablePath;

    // One row past the chosen limit is read only to learn whether the table
    // holds more; it is dropped again and the result marked as truncated.
    const limit = previewRowLimit.value;
    const results = await loqe.query(sql`SELECT * FROM ${fromClause} LIMIT ${num(limit + 1)};`);
    queryResults.value =
      results.rows.length > limit
        ? { ...results, rows: results.rows.slice(0, limit), rowCount: limit, truncated: true }
        : results;
  } catch (err: any) {
    console.error('Failed to load table preview:', err);
    // loqe.error.value already contains the humanized error message
    // from useLoQE, so prefer it over the raw DuckDB error
    const errorMsg = loqe.error.value || err.message || 'Unknown error occurred';

    // A warehouse with STS off cannot have produced a CORS failure: nothing was
    // ever authorised to fetch. Its own reason wins over the signature match.
    if (storageValidation.vendedCredentialsReason.value) {
      error.value = storageValidation.vendedCredentialsReason.value;
      return;
    }

    // Shown as thrown. The engine diagnosed this message already — reachability
    // established, the catalog's own status read where it gave one — and the
    // sniff that used to sit here matched the word "CORS" inside that diagnosis
    // and replaced it with something vaguer.
    error.value = errorMsg;
  } finally {
    isLoading.value = false;
  }
}

function downloadCSV() {
  if (!queryResults.value) return;
  csvDownload.downloadCSV(queryResults.value, {
    baseFilename: `${props.tableName}_preview`,
  });
}

onMounted(() => {
  loadPreview();
});

// Keep local resolvedWarehouseName in sync with prop (updated after rename in parent)
watch(
  () => props.warehouseName,
  (name) => {
    if (name) resolvedWarehouseName.value = name;
  },
);

// Watch for table/namespace/warehouse changes and reload preview
watch([() => props.tableName, () => props.namespaceId, () => props.warehouseId], () => {
  loadedTable.value = null;
  selectedSnapshot.value = null;
  selectedBranch.value = 'main';
  loadPreview();
});

// Watch for storage type changes and reload preview when it becomes available and supported
watch(
  () => props.storageType,
  () => {
    if (props.storageType && storageValidation.isOperationAvailable.value.available) {
      loadPreview();
    }
  },
);
</script>

<style scoped>
:deep(.v-data-table) {
  font-size: 0.875rem;
}

/* Neutral tint rather than a primary wash: the header must stay quiet under
   any white-label theme, and the data is what should carry the colour. */
:deep(.v-data-table th) {
  font-weight: 600;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

:deep(.v-data-table td) {
  white-space: nowrap;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

/* Zebra striping + hover: both sit on the theme's on-surface colour, so they
   hold up in light and dark without a second palette. */
/* By the row's index in the result, not :nth-child — the virtual table keeps a
   spacer row at the top of the body, and the rows it renders change as it
   scrolls, so child position does not stay with a row. */
.preview-table :deep(tbody tr.preview-row--even td) {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}

.preview-table :deep(tbody tr:hover td) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.preview-table :deep(td.numeric-cell) {
  font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Iceberg type under the column name */
.column-type {
  font-size: 0.625rem;
  line-height: 1.1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
  font-weight: 400;
}

/* The doc wraps, but only so far: a header row that grows without bound would
   push the data itself off the screen. */
.column-doc {
  font-size: 0.6875rem;
  line-height: 1.3;
  font-weight: 400;
  opacity: 0.7;
  white-space: normal;
  max-width: 260px;
  margin-top: 2px;
}

.column-head {
  min-width: 0;
}

/* The table keeps the card's width and scrolls inside it, both ways: without
   this it grows to all its columns and the card only clips it. */
.preview-table {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}
.preview-table :deep(.v-table__wrapper) {
  overflow: auto;
}

/* Quieter still than a real doc: absence should not compete with content */
.column-doc--empty {
  opacity: 0.4;
  font-style: italic;
}

/* Type and doc are block text, so they need the alignment the flex rows get */
.column-head.align-start {
  text-align: left;
}

.doc-hint {
  opacity: 0.45;
}

/* Sort affordance: present but silent until the column is actually sorted */
.sort-icon {
  opacity: 0;
  transition: opacity 0.15s ease;
}

:deep(th:hover) .sort-icon,
.sort-icon--active {
  opacity: 0.7;
}

.null-cell {
  opacity: 0.38;
  font-style: italic;
}
</style>
