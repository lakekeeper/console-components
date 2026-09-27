<template>
  <div class="home-statistics">
    <!-- Slim progress bar while loading -->
    <v-progress-linear
      v-if="loading || chartLoading"
      indeterminate
      color="primary"
      height="2"
      class="mb-1"
      style="border-radius: 4px"></v-progress-linear>

    <!-- The estate: the four totals on one line, and where the objects
         actually sit. Four big cards spent a quarter of the page saying four
         numbers, and two of them had nowhere to go. -->
    <v-card variant="outlined" class="estate-card mb-2">
      <v-card-text class="pa-3">
        <div class="d-flex align-center flex-wrap mb-2" style="gap: 6px 14px">
          <v-icon size="small" color="secondary">mdi-file-tree</v-icon>
          <span class="text-body-2 font-weight-bold">Estate</span>

          <div class="totals d-flex align-center flex-wrap" style="gap: 6px 14px">
            <button
              v-for="total in totals"
              :key="total.label"
              class="total"
              :class="{ 'total--link': total.to }"
              type="button"
              :disabled="!total.to"
              @click="total.to && emit('navigate', total.to)">
              <v-icon size="14" :color="total.color">{{ total.icon }}</v-icon>
              <span class="total-value text-body-2 font-weight-bold">
                {{ loading || total.unavailable ? '—' : fmt(total.value) }}
              </span>
              <span class="text-caption text-medium-emphasis">{{ total.label }}</span>
              <span v-if="!loading && total.delta" class="text-caption text-medium-emphasis">
                <v-icon size="11">{{ deltaIcon(total.delta) }}</v-icon>
                {{ deltaLabel(total.delta) }}
              </span>
            </button>
          </div>
        </div>

        <div v-if="projectsUnavailable" class="text-caption text-medium-emphasis mb-2 px-1">
          <v-icon size="12" color="warning">mdi-alert-outline</v-icon>
          {{ projectsUnavailable }}
        </div>
        <div v-if="loading" class="text-caption text-medium-emphasis pa-2">Counting…</div>
        <EstateGraph
          v-else
          :root="treeRoot"
          :load-children="loadTreeChildren"
          :height="340"
          @open="onTreeSelect" />
      </v-card-text>
    </v-card>

    <!-- API Calls Chart -->
    <v-card v-if="!chartForbidden" variant="outlined" class="chart-card">
      <v-card-text class="pa-3">
        <div class="d-flex align-center flex-wrap mb-1" style="gap: 8px">
          <v-icon size="small" color="secondary">mdi-chart-areaspline</v-icon>
          <span class="text-body-2 font-weight-bold">API Calls</span>
          <span class="text-caption text-medium-emphasis">{{ chartSubtitle }}</span>
          <v-spacer />
          <div v-if="activeSeries.length > 1" class="d-flex" style="gap: 10px">
            <span
              v-for="s in activeSeries"
              :key="s.key"
              class="d-flex align-center text-caption text-medium-emphasis">
              <span class="legend-dot mr-1" :style="{ background: s.color }"></span>
              {{ s.label }}
            </span>
          </div>
        </div>
        <div
          v-if="noChartData && !chartLoading"
          class="text-center pa-4 text-caption text-medium-emphasis">
          No API activity in the last {{ WINDOW_DAYS }} days
        </div>
        <template v-else-if="!chartLoading">
          <div class="text-caption text-medium-emphasis mb-1">
            {{ fmt(totalCalls) }} calls · {{ errorSummary }}
          </div>
          <StackedAreaChart
            :series="activeSeries"
            :points="chartPoints"
            :variant="chartVariant"
            :height="160" />
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { EndpointStatisticsResponse, WarehouseStatistics } from '../gen/management/types.gen';
import { useFunctions } from '../plugins/functions';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';
import StackedAreaChart from './StackedAreaChart.vue';
import EstateGraph, { type GraphNodeData as TreeNodeData } from './EstateGraph.vue';

