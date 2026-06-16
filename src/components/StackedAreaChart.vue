<template>
  <div ref="container" class="sac-container" :style="{ height: `${height}px` }">
    <svg ref="svg" class="sac-svg"></svg>
    <div v-show="tooltip.show" ref="tip" class="sac-tooltip" :style="tooltip.style">
      <div v-for="row in tooltip.rows" :key="row.key" class="sac-tip-row">
        <span class="sac-tip-dot" :style="{ background: row.color }"></span>
        <span class="sac-tip-label">{{ row.label }}</span>
        <span class="sac-tip-val">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue';
import * as d3 from 'd3';

interface Series {
  key: string;
  label: string;
  color: string;
}
interface Point {
  label: string; // full label (tooltip / x axis)
  short: string; // short x-axis tick label
  values: Record<string, number>;
}

const props = withDefaults(
  defineProps<{
    series: Series[];
    points: Point[];
    height?: number;
  }>(),
  { height: 240 },
);

const container = ref<HTMLDivElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const tip = ref<HTMLDivElement | null>(null);
const tooltip = reactive({
  show: false,
  title: '',
  rows: [] as Array<{ key: string; label: string; color: string; value: number }>,
  style: { left: '0px', top: '0px' } as Record<string, string>,
});

const MARGIN = { top: 12, right: 16, bottom: 30, left: 42 };
let resizeObserver: ResizeObserver | null = null;

function draw() {
  if (!container.value || !svg.value) return;
  const width = container.value.clientWidth;
  const height = props.height;
  if (width <= 0) return;

  const innerW = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(10, height - MARGIN.top - MARGIN.bottom);
  const pts = props.points;
  const keys = props.series.map((s) => s.key);
  const colorOf = new Map(props.series.map((s) => [s.key, s.color]));

  const root = d3.select(svg.value).attr('width', width).attr('height', height);
  root.selectAll('*').remove();
  const g = root.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  if (pts.length === 0 || keys.length === 0) return;

  // Stack the data (missing series default to 0).
  const stackInput = pts.map((p) => {
    const row: Record<string, number> = {};
    for (const k of keys) row[k] = p.values[k] ?? 0;
    return row;
  });
  const stacked = d3.stack<Record<string, number>>().keys(keys)(stackInput);

  const n = pts.length;
  const x = d3
    .scaleLinear()
    .domain([0, Math.max(1, n - 1)])
    .range([0, innerW]);
  const yMax = d3.max(stacked[stacked.length - 1] ?? [], (d) => d[1]) ?? 1;
  const y = d3
    .scaleLinear()
    .domain([0, yMax || 1])
    .nice()
    .range([innerH, 0]);

  // Y grid + axis
  g.append('g')
    .attr('class', 'sac-axis')
    .call(d3.axisLeft(y).ticks(3).tickSize(-innerW).tickPadding(6))
    .call((sel) => sel.select('.domain').remove());

  // X axis (sparse date labels)
  const labelEvery = Math.max(1, Math.ceil(n / 12));
  const tickIdx = pts.map((_, i) => i).filter((i) => i % labelEvery === 0);
  g.append('g')
    .attr('class', 'sac-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(tickIdx)
        .tickFormat((d) => pts[d as number]?.short ?? '')
        .tickSize(0)
        .tickPadding(6),
    )
    .call((sel) => sel.select('.domain').remove());

  const area = d3
    .area<[number, number]>()
    .x((_d, i) => x(i))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveMonotoneX);

  g.selectAll('path.sac-area')
    .data(stacked)
    .join('path')
    .attr('class', 'sac-area')
    .attr('fill', (d) => colorOf.get(d.key as string) ?? '#888')
    .attr('fill-opacity', 0.7)
    .attr('stroke', (d) => colorOf.get(d.key as string) ?? '#888')
    .attr('stroke-width', 1)
    .attr('d', (d) => area(d as unknown as [number, number][]));

  // Hover interaction
  const focusLine = g
    .append('line')
    .attr('class', 'sac-focus')
    .attr('y1', 0)
    .attr('y2', innerH)
    .style('display', 'none');

  g.append('rect')
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'transparent')
    .on('mousemove', (event: MouseEvent) => {
      const [mx, my] = d3.pointer(event);
      const i = Math.min(n - 1, Math.max(0, Math.round(x.invert(mx))));
      focusLine.style('display', null).attr('x1', x(i)).attr('x2', x(i));
      const p = pts[i];
      tooltip.rows = props.series
        .map((s) => ({ key: s.key, label: s.label, color: s.color, value: p.values[s.key] ?? 0 }))
        .filter((r) => r.value > 0);
      tooltip.show = tooltip.rows.length > 0;
      // Follow the cursor (container coords), clamped so it never gets clipped.
      const TIP_W = 150;
      const tipH = 12 + tooltip.rows.length * 18;
      const cx = mx + MARGIN.left;
      const cy = my + MARGIN.top;
      let left = cx + 14;
      if (left + TIP_W > width) left = cx - TIP_W - 14;
      left = Math.max(4, Math.min(left, width - TIP_W - 4));
      let top = cy + 12;
      top = Math.max(4, Math.min(top, height - tipH - 4));
      tooltip.style = { left: `${left}px`, top: `${top}px` };
    })
    .on('mouseleave', () => {
      tooltip.show = false;
      focusLine.style('display', 'none');
    });
}

function scheduleDraw() {
  nextTick(draw);
}

onMounted(() => {
  scheduleDraw();
  if (container.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(container.value);
  }
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
watch(() => [props.points, props.series, props.height], scheduleDraw, { deep: true });
</script>

<style scoped>
.sac-container {
  position: relative;
  width: 100%;
}
.sac-svg {
  display: block;
  width: 100%;
  overflow: visible;
}
.sac-container :deep(.sac-axis text) {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 10px;
}
.sac-container :deep(.sac-axis line) {
  stroke: rgba(var(--v-theme-on-surface), 0.1);
}
.sac-focus {
  stroke: rgba(var(--v-theme-on-surface), 0.4);
  stroke-dasharray: 3 3;
}
.sac-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  z-index: 5;
}
.sac-tip-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.sac-tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sac-tip-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex: 0 0 auto;
}
.sac-tip-label {
  flex: 1 1 auto;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.sac-tip-val {
  font-weight: 600;
}
</style>
