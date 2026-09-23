<template>
  <v-container fluid>
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

    <!-- Loading: a skeleton in the shape of the result, so the layout does not jump -->
    <div v-if="isLoading">
      <div class="d-flex align-center mb-3">
        <v-progress-circular indeterminate size="16" width="2" class="mr-2"></v-progress-circular>
        <span class="text-caption text-medium-emphasis">Running preview query…</span>
      </div>
      <v-card variant="outlined">
        <v-skeleton-loader type="table-thead, table-tbody"></v-skeleton-loader>
      </v-card>
    </div>

    <!-- Error State -->
    <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
      <div class="text-body-1 font-weight-bold mb-2">Failed to load preview</div>
      <div class="text-body-2">{{ error }}</div>
      <template v-if="error.includes('CORS')" #append>
        <CorsConfigDialog />
      </template>
    </v-alert>

    <!-- Results -->
    <div v-else-if="queryResults">
      <!-- One toolbar: what is being read, from where, and what came back -->
      <v-card variant="outlined" class="mb-4">
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

          <span class="text-caption text-medium-emphasis">{{ resultSummary }}</span>
          <v-tooltip
            v-if="queryResults.truncated"
            text="Preview reads the first 1,000 rows only"
            location="top">
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
      <v-alert v-if="tableRows.length === 0" type="info" variant="tonal" prominent class="mb-4">
        <div class="text-body-1 font-weight-bold mb-2">
          <v-icon class="mr-2">mdi-table-off</v-icon>
          {{ emptyResult.title }}
        </div>
        <div class="text-body-2">{{ emptyResult.detail }}</div>
      </v-alert>

      <!-- Results Table -->
      <v-card v-else variant="outlined">
        <v-data-table
          :headers="tableHeaders"
          :items="tableRows"
          :items-per-page="1000"
          hide-default-footer
          density="compact"
          class="preview-table"
          fixed-header
          height="50vh">
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
                <span v-if="columnTypes[h.key]" class="column-type">{{ columnTypes[h.key] }}</span>
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
        </v-data-table>
      </v-card>

      <!-- Full-value / JSON viewer -->
      <CellValueDialog v-model="cellDialog.open" :state="cellDialog" />
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, toRef, watch, inject } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useLoQE } from '@/composables/useLoQE';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { useCsvDownload } from '@/composables/useCsvDownload';
import { useCellViewer } from '@/composables/useCellViewer';
import CorsConfigDialog from './CorsConfigDialog.vue';
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
  snapshots?: BigIntSnapshot[];
  refs?: Record<string, BigIntRef>;
  'current-snapshot-id'?: string;
  schemas?: BigIntSchema[];
  'current-schema-id'?: number;
}

interface BigIntLoadTableResult {
  metadata: BigIntTableMetadata;
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

// Namespace display: convert \x1F separators to dots for display and DuckDB SQL
const namespaceDisplay = computed(() => {
  const ns = props.namespaceId;
  if (ns.includes('\x1F')) return ns.split('\x1F').join('.');
  return ns;
});

// The warehouse's profile, loaded before the first preview attempt: whether the
// warehouse vends credentials at all is not derivable from `storageType`, and it
// decides between "STS is off" and a CORS diagnosis.
const storageProfile = ref<Record<string, any> | null>(null);

const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
  storageProfile,
);

const isLoading = ref(true);
const error = ref<string | null>(null);
const queryResults = ref<any>(null);
const resolvedWarehouseName = ref<string | undefined>(undefined);
const loadedTable = ref<BigIntLoadTableResult | null>(null);
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

// Compute headers from results
const tableHeaders = computed(() => {
  if (!queryResults.value?.columns) return [];
  return queryResults.value.columns.map((col: string) => ({
    title: col,
    key: col,
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

// Compute rows from results
const tableRows = computed(() => {
  if (!queryResults.value?.rows) return [];
  return queryResults.value.rows.map((row: any[]) => {
    const obj: Record<string, any> = {};
    queryResults.value.columns.forEach((col: string, index: number) => {
      obj[col] = row[index];
    });
    return obj;
  });
});

const formatMs = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

// "842 of 12,043 rows · 310 ms" — what came back, and what it cost
const resultSummary = computed(() => {
  const r = queryResults.value;
  if (!r) return '';
  const rows = r.truncated
    ? `${r.rowCount.toLocaleString()} of ${r.totalRowCount.toLocaleString()} rows`
    : `${r.rowCount.toLocaleString()} ${r.rowCount === 1 ? 'row' : 'rows'}`;
  return typeof r.executionTimeMs === 'number' ? `${rows} · ${formatMs(r.executionTimeMs)}` : rows;
});

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

    // Load table metadata via loadTableCustomized (uses json-bigint to preserve snapshot IDs)
    if (!loadedTable.value) {
      try {
        loadedTable.value = (await functions.loadTableCustomized(
          props.warehouseId,
          props.namespaceId,
          props.tableName,
        )) as BigIntLoadTableResult;
      } catch {
        // Non-critical — time travel just won't be available
        loadedTable.value = null;
      }
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

    const tablePath = `"${warehouseName}"."${namespaceDisplay.value}"."${props.tableName}"`;

    // Optional time-travel clause (snapshot IDs are BigInt-safe strings).
    // VARIANT columns that can't be Arrow-serialized are handled by the engine
    // (it retries with a text cast), so a plain SELECT * is enough here.
    const fromClause = selectedSnapshot.value
      ? `${tablePath} AT (VERSION => ${selectedSnapshot.value})`
      : tablePath;

    const results = await loqe.query(`SELECT * FROM ${fromClause} LIMIT 1000;`);
    queryResults.value = results;
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

    // Detect CORS errors that manifest as DuckDB read/download errors
    if (
      errorMsg.includes('Cannot read') ||
      errorMsg.includes('memory buffer') ||
      errorMsg.includes('Invalid Input Error') ||
      errorMsg.includes('Full download failed') ||
      errorMsg.includes('CORS error') ||
      errorMsg.toLowerCase().includes('cors')
    ) {
      error.value =
        `CORS Error: Cannot access object storage from the browser.\n\n` +
        `DuckDB tried to read Iceberg metadata files from object storage but ` +
        `the request was blocked by CORS policy.\n\n` +
        `Please contact your administrator to configure CORS on your storage bucket.`;
    } else {
      error.value = errorMsg;
    }
  } finally {
    isLoading.value = false;
  }
}

function downloadCSV() {
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
.preview-table :deep(tbody tr:nth-child(even) td) {
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
