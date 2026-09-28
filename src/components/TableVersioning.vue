<template>
  <div>
    <!-- Thin bar on refreshes so the graph stays visible while reloading -->
    <v-progress-linear v-if="loading && loaded" indeterminate color="primary"></v-progress-linear>

    <!-- Full spinner on the first load (metadata can be large for long histories) -->
    <div
      v-if="loading && !loaded"
      class="d-flex flex-column align-center justify-center text-medium-emphasis py-12">
      <v-progress-circular
        indeterminate
        color="primary"
        size="48"
        class="mb-3"></v-progress-circular>
      Loading version history…
    </div>

    <TableVersioningVisualization
      v-if="loaded"
      :table="table"
      :snapshot-history="snapshotHistory"
      :can-rollback="canCommit"
      :warehouse-id="props.warehouseId"
      :namespace-path="props.namespaceId"
      :table-name="props.tableName"
      @rollback="loadTableData"
      @fast-forward="loadTableData"
      @create-branch="loadTableData"
      @rename-branch="loadTableData"
      @delete-branch="loadTableData"
      @create-tag="loadTableData"
      @rename-tag="loadTableData"
      @delete-tag="loadTableData"
      @refresh="loadTableData" />

    <!-- The same snapshots as a list. The graph answers "what happened to this
         table"; the list answers "what does snapshot 46301807… say", which is
         the question you arrive with from a query plan or a log line. It used
         to sit on the details tab, loading the metadata a second time. -->
    <section v-if="snapshotRows.length" class="tdx-section mb-4 px-4">
      <div class="tdx-head">
        <v-icon icon="mdi-camera-outline" size="16" color="info" class="mr-2"></v-icon>
        Snapshots
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ snapshotRows.length }}</v-chip>
        <v-spacer></v-spacer>
        <v-select
          v-if="branchOptions.length > 1"
          v-model="selectedBranch"
          :items="branchOptions"
          density="compact"
          variant="outlined"
          hide-details
          prepend-inner-icon="mdi-source-branch"
          label="Branch"
          style="max-width: 220px"
          no-data-text="No branches available"></v-select>
      </div>
      <v-data-table
        :headers="snapshotHeaders"
        :items="snapshotRows"
        :items-per-page="10"
        density="compact"
        item-value="id"
        hover
        fixed-header
        class="snapshot-table"
        @click:row="openSnapshot">
        <template #item.refs="{ item }">
          <v-chip
            v-for="r in item.refs"
            :key="r"
            size="x-small"
            :color="r === 'main' ? 'primary' : 'default'"
            variant="tonal"
            class="mr-1">
            <v-icon start size="x-small">mdi-source-branch</v-icon>
            {{ r }}
          </v-chip>
          <span v-if="item.refs.length === 0" class="text-disabled">—</span>
        </template>
        <template #item.committed="{ item }">
          <span :title="item.committedAbs" style="white-space: nowrap">
            {{ item.committedAbs }}
          </span>
          <v-chip v-if="item.current" size="x-small" color="success" variant="flat" class="ml-1">
            current
          </v-chip>
        </template>
        <template #item.operation="{ item }">
          <v-chip :color="getOperationColor(item.operation)" size="x-small" variant="flat">
            {{ item.operation }}
          </v-chip>
        </template>
        <template #item.records="{ item }">{{ fmtNum(item.totalRecords) }}</template>
        <template #item.delta="{ item }">
          <span v-if="Number(item.addedRecords) > 0" class="text-success">
            +{{ fmtNum(item.addedRecords) }}
          </span>
          <span v-if="Number(item.deletedRecords) > 0" class="text-error ml-1">
            −{{ fmtNum(item.deletedRecords) }}
          </span>
          <span v-if="!(Number(item.addedRecords) > 0) && !(Number(item.deletedRecords) > 0)">
            —
          </span>
        </template>
        <template #item.files="{ item }">{{ fmtNum(item.totalDataFiles) }}</template>
        <template #item.id="{ item }">
          <span class="font-mono">{{ item.id }}</span>
        </template>
        <template #item.actions>
          <v-icon size="small" class="text-medium-emphasis">mdi-open-in-new</v-icon>
        </template>
      </v-data-table>
    </section>

    <!-- Snapshot detail popup -->
    <v-dialog v-model="snapshotDialog" max-width="800" scrollable>
      <TableSnapshotDetails
        v-if="selectedSnapshot"
        :snapshot="selectedSnapshot"
        title="Snapshot detail">
        <template #append>
          <v-btn icon="mdi-close" variant="text" @click="snapshotDialog = false"></v-btn>
        </template>
      </TableSnapshotDetails>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, computed, ref } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import TableVersioningVisualization from './TableVersioningVisualization.vue';
import TableSnapshotDetails from './TableSnapshotDetails.vue';
import type { LoadTableResult, Snapshot } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const functions = useFunctions();

const table = reactive<LoadTableResult>({
  metadata: {
    'format-version': 0,
    'table-uuid': '',
  },
});

const tableId = computed(() => table.metadata['table-uuid'] || '');
const { canCommit } = useTablePermissions(
  tableId,
  computed(() => props.warehouseId),
);

const snapshotHistory = reactive<Snapshot[]>([]);

const loading = ref(false);
// Whether the table metadata has been loaded at least once.
const loaded = computed(() => !!table.metadata['table-uuid']);

onMounted(loadTableData);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], loadTableData);

