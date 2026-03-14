<template>
  <v-card flat style="height: 100%">
    <v-card-text class="pa-0" style="height: 100%">
      <div class="d-flex" style="height: 100%; overflow: hidden">
        <!-- Vertical Tabs -->
        <v-tabs
          v-model="section"
          direction="vertical"
          density="compact"
          color="primary"
          class="flex-shrink-0"
          style="border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12); min-width: 170px">
          <v-tab value="endpoints" prepend-icon="mdi-api">Endpoints</v-tab>
          <v-tab value="objects" prepend-icon="mdi-database">Tables &amp; Views</v-tab>
        </v-tabs>

        <!-- Tab content -->
        <div
          class="flex-grow-1 pa-4"
          style="min-width: 0; min-height: 0; height: 100%; overflow-y: auto">
          <v-tabs-window v-model="section">
            <!-- ════════════════════════════════════════════════════════════════
                 TAB 1 — Endpoint Statistics
                 ════════════════════════════════════════════════════════════ -->
            <v-tabs-window-item value="endpoints">
              <!-- Controls row -->
              <div class="d-flex align-center ga-2 mb-2">
                <v-btn-toggle v-model="activeView" mandatory density="compact" variant="outlined">
                  <v-btn value="charts" size="small">
                    <v-icon start>mdi-chart-areaspline</v-icon>
                    Charts
                  </v-btn>
                  <v-btn value="table" size="small">
                    <v-icon start>mdi-table</v-icon>
                    Table
                  </v-btn>
                </v-btn-toggle>

                <v-divider vertical class="mx-1" />

                <v-btn-toggle v-model="aggregation" mandatory density="compact" variant="outlined">
                  <v-btn value="hour" size="small">Hour</v-btn>
                  <v-btn value="day" size="small">Day</v-btn>
                  <v-btn value="week" size="small">Week</v-btn>
                  <v-btn value="month" size="small">Month</v-btn>
                  <v-btn value="year" size="small">Year</v-btn>
                </v-btn-toggle>

                <v-spacer />
                <v-btn
                  v-if="activeView === 'table'"
                  size="small"
                  prepend-icon="mdi-file-download"
                  variant="outlined"
                  color="primary"
                  @click="downloadEndpointCSV">
                  Download CSV
                </v-btn>
              </div>

              <!-- Filters row -->
              <v-row dense class="mb-3 align-center">
                <v-col cols="12" md="4">
                  <v-select
                    v-model="selectedStatusCodes"
                    :items="STATUS_CATEGORIES"
                    label="Status Codes"
                    multiple
                    chips
                    closable-chips
                    density="compact"
                    variant="outlined"
                    hide-details>
                    <template #chip="{ item, props: chipProps }">
                      <v-chip
                        v-bind="chipProps"
                        :color="STATUS_COLORS[item.value]"
                        size="small"
                        label
                        variant="flat"
                        class="font-weight-bold">
                        {{ item.value }}
                      </v-chip>
                    </template>
                  </v-select>
                </v-col>
                <v-col cols="6" md="3">
                  <v-text-field
                    v-model="dateFrom"
                    label="From"
                    type="datetime-local"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                    :max="dateTo || undefined" />
                </v-col>
                <v-col cols="6" md="3">
                  <v-text-field
                    v-model="dateTo"
                    label="To"
                    type="datetime-local"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                    :min="dateFrom || undefined" />
                </v-col>
                <v-col cols="12" md="2" class="d-flex align-center ga-1">
                  <v-btn
                    size="small"
                    variant="flat"
                    color="primary"
                    prepend-icon="mdi-filter"
                    :loading="loading"
                    @click="applyFilters">
                    Apply
                  </v-btn>
                  <v-btn size="small" variant="text" @click="resetFilters">Reset</v-btn>
                </v-col>
              </v-row>

              <!-- Loading -->
              <div v-if="loading" class="pa-4">
                <div class="text-body-2 text-medium-emphasis mb-2">Loading statistics…</div>
                <v-progress-linear indeterminate color="primary" rounded />
              </div>

              <!-- Charts view -->
              <div v-else-if="activeView === 'charts'">
                <v-row>
                  <v-col cols="12">
                    <div class="text-subtitle-2 mb-2">API Traffic Over Time</div>
                    <div ref="areaChartRef" class="d3-chart" />
                  </v-col>
                </v-row>
                <v-row>
                  <v-col cols="12" md="3">
                    <div class="text-subtitle-2 mb-2">Status Code Distribution</div>
                    <div ref="donutChartRef" class="d3-chart d3-chart--donut" />
                  </v-col>
                  <v-col cols="12" md="9">
                    <div class="text-subtitle-2 mb-2">Top Endpoints</div>
                    <div ref="barChartRef" class="d3-chart" />
                  </v-col>
                </v-row>
              </div>

              <!-- Table view -->
              <div v-else-if="activeView === 'table'">
                <v-data-table-virtual
                  fixed-header
                  height="calc(100vh - 340px)"
                  :headers="endpointHeaders"
                  hover
                  :items="aggregatedRows"
                  density="compact">
                  <template v-slot:item.timestamp="{ item }">
                    {{ fmtDate(item.timestamp) }}
                  </template>
                  <template v-slot:item.statusCode="{ item }">
                    <v-chip
                      :color="statusColor(item.statusCode)"
                      size="x-small"
                      label
                      variant="flat"
                      class="font-weight-bold">
                      {{ item.statusCode }}
                    </v-chip>
                  </template>
                  <template #no-data>
                    <div class="text-body-2 pa-4">No statistics available</div>
                  </template>
                </v-data-table-virtual>
              </div>
            </v-tabs-window-item>

            <!-- ════════════════════════════════════════════════════════════════
                 TAB 2 — Warehouse Object Statistics (tables & views over time)
                 ════════════════════════════════════════════════════════════ -->
            <v-tabs-window-item value="objects">
              <div class="d-flex align-center ga-2 mb-2">
                <v-btn-toggle v-model="objectsView" mandatory density="compact" variant="outlined">
                  <v-btn value="chart" size="small">
                    <v-icon start>mdi-chart-line</v-icon>
                    Chart
                  </v-btn>
                  <v-btn value="table" size="small">
                    <v-icon start>mdi-table</v-icon>
                    Table
                  </v-btn>
                </v-btn-toggle>

                <v-divider vertical class="mx-1" />

                <v-btn-toggle
                  v-model="objectsAggregation"
                  mandatory
                  density="compact"
                  variant="outlined">
                  <v-btn value="hour" size="small">Hour</v-btn>
                  <v-btn value="day" size="small">Day</v-btn>
                  <v-btn value="week" size="small">Week</v-btn>
                  <v-btn value="month" size="small">Month</v-btn>
                  <v-btn value="year" size="small">Year</v-btn>
                </v-btn-toggle>

                <v-spacer />
                <v-btn
                  v-if="objectsView === 'table'"
                  size="small"
                  prepend-icon="mdi-file-download"
                  variant="outlined"
                  color="primary"
                  @click="downloadObjectsCSV">
                  Download CSV
                </v-btn>
              </div>

              <!-- Loading -->
              <div v-if="objectsLoading" class="pa-4">
                <div class="text-body-2 text-medium-emphasis mb-2">
                  Loading warehouse statistics…
                </div>
                <v-progress-linear indeterminate color="primary" rounded />
              </div>

              <!-- Chart -->
              <div v-else-if="objectsView === 'chart'">
                <div class="text-subtitle-2 mb-2">Tables &amp; Views Over Time</div>
                <div ref="objectsChartRef" class="d3-chart" />
              </div>

              <!-- Table -->
              <div v-else-if="objectsView === 'table'">
                <v-data-table-virtual
                  fixed-header
                  height="calc(100vh - 340px)"
                  :headers="objectsHeaders"
                  hover
                  :items="aggregatedObjectsData"
                  density="compact">
                  <template v-slot:item.timestamp="{ item }">
                    {{ fmtDate(item.timestamp) }}
                  </template>
                  <template v-slot:[`item.updated-at`]="{ item }">
                    {{ fmtDate(item['updated-at']) }}
                  </template>
                  <template #no-data>
                    <div class="text-body-2 pa-4">No statistics available</div>
                  </template>
                </v-data-table-virtual>
              </div>
            </v-tabs-window-item>
          </v-tabs-window>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import {
  EndpointStatisticsResponse,
  TimeWindowSelector,
  WarehouseStatistics,
} from '../gen/management/types.gen';
import { Header } from '../common/interfaces';
import { useFunctions } from '../plugins/functions';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';