// Only the counts that have a page behind them are offered as destinations.
// Tables and views are counted across the whole estate and live inside a
// namespace inside a warehouse, so there is no one list to open for them.
const emit = defineEmits<{
  (e: 'navigate', destination: 'projects' | 'warehouses'): void;
  (e: 'navigate-warehouse', warehouseId: string): void;
  // The per-warehouse object counts, so a host that needs them (the Plus
  // maintenance summary) does not repeat the fan-out that produced them.
  (
    e: 'estate',
    warehouses: Array<{ id: string; name: string; tables: number; views: number }>,
  ): void;
  (e: 'navigate-namespace', warehouseId: string, namespace: string): void;
  (
    e: 'navigate-tabular',
    warehouseId: string,
    namespace: string,
    name: string,
    kind: 'table' | 'view',
  ): void;
}>();

const functions = useFunctions();
const userStorage = useUserStore();
const visual = useVisualStore();

// ─── Constants ───────────────────────────────────────────────────────────────
const HOUR_MS = 3_600_000;
// How much history the chart asks for. What it *draws* is decided by what came
// back: a server started an hour ago gets hours, one with a week of traffic
// gets days. Asking for less than this leaves a young server with two points
// and a busy one with no context.
const WINDOW_DAYS = 14;
// Hours hold until the history is a full two weeks. A server with two or three
// days of traffic bucketed by day is three fat bars and no shape at all, while
// the same data by hour shows when the load actually arrives — so days are
// earned by having enough of them to be a trend, not by passing a day or two.
// At the limit the window is full, which is where days take over.
const HOURLY_SPAN_LIMIT_H = WINDOW_DAYS * 24;
// Fewer buckets than this and an area is a line drawn between a couple of
// points, which reads as a trend; bars state each bucket and imply nothing.
const BAR_THRESHOLD = 8;
// The window the tile deltas compare against.
const DELTA_HOURS = 24;
// Warehouse statistics rows are written lazily, at most one per hour and only
// when something changed, so this many rows normally reaches well past the
// delta window. When it does not, the response still carries a page token and
// we say nothing rather than guess.
const WH_STATS_PAGE = 30;
// How many warehouse-statistics requests are allowed in flight. An estate with
// a few hundred warehouses otherwise opens a few hundred sockets at once on a
// page the reader lands on first.
const STATS_CONCURRENCY = 8;

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const chartLoading = ref(true);
const noChartData = ref(false);
const chartForbidden = ref(false);
const projects = ref(0);
const warehouses = ref(0);
const tables = ref(0);
const views = ref(0);
// null = not known well enough to show (some warehouse's history did not reach
// back past the window).
// Why the project count is missing, when it is.
const projectsUnavailable = ref('');
const tablesDelta = ref<number | null>(null);
const viewsDelta = ref<number | null>(null);

const warehouseObjects = ref<Array<{ id: string; name: string; tables: number; views: number }>>(
  [],
);

// ─── Estate tree ─────────────────────────────────────────────────────────────
// Children are fetched when a node is opened, never up front: the estate is
// warehouses × namespaces × tables, and only the path the reader actually
// walks is worth a request.
const TREE_PAGE = 100;
// How many children one node draws. Past this the fan of links is denser than
// the labels it carries, and the right answer is a page built for listing.
const TREE_CHILDREN_CAP = 20;

const treeRoot = computed<TreeNodeData>(() => ({
  key: `project:${visual.projectSelected['project-id']}`,
  label: visual.projectSelected['project-name'] || 'Project',
  kind: 'project',
  note: `${warehouses.value} warehouses`,
  expandable: true,
}));

// The API takes a namespace path separated by unit separators; the tree and
// the router both carry the dotted form.
function toApiNamespace(path: string): string {
  return path.split('.').join('\x1F');
}

