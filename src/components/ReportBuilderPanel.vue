<template>
  <v-card variant="outlined">
    <!-- Top bar -->
    <div class="d-flex align-center ga-2 px-3 pt-2 pb-1">
      <v-icon size="small" color="primary">mdi-chart-multiple</v-icon>
      <span class="text-caption font-weight-medium">Charts</span>
      <v-spacer />
      <v-btn size="x-small" variant="text" @click="addPanel">
        <v-icon start size="small">mdi-plus</v-icon>
        Add chart
      </v-btn>
      <v-btn size="x-small" variant="tonal" color="primary" @click="openSaveDialog">
        <v-icon start size="small">mdi-content-save-outline</v-icon>
        Save
      </v-btn>
    </div>

    <v-divider />

    <v-card-text class="pa-2">
      <div v-for="(panel, pIdx) in panels" :key="panel.id" class="rbp-panel mb-3">
        <!-- Panel header -->
        <div class="d-flex align-center px-2 py-1">
          <span class="text-caption text-medium-emphasis">Chart {{ pIdx + 1 }}</span>
          <v-spacer />
          <v-btn
            size="x-small"
            variant="text"
            :disabled="!canRender(panel)"
            @click="downloadPng(panel)">
            <v-icon size="small">mdi-download</v-icon>
            <v-tooltip activator="parent">Download PNG</v-tooltip>
          </v-btn>
          <v-btn
            size="x-small"
            variant="text"
            :disabled="!canRender(panel)"
            @click="printPdf(panel)">
            <v-icon size="small">mdi-printer</v-icon>
            <v-tooltip activator="parent">Print / PDF</v-tooltip>
          </v-btn>
          <v-btn
            v-if="panels.length > 1"
            size="x-small"
            variant="text"
            color="error"
            @click="removePanel(pIdx)">
            <v-icon size="small">mdi-close</v-icon>
            <v-tooltip activator="parent">Remove chart</v-tooltip>
          </v-btn>
        </div>

        <!-- Sidebar + canvas -->
        <div class="rbp-body">
          <!-- ── Config sidebar ── -->
          <div class="rbp-sidebar">
            <!-- Chart type -->
            <div class="rbp-section-label">Type</div>
            <v-btn-toggle
              v-model="panel.chartType"
              mandatory
              density="compact"
              variant="outlined"
              rounded="0"
              class="mb-3">
              <v-btn value="bar" size="x-small">
                <v-icon size="small">mdi-chart-bar</v-icon>
                <v-tooltip activator="parent">Bar</v-tooltip>
              </v-btn>
              <v-btn value="line" size="x-small">
                <v-icon size="small">mdi-chart-line</v-icon>
                <v-tooltip activator="parent">Line</v-tooltip>
              </v-btn>
              <v-btn value="pie" size="x-small">
                <v-icon size="small">mdi-chart-pie</v-icon>
                <v-tooltip activator="parent">Pie</v-tooltip>
              </v-btn>
              <v-btn value="scatter" size="x-small">
                <v-icon size="small">mdi-chart-scatter-plot</v-icon>
                <v-tooltip activator="parent">Scatter</v-tooltip>
              </v-btn>
            </v-btn-toggle>

            <!-- X axis -->
            <div class="rbp-section-label">
              {{ panel.chartType === 'scatter' ? 'X Axis' : 'X Axis (Labels)' }}
            </div>
            <v-select
              v-model="panel.xColumn"
              :items="columns"
              density="compact"
              variant="outlined"
              hide-details
              placeholder="Select column"
              class="mb-3" />

            <!-- Y series -->
            <div class="rbp-section-label d-flex align-center">
              {{ panel.chartType === 'scatter' ? 'Y Axis' : 'Y Series (Values)' }}
              <v-spacer />
              <v-btn
                v-if="panel.chartType !== 'pie' && panel.chartType !== 'scatter'"
                size="x-small"
                variant="text"
                color="primary"
                :disabled="columns.length === 0"
                @click="addSeries(panel)">
                <v-icon size="x-small">mdi-plus</v-icon>
              </v-btn>
            </div>
            <div
              v-for="(series, sIdx) in panel.ySeriesList"
              :key="series.column + sIdx"
              class="d-flex align-center ga-1 mb-1">
              <span
                class="rbp-series-dot flex-shrink-0"
                :style="{ background: PALETTE[series.colorIndex % PALETTE.length] }" />
              <v-select
                v-model="series.column"
                :items="columns"
                density="compact"
                variant="outlined"
                hide-details
                class="flex-grow-1"
                style="min-width: 0" />
              <v-btn
                v-if="panel.ySeriesList.length > 1"
                size="x-small"
                variant="text"
                icon
                @click="removeSeries(panel, sIdx)">
                <v-icon size="x-small">mdi-close</v-icon>
              </v-btn>
            </div>

            <!-- Aggregation (not for scatter; pie uses raw values) -->
            <template v-if="panel.chartType !== 'scatter' && panel.chartType !== 'pie'">
              <div class="rbp-section-label mt-3">Aggregation</div>
              <v-select
                v-model="panel.aggregation"
                :items="AGG_OPTIONS"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-3" />
            </template>

            <!-- Type-specific options -->
            <div class="rbp-section-label mt-1">Options</div>

            <template v-if="panel.chartType === 'bar'">
              <v-checkbox
                v-model="panel.stacked"
                label="Stacked"
                density="compact"
                hide-details
                class="rbp-check" />
              <v-checkbox
                v-model="panel.horizontal"
                label="Horizontal"
                density="compact"
                hide-details
                class="rbp-check" />
            </template>

            <template v-else-if="panel.chartType === 'line'">
              <v-checkbox
                v-model="panel.smooth"
                label="Smooth curve"
                density="compact"
                hide-details
                class="rbp-check" />
              <v-checkbox
                v-model="panel.stacked"
                label="Stacked area"
                density="compact"
                hide-details
                class="rbp-check" />
            </template>

            <template v-else-if="panel.chartType === 'pie'">
              <v-checkbox
                v-model="panel.donut"
                label="Donut"
                density="compact"
                hide-details
                class="rbp-check" />
            </template>

            <!-- Sort + limit (not for pie/scatter) -->
            <template v-if="panel.chartType !== 'pie' && panel.chartType !== 'scatter'">
              <div class="rbp-section-label mt-3">Sort</div>
              <v-select
                v-model="panel.sortBy"
                :items="SORT_OPTIONS"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-2" />
              <div class="rbp-section-label">Limit rows</div>
              <v-select
                v-model="panel.topN"
                :items="TOPN_OPTIONS"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-1" />
            </template>
          </div>

          <!-- ── Chart canvas ── -->
          <div class="rbp-canvas-wrap">
            <div
              v-if="canRender(panel)"
              :style="{ height: panel.height + 'px', position: 'relative' }">
              <Bar
                v-if="panel.chartType === 'bar'"
                :ref="(el: any) => setRef(panel.id, el)"
                :data="buildData(panel)"
                :options="buildOptions(panel)" />
              <Line
                v-else-if="panel.chartType === 'line'"
                :ref="(el: any) => setRef(panel.id, el)"
                :data="buildData(panel)"
                :options="buildOptions(panel)" />
              <Pie
                v-else-if="panel.chartType === 'pie'"
                :ref="(el: any) => setRef(panel.id, el)"
                :data="buildData(panel)"
                :options="buildOptions(panel)" />
              <Scatter
                v-else-if="panel.chartType === 'scatter'"
                :ref="(el: any) => setRef(panel.id, el)"
                :data="buildData(panel)"
                :options="buildOptions(panel)" />
            </div>
            <div v-else class="rbp-empty">
              <v-icon size="40" color="grey-lighten-2">mdi-chart-bar</v-icon>
              <div class="text-caption text-medium-emphasis mt-2">
                Select X and at least one Y column
              </div>
            </div>
            <!-- Resize handle -->
            <div
              class="rbp-resize"
              :class="{ 'rbp-resize--active': resizingId === panel.id }"
              @mousedown="startResize($event, panel)">
              ⋮
            </div>
          </div>
        </div>
      </div>

      <!-- Saved reports -->
      <template v-if="reportsStore.reports.length > 0">
        <v-divider class="mb-2" />
        <div class="text-caption text-medium-emphasis mb-1">Saved</div>
        <div class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="report in reportsStore.reports"
            :key="report.id"
            size="small"
            variant="tonal"
            closable
            @click="loadReport(report)"
            @click:close="reportsStore.deleteReport(report.id)">
            <v-icon start size="x-small">mdi-chart-box-outline</v-icon>
            {{ report.name }}
          </v-chip>
        </div>
      </template>
    </v-card-text>
  </v-card>

  <!-- Save dialog -->
  <v-dialog v-model="saveDialog" max-width="380">
    <v-card>
      <v-card-title>Save Report</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="saveName"
          label="Report Name"
          density="comfortable"
          variant="outlined"
          autofocus
          @keyup.enter="confirmSave" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="saveDialog = false">Cancel</v-btn>
        <v-btn color="primary" variant="elevated" :disabled="!saveName.trim()" @click="confirmSave">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Bar, Line, Pie, Scatter } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { LoQEQueryResult } from '../composables/loqe/types';
