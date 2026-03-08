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

    <!-- Stat Cards -->
    <v-row dense class="mb-2">
      <v-col cols="6" sm="3">
        <v-card variant="outlined" class="stat-card text-center">
          <v-card-text class="pa-3">
            <v-icon color="primary" size="24" class="mb-1">mdi-folder-multiple</v-icon>
            <div class="text-h5 font-weight-bold">{{ loading ? '—' : projects }}</div>
            <div class="text-caption text-medium-emphasis">Projects</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" class="stat-card text-center">
          <v-card-text class="pa-3">
            <v-icon color="info" size="24" class="mb-1">mdi-warehouse</v-icon>
            <div class="text-h5 font-weight-bold">{{ loading ? '—' : warehouses }}</div>
            <div class="text-caption text-medium-emphasis">Warehouses</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" class="stat-card text-center">
          <v-card-text class="pa-3">
            <v-icon color="success" size="24" class="mb-1">mdi-table</v-icon>
            <div class="text-h5 font-weight-bold">{{ loading ? '—' : tables }}</div>
            <div class="text-caption text-medium-emphasis">Tables</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="outlined" class="stat-card text-center">
          <v-card-text class="pa-3">
            <v-icon color="warning" size="24" class="mb-1">mdi-eye</v-icon>
            <div class="text-h5 font-weight-bold">{{ loading ? '—' : views }}</div>
            <div class="text-caption text-medium-emphasis">Views</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- API Calls Chart -->
    <v-card variant="outlined" class="chart-card">
      <v-card-text class="pa-3">
        <div class="d-flex align-center mb-2">
          <v-icon size="18" class="mr-2" color="primary">mdi-chart-line</v-icon>
          <span class="text-body-2 font-weight-bold">API Calls (Last 7 Days)</span>
        </div>
        <div v-if="noChartData && !chartLoading" class="text-center pa-4 text-caption text-medium-emphasis">
          No API activity in the last 7 days
        </div>
        <div ref="chartRef" v-show="!noChartData && !chartLoading" class="chart-container"></div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as d3 from 'd3';
import type {
  EndpointStatisticsResponse,
  WarehouseStatistics,
} from '../gen/management/types.gen';
import { useFunctions } from '../plugins/functions';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';

const functions = useFunctions();
const userStorage = useUserStore();
const visual = useVisualStore();

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const chartLoading = ref(true);
const noChartData = ref(false);
const projects = ref(0);
const warehouses = ref(0);
const tables = ref(0);
const views = ref(0);
const chartRef = ref<HTMLElement | null>(null);

// ─── Chart data ──────────────────────────────────────────────────────────────
interface DayRow {
  date: Date;
  total: number;
  success: number;
  error: number;
}

const chartData = ref<DayRow[]>([]);

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_COLORS = {
  success: '#4caf50',
  error: '#f44336',
};

// ─── Load counts ─────────────────────────────────────────────────────────────
async function loadCounts() {
  loading.value = true;
  try {
    // Projects
    const projectList = await functions.loadProjectList(false);
    projects.value = projectList?.length ?? 0;

    // Warehouses + aggregate tables/views across all warehouses
    const whResp = await functions.listWarehouses(false);
    const whList = whResp?.warehouses ?? [];
    warehouses.value = whList.length;

    // Fetch statistics for each warehouse to get tables/views counts
    let totalTables = 0;
    let totalViews = 0;

    await Promise.all(
      whList.map(async (wh: any) => {
        try {
          const resp = await functions.getWarehouseStatistics(wh['warehouse-id'] ?? wh.id, 1);
          if (resp?.stats?.length > 0) {
            const latest: WarehouseStatistics = resp.stats[0];
            totalTables += latest['number-of-tables'];
            totalViews += latest['number-of-views'];
          }
        } catch {
          // Skip warehouses that fail
        }
      }),
    );

    tables.value = totalTables;
    views.value = totalViews;
  } catch (error) {
    console.error('Failed to load counts:', error);
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

    // Last 7 days range
    const end = new Date().toISOString();
    const rangeSpec = { end, interval: 'P7D', type: 'window' as const };

    const result: EndpointStatisticsResponse = await functions.getEndpointStatistics(
      { type: 'all' },
      rangeSpec,
      null,
      false,
    );

    // Flatten and bucket by day
    const byDay = new Map<string, { total: number; success: number; error: number }>();

    result.timestamps.forEach((ts: string, i: number) => {
      const endpoints = result['called-endpoints'][i];
      if (!endpoints) return;

      const d = new Date(ts);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, { total: 0, success: 0, error: 0 });
      }
      const entry = byDay.get(dayKey)!;

      endpoints.forEach((ep: any) => {
        const count = ep.count ?? 0;
        entry.total += count;
        if (ep['status-code'] >= 200 && ep['status-code'] < 400) {
          entry.success += count;
        } else {
          entry.error += count;
        }
      });
    });

    // Build sorted array with actual Date objects
    const rows: DayRow[] = [];
    result.timestamps.forEach((ts: string) => {
      const d = new Date(ts);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const entry = byDay.get(dayKey);
      if (entry) {
        rows.push({
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          ...entry,
        });
        byDay.delete(dayKey); // Only add once per day
      }
    });

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    chartData.value = rows;

    if (rows.length === 0) {
      noChartData.value = true;
      return;
    }

    await nextTick();
    drawChart();
  } catch (error) {
    console.error('Failed to load chart data:', error);
    noChartData.value = true;
  } finally {
    chartLoading.value = false;
  }
}

