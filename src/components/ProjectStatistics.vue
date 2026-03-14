<template>
  <v-card flat style="height: 100%; display: flex; flex-direction: column">
    <v-card-text style="flex: 1; min-height: 0; overflow-y: auto">
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
          @click="downloadStatsAsCSV">
          Download CSV
        </v-btn>
      </div>

      <!-- Filters row -->
      <v-row dense class="mb-3 align-center">
        <v-col cols="12" md="3">
          <v-select
            v-model="selectedWarehouse"
            :items="warehouseOptions"
            item-title="label"
            item-value="value"
            label="Warehouse"
            density="compact"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-warehouse" />
        </v-col>
        <v-col cols="12" md="3">
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
        <v-col cols="6" md="2">
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
        <v-col cols="6" md="2">
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
          <!-- Stacked area chart -->
          <v-col cols="12">
            <div class="text-subtitle-2 mb-2">API Traffic Over Time</div>
            <div ref="areaChartRef" class="d3-chart" />
          </v-col>
        </v-row>
        <v-row>
          <!-- Status code donut -->
          <v-col cols="12" md="3">
            <div class="text-subtitle-2 mb-2">Status Code Distribution</div>
            <div ref="donutChartRef" class="d3-chart d3-chart--donut" />
          </v-col>
          <!-- Top endpoints bar -->
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
          :headers="headersStatistics"
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
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import {
  EndpointStatisticsResponse,
  GetWarehouseResponse,
  WarehouseFilter,
  TimeWindowSelector,
} from '../gen/management/types.gen';
import { Header } from '../common/interfaces';
import { useFunctions } from '../plugins/functions';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';

// ─── Props ───────────────────────────────────────────────────────────────────
const props = defineProps<{
  warehouseFilter?: WarehouseFilter;
}>();

// ─── Deps ────────────────────────────────────────────────────────────────────
const functions = useFunctions();
const userStorage = useUserStore();
const visual = useVisualStore();

// ─── State ───────────────────────────────────────────────────────────────────
const activeView = ref<'charts' | 'table'>('charts');
const loading = ref(false);
const aggregation = ref<'hour' | 'day' | 'week' | 'month' | 'year'>('day');
const areaChartRef = ref<HTMLElement | null>(null);
const donutChartRef = ref<HTMLElement | null>(null);
const barChartRef = ref<HTMLElement | null>(null);

const headersStatistics: readonly Header[] = Object.freeze([
  { title: 'Timestamp', key: 'timestamp', align: 'start', sortable: true },
  { title: 'Count', key: 'count', align: 'start', sortable: true },
  { title: 'Route', key: 'httpRoute', align: 'start', sortable: true },
  { title: 'Status', key: 'statusCode', align: 'start', sortable: true },
  { title: 'Warehouse', key: 'warehouseName', align: 'start', sortable: true },
]);

// ─── Parsed Data ─────────────────────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CATEGORIES: string[] = ['2xx', '3xx', '4xx', '5xx', 'Other'];
const STATUS_COLORS: Record<string, string> = {
  '2xx': '#4caf50',
  '3xx': '#ff9800',
  '4xx': '#f44336',
  '5xx': '#9c27b0',
  Other: '#607d8b',
};

// Map category to actual status code ranges for API filter
const CATEGORY_CODES: Record<string, number[]> = {
  '2xx': [200, 201, 202, 203, 204, 205, 206, 207, 208, 226],
  '3xx': [300, 301, 302, 303, 304, 305, 307, 308],
  '4xx': [
    400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
    421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  ],
  '5xx': [500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511],
};

// ─── Warehouse Options ───────────────────────────────────────────────────────
interface WarehouseOption {
  label: string;
  value: string;
}

const warehouseOptions = ref<WarehouseOption[]>([{ label: 'All Warehouses', value: '__all__' }]);
const selectedWarehouse = ref<string>('__all__');

async function loadWarehouses() {
  try {
    const resp = await functions.listWarehouses(false);
    const items: WarehouseOption[] = [{ label: 'All Warehouses', value: '__all__' }];
    (resp.warehouses ?? []).forEach((wh: GetWarehouseResponse) => {
      items.push({ label: wh.name, value: wh.id });
    });
    warehouseOptions.value = items;
  } catch {
    // keep default "All" option
  }
}

// ─── Filters ─────────────────────────────────────────────────────────────────
const selectedStatusCodes = ref<string[]>([...STATUS_CATEGORIES]);
const dateFrom = ref<string | null>(null);
const dateTo = ref<string | null>(null);