// ─── Props ───────────────────────────────────────────────────────────────────
const props = defineProps<{
  warehouseId: string;
}>();

// ─── Deps ────────────────────────────────────────────────────────────────────
const functions = useFunctions();
const userStorage = useUserStore();
const visual = useVisualStore();

// ─── Section State ───────────────────────────────────────────────────────────
const section = ref<'endpoints' | 'objects'>('endpoints');

// ─── Endpoint Statistics State ───────────────────────────────────────────────
const activeView = ref<'charts' | 'table'>('charts');
const loading = ref(false);
const aggregation = ref<'hour' | 'day' | 'week' | 'month' | 'year'>('day');
const areaChartRef = ref<HTMLElement | null>(null);
const donutChartRef = ref<HTMLElement | null>(null);
const barChartRef = ref<HTMLElement | null>(null);

const endpointHeaders: readonly Header[] = Object.freeze([
  { title: 'Timestamp', key: 'timestamp', align: 'start', sortable: true },
  { title: 'Count', key: 'count', align: 'start', sortable: true },
  { title: 'Route', key: 'httpRoute', align: 'start', sortable: true },
  { title: 'Status', key: 'statusCode', align: 'start', sortable: true },
]);

interface FlatRow {
  timestamp: string;
  date: Date;
  count: number;
  httpRoute: string;
  statusCode: number;
  warehouseId: string | null;
  warehouseName: string | null;
}