import {
  useReportsStore,
  type ChartType,
  type AggregationType,
  type SortType,
  type YSeries,
  type SavedReport,
  type ChartConfig,
} from '../stores/reports';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

const props = defineProps<{
  result: LoQEQueryResult | null;
  sql: string;
}>();

const reportsStore = useReportsStore();
const visualStore = useVisualStore();

// ── Constants ─────────────────────────────────────────────────────────

const PALETTE = [
  '#42A5F5',
  '#66BB6A',
  '#FFA726',
  '#EF5350',
  '#AB47BC',
  '#26C6DA',
  '#D4E157',
  '#FF7043',
  '#8D6E63',
  '#78909C',
];

const AGG_OPTIONS = [
  { title: 'None (raw values)', value: 'none' },
  { title: 'SUM', value: 'sum' },
  { title: 'AVG', value: 'avg' },
  { title: 'COUNT', value: 'count' },
  { title: 'MAX', value: 'max' },
  { title: 'MIN', value: 'min' },
];

const SORT_OPTIONS = [
  { title: 'No sort', value: 'none' },
  { title: 'X ↑ ascending', value: 'x_asc' },
  { title: 'X ↓ descending', value: 'x_desc' },
  { title: 'Y ↑ ascending', value: 'y_asc' },
  { title: 'Y ↓ descending', value: 'y_desc' },
];

