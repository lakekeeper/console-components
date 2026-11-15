<template>
  <!-- A run's plan as a graph: scans at the bottom, rows flowing up through
       each operator to the result at the top. An edge is as thick as the rows
       it carries; each box shows its operator's rows and its share of the time,
       the slowest in amber. Drag to pan, scroll to zoom, click a box for what
       DuckDB says it did. d3 lays it out and zooms it; Vue draws it, so it
       follows the theme. -->
  <div class="lpg">
    <div class="lpg-tools">
      <v-btn
        icon="mdi-magnify-plus-outline"
        size="x-small"
        variant="text"
        aria-label="Zoom in"
        @click="zoomBy(1.25)" />
      <v-btn
        icon="mdi-magnify-minus-outline"
        size="x-small"
        variant="text"
        aria-label="Zoom out"
        @click="zoomBy(0.8)" />
      <v-btn
        icon="mdi-fit-to-screen-outline"
        size="x-small"
        variant="text"
        aria-label="Fit to view"
        @click="fit" />
    </div>
    <svg
      ref="svgRef"
      class="lpg-svg"
      role="img"
      :aria-label="`Plan with ${nodes.length} operators`">
      <g :transform="transform">
        <g v-for="(l, i) in links" :key="`l${i}`">
          <path :d="l.path" class="lpg-link" :style="{ strokeWidth: `${l.width}px` }" />
          <text :x="l.labelX + 6" :y="l.labelY" class="lpg-link-label">{{ l.label }}</text>
        </g>
        <g
          v-for="(n, i) in nodes"
          :key="`n${i}`"
          :transform="`translate(${n.x - W / 2}, ${n.y - H / 2})`"
          class="lpg-node"
          :class="{
            'lpg-node--slowest': n.slowest,
            'lpg-node--scan': n.data.scanned > 0,
            'lpg-node--selected': selected === n.data,
          }"
          tabindex="0"
          role="button"
          :aria-label="`${n.data.name}, ${fmtRows(n.data.rows)} rows, ${fmtMs(n.data.timeMs)}`"
          @click="selected = selected === n.data ? null : n.data"
          @keydown.enter="selected = selected === n.data ? null : n.data">
          <rect :width="W" :height="H" rx="8" class="lpg-box" />
          <text x="10" y="20" class="lpg-name">{{ short(n.data.name, 22) }}</text>
          <text x="10" y="37" class="lpg-meta">
            {{ fmtRows(n.data.rows) }} rows
            <tspan v-if="n.data.scanned">· scanned {{ fmtRows(n.data.scanned) }}</tspan>
          </text>
          <text :x="W - 10" y="20" text-anchor="end" class="lpg-meta">
            {{ fmtMs(n.data.timeMs) }}
          </text>
          <rect x="10" :y="H - 10" :width="W - 20" height="3" rx="1.5" class="lpg-bar-bg" />
          <rect
            x="10"
            :y="H - 10"
            :width="Math.max(2, (W - 20) * n.share)"
            height="3"
            rx="1.5"
            class="lpg-bar" />
        </g>
      </g>
    </svg>

    <div v-if="selected" class="lpg-info">
      <div class="d-flex align-center mb-1">
        <span class="lpg-info-name">{{ selected.name }}</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          aria-label="Close operator details"
          @click="selected = null" />
      </div>
      <div class="text-caption text-medium-emphasis mb-1">
        {{ fmtRows(selected.rows) }} rows out
        <template v-if="selected.scanned">· {{ fmtRows(selected.scanned) }} scanned</template>
        · {{ fmtMs(selected.timeMs) }}
      </div>
      <div v-for="[key, value] in infoLines(selected)" :key="key" class="lpg-info-line">
        <span class="lpg-info-key">{{ key }}</span>
        <span class="lpg-info-val">{{ Array.isArray(value) ? value.join(', ') : value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import type { LoQEPlanNode } from '../composables/loqe/runProfile';

const props = defineProps<{ plan: LoQEPlanNode }>();

const W = 200;
const H = 52;
const GAP_X = 28;
const GAP_Y = 46;

const selected = ref<LoQEPlanNode | null>(null);
watch(
  () => props.plan,
  () => (selected.value = null),
);

const layout = computed(() => {
  const root = d3.hierarchy(props.plan, (d) => d.children);
  d3.tree<LoQEPlanNode>().nodeSize([W + GAP_X, H + GAP_Y])(root);
  return root as d3.HierarchyPointNode<LoQEPlanNode>;
});

const totalMs = computed(() => layout.value.descendants().reduce((t, n) => t + n.data.timeMs, 0));
const slowestMs = computed(() =>
  Math.max(0, ...layout.value.descendants().map((n) => n.data.timeMs)),
);
const maxRows = computed(() => Math.max(1, ...layout.value.descendants().map((n) => n.data.rows)));

const nodes = computed(() =>
  layout.value.descendants().map((n) => ({
    x: n.x,
    y: n.y,
    data: n.data,
    share: totalMs.value > 0 ? n.data.timeMs / totalMs.value : 0,
    slowest: n.data.timeMs > 0 && n.data.timeMs === slowestMs.value,
  })),
);

// An edge carries the child's rows up to its parent; its width says how many.
const link = d3.linkVertical();
const links = computed(() =>
  layout.value.links().map(({ source, target }) => {
    const from: [number, number] = [target.x, target.y - H / 2];
    const to: [number, number] = [source.x, source.y + H / 2];
    const rows = target.data.rows;
    return {
      path: link({ source: from, target: to }) ?? '',
      width: 1 + (5 * Math.log10(rows + 1)) / Math.log10(maxRows.value + 1),
      label: compact.format(rows),
      labelX: (from[0] + to[0]) / 2,
      labelY: (from[1] + to[1]) / 2 + 4,
    };
  }),
);

// ── Pan and zoom ──
const svgRef = ref<SVGSVGElement | null>(null);
const transform = ref('');
let behaviour: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
let observer: ResizeObserver | null = null;
let fitted = false;

function fit() {
  const svg = svgRef.value;
  if (!svg || !behaviour) return;
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;
  const xs = nodes.value.map((n) => n.x);
  const ys = nodes.value.map((n) => n.y);
  const minX = Math.min(...xs) - W / 2;
  const maxX = Math.max(...xs) + W / 2;
  const minY = Math.min(...ys) - H / 2;
  const maxY = Math.max(...ys) + H / 2;
  const scale = Math.min(1, (width - 32) / (maxX - minX), (height - 32) / (maxY - minY));
  const tx = width / 2 - ((minX + maxX) / 2) * scale;
  const ty = height / 2 - ((minY + maxY) / 2) * scale;
  d3.select(svg).call(behaviour.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  fitted = true;
}

function zoomBy(factor: number) {
  if (svgRef.value && behaviour) d3.select(svgRef.value).call(behaviour.scaleBy, factor);
}

onMounted(() => {
  const svg = svgRef.value!;
  behaviour = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 2.5])
    .on('zoom', (e) => (transform.value = e.transform.toString()));
  d3.select(svg).call(behaviour).on('dblclick.zoom', null);
  // Fit once there is a size to fit into: a tab that is not showing has none.
  observer = new ResizeObserver(() => {
    if (!fitted) fit();
  });
  observer.observe(svg);
  fit();
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => props.plan,
  () => {
    fitted = false;
    requestAnimationFrame(fit);
  },
);

// ── Text ──
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const fmtRows = (n: number) => n.toLocaleString();
function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const HIDDEN = new Set(['Estimated Cardinality', 'Function']);
const infoLines = (n: LoQEPlanNode) =>
  Object.entries(n.info).filter(([k, v]) => !HIDDEN.has(k) && v.length !== 0);
</script>

<style scoped>
.lpg {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.lpg-tools {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: flex;
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
}
.lpg-svg {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  cursor: grab;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.02);
}
.lpg-svg:active {
  cursor: grabbing;
}
.lpg-link {
  fill: none;
  stroke: rgba(var(--v-theme-primary), 0.35);
}
.lpg-link-label {
  font-size: 10px;
  fill: rgba(var(--v-theme-on-surface), 0.6);
}
.lpg-node {
  cursor: pointer;
  outline: none;
}
.lpg-box {
  fill: rgb(var(--v-theme-surface));
  stroke: rgba(var(--v-theme-on-surface), 0.25);
  stroke-width: 1;
}
.lpg-node--scan .lpg-box {
  fill: rgba(var(--v-theme-primary), 0.06);
}
.lpg-node--slowest .lpg-box {
  stroke: rgb(var(--v-theme-warning));
  stroke-width: 2;
}
.lpg-node--selected .lpg-box,
.lpg-node:focus-visible .lpg-box {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
}
.lpg-name {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  fill: rgb(var(--v-theme-on-surface));
}
.lpg-node--slowest .lpg-name {
  fill: rgb(var(--v-theme-warning));
}
.lpg-meta {
  font-size: 11px;
  fill: rgba(var(--v-theme-on-surface), 0.7);
}
.lpg-bar-bg {
  fill: rgba(var(--v-theme-on-surface), 0.08);
}
.lpg-bar {
  fill: rgba(var(--v-theme-primary), 0.7);
}
.lpg-node--slowest .lpg-bar {
  fill: rgb(var(--v-theme-warning));
}
.lpg-info {
  flex: 0 0 auto;
  max-height: 35%;
  overflow-y: auto;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.lpg-info-name {
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.lpg-info-line {
  display: flex;
  gap: 6px;
  font-size: 11px;
  line-height: 1.5;
}
.lpg-info-key {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.lpg-info-val {
  min-width: 0;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