async function loadTableData() {
  loading.value = true;
  try {
    Object.assign(
      table,
      await functions.loadTableCustomized(props.warehouseId, props.namespaceId, props.tableName),
    );

    // Process snapshot history - sort by timestamp descending (newest first)
    snapshotHistory.splice(0, snapshotHistory.length);
    if (table.metadata.snapshots) {
      const sortedSnapshots = [...table.metadata.snapshots].sort((a, b) => {
        return (b['timestamp-ms'] || 0) - (a['timestamp-ms'] || 0);
      });
      snapshotHistory.push(...sortedSnapshots);
    }
  } catch (error) {
    functions.handleError(error, 'loadTableData', true);
  } finally {
    loading.value = false;
  }
}

// --- All snapshots, as a digestible table + detail popup --------------------
const snapshotDialog = ref(false);
const selectedSnapshot = ref<any>(null);
function openSnapshot(_event: unknown, row: { item: { raw: any } }) {
  selectedSnapshot.value = row.item.raw;
  snapshotDialog.value = true;
}
const snapshotHeaders = [
  { title: 'Committed', key: 'committed' },
  { title: 'Refs', key: 'refs', sortable: false },
  { title: 'Operation', key: 'operation' },
  { title: 'Records', key: 'records', align: 'end' as const },
  { title: 'Δ Records', key: 'delta', align: 'end' as const },
  { title: 'Data files', key: 'files', align: 'end' as const },
  { title: 'Snapshot ID', key: 'id' },
  { title: '', key: 'actions', align: 'end' as const, sortable: false },
];

// Branch/tag refs (name → { snapshot-id, type }).
const branchRefs = computed(() => {
  const refs = (table.metadata as any)?.refs as Record<string, any> | undefined;
  return refs && typeof refs === 'object' ? refs : {};
});
const branchOptions = computed(() => [
  { title: 'All snapshots', value: '__all__' },
  ...Object.keys(branchRefs.value).map((name) => ({
    title: `${name} · ${branchRefs.value[name]?.type ?? 'branch'}`,
    value: name,
  })),
]);
const selectedBranch = ref('__all__');
// Default to the `main` branch when the table has one (set once refs load).
let branchInitialized = false;
watch(
  branchRefs,
  (refs) => {
    if (branchInitialized || !refs || Object.keys(refs).length === 0) return;
    if (refs['main']) selectedBranch.value = 'main';
    branchInitialized = true;
  },
  { immediate: true },
);
// snapshot-id → ref names that point at it (tips)
const refTips = computed(() => {
  const map: Record<string, string[]> = {};
  for (const [name, r] of Object.entries(branchRefs.value)) {
    const sid = String((r as any)?.['snapshot-id']);
    (map[sid] ??= []).push(name);
  }
  return map;
});

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
// Format integer counters string-safely so i64 values above
// Number.MAX_SAFE_INTEGER are grouped without precision loss.
const fmtNum = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '0';
  const s = String(v);
  if (/^-?\d+$/.test(s)) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = Number(s);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};

const snapshotRows = computed(() => {
  const snaps = table.metadata.snapshots;
  if (!Array.isArray(snaps)) return [];
  const currentId = String(table.metadata['current-snapshot-id']);

  // When a branch/tag is selected, keep only its lineage (walk parent links from the tip).
  let allowed: Set<string> | null = null;
  if (selectedBranch.value !== '__all__') {
    const byId = new Map(snaps.map((s: any) => [String(s['snapshot-id']), s]));
    const tip = String(branchRefs.value[selectedBranch.value]?.['snapshot-id'] ?? '');
    allowed = new Set();
    let cur = tip;
    while (cur && byId.has(cur) && !allowed.has(cur)) {
      allowed.add(cur);
      cur = String(byId.get(cur)?.['parent-snapshot-id'] ?? '');
    }
  }

  return [...snaps]
    .filter((s: any) => !allowed || allowed.has(String(s['snapshot-id'])))
    .sort((a: any, b: any) => toNum(b['timestamp-ms']) - toNum(a['timestamp-ms']))
    .map((s: any) => {
      const summary = s.summary ?? {};
      const id = String(s['snapshot-id']);
      return {
        id,
        raw: s,
        refs: refTips.value[id] ?? [],
        committedAbs: s['timestamp-ms'] ? absoluteTimestamp(s['timestamp-ms']) : '—',
        operation: summary.operation ?? '—',
        current: id === currentId,
        totalRecords: summary['total-records'],
        addedRecords: summary['added-records'],
        deletedRecords: summary['deleted-records'],
        totalDataFiles: summary['total-data-files'],
      };
    });
});

const getOperationColor = (operation: string): string => {
  const colors: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };
  return colors[operation?.toLowerCase()] || 'default';
};

// Time is shown absolutely here: a snapshot list is read against a log line or
// a query plan, and "2 d ago" cannot be matched to either.
function absoluteTimestamp(timestampMs: number): string {
  return timestampMs ? new Date(timestampMs).toLocaleString() : '';
}

defineExpose({
  loadTableData,
});
</script>

<style scoped>
/* Same section shape as the rest of the table's tabs: a heading and a hairline,
   no card frame. Kept in step with the block in TableDetails.vue. */
.tdx-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-height: 32px;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.tdx-head :deep(.v-btn),
.tdx-head :deep(.v-chip),
.tdx-head :deep(.v-label),
.tdx-head :deep(.v-field) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
.tdx-section {
  min-width: 0;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

/* Ten rows and then the table scrolls, header pinned, so a page size of 25 or
   50 does not push the graph's own controls off the screen. */
.snapshot-table :deep(.v-table__wrapper) {
  max-height: calc(10 * 36px + 40px);
}
</style>