// Prevent invalid date ranges
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
  // If all selected, don't filter
  if (selectedStatusCodes.value.length === STATUS_CATEGORIES.length) {
    return null;
  }
  // If "Other" is selected but we can't map it to codes, skip status filter
  if (selectedStatusCodes.value.includes('Other') && selectedStatusCodes.value.length === 1) {
    return null;
  }
  const codes: number[] = [];
  selectedStatusCodes.value.forEach((cat) => {
    if (CATEGORY_CODES[cat]) {
      codes.push(...CATEGORY_CODES[cat]);
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

  // Convert to ISO 8601 duration
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  const interval = hours >= 24 ? `P${Math.ceil(hours / 24)}D` : `PT${hours}H`;

  return { end, interval, type: 'window' };
}

async function fetchStatistics() {
  loading.value = true;
  try {
    let warehouseFilter: WarehouseFilter;
    if (selectedWarehouse.value && selectedWarehouse.value !== '__all__') {
      warehouseFilter = { id: selectedWarehouse.value, type: 'warehouse-id' };
    } else {
      warehouseFilter = props.warehouseFilter ?? { type: 'all' };
    }
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
    functions.handleError(error, 'loadStatistics');
  } finally {
    loading.value = false;
    await nextTick();
    if (activeView.value === 'charts') {
      drawAllCharts();
    }
  }
}

// ─── Time Aggregation ────────────────────────────────────────────────────────
function bucketDate(d: Date): Date {
  switch (aggregation.value) {
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case 'week': {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
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
    const bucket = bucketDate(r.date);
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

async function applyFilters() {
  await fetchStatistics();
}

function resetFilters() {
  selectedStatusCodes.value = [...STATUS_CATEGORIES];
  selectedWarehouse.value = '__all__';
  dateFrom.value = null;
  dateTo.value = null;
  aggregation.value = 'day';
  fetchStatistics();
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

// ─── Resize observer ─────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  resizeObserver = new ResizeObserver(() => {
    if (activeView.value === 'charts') {
      drawAllCharts();
    }
  });
  if (areaChartRef.value) resizeObserver.observe(areaChartRef.value);
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

  // Aggregate by timestamp + status category
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
    // Single data point — draw stacked bars instead of area
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
    // Multiple data points — draw stacked area
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

    // x-axis
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

  // x-axis label for single point
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

  // y-axis
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

  // Aggregate by status category
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

  // Labels
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

  // Center total
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

  // Legend below donut
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

  // Aggregate by route
  const byRoute = new Map<string, number>();
  aggregatedRows.value.forEach((r) => {
    byRoute.set(r.httpRoute, (byRoute.get(r.httpRoute) ?? 0) + r.count);
  });

  const data = Array.from(byRoute, ([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  if (data.length === 0) return;

  // Measure the longest route label to size the left margin
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

  // Route labels – full path
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

  // Count labels
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

// ─── Draw All ────────────────────────────────────────────────────────────────
function drawAllCharts() {
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

// ─── CSV Download ────────────────────────────────────────────────────────────
function escapeCsv(value: string | null | undefined): string {
  const str = value ?? '';
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadStatsAsCSV() {
  if (aggregatedRows.value.length === 0) return;

  const csvHeaders = [
    'Timestamp',
    'Count',
    'HTTP Route',
    'Status Code',
    'Warehouse ID',
    'Warehouse Name',
  ];
  const csvRows = aggregatedRows.value.map((r) =>
    [
      escapeCsv(fmtDate(r.timestamp)),
      r.count,
      escapeCsv(r.httpRoute),
      r.statusCode,
      escapeCsv(r.warehouseId),
      escapeCsv(r.warehouseName),
    ].join(','),
  );

  const blob = new Blob([[csvHeaders.join(','), ...csvRows].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const ts = new Date().toISOString().replace(/[:.-]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `endpoint-statistics_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadWarehouses();
  await fetchStatistics();
  setupResizeObserver();
});

watch(
  () => activeView.value,
  (v) => {
    if (v === 'charts') {
      nextTick(() => drawAllCharts());
    }
  },
);

watch(aggregation, async () => {
  aggregateRows();
  await nextTick();
  if (activeView.value === 'charts') {
    drawAllCharts();
  }
});
async function loadStatistics() {
  await fetchStatistics();
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