const tableRows = ref<FlatRow[]>([]);
const aggregatedRows = ref<FlatRow[]>([]);

// ─── Objects Statistics State ────────────────────────────────────────────────
const objectsView = ref<'chart' | 'table'>('chart');
const objectsAggregation = ref<'hour' | 'day' | 'week' | 'month' | 'year'>('day');
const objectsLoading = ref(false);
const objectsChartRef = ref<HTMLElement | null>(null);
const objectsData = ref<WarehouseStatistics[]>([]);
const aggregatedObjectsData = ref<WarehouseStatistics[]>([]);

const objectsHeaders: readonly Header[] = Object.freeze([
  { title: 'Number of Tables', key: 'number-of-tables', align: 'start', sortable: true },
  { title: 'Number of Views', key: 'number-of-views', align: 'start', sortable: true },
  { title: 'Timestamp', key: 'timestamp', align: 'start', sortable: true },
  { title: 'Updated', key: 'updated-at', align: 'start', sortable: true },
]);

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CATEGORIES: string[] = ['2xx', '3xx', '4xx', '5xx', 'Other'];
const STATUS_COLORS: Record<string, string> = {
  '2xx': '#4caf50',
  '3xx': '#ff9800',
  '4xx': '#f44336',
  '5xx': '#9c27b0',
  Other: '#607d8b',
};

const CATEGORY_CODES: Record<string, number[]> = {
  '2xx': [200, 201, 202, 203, 204, 205, 206, 207, 208, 226],
  '3xx': [300, 301, 302, 303, 304, 305, 307, 308],
  '4xx': [
    400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
    421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  ],
  '5xx': [500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511],
};

// ─── Filters ─────────────────────────────────────────────────────────────────
const selectedStatusCodes = ref<string[]>([...STATUS_CATEGORIES]);
const dateFrom = ref<string | null>(null);
const dateTo = ref<string | null>(null);

watch(dateFrom, (val) => {
  if (val && dateTo.value && val > dateTo.value) {
    dateTo.value = val;
  }
});
watch(dateTo, (val) => {
  if (val && dateFrom.value && val < dateFrom.value) {
    dateFrom.value = val;
  }
});

function buildStatusCodesFilter(): number[] | null {
  if (selectedStatusCodes.value.length === STATUS_CATEGORIES.length) {
    return null;
  }

  const categorizedSet = new Set(Object.values(CATEGORY_CODES).flat());
  const codes: number[] = [];

  selectedStatusCodes.value.forEach((cat) => {
    if (CATEGORY_CODES[cat]) {
      codes.push(...CATEGORY_CODES[cat]);
    } else if (cat === 'Other') {
      for (let c = 100; c <= 599; c++) {
        if (!categorizedSet.has(c)) codes.push(c);
      }
    }
  });

  return codes.length > 0 ? codes : null;
}

function buildRangeSpecifier(): TimeWindowSelector | null {
  if (!dateTo.value && !dateFrom.value) return null;

  const end = dateTo.value ? new Date(dateTo.value).toISOString() : new Date().toISOString();
  const start = dateFrom.value
    ? new Date(dateFrom.value)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - start.getTime();

  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  const interval = hours >= 24 ? `P${Math.ceil(hours / 24)}D` : `PT${hours}H`;

  return { end, interval, type: 'window' };
}