// The full child list of every node that has been opened, so "N more" pages
// through what is already in hand instead of asking the server again.
const childCache = new Map<string, TreeNodeData[]>();

// One page of a node's children, with a trailing signpost for the rest. The
// signpost carries where to resume, and opening it swaps it for the next page.
function page(parentKey: string, all: TreeNodeData[], offset: number): TreeNodeData[] {
  childCache.set(parentKey, all);
  const slice = all.slice(offset, offset + TREE_CHILDREN_CAP);
  const shown = offset + slice.length;
  if (shown >= all.length) return slice;
  return [
    ...slice,
    {
      key: `more:${parentKey}:${shown}`,
      label: `${all.length - shown} more`,
      kind: 'more',
      expandable: true,
      meta: { parentKey, offset: shown },
    },
  ];
}

async function loadTreeChildren(node: TreeNodeData): Promise<TreeNodeData[]> {
  const meta = (node.meta ?? {}) as {
    warehouseId?: string;
    warehouseName?: string;
    namespace?: string;
    entityId?: string;
    parentKey?: string;
    offset?: number;
  };

  if (node.kind === 'more') {
    const all = childCache.get(meta.parentKey ?? '') ?? [];
    return page(meta.parentKey ?? '', all, meta.offset ?? 0);
  }

  if (node.kind === 'project') {
    // Warehouses that hold something first: an estate of mostly-empty
    // warehouses otherwise opens on a screen of zeroes.
    const ranked = [...warehouseObjects.value].sort(
      (a, b) => b.tables + b.views - (a.tables + a.views) || a.name.localeCompare(b.name),
    );
    const all: TreeNodeData[] = ranked.map((wh) => ({
      key: `wh:${wh.id}`,
      label: wh.name,
      kind: 'warehouse' as const,
      note:
        wh.tables + wh.views > 0
          ? `${wh.tables} t${wh.views > 0 ? ` · ${wh.views} v` : ''}`
          : 'empty',
      expandable: true,
      meta: { warehouseId: wh.id, warehouseName: wh.name, entityId: wh.id },
    }));
    return page(node.key, all, 0);
  }

  if (node.kind === 'warehouse') {
    const warehouseId = meta.warehouseId as string;
    const resp = await functions.listNamespaces(
      warehouseId,
      undefined,
      undefined,
      false,
      TREE_PAGE,
    );
    const warehouseName = (meta.warehouseName as string) ?? '';
    const all: TreeNodeData[] = (resp.namespaces ?? []).map((ns: string[]) => {
      const path = ns.join('.');
      return {
        key: `ns:${warehouseId}:${path}`,
        label: ns[ns.length - 1],
        kind: 'namespace' as const,
        expandable: true,
        meta: {
          warehouseId,
          warehouseName,
          namespace: path,
          entityId: resp.namespaceMap?.[path] ?? '',
        },
      };
    });
    return page(node.key, all, 0);
  }

  if (node.kind === 'namespace') {
    const warehouseId = meta.warehouseId as string;
    const warehouseName = (meta.warehouseName as string) ?? '';
    const parent = meta.namespace as string;
    const apiNs = toApiNamespace(parent);
    // The uuid-returning variants: tags address a table or a view by id, and
    // the plain listings answer with names only.
    const [nested, tbls, vws, generic] = await Promise.all([
      functions.listNamespaces(warehouseId, apiNs, undefined, false, TREE_PAGE),
      functions.listTableUuids(warehouseId, apiNs, false),
      functions.listViewUuids(warehouseId, apiNs, false),
      // Not every server serves generic tables, and a refusal there must not
      // cost the reader the Iceberg ones.
      functions
        .listGenericTables(warehouseId, apiNs, undefined, false, TREE_PAGE)
        .catch(() => ({ identifiers: [] as any[] })),
    ]);

    const all: TreeNodeData[] = [];
    const base = { warehouseId, warehouseName, namespace: parent };

    for (const ns of nested.namespaces ?? []) {
      const path = ns.join('.');
      all.push({
        key: `ns:${warehouseId}:${path}`,
        label: ns[ns.length - 1],
        kind: 'namespace',
        expandable: true,
        meta: {
          warehouseId,
          warehouseName,
          namespace: path,
          entityId: nested.namespaceMap?.[path] ?? '',
        },
      });
    }
    tbls.names.forEach((name: string, i: number) => {
      all.push({
        key: `tbl:${warehouseId}:${parent}:${name}`,
        label: name,
        kind: 'table',
        expandable: false,
        meta: { ...base, name, entityId: tbls.uuids[i] ?? '' },
      });
    });
    vws.names.forEach((name: string, i: number) => {
      all.push({
        key: `view:${warehouseId}:${parent}:${name}`,
        label: name,
        kind: 'view',
        expandable: false,
        meta: { ...base, name, entityId: vws.uuids[i] ?? '' },
      });
    });
    for (const id of ((generic as any).identifiers ?? []) as any[]) {
      all.push({
        key: `gt:${warehouseId}:${parent}:${id.name}`,
        label: id.name,
        kind: 'generic-table',
        note: id.format ?? undefined,
        expandable: false,
        meta: { ...base, name: id.name, entityId: id['table-id'] ?? id.id ?? '' },
      });
    }

    return page(node.key, all, 0);
  }

  return [];
}

