<template>
  <div class="home-statistics">
    <!-- Slim progress bar while loading -->
    <v-progress-linear
      v-if="(showEstate && loading) || (showChart && chartLoading)"
      indeterminate
      color="primary"
      height="2"
      class="mb-1"
      style="border-radius: 4px"></v-progress-linear>

    <!-- The estate: the four totals on one line, and where the objects
         actually sit. Four big cards spent a quarter of the page saying four
         numbers, and two of them had nowhere to go. -->
    <v-card v-if="showEstate" variant="outlined" class="estate-card mb-2">
      <v-card-text class="pa-4">
        <div class="d-flex align-center mb-4" style="gap: 8px">
          <v-icon size="small" color="secondary">mdi-file-tree</v-icon>
          <span class="text-body-2 font-weight-bold">Estate</span>
          <v-spacer />
          <span v-if="!loading" class="text-caption text-medium-emphasis">
            {{ occupied }} of {{ warehouses.toLocaleString() }} warehouses hold objects
          </span>
        </div>

        <div v-if="projectsUnavailable" class="text-caption text-medium-emphasis mb-3">
          <v-icon size="12" color="warning">mdi-alert-outline</v-icon>
          {{ projectsUnavailable }}
        </div>

        <!-- One block per total, given the room to be read across a table:
             four numbers on one line was a footnote, and a footnote is not
             what the page opens on. -->
        <div class="totals">
          <button
            v-for="total in totals"
            :key="total.label"
            class="total"
            :class="{ 'total--link': total.to }"
            type="button"
            :disabled="!total.to"
            @click="total.to && emit('navigate', total.to)">
            <v-icon size="20" :color="total.color" class="mb-1">{{ total.icon }}</v-icon>
            <span class="total-value text-h4 font-weight-bold">
              {{ loading || total.unavailable ? '—' : fmt(total.value) }}
            </span>
            <span class="text-caption text-medium-emphasis total-label">{{ total.label }}</span>
            <!-- Always rendered, so a delta appearing does not shift the row. -->
            <span class="delta-line text-caption text-medium-emphasis">
              <template v-if="!loading && total.delta">
                <v-icon size="11">{{ deltaIcon(total.delta) }}</v-icon>
                {{ deltaLabel(total.delta) }}
              </template>
            </span>
            <v-icon v-if="total.to" size="12" class="total-chevron">mdi-chevron-right</v-icon>
          </button>
        </div>
      </v-card-text>
    </v-card>

    <!-- API Calls Chart -->
    <v-card v-if="showChart && !chartForbidden" variant="outlined" class="chart-card">
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

// Only the counts that have a page behind them are offered as destinations.
// Tables and views are counted across the whole estate and live inside a
// namespace inside a warehouse, so there is no one list to open for them.
// Home renders the estate card and the traffic chart in different places, so
// one component renders either half and fetches only what that half shows.
const props = withDefaults(defineProps<{ section?: 'all' | 'estate' | 'chart' }>(), {
  section: 'all',
});

const showEstate = computed(() => props.section !== 'chart');
const showChart = computed(() => props.section !== 'estate');

const emit = defineEmits<{
  (e: 'navigate', destination: 'projects' | 'warehouses'): void;
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

const occupied = computed(
  () => warehouseObjects.value.filter((w) => w.tables + w.views > 0).length,
);

const warehouseObjects = ref<Array<{ id: string; name: string; tables: number; views: number }>>(
  [],
);

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
  // Against the window that was asked for, not against `Date.now()`. The rows
  // are already filtered to start at `windowStart`, so the span from the oldest
  // row to now could never reach the limit and every server got hours forever.
  // Reaching the window start is exactly what "a full two weeks of history"
  // means, and it is the same test `truncated` makes for the subtitle.
  return raw[0].ts <= windowStart.value ? 'day' : 'hour';
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

async function loadCounts(seq: number) {
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

    // The fan-out over every warehouse is slow enough that a second project
    // switch lands mid-flight; without this the first project's estate arrives
    // afterwards and is emitted under the second one's name.
    if (seq !== loadSeq) return;

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
    if (seq === loadSeq) loading.value = false;
  }
}

// ─── Load chart data ─────────────────────────────────────────────────────────
async function loadChart(seq: number) {
  chartLoading.value = true;
  noChartData.value = false;
  // A refusal belongs to the project that was asked, not to this component: a
  // project the reader may not read statistics for used to hide the chart for
  // every project they switched to afterwards.
  chartForbidden.value = false;
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

    if (seq !== loadSeq) return;

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
    if (seq !== loadSeq) return;
    const status = error?.error?.code || error?.status || error?.response?.status || 0;
    if (status === 403) {
      chartForbidden.value = true;
    } else {
      functions.handleError(error, 'HomeStatistics:loadChart');
    }
    noChartData.value = true;
  } finally {
    if (seq === loadSeq) chartLoading.value = false;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
//
// Which load is the current one. Switching project restarts both halves while
// the previous pair is still out, and each half writes several refs plus an
// emit — so every one of those is checked against the ticket taken here rather
// than landing on top of the project the reader has since moved to.
let loadSeq = 0;

async function loadStatistics() {
  const seq = ++loadSeq;
  await Promise.all([
    showEstate.value ? loadCounts(seq) : Promise.resolve(),
    showChart.value ? loadChart(seq) : Promise.resolve(),
  ]);
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

.totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* A total with nowhere to go is not a button: no pointer, no hover, no
   chevron. Binding a bare click to a card is what made tables and views look
   clickable when they were not. */
.total {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 12px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  color: inherit;
  cursor: default;
  font: inherit;
  text-align: left;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.total--link {
  cursor: pointer;
}

.total--link:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-color: rgba(var(--v-theme-on-surface), 0.12);
}

.total-value {
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.total-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.total-chevron {
  position: absolute;
  top: 10px;
  right: 10px;
  opacity: 0.35;
}

.delta-line {
  min-height: 18px;
  line-height: 18px;
}

@media (max-width: 700px) {
  .totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