const TOPN_OPTIONS = [
  { title: 'All rows', value: 0 },
  { title: 'Top 10', value: 10 },
  { title: 'Top 25', value: 25 },
  { title: 'Top 50', value: 50 },
  { title: 'Top 100', value: 100 },
];

// ── Panel state ───────────────────────────────────────────────────────

interface ChartPanel {
  id: string;
  chartType: ChartType;
  xColumn: string;
  ySeriesList: YSeries[];
  aggregation: AggregationType;
  stacked: boolean;
  horizontal: boolean;
  smooth: boolean;
  donut: boolean;
  sortBy: SortType;
  topN: number;
  height: number;
}

const DEFAULT_HEIGHT = 360;

function makePanel(xCol = '', yCol = ''): ChartPanel {
  return {
    id: crypto.randomUUID(),
    chartType: 'bar',
    xColumn: xCol,
    ySeriesList: [{ column: yCol, colorIndex: 0 }],
    aggregation: 'none',
    stacked: false,
    horizontal: false,
    smooth: false,
    donut: false,
    sortBy: 'none',
    topN: 0,
    height: DEFAULT_HEIGHT,
  };
}

const panels = ref<ChartPanel[]>([makePanel()]);

// Chart refs keyed by panel id
const chartRefs: Record<string, any> = {};
function setRef(id: string, el: any) {
  if (el) chartRefs[id] = el;
  else delete chartRefs[id];
}

// ── Columns ───────────────────────────────────────────────────────────

const columns = computed(() => props.result?.columns ?? []);

watch(
  () => props.result,
  (result) => {
    if (!result) return;
    const cols = result.columns;
    for (const p of panels.value) {
      if (!cols.includes(p.xColumn)) p.xColumn = cols[0] ?? '';
      for (const s of p.ySeriesList) {
        if (!cols.includes(s.column)) s.column = cols[1] ?? cols[0] ?? '';
      }
    }
  },
  { immediate: true },
);

// ── Panel / series management ─────────────────────────────────────────

function addPanel() {
  const cols = props.result?.columns ?? [];
  panels.value.push(makePanel(cols[0] ?? '', cols[1] ?? cols[0] ?? ''));
}

function removePanel(idx: number) {
  const [removed] = panels.value.splice(idx, 1);
  delete chartRefs[removed.id];
}

function addSeries(panel: ChartPanel) {
  const nextIdx = panel.ySeriesList.length;
  const col = columns.value[nextIdx] ?? columns.value[0] ?? '';
  panel.ySeriesList.push({ column: col, colorIndex: nextIdx });
}

function removeSeries(panel: ChartPanel, idx: number) {
  panel.ySeriesList.splice(idx, 1);
}

// ── Data helpers ──────────────────────────────────────────────────────

function canRender(p: ChartPanel): boolean {
  return !!props.result && !!p.xColumn && p.ySeriesList.some((s) => !!s.column);
}