// ─── Fetch Endpoint Statistics ───────────────────────────────────────────────
async function fetchEndpointStatistics() {
  loading.value = true;
  try {
    const warehouseFilter = { id: props.warehouseId, type: 'warehouse-id' as const };
    const rangeSpec = buildRangeSpecifier();
    const statusCodes = buildStatusCodesFilter();

    if (
      visual.getServerInfo()['authz-backend'] !== 'allow-all' &&
      userStorage.getUser().access_token === ''
    ) {
      return;
    }

    const result = await functions.getEndpointStatistics(warehouseFilter, rangeSpec, statusCodes);
    tableRows.value = flatten(result);
    aggregateRows();
  } catch (error) {
    functions.handleError(error, 'loadEndpointStatistics');
  } finally {
    loading.value = false;
    await nextTick();
    if (activeView.value === 'charts') {
      drawAllEndpointCharts();
    }
  }
}

// ─── Fetch Warehouse Object Statistics ───────────────────────────────────────
async function fetchObjectStatistics() {
  objectsLoading.value = true;
  try {
    const allStats: WarehouseStatistics[] = [];
    let pageToken: string | undefined;

    do {
      const resp = await functions.getWarehouseStatistics(props.warehouseId, 100, pageToken);
      allStats.push(...resp.stats);
      pageToken = resp['next-page-token'] ?? undefined;
    } while (pageToken);

    objectsData.value = allStats.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    aggregateObjectsData();
  } catch (error) {
    functions.handleError(error, 'fetchObjectStatistics');
  } finally {
    objectsLoading.value = false;
    await nextTick();
    if (objectsView.value === 'chart') {
      drawObjectsChart();
    }
  }
}

// ─── Time Aggregation ────────────────────────────────────────────────────────
function bucketDate(d: Date, agg: 'hour' | 'day' | 'week' | 'month' | 'year'): Date {
  switch (agg) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week': {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
    }
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case 'year':
      return new Date(d.getFullYear(), 0, 1);
  }
}