function onTreeSelect(node: TreeNodeData) {
  const meta = (node.meta ?? {}) as { warehouseId?: string; namespace?: string; name?: string };
  if (node.kind === 'warehouse' && meta.warehouseId) {
    emit('navigate-warehouse', meta.warehouseId);
  } else if (node.kind === 'namespace' && meta.warehouseId && meta.namespace) {
    emit('navigate-namespace', meta.warehouseId, meta.namespace);
  } else if ((node.kind === 'table' || node.kind === 'view') && meta.warehouseId) {
    emit('navigate-tabular', meta.warehouseId, meta.namespace ?? '', meta.name ?? '', node.kind);
  }
}

const totals = computed(() => [
  {
    label: 'projects',
    value: projects.value,
    unavailable: projectsUnavailable.value,
    icon: 'mdi-folder-multiple',
    color: 'primary',
    delta: null as number | null,
    to: 'projects' as const,
  },
  {
    label: 'warehouses',
    unavailable: '',
    value: warehouses.value,
    icon: 'mdi-warehouse',
    color: 'info',
    delta: null as number | null,
    to: 'warehouses' as const,
  },
  {
    label: 'tables',
    unavailable: '',
    value: tables.value,
    icon: 'mdi-table',
    color: 'success',
    delta: tablesDelta.value,
    to: undefined,
  },
  {
    label: 'views',
    unavailable: '',
    value: views.value,
    icon: 'mdi-eye',
    color: 'warning',
    delta: viewsDelta.value,
    to: undefined,
  },
]);

function fmt(n: number): string {
  return n.toLocaleString();
}

function deltaIcon(delta: number): string {
  if (delta > 0) return 'mdi-arrow-up';
  if (delta < 0) return 'mdi-arrow-down';
  return 'mdi-minus';
}