function aggregate(
  rows: any[][],
  xIdx: number,
  yIdx: number,
  agg: AggregationType,
): [string[], number[]] {
  if (agg === 'none') {
    return [rows.map((r) => String(r[xIdx])), rows.map((r) => Number(r[yIdx]) || 0)];
  }
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[xIdx]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(Number(row[yIdx]) || 0);
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (const [key, vals] of groups) {
    labels.push(key);
    switch (agg) {
      case 'sum':
        values.push(vals.reduce((a, b) => a + b, 0));
        break;
      case 'avg':
        values.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        break;
      case 'count':
        values.push(vals.length);
        break;
      case 'max':
        values.push(Math.max(...vals));
        break;
      case 'min':
        values.push(Math.min(...vals));
        break;
    }
  }
  return [labels, values];
}

function sortAndLimit(
  labels: string[],
  values: number[],
  sortBy: SortType,
  topN: number,
): [string[], number[]] {
  let pairs: [string, number][] = labels.map((l, i) => [l, values[i]]);
  if (sortBy === 'x_asc') pairs.sort((a, b) => a[0].localeCompare(b[0]));
  else if (sortBy === 'x_desc') pairs.sort((a, b) => b[0].localeCompare(a[0]));
  else if (sortBy === 'y_asc') pairs.sort((a, b) => a[1] - b[1]);
  else if (sortBy === 'y_desc') pairs.sort((a, b) => b[1] - a[1]);
  if (topN > 0) pairs = pairs.slice(0, topN);
  return [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
}

function buildData(p: ChartPanel): any {
  if (!props.result) return { datasets: [] };
  const { rows, columns: cols } = props.result;
  const xIdx = cols.indexOf(p.xColumn);
  if (xIdx === -1) return { datasets: [] };

  if (p.chartType === 'scatter') {
    const s = p.ySeriesList[0];
    const yIdx = cols.indexOf(s?.column ?? '');
    return {
      datasets: [
        {
          label: s?.column ?? 'Y',
          data: rows.map((r) => ({ x: Number(r[xIdx]) || 0, y: Number(r[yIdx]) || 0 })),
          backgroundColor: PALETTE[0] + '99',
          borderColor: PALETTE[0],
          pointRadius: 4,
        },
      ],
    };
  }

  if (p.chartType === 'pie') {
    const s = p.ySeriesList[0];
    const yIdx = cols.indexOf(s?.column ?? '');
    const [labels, values] = sortAndLimit(
      rows.map((r) => String(r[xIdx])),
      rows.map((r) => Number(r[yIdx]) || 0),
      p.sortBy,
      p.topN,
    );
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: PALETTE.map((c) => c + 'CC'),
          borderColor: PALETTE,
          borderWidth: 1,
        },
      ],
    };
  }

  // Bar / line — one dataset per Y series, share the same X labels
  // Use first series to determine labels (all series are expected to share X)
  const firstS = p.ySeriesList[0];
  const firstYIdx = cols.indexOf(firstS?.column ?? '');
  let [sharedLabels] = aggregate(rows, xIdx, firstYIdx, p.aggregation);
  // apply sort/limit on labels from first series, then reapply same indices to others
  // Build combined pairs per series and sort once
  const datasets = p.ySeriesList
    .filter((s) => !!s.column)
    .map((s, i) => {
      const yIdx = cols.indexOf(s.column);
      const [labels, values] = aggregate(rows, xIdx, yIdx, p.aggregation);
      const [sortedLabels, sortedValues] = sortAndLimit(labels, values, p.sortBy, p.topN);
      if (i === 0) sharedLabels = sortedLabels;
      const color = PALETTE[s.colorIndex % PALETTE.length];
      return {
        label: s.label || s.column,
        data: sortedValues,
        backgroundColor: p.chartType === 'bar' ? color + 'CC' : color + '22',
        borderColor: color,
        borderWidth: 2,
        fill: p.chartType === 'line' && p.stacked,
        tension: p.chartType === 'line' && p.smooth ? 0.4 : 0,
        pointRadius: 3,
      };
    });

  return { labels: sharedLabels, datasets };
}

function buildOptions(p: ChartPanel): any {
  const base: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    plugins: {
      legend: { display: p.chartType === 'pie' || p.ySeriesList.length > 1 },
    },
  };

  if (p.chartType === 'pie') {
    if (p.donut) base.cutout = '50%';
    return base;
  }

  if (p.chartType === 'scatter') {
    base.scales = {
      x: { type: 'linear', grid: { display: true, color: 'rgba(128,128,128,0.1)' } },
      y: { grid: { color: 'rgba(128,128,128,0.1)' } },
    };
    return base;
  }

  // Bar / line
  const stacked = p.stacked;
  base.scales = {
    x: {
      stacked,
      grid: { display: false },
    },
    y: {
      stacked,
      grid: { color: 'rgba(128,128,128,0.1)' },
    },
  };

  if (p.chartType === 'bar' && p.horizontal) {
    base.indexAxis = 'y';
  }

  return base;
}