function aggregateRows() {
  const rows = tableRows.value;
  const map = new Map<string, FlatRow>();

  rows.forEach((r) => {
    const bucket = bucketDate(r.date, aggregation.value);
    const key = `${bucket.getTime()}|${r.httpRoute}|${r.statusCode}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += r.count;
    } else {
      map.set(key, {
        timestamp: bucket.toISOString(),
        date: bucket,
        count: r.count,
        httpRoute: r.httpRoute,
        statusCode: r.statusCode,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
      });
    }
  });

  aggregatedRows.value = Array.from(map.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

function aggregateObjectsData() {
  const raw = objectsData.value;
  const map = new Map<number, WarehouseStatistics>();

  raw.forEach((s) => {
    const bucket = bucketDate(new Date(s.timestamp), objectsAggregation.value);
    const key = bucket.getTime();
    const existing = map.get(key);
    // Keep the latest entry per bucket (highest tables/views counts)
    if (!existing || new Date(s.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
      map.set(key, {
        ...s,
        timestamp: bucket.toISOString(),
      });
    }
  });

  aggregatedObjectsData.value = Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

async function applyFilters() {
  await fetchEndpointStatistics();
}

function resetFilters() {
  selectedStatusCodes.value = [...STATUS_CATEGORIES];
  dateFrom.value = null;
  dateTo.value = null;
  aggregation.value = 'day';
  fetchEndpointStatistics();
}

function flatten(stats: EndpointStatisticsResponse): FlatRow[] {
  const rows: FlatRow[] = [];
  stats.timestamps.forEach((ts: string, i: number) => {
    const endpoints = stats['called-endpoints'][i];
    if (!endpoints) return;
    endpoints.forEach((ep: any) => {
      rows.push({
        timestamp: ts,
        date: new Date(ts),
        count: ep.count,
        httpRoute: ep['http-route'],
        statusCode: ep['status-code'],
        warehouseId: ep['warehouse-id'] ?? null,
        warehouseName: ep['warehouse-name'] ?? null,
      });
    });
  });
  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusCategory(code: number): string {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'Other';
}

function statusColor(code: number): string {
  return STATUS_COLORS[statusCategory(code)] ?? '#607d8b';
}

function aggTimeInterval(agg: string, dataLen: number): d3.TimeInterval | number {
  const maxTicks = Math.min(dataLen, 10);
  switch (agg) {
    case 'hour':
      return d3.timeHour.every(Math.max(1, Math.ceil(dataLen / maxTicks))) ?? maxTicks;
    case 'day':
      return d3.timeDay.every(Math.max(1, Math.ceil(dataLen / maxTicks))) ?? maxTicks;
    case 'week':
      return d3.timeWeek.every(Math.max(1, Math.ceil(dataLen / maxTicks))) ?? maxTicks;
    case 'month':
      return d3.timeMonth.every(Math.max(1, Math.ceil(dataLen / maxTicks))) ?? maxTicks;
    case 'year':
      return d3.timeYear.every(Math.max(1, Math.ceil(dataLen / maxTicks))) ?? maxTicks;
    default:
      return maxTicks;
  }
}

function fmtDate(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ─── Resize Observer ─────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  resizeObserver = new ResizeObserver(() => {
    if (activeView.value === 'charts') {
      drawAllEndpointCharts();
    }
    if (objectsView.value === 'chart') {
      drawObjectsChart();
    }
  });
  if (areaChartRef.value) resizeObserver.observe(areaChartRef.value);
  if (objectsChartRef.value) resizeObserver.observe(objectsChartRef.value);
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ─── D3: Stacked Area Chart ─────────────────────────────────────────────────
function drawAreaChart() {
  const el = areaChartRef.value;
  if (!el || aggregatedRows.value.length === 0) return;
  d3.select(el).selectAll('*').remove();

  const margin = { top: 16, right: 24, bottom: 70, left: 50 };
  const width = el.clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const byTime = new Map<number, Record<string, number | Date>>();

  aggregatedRows.value.forEach((r) => {
    const key = r.date.getTime();
    if (!byTime.has(key)) {
      byTime.set(key, { date: key, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, Other: 0 });
    }
    const entry = byTime.get(key)!;
    (entry[statusCategory(r.statusCode)] as number) += r.count;
  });

  const data = Array.from(byTime.values())
    .sort((a, b) => (a.date as number) - (b.date as number))
    .map((d) => ({ ...d, date: new Date(d.date as number) }));
  if (data.length === 0) return;

  const tickFmt: Record<string, string> = {
    hour: '%d %b %H:%M',
    day: '%d %b %Y',
    week: 'W%V %b %Y',
    month: '%b %Y',
    year: '%Y',
  };

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const stack = d3
    .stack<(typeof data)[0]>()
    .keys(STATUS_CATEGORIES as unknown as string[])
    .value((d, key) => (d as any)[key] ?? 0)
    .order(d3.stackOrderNone);

  const series = stack(data);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 0])
    .nice()
    .range([height, 0]);

  if (data.length === 1) {
    const barWidth = Math.min(width * 0.4, 80);
    const cx = width / 2;

    svg
      .selectAll('.bar-segment')
      .data(series)
      .join('rect')
      .attr('class', 'bar-segment')
      .attr('x', cx - barWidth / 2)
      .attr('y', (d) => y(d[0][1]))
      .attr('width', barWidth)
      .attr('height', (d) => y(d[0][0]) - y(d[0][1]))
      .attr('rx', 2)
      .attr('fill', (d) => STATUS_COLORS[d.key] ?? '#ccc')
      .attr('opacity', 0.85);
  } else {
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, width]);

    const area = d3
      .area<d3.SeriesPoint<(typeof data)[0]>>()
      .x((d) => x(d.data.date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    svg
      .selectAll('.layer')
      .data(series)
      .join('path')
      .attr('class', 'layer')
      .attr('d', area)
      .attr('fill', (d) => STATUS_COLORS[d.key] ?? '#ccc')
      .attr('opacity', 0.8);

    svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(aggTimeInterval(aggregation.value, data.length))
          .tickFormat((d) => {
            const dt = d as Date;
            return d3.timeFormat(tickFmt[aggregation.value] ?? '%d %b %H:%M')(dt);
          }),
      )
      .selectAll('text')
      .attr('transform', 'rotate(-30)')
      .style('text-anchor', 'end')
      .style('font-size', '10px');
  }

  if (data.length === 1) {
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height + 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .attr('fill', 'currentColor')
      .text(d3.timeFormat(tickFmt[aggregation.value] ?? '%d %b %H:%M')(data[0].date));
  }

  svg.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

  // Legend
  const legend = svg
    .append('g')
    .attr('transform', `translate(${width - 180}, -8)`)
    .selectAll('.leg')
    .data(STATUS_CATEGORIES)
    .join('g')
    .attr('class', 'leg')
    .attr('transform', (_d, i) => `translate(${i * 42}, 0)`);

  legend
    .append('rect')
    .attr('width', 10)
    .attr('height', 10)
    .attr('rx', 2)
    .attr('fill', (d) => STATUS_COLORS[d]);

  legend
    .append('text')
    .attr('x', 13)
    .attr('y', 9)
    .text((d) => d)
    .style('font-size', '10px')
    .attr('fill', 'currentColor');
}

// ─── D3: Donut Chart ─────────────────────────────────────────────────────────
function drawDonutChart() {
  const el = donutChartRef.value;
  if (!el || aggregatedRows.value.length === 0) return;
  d3.select(el).selectAll('*').remove();

  const size = Math.min(el.clientWidth, 280);
  const legendHeight = 30;
  const radius = size / 2;
  const innerRadius = radius * 0.55;

  const counts = new Map<string, number>();
  aggregatedRows.value.forEach((r) => {
    const cat = statusCategory(r.statusCode);
    counts.set(cat, (counts.get(cat) ?? 0) + r.count);
  });

  const pieData = Array.from(counts, ([key, value]) => ({ key, value })).sort(
    (a, b) => b.value - a.value,
  );
  const total = d3.sum(pieData, (d) => d.value);

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', size)
    .attr('height', size + legendHeight)
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const pie = d3
    .pie<(typeof pieData)[0]>()
    .value((d) => d.value)
    .sort(null)
    .padAngle(0.02);

  const arc = d3
    .arc<d3.PieArcDatum<(typeof pieData)[0]>>()
    .innerRadius(innerRadius)
    .outerRadius(radius - 4);

  const arcs = svg.selectAll('.arc').data(pie(pieData)).join('g').attr('class', 'arc');

  arcs
    .append('path')
    .attr('d', arc)
    .attr('fill', (d) => STATUS_COLORS[d.data.key] ?? '#ccc')
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5);

  arcs
    .append('text')
    .attr('transform', (d) => `translate(${arc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .style('font-size', '11px')
    .style('font-weight', 'bold')
    .attr('fill', 'white')
    .text((d) => {
      const pct = ((d.data.value / total) * 100).toFixed(0);
      return Number(pct) >= 5 ? `${pct}%` : '';
    });

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .style('font-size', '22px')
    .style('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text(total.toLocaleString());

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.2em')
    .style('font-size', '11px')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.6)
    .text('total calls');

  const legendG = d3
    .select(el)
    .select('svg')
    .append('g')
    .attr('transform', `translate(${radius - (pieData.length * 55) / 2}, ${size + 8})`);

  pieData.forEach((d, i) => {
    const g = legendG.append('g').attr('transform', `translate(${i * 55}, 0)`);
    g.append('rect')
      .attr('width', 10)
      .attr('height', 10)
      .attr('rx', 2)
      .attr('fill', STATUS_COLORS[d.key]);
    g.append('text')
      .attr('x', 14)
      .attr('y', 10)
      .text(`${d.key}`)
      .style('font-size', '12px')
      .style('font-weight', '500')
      .attr('fill', 'currentColor');
  });
}

// ─── D3: Horizontal Bar Chart ────────────────────────────────────────────────
function drawBarChart() {
  const el = barChartRef.value;
  if (!el || aggregatedRows.value.length === 0) return;
  d3.select(el).selectAll('*').remove();

  const byRoute = new Map<string, number>();
  aggregatedRows.value.forEach((r) => {
    byRoute.set(r.httpRoute, (byRoute.get(r.httpRoute) ?? 0) + r.count);
  });

  const data = Array.from(byRoute, ([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  if (data.length === 0) return;

  const tempSvg = d3
    .select(el)
    .append('svg')
    .style('position', 'absolute')
    .style('visibility', 'hidden');
  const longestLabel = data.reduce((a, b) => (a.route.length > b.route.length ? a : b)).route;
  const tempText = tempSvg.append('text').style('font-size', '11px').text(longestLabel);
  const measuredWidth = (tempText.node() as SVGTextElement)?.getBBox().width ?? 200;
  tempSvg.remove();

  const margin = { top: 8, right: 50, bottom: 12, left: Math.ceil(measuredWidth) + 16 };
  const fullWidth = el.clientWidth;

  const barHeight = 22;
  const gap = 4;
  const height = data.length * (barHeight + gap);
  const width = fullWidth - margin.left - margin.right;

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', fullWidth)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.count) ?? 0])
    .nice()
    .range([0, width]);

  const y = d3
    .scaleBand<string>()
    .domain(data.map((d) => d.route))
    .range([0, height])
    .padding(0.15);

  const bars = svg
    .selectAll('.bar')
    .data(data)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', 0)
    .attr('y', (d) => y(d.route)!)
    .attr('width', (d) => x(d.count))
    .attr('height', y.bandwidth())
    .attr('rx', 3)
    .attr('fill', '#1e857d')
    .attr('opacity', 0.85);

  bars.each(function (d) {
    d3.select(this).append('title').text(`${d.route}\n${d.count.toLocaleString()} calls`);
  });

  svg
    .selectAll('.label')
    .data(data)
    .join('text')
    .attr('class', 'label')
    .attr('x', -6)
    .attr('y', (d) => y(d.route)! + y.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dy', '0.35em')
    .style('font-size', '11px')
    .style('cursor', 'default')
    .attr('fill', 'currentColor')
    .text((d) => d.route)
    .each(function (d) {
      d3.select(this).append('title').text(d.route);
    });

  svg
    .selectAll('.count')
    .data(data)
    .join('text')
    .attr('class', 'count')
    .attr('x', (d) => x(d.count) + 4)
    .attr('y', (d) => y(d.route)! + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .style('font-size', '10px')
    .style('font-weight', 'bold')
    .attr('fill', 'currentColor')
    .text((d) => d.count.toLocaleString());
}

function drawAllEndpointCharts() {
  try {
    drawAreaChart();
  } catch (e) {
    console.warn('Area chart error:', e);
  }
  try {
    drawDonutChart();
  } catch (e) {
    console.warn('Donut chart error:', e);
  }
  try {
    drawBarChart();
  } catch (e) {
    console.warn('Bar chart error:', e);
  }
}

// ─── D3: Objects Line Chart (Tables & Views Over Time) ───────────────────────
function drawObjectsChart() {
  const el = objectsChartRef.value;
  if (!el || aggregatedObjectsData.value.length === 0) return;
  d3.select(el).selectAll('*').remove();

  const margin = { top: 16, right: 24, bottom: 85, left: 50 };
  const width = el.clientWidth - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  const tickFmt: Record<string, string> = {
    hour: '%d %b %H:%M',
    day: '%d %b %Y',
    week: 'W%V %b %Y',
    month: '%b %Y',
    year: '%Y',
  };

  const data = aggregatedObjectsData.value.map((s) => ({
    date: new Date(s.timestamp),
    tables: s['number-of-tables'],
    views: s['number-of-views'],
  }));

  if (data.length === 0) return;

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => d.date) as [Date, Date])
    .range([0, width]);

  const yMax = d3.max(data, (d) => Math.max(d.tables, d.views)) ?? 0;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

  // Lines
  const lineTable = d3
    .line<(typeof data)[0]>()
    .x((d) => x(d.date))
    .y((d) => y(d.tables))
    .curve(d3.curveMonotoneX);

  const lineView = d3
    .line<(typeof data)[0]>()
    .x((d) => x(d.date))
    .y((d) => y(d.views))
    .curve(d3.curveMonotoneX);

  const TABLES_COLOR = '#1e857d';
  const VIEWS_COLOR = '#0097fb';

  // Draw lines
  svg
    .append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', TABLES_COLOR)
    .attr('stroke-width', 2)
    .attr('d', lineTable);

  svg
    .append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', VIEWS_COLOR)
    .attr('stroke-width', 2)
    .attr('d', lineView);

  // Dots
  svg
    .selectAll('.dot-tables')
    .data(data)
    .join('circle')
    .attr('class', 'dot-tables')
    .attr('cx', (d) => x(d.date))
    .attr('cy', (d) => y(d.tables))
    .attr('r', data.length <= 30 ? 3 : 1.5)
    .attr('fill', TABLES_COLOR)
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(`Tables: ${d.tables}\n${fmtDate(d.date)}`);
    });

  svg
    .selectAll('.dot-views')
    .data(data)
    .join('circle')
    .attr('class', 'dot-views')
    .attr('cx', (d) => x(d.date))
    .attr('cy', (d) => y(d.views))
    .attr('r', data.length <= 30 ? 3 : 1.5)
    .attr('fill', VIEWS_COLOR)
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(`Views: ${d.views}\n${fmtDate(d.date)}`);
    });

  // x-axis
  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(aggTimeInterval(objectsAggregation.value, data.length))
        .tickFormat((d) =>
          d3.timeFormat(tickFmt[objectsAggregation.value] ?? '%d %b %Y')(d as Date),
        ),
    )
    .selectAll('text')
    .attr('transform', 'rotate(-30)')
    .style('text-anchor', 'end')
    .style('font-size', '10px');

  // y-axis
  svg
    .append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
    .selectAll('text')
    .style('font-size', '10px');

  // Legend (below x-axis)
  const legendData = [
    { label: 'Tables', color: TABLES_COLOR },
    { label: 'Views', color: VIEWS_COLOR },
  ];
  const legendWidth = legendData.length * 65;
  const legend = svg
    .append('g')
    .attr('transform', `translate(${(width - legendWidth) / 2}, ${height + 55})`)
    .selectAll('.leg')
    .data(legendData)
    .join('g')
    .attr('class', 'leg')
    .attr('transform', (_d, i) => `translate(${i * 65}, 0)`);

  legend
    .append('rect')
    .attr('width', 10)
    .attr('height', 10)
    .attr('rx', 2)
    .attr('fill', (d) => d.color);

  legend
    .append('text')
    .attr('x', 13)
    .attr('y', 9)
    .text((d) => d.label)
    .style('font-size', '10px')
    .attr('fill', 'currentColor');
}

// ─── CSV Downloads ───────────────────────────────────────────────────────────
function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadEndpointCSV() {
  if (aggregatedRows.value.length === 0) return;

  const csvHeaders = ['Timestamp', 'Count', 'HTTP Route', 'Status Code'];
  const csvRows = aggregatedRows.value.map((r) =>
    [escapeCsv(fmtDate(r.timestamp)), r.count, escapeCsv(r.httpRoute), r.statusCode].join(','),
  );

  const blob = new Blob([[csvHeaders.join(','), ...csvRows].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const ts = new Date().toISOString().replace(/[:.-]/g, '_');
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `warehouse-endpoint-statistics_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function downloadObjectsCSV() {
  if (aggregatedObjectsData.value.length === 0) return;

  const csvHeaders = ['Number of Tables', 'Number of Views', 'Timestamp', 'Updated'];
  const csvRows = aggregatedObjectsData.value.map((s) =>
    [
      s['number-of-tables'],
      s['number-of-views'],
      escapeCsv(fmtDate(s.timestamp)),
      escapeCsv(fmtDate(s['updated-at'])),
    ].join(','),
  );

  const blob = new Blob([[csvHeaders.join(','), ...csvRows].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const ts = new Date().toISOString().replace(/[:.-]/g, '_');
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `warehouse-object-statistics_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchEndpointStatistics();
  fetchObjectStatistics(); // load in background
  setupResizeObserver();
});

watch(
  () => activeView.value,
  (v) => {
    if (v === 'charts') {
      nextTick(() => drawAllEndpointCharts());
    }
  },
);

watch(aggregation, async () => {
  aggregateRows();
  await nextTick();
  if (activeView.value === 'charts') {
    drawAllEndpointCharts();
  }
});

watch(section, async (s) => {
  await nextTick();
  if (s === 'endpoints' && activeView.value === 'charts') {
    drawAllEndpointCharts();
  } else if (s === 'objects' && objectsView.value === 'chart') {
    drawObjectsChart();
  }
});

watch(objectsView, async (v) => {
  if (v === 'chart') {
    await nextTick();
    drawObjectsChart();
  }
});

watch(objectsAggregation, async () => {
  aggregateObjectsData();
  await nextTick();
  if (objectsView.value === 'chart') {
    drawObjectsChart();
  }
});

async function loadStatistics() {
  await fetchEndpointStatistics();
  fetchObjectStatistics();
}

defineExpose({ loadStatistics });
</script>

<style scoped>
.d3-chart {
  width: 100%;
  min-height: 120px;
}
.d3-chart--donut {
  display: flex;
  justify-content: center;
}
</style>