function deltaLabel(delta: number): string {
  if (delta === 0) return 'no change today';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()} today`;
}

// ─── Chart data ──────────────────────────────────────────────────────────────
interface HourRow {
  ts: number;
  success: number;
  error: number;
}

// Every hour the server returned, ascending. The chart buckets these; nothing
// else re-reads the server to change granularity.
const rawHours = ref<HourRow[]>([]);
// Start of the window that was asked for, floored to the hour.
const windowStart = ref(0);
// The server's history starts after the window start — a freshly started
// server has no seven days to show and should not be drawn as though it did.
const truncated = ref(false);

type Granularity = 'hour' | 'day';

function bucketStart(ts: number, gran: Granularity): number {
  const d = new Date(ts);
  if (gran === 'day') d.setHours(0, 0, 0, 0);
  else d.setMinutes(0, 0, 0);
  return d.getTime();
}

// Stepped through a Date rather than by adding milliseconds so a DST boundary
// does not shift every following bucket by an hour.
function nextBucket(ts: number, gran: Granularity): number {
  const d = new Date(ts);
  if (gran === 'day') d.setDate(d.getDate() + 1);
  else d.setTime(d.getTime() + HOUR_MS);
  return d.getTime();
}

const granularity = computed<Granularity>(() => {
  const raw = rawHours.value;
  if (raw.length === 0) return 'hour';
  const span = Date.now() - raw[0].ts;
  return span >= HOURLY_SPAN_LIMIT_H * HOUR_MS ? 'day' : 'hour';
});

// Continuous buckets across the loaded span, so a quiet hour is a gap at zero
// rather than a straight line drawn over it.
const chartRows = computed<HourRow[]>(() => {
  const raw = rawHours.value;
  if (raw.length === 0) return [];
  const gran = granularity.value;

  const sums = new Map<number, { success: number; error: number }>();
  for (const r of raw) {
    const key = bucketStart(r.ts, gran);
    const entry = sums.get(key) ?? { success: 0, error: 0 };
    entry.success += r.success;
    entry.error += r.error;
    sums.set(key, entry);
  }

  const start = bucketStart(Math.max(windowStart.value, raw[0].ts), gran);
  const end = bucketStart(Date.now(), gran);
  const rows: HourRow[] = [];
  for (let ts = start; ts <= end && rows.length < 400; ts = nextBucket(ts, gran)) {
    rows.push({ ts, ...(sums.get(ts) ?? { success: 0, error: 0 }) });
  }
  return rows;
});

const chartVariant = computed<'area' | 'bar'>(() =>
  chartRows.value.length < BAR_THRESHOLD ? 'bar' : 'area',
);

// Colours as CSS variables rather than resolved hex: the chart then follows a
// theme switch (and console-plus runtime branding) without being redrawn.
const SERIES = {
  success: { key: 'success', label: 'Success', color: 'rgb(var(--v-theme-success))' },
  error: { key: 'error', label: 'Errors', color: 'rgb(var(--v-theme-error))' },
};

const totalCalls = computed(() => rawHours.value.reduce((sum, r) => sum + r.success + r.error, 0));
const totalErrors = computed(() => rawHours.value.reduce((sum, r) => sum + r.error, 0));

const errorSummary = computed(() => {
  if (totalErrors.value === 0) return 'no errors';
  const pct = (totalErrors.value / Math.max(1, totalCalls.value)) * 100;
  return `${fmt(totalErrors.value)} errors (${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%)`;
});

// A single series needs no legend; the heading names it.
const activeSeries = computed(() =>
  totalErrors.value > 0 ? [SERIES.success, SERIES.error] : [SERIES.success],
);

function hourLabel(ts: number): string {
  const d = new Date(ts);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:00`;
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? hhmm : `${d.toLocaleDateString()} ${hhmm}`;
}

const chartSubtitle = computed(() => {
  const per = granularity.value === 'day' ? 'per day' : 'per hour';
  const raw = rawHours.value;
  if (raw.length === 0) return per;
  if (truncated.value) return `${per} · since ${hourLabel(raw[0].ts)}`;
  return `${per} · last ${WINDOW_DAYS} days`;
});

const chartPoints = computed(() => {
  const gran = granularity.value;
  const rows = chartRows.value;
  // Only about a dozen ticks are drawn, so across several days of hours a bare
  // "14:00" lands on a different day each time it appears and says nothing
  // about which. The day comes along as soon as the span crosses one.
  const multiDay =
    gran === 'hour' &&
    rows.length > 0 &&
    new Date(rows[0].ts).toDateString() !== new Date(rows[rows.length - 1].ts).toDateString();

  return rows.map((r) => {
    const d = new Date(r.ts);
    const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const hour = `${String(d.getHours()).padStart(2, '0')}:00`;
    return {
      label: gran === 'day' ? d.toLocaleDateString() : d.toLocaleString(),
      short: gran === 'day' ? day : multiDay ? `${day} ${hour}` : hour,
      values: { success: r.success, error: r.error },
    };
  });
});