// ── Resize ────────────────────────────────────────────────────────────

const resizingId = ref<string | null>(null);
// Track active drag listeners so we can detach them if the component unmounts mid-resize.
let activeMove: ((e: MouseEvent) => void) | null = null;
let activeUp: (() => void) | null = null;

function startResize(event: MouseEvent, panel: ChartPanel) {
  resizingId.value = panel.id;
  const startY = event.clientY;
  const startH = panel.height;
  function onMove(e: MouseEvent) {
    panel.height = Math.max(120, startH + (e.clientY - startY));
  }
  function onUp() {
    resizingId.value = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    activeMove = null;
    activeUp = null;
  }
  activeMove = onMove;
  activeUp = onUp;
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

onBeforeUnmount(() => {
  if (activeMove) window.removeEventListener('mousemove', activeMove);
  if (activeUp) window.removeEventListener('mouseup', activeUp);
  activeMove = null;
  activeUp = null;
  resizingId.value = null;
});

// ── Export ────────────────────────────────────────────────────────────

function getDataUrl(panel: ChartPanel): string | null {
  return chartRefs[panel.id]?.chart?.toBase64Image('image/png', 1) ?? null;
}

function downloadPng(panel: ChartPanel) {
  const url = getDataUrl(panel);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${saveName.value || 'chart'}.png`;
  a.click();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function printPdf(panel: ChartPanel) {
  const url = getDataUrl(panel);
  if (!url) return;
  // Escape: the report name is user-supplied and is injected into the print document.
  const title = escapeHtml(saveName.value || 'Report');
  const win = window.open('', '_blank', 'width=820,height=620');
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title>` +
      `<style>body{margin:24px;font-family:sans-serif}img{max-width:100%;border:1px solid #eee;margin-top:12px}` +
      `h2{margin:0 0 8px;font-size:16px;font-weight:600}</style></head>` +
      `<body><h2>${title}</h2><img src="${url}">` +
      `<script>window.onload=function(){window.print()}<` +
      `/script></body></html>`,
  );
  win.document.close();
}

// ── Save / load ───────────────────────────────────────────────────────

const saveDialog = ref(false);
const saveName = ref('');

function openSaveDialog() {
  saveDialog.value = true;
}

function confirmSave() {
  if (!saveName.value.trim()) return;
  const p = panels.value[0];
  if (!p) return;
  const config: ChartConfig = {
    type: p.chartType,
    xColumn: p.xColumn,
    ySeriesList: p.ySeriesList,
    aggregation: p.aggregation,
    stacked: p.stacked,
    horizontal: p.horizontal,
    smooth: p.smooth,
    donut: p.donut,
    sortBy: p.sortBy,
    topN: p.topN,
  };
  reportsStore.saveReport(saveName.value.trim(), props.sql, config);
  visualStore.setSnackbarMsg({
    text: `Report "${saveName.value.trim()}" saved.`,
    ttl: 3000,
    ts: Date.now(),
    type: Type.SUCCESS,
  });
  saveDialog.value = false;
}

function loadReport(report: SavedReport) {
  const c = report.chartConfig;
  panels.value = [
    {
      id: crypto.randomUUID(),
      chartType: c.type,
      xColumn: c.xColumn,
      ySeriesList: c.ySeriesList ?? [{ column: '', colorIndex: 0 }],
      aggregation: c.aggregation ?? 'none',
      stacked: c.stacked ?? false,
      horizontal: c.horizontal ?? false,
      smooth: c.smooth ?? false,
      donut: c.donut ?? false,
      sortBy: c.sortBy ?? 'none',
      topN: c.topN ?? 0,
      height: DEFAULT_HEIGHT,
    },
  ];
}
</script>

<style scoped>
.rbp-panel {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.rbp-body {
  display: flex;
  min-height: 0;
}

.rbp-sidebar {
  width: 220px;
  flex-shrink: 0;
  padding: 10px 10px 8px;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow-y: auto;
}

.rbp-canvas-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.rbp-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.rbp-series-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.rbp-check {
  margin-left: -4px;
}
.rbp-check :deep(.v-label) {
  font-size: 0.8125rem;
}

.rbp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  min-height: 160px;
}

.rbp-resize {
  height: 6px;
  cursor: row-resize;
  user-select: none;
  text-align: center;
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.25);
  line-height: 6px;
  margin-top: 4px;
  border-radius: 4px;
  transition:
    background 0.15s,
    color 0.15s;
}
.rbp-resize:hover,
.rbp-resize--active {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}
</style>