// ─── D3 Chart ────────────────────────────────────────────────────────────────
function drawChart() {
  const el = chartRef.value;
  if (!el || chartData.value.length === 0) return;
  d3.select(el).selectAll('*').remove();

  const isDark = !visual.themeLight;
  const textColor = isDark ? '#aaa' : '#666';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const margin = { top: 12, right: 16, bottom: 36, left: 44 };
  const width = el.clientWidth - margin.left - margin.right;
  const height = 180 - margin.top - margin.bottom;

  const data = chartData.value;

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => d.date) as [Date, Date])
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.total) ?? 0])
    .nice()
    .range([height, 0]);

  // Grid lines
  svg
    .append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(y)
        .tickSize(-width)
        .tickFormat(() => ''),
    )
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke', gridColor));

  // Stacked area
  const stack = d3
    .stack<DayRow>()
    .keys(['success', 'error'] as any)
    .value((d, key) => (d as any)[key] ?? 0)
    .order(d3.stackOrderNone);

  const series = stack(data);

  const area = d3
    .area<any>()
    .x((d) => x(d.data.date))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);

  const colors = [STATUS_COLORS.success, STATUS_COLORS.error];

  svg
    .selectAll('.area-layer')
    .data(series)
    .enter()
    .append('path')
    .attr('class', 'area-layer')
    .attr('d', area)
    .attr('fill', (_, i) => colors[i])
    .attr('fill-opacity', 0.3)
    .attr('stroke', (_, i) => colors[i])
    .attr('stroke-width', 1.5);

  // X axis
  const tickInterval = d3.timeDay.every(Math.max(1, Math.ceil(data.length / 7))) ?? 7;
  svg
    .append('g')
    .attr('transform', `translate(0,${height})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(tickInterval)
        .tickFormat((d) => d3.timeFormat('%d %b')(d as Date)),
    )
    .call((g) => g.select('.domain').attr('stroke', gridColor))
    .call((g) => g.selectAll('.tick line').attr('stroke', gridColor))
    .call((g) => g.selectAll('.tick text').attr('fill', textColor).style('font-size', '10px'));

  // Y axis
  svg
    .append('g')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('~s')))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').remove())
    .call((g) => g.selectAll('.tick text').attr('fill', textColor).style('font-size', '10px'));

  // Legend
  const legend = svg.append('g').attr('transform', `translate(${width - 110}, -4)`);

  [
    { label: 'Success', color: STATUS_COLORS.success },
    { label: 'Error', color: STATUS_COLORS.error },
  ].forEach((item, i) => {
    const g = legend.append('g').attr('transform', `translate(${i * 60}, 0)`);
    g.append('rect')
      .attr('width', 10)
      .attr('height', 10)
      .attr('rx', 2)
      .attr('fill', item.color)
      .attr('fill-opacity', 0.6);
    g.append('text')
      .attr('x', 14)
      .attr('y', 9)
      .attr('fill', textColor)
      .style('font-size', '10px')
      .text(item.label);
  });

  // Tooltip overlay
  const tooltip = d3
    .select(el)
    .append('div')
    .style('position', 'absolute')
    .style('pointer-events', 'none')
    .style('background', isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)')
    .style('border', `1px solid ${isDark ? '#555' : '#ddd'}`)
    .style('border-radius', '6px')
    .style('padding', '6px 10px')
    .style('font-size', '11px')
    .style('color', isDark ? '#eee' : '#333')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
    .style('opacity', 0);

  svg
    .append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .on('mousemove', (event: MouseEvent) => {
      const [mx] = d3.pointer(event);
      const px = x.invert(mx);
      const bisect = d3.bisector((d: DayRow) => d.date).left;
      let idx = bisect(data, px, 1);
      if (idx >= data.length) idx = data.length - 1;
      if (idx > 0) {
        const d0 = data[idx - 1];
        const d1 = data[idx];
        idx = px.getTime() - d0.date.getTime() > d1.date.getTime() - px.getTime() ? idx : idx - 1;
      }
      const d = data[idx];
      const fmtDate = d3.timeFormat('%d %b %Y')(d.date);
      tooltip
        .html(
          `<strong>${fmtDate}</strong><br/>` +
            `<span style="color:${STATUS_COLORS.success}">●</span> Success: ${d.success.toLocaleString()}<br/>` +
            `<span style="color:${STATUS_COLORS.error}">●</span> Error: ${d.error.toLocaleString()}<br/>` +
            `Total: ${d.total.toLocaleString()}`,
        )
        .style('opacity', 1)
        .style('left', `${event.offsetX + 12}px`)
        .style('top', `${event.offsetY - 10}px`);
    })
    .on('mouseleave', () => {
      tooltip.style('opacity', 0);
    });
}

// ─── Resize observer ─────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  resizeObserver = new ResizeObserver(() => {
    if (chartData.value.length > 0) {
      drawChart();
    }
  });
  if (chartRef.value) resizeObserver.observe(chartRef.value);
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

// ─── Init ────────────────────────────────────────────────────────────────────
async function loadStatistics() {
  await Promise.all([loadCounts(), loadChart()]);
  await nextTick();
  setupResizeObserver();
}

defineExpose({ loadStatistics });

onMounted(() => {
  loadStatistics();
});
</script>

<style scoped>
.home-statistics {
  position: relative;
}

.stat-card {
  border-radius: 12px !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.chart-card {
  border-radius: 12px !important;
}

.chart-container {
  position: relative;
  width: 100%;
  min-height: 180px;
}
</style>