// ─── Concurrency ─────────────────────────────────────────────────────────────
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─── Load counts ─────────────────────────────────────────────────────────────
interface WarehouseCounts {
  tables: number;
  views: number;
  // Counts as of the start of the delta window, or null where the warehouse's
  // history does not reach that far back.
  baseTables: number | null;
  baseViews: number | null;
}

async function loadWarehouseCounts(warehouseId: string): Promise<WarehouseCounts> {
  const empty: WarehouseCounts = { tables: 0, views: 0, baseTables: 0, baseViews: 0 };
  try {
    const resp = await functions.getWarehouseStatistics(warehouseId, WH_STATS_PAGE);
    const stats: WarehouseStatistics[] = [...(resp?.stats ?? [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    if (stats.length === 0) return empty;

    const latest = stats[0];
    const cutoff = Date.now() - DELTA_HOURS * HOUR_MS;
    const baseline = stats.find((s) => new Date(s.timestamp).getTime() <= cutoff);

    // No row older than the cutoff: either the whole history is inside the
    // window (so everything counted is new), or it was truncated by the page
    // size and we cannot tell.
    const historyComplete = !resp?.['next-page-token'];

    return {
      tables: latest['number-of-tables'],
      views: latest['number-of-views'],
      baseTables: baseline ? baseline['number-of-tables'] : historyComplete ? 0 : null,
      baseViews: baseline ? baseline['number-of-views'] : historyComplete ? 0 : null,
    };
  } catch {
    // Skip warehouses that fail — counts are best-effort.
    return empty;
  }
}

async function loadCounts() {
  loading.value = true;
  try {
    // Counted on its own: on a server with more than one project the Cedar
    // authorizer refuses the project listing outright (one authz batch cannot
    // span two projects), and that refusal must not take the estate with it —
    // the warehouses below are a different request and usually succeed.
    try {
      const projectList = await functions.loadProjectList(false);
      projects.value = projectList?.length ?? 0;
      projectsUnavailable.value = '';
    } catch (error: any) {
      projects.value = 0;
      projectsUnavailable.value =
        error?.error?.message || 'Projects could not be listed for this user.';
    }

    const whResp = await functions.listWarehouses(false);
    const whList = whResp?.warehouses ?? [];
    warehouses.value = whList.length;

    const counts = await mapPool(whList, STATS_CONCURRENCY, (wh: any) =>
      loadWarehouseCounts(wh['warehouse-id'] ?? wh.id),
    );

    warehouseObjects.value = whList.map((wh: any, i: number) => ({
      id: wh['warehouse-id'] ?? wh.id,
      name: wh.name ?? wh['warehouse-id'] ?? wh.id,
      tables: counts[i]?.tables ?? 0,
      views: counts[i]?.views ?? 0,
    }));
    emit('estate', warehouseObjects.value);

    tables.value = counts.reduce((sum, c) => sum + c.tables, 0);
    views.value = counts.reduce((sum, c) => sum + c.views, 0);

    // One unknown baseline makes the whole sum unknown; better to show no
    // delta than a number that is short by an unknown amount.
    const tablesKnown = counts.every((c) => c.baseTables !== null);
    const viewsKnown = counts.every((c) => c.baseViews !== null);
    tablesDelta.value = tablesKnown
      ? tables.value - counts.reduce((sum, c) => sum + (c.baseTables ?? 0), 0)
      : null;
    viewsDelta.value = viewsKnown
      ? views.value - counts.reduce((sum, c) => sum + (c.baseViews ?? 0), 0)
      : null;
  } catch {
    // Silently ignore – counts are best-effort
  } finally {
    loading.value = false;
  }
}

// ─── Load chart data ─────────────────────────────────────────────────────────
async function loadChart() {
  chartLoading.value = true;
  noChartData.value = false;
  try {
    const canFetch =
      visual.getServerInfo()['authz-backend'] === 'allow-all' ||
      userStorage.getUser().access_token !== '';

    if (!canFetch) {
      noChartData.value = true;
      return;
    }

    const rangeSpec = {
      end: new Date().toISOString(),
      interval: `P${WINDOW_DAYS}D`,
      type: 'window' as const,
    };

    const result: EndpointStatisticsResponse = await functions.getEndpointStatistics(
      { type: 'all' },
      rangeSpec,
      null,
      false,
    );

    // The server keeps one entry per hour, which is the granularity the chart
    // draws at — bucket on the hour and keep every one of them.
    const byHour = new Map<number, { success: number; error: number }>();

    result.timestamps.forEach((ts: string, i: number) => {
      const endpoints = result['called-endpoints'][i];
      if (!endpoints) return;

      const d = new Date(ts);
      d.setMinutes(0, 0, 0);
      const key = d.getTime();

      const entry = byHour.get(key) ?? { success: 0, error: 0 };
      endpoints.forEach((ep: any) => {
        const count = ep.count ?? 0;
        if (ep['status-code'] >= 200 && ep['status-code'] < 400) entry.success += count;
        else entry.error += count;
      });
      byHour.set(key, entry);
    });

    if (byHour.size === 0) {
      rawHours.value = [];
      noChartData.value = true;
      return;
    }

    const nowHour = new Date();
    nowHour.setMinutes(0, 0, 0);
    const start = nowHour.getTime() - (WINDOW_DAYS * 24 - 1) * HOUR_MS;
    const rows: HourRow[] = Array.from(byHour.entries())
      .map(([ts, entry]) => ({ ts, ...entry }))
      .filter((r) => r.ts >= start)
      .sort((a, b) => a.ts - b.ts);

    windowStart.value = start;
    rawHours.value = rows;
    truncated.value = rows.length > 0 && rows[0].ts > start;
    noChartData.value = rows.length === 0;
  } catch (error: any) {
    const status = error?.error?.code || error?.status || error?.response?.status || 0;
    if (status === 403) {
      chartForbidden.value = true;
    } else {
      functions.handleError(error, 'HomeStatistics:loadChart');
    }
    noChartData.value = true;
  } finally {
    chartLoading.value = false;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function loadStatistics() {
  await Promise.all([loadCounts(), loadChart()]);
}

defineExpose({ loadStatistics });

onMounted(() => {
  loadStatistics();
});

// Every count and every point here is scoped to the selected project by the
// `x-project-id` header, which `functions` reads fresh on each request — so a
// switch changes what these numbers mean without changing the numbers. Nothing
// else tells this pane to ask again: the switch may happen from the app bar
// with the reader already on this page, where there is no navigation to
// remount it.
watch(
  () => visual.projectSelected['project-id'],
  (projectId, previous) => {
    if (projectId && projectId !== previous) loadStatistics();
  },
);
</script>

<style scoped>
.home-statistics {
  position: relative;
}

.estate-card {
  border-radius: 12px !important;
}

/* A total with nowhere to go is not a button: no pointer, no hover, no ripple.
   The bare `@click` on the old cards gave Vuetify a link to style, which is
   what made tables and views look clickable. */
.total {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 6px;
  background: none;
  border: none;
  color: inherit;
  cursor: default;
  font: inherit;
}

.total--link {
  cursor: pointer;
}

.total--link:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.total-value {
  font-variant-numeric: tabular-nums;
}

.chart-card {
  border-radius: 12px !important;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
</style>
