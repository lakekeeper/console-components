<template>
  <div class="graph">
    <div ref="container" class="canvas" :style="{ height: `${height}px` }">
      <svg ref="svg" class="canvas-svg"></svg>

      <div class="zoom-bar">
        <v-btn-group variant="flat" density="comfortable" rounded="lg" class="zoom-group">
          <v-btn size="x-small" icon="mdi-plus" @click="zoomIn">
            <v-icon size="small">mdi-plus</v-icon>
            <v-tooltip activator="parent" location="bottom">Zoom in</v-tooltip>
          </v-btn>
          <v-btn size="x-small" class="zoom-label" @click="fitToView">
            {{ Math.round(currentZoom * 100) }}%
            <v-tooltip activator="parent" location="bottom">Fit to view</v-tooltip>
          </v-btn>
          <v-btn size="x-small" icon="mdi-minus" @click="zoomOut">
            <v-icon size="small">mdi-minus</v-icon>
            <v-tooltip activator="parent" location="bottom">Zoom out</v-tooltip>
          </v-btn>
        </v-btn-group>
      </div>
    </div>

    <!-- What the graph cannot say in a node: where this sits, what it carries,
         and what can be done with it. -->
    <aside class="inspector" :style="{ height: `${height}px` }">
      <template v-if="selected">
        <div class="d-flex align-center mb-1" style="gap: 6px">
          <span class="dot" :style="{ background: colorOf(selected.kind) }"></span>
          <span class="text-caption text-medium-emphasis">{{ KIND_LABEL[selected.kind] }}</span>
        </div>
        <div class="text-body-2 font-weight-bold mb-1 break">{{ selected.label }}</div>
        <div v-if="selectedPath" class="text-caption text-medium-emphasis mb-2 break">
          {{ selectedPath }}
        </div>

        <template v-if="selectedScope && selectedEntityId && selectedWarehouseId">
          <div class="text-caption text-medium-emphasis mb-1">Tags</div>
          <EntityTagsChips
            :key="`${selectedScope}:${selectedEntityId}`"
            :scope="selectedScope"
            :warehouse-id="selectedWarehouseId"
            :entity-id="selectedEntityId"
            effective
            class="mb-3" />
        </template>

        <div class="d-flex flex-column" style="gap: 6px">
          <v-btn
            v-if="canOpen(selected)"
            size="small"
            variant="tonal"
            prepend-icon="mdi-open-in-app"
            @click="emit('open', selected)">
            Open {{ KIND_LABEL[selected.kind].toLowerCase() }}
          </v-btn>
          <v-btn
            v-if="selected.expandable !== false && selected.kind !== 'more'"
            size="small"
            variant="text"
            :prepend-icon="isOpen(selected) ? 'mdi-collapse-all-outline' : 'mdi-sitemap-outline'"
            @click="toggleSelected">
            {{ isOpen(selected) ? 'Collapse' : 'Expand' }}
          </v-btn>
        </div>
      </template>

      <div v-else class="text-caption text-medium-emphasis">
        Pick a node to see its tags and open it. The chevron on a node's right edge expands it.
        Scroll to zoom, drag to pan.
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import * as d3 from 'd3';
import type { TagScope } from '../gen/management/types.gen';
import EntityTagsChips from './EntityTagsChips.vue';

export interface GraphNodeData {
  key: string;
  label: string;
  kind: 'project' | 'warehouse' | 'namespace' | 'table' | 'view' | 'generic-table' | 'more';
  /** `warehouseId`, `namespace`, `name`, and `entityId` where the kind has one. */
  meta?: Record<string, unknown>;
  expandable?: boolean;
  note?: string;
}

interface Node extends GraphNodeData {
  children?: Node[];
  open?: boolean;
  loading?: boolean;
  failed?: string;
}

const props = withDefaults(
  defineProps<{
    root: GraphNodeData;
    loadChildren: (node: GraphNodeData) => Promise<GraphNodeData[]>;
    height?: number;
  }>(),
  { height: 340 },
);

const emit = defineEmits<{ (e: 'open', node: GraphNodeData): void }>();

// Kind decides the colour, so the same kind reads the same anywhere in the
// graph. Hues from the validated categorical order; "more" is grey because it
// is a signpost, not a thing in the estate.
const COLORS: Record<GraphNodeData['kind'], string> = {
  project: 'rgb(74, 58, 167)',
  warehouse: 'rgb(42, 120, 214)',
  namespace: 'rgb(235, 104, 52)',
  table: 'rgb(27, 175, 122)',
  view: 'rgb(237, 161, 0)',
  'generic-table': 'rgb(232, 123, 164)',
  more: 'rgba(138, 138, 133, 0.8)',
};

const KIND_LABEL: Record<GraphNodeData['kind'], string> = {
  project: 'Project',
  warehouse: 'Warehouse',
  namespace: 'Namespace',
  table: 'Table',
  view: 'View',
  'generic-table': 'Generic table',
  more: 'More',
};

const TAG_SCOPE: Partial<Record<GraphNodeData['kind'], TagScope>> = {
  warehouse: 'warehouse',
  namespace: 'namespace',
  table: 'table',
  view: 'view',
  'generic-table': 'generic-table',
};

const container = ref<HTMLDivElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const currentZoom = ref(1);
const userZoomed = ref(false);
const selectedKey = ref<string | null>(null);

let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

const tree = ref<Node>({ ...props.root, open: false });

function find(from: Node, key: string): Node | null {
  if (from.key === key) return from;
  for (const child of from.children ?? []) {
    const found = find(child, key);
    if (found) return found;
  }
  return null;
}

function findParent(from: Node, target: Node): Node | null {
  if (from.children?.includes(target)) return from;
  for (const child of from.children ?? []) {
    const found = findParent(child, target);
    if (found) return found;
  }
  return null;
}

const selected = computed<Node | null>(() =>
  selectedKey.value ? find(tree.value as Node, selectedKey.value) : null,
);

const selectedMeta = computed(() => (selected.value?.meta ?? {}) as Record<string, string>);
const selectedWarehouseId = computed(() => selectedMeta.value.warehouseId ?? '');
const selectedEntityId = computed(() => selectedMeta.value.entityId ?? '');
const selectedScope = computed<TagScope | undefined>(() =>
  selected.value ? TAG_SCOPE[selected.value.kind] : undefined,
);
const selectedPath = computed(() => {
  const meta = selectedMeta.value;
  return [meta.warehouseName, meta.namespace].filter(Boolean).join(' › ');
});

function colorOf(kind: GraphNodeData['kind']): string {
  return COLORS[kind] ?? COLORS.more;
}

function canOpen(node: Node): boolean {
  return node.kind !== 'project' && node.kind !== 'more' && Boolean(node.meta?.warehouseId);
}

function isOpen(node: Node): boolean {
  return Boolean(node.open);
}

function toggleSelected() {
  if (selected.value) toggle(selected.value);
}

async function toggle(node: Node) {
  // "N more" stands in for siblings that were not drawn, so opening it
  // replaces it with them rather than nesting them a level deeper.
  if (node.kind === 'more') {
    node.loading = true;
    draw();
    try {
      const more = await props.loadChildren(node);
      const parent = findParent(tree.value as Node, node);
      const index = parent?.children?.indexOf(node) ?? -1;
      if (parent?.children && index >= 0) {
        parent.children.splice(index, 1, ...more.map((c) => ({ ...c, open: false })));
      }
    } catch (error: any) {
      node.failed = error?.error?.message || 'could not be loaded';
    } finally {
      node.loading = false;
      draw();
    }
    return;
  }

  if (node.expandable === false) return;

  if (node.open) {
    node.open = false;
    draw();
    return;
  }
  if (node.children) {
    node.open = true;
    draw();
    return;
  }

  node.loading = true;
  draw();
  try {
    const children = await props.loadChildren(node);
    node.children = children.map((c) => ({ ...c, open: false }));
    node.open = true;
    node.failed = undefined;
  } catch (error: any) {
    // On the node itself: a snackbar would leave the reader looking at a node
    // that simply refused to open, with the reason somewhere else.
    node.failed = error?.error?.message || 'could not be opened';
  } finally {
    node.loading = false;
    draw();
  }
}

const MARGIN = 24;
// Box geometry. Rows are pitched by the box, columns by the widest box in the
// column, so nothing can land on top of anything else whatever the names are.
const BOX_H = 30;
const ROW_GAP = 14;
const COL_GAP = 56;
const PAD_X = 10;
const EXPAND_W = 22;
const MIN_BOX_W = 90;
const MAX_BOX_W = 260;

// Text measurement is the only way to know how wide a name renders. Cached:
// the same label is re-measured on every redraw otherwise.
const textWidths = new Map<string, number>();
function measure(text: string, weight: number, el: SVGSVGElement): number {
  const key = `${weight}:${text}`;
  const hit = textWidths.get(key);
  if (hit !== undefined) return hit;
  const probe = d3
    .select(el)
    .append('text')
    .attr('class', 'label')
    .attr('font-weight', weight)
    .style('visibility', 'hidden')
    .text(text);
  const width = (probe.node() as SVGTextElement).getComputedTextLength();
  probe.remove();
  textWidths.set(key, width);
  return width;
}

function boxWidth(node: Node, el: SVGSVGElement): number {
  const label = node.note ? `${node.label}  ${node.note}` : node.label;
  const text = measure(label, node.key === selectedKey.value ? 600 : 400, el);
  const expand = node.expandable !== false ? EXPAND_W : 0;
  return Math.max(MIN_BOX_W, Math.min(MAX_BOX_W, text + PAD_X * 2 + expand));
}

function draw() {
  const host = container.value;
  const el = svg.value;
  if (!host || !el) return;

  const width = host.clientWidth;
  const height = props.height;
  if (width <= 0) return;

  const hierarchy = d3.hierarchy<Node>(tree.value as Node, (d) =>
    d.open && d.children ? d.children : null,
  );

  // Left to right, one column per level, with the vertical pitch fixed by the
  // box so two nodes can never share a row.
  const layout = d3.tree<Node>().nodeSize([BOX_H + ROW_GAP, 1]);
  const rootNode = layout(hierarchy);
  const nodes = rootNode.descendants();

  // Each node's own width, then each column's width from the widest box in it,
  // then the columns laid end to end. Fixed column pitch is what let a long
  // name run under the next column.
  const widths = new Map<string, number>();
  const columnWidth: number[] = [];
  for (const d of nodes) {
    const w = boxWidth(d.data, el);
    widths.set(d.data.key, w);
    columnWidth[d.depth] = Math.max(columnWidth[d.depth] ?? 0, w);
  }
  const columnX: number[] = [];
  let cursor = 0;
  for (let depth = 0; depth < columnWidth.length; depth += 1) {
    columnX[depth] = cursor;
    cursor += columnWidth[depth] + COL_GAP;
  }
  for (const d of nodes) d.y = columnX[d.depth];

  const minX = Math.min(...nodes.map((d) => d.x));

  const root = d3.select(el).attr('width', width).attr('height', height);
  let zoomLayer = root.select<SVGGElement>('g.zoom');
  if (zoomLayer.empty()) zoomLayer = root.append('g').attr('class', 'zoom');
  let g = zoomLayer.select<SVGGElement>('g.plot');
  if (g.empty()) g = zoomLayer.append('g').attr('class', 'plot');
  g.attr('transform', `translate(${MARGIN},${MARGIN - minX + BOX_H / 2})`);

  if (!zoomBehavior) {
    zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        d3.select(el).select('g.zoom').attr('transform', event.transform.toString());
        currentZoom.value = event.transform.k;
        if (event.sourceEvent) userZoomed.value = true;
      });
    root.call(zoomBehavior);
    root.on('dblclick.zoom', null);
  }

  const t = d3.transition().duration(250) as any;

  // Elbows from the right edge of the parent box to the left edge of the
  // child's: a straight run out, one step across, a straight run in.
  const elbow = (d: d3.HierarchyPointLink<Node>): string => {
    const x1 = d.source.y + (widths.get(d.source.data.key) ?? MIN_BOX_W);
    const y1 = d.source.x;
    const x2 = d.target.y;
    const y2 = d.target.x;
    const mid = x1 + (x2 - x1) / 2;
    return `M${x1},${y1} H${mid} V${y2} H${x2}`;
  };

  g.selectAll<SVGPathElement, d3.HierarchyPointLink<Node>>('path.link')
    .data(rootNode.links(), (d: any) => d.target.data.key)
    .join(
      (enter) => enter.append('path').attr('class', 'link').attr('d', elbow),
      (update) => update,
      (exit) => exit.remove(),
    )
    .transition(t)
    .attr('d', elbow);

  const nodeSel = g
    .selectAll<SVGGElement, d3.HierarchyPointNode<Node>>('g.node')
    .data(nodes, (d: any) => d.data.key)
    .join(
      (enter) => {
        const ng = enter.append('g').attr('class', 'node');

        // The box selects; the button on its right edge expands. Two targets,
        // because "show me this" and "show me what is under it" are two
        // different intentions and one click cannot mean both.
        const body = ng
          .append('g')
          .attr('class', 'node-body')
          .style('cursor', 'pointer')
          .on('click', (_e: MouseEvent, d) => {
            // "N more" is not a thing to inspect, it is the rest of the list:
            // the whole box acts as its own expand.
            if (d.data.kind === 'more') {
              toggle(d.data);
              return;
            }
            selectedKey.value = d.data.key;
          })
          .on('dblclick', (_e: MouseEvent, d) => {
            if (canOpen(d.data)) emit('open', d.data);
          });
        body.append('rect').attr('class', 'box').attr('rx', 6);
        body.append('rect').attr('class', 'accent');
        body.append('text').attr('class', 'label').attr('dy', '0.32em');

        const expand = ng
          .append('g')
          .attr('class', 'expand')
          .style('cursor', 'pointer')
          .on('click', (event: MouseEvent, d) => {
            event.stopPropagation();
            toggle(d.data);
          });
        expand.append('rect').attr('class', 'expand-hit').attr('rx', 4);
        expand.append('path').attr('class', 'chevron');
        return ng;
      },
      (update) => update,
      (exit) => exit.remove(),
    );

  nodeSel.transition(t).attr('transform', (d) => `translate(${d.y},${d.x})`);

  const w = (d: d3.HierarchyPointNode<Node>) => widths.get(d.data.key) ?? MIN_BOX_W;

  nodeSel
    .select('rect.box')
    .attr('x', 0)
    .attr('y', -BOX_H / 2)
    .attr('height', BOX_H)
    .attr('width', w)
    .attr('stroke', (d) =>
      d.data.key === selectedKey.value ? colorOf(d.data.kind) : 'rgba(128,128,128,0.35)',
    )
    .attr('stroke-width', (d) => (d.data.key === selectedKey.value ? 2 : 1))
    .attr('stroke-dasharray', (d) => (d.data.loading ? '3 3' : null));

  // A bar in the kind's colour, rather than a coloured box: the name has to
  // stay legible on it.
  nodeSel
    .select('rect.accent')
    .attr('x', 0)
    .attr('y', -BOX_H / 2)
    .attr('width', 4)
    .attr('height', BOX_H)
    .attr('fill', (d) => colorOf(d.data.kind));

  nodeSel
    .select('text.label')
    .attr('x', PAD_X)
    .attr('font-weight', (d) => (d.data.key === selectedKey.value ? 600 : 400))
    .text((d) => {
      const label = d.data.note ? `${d.data.label}  ${d.data.note}` : d.data.label;
      if (d.data.failed) return `${d.data.label} — ${d.data.failed}`;
      return label;
    })
    .each(function (d) {
      // Clip rather than overflow: the box is the boundary of this node.
      const available = w(d) - PAD_X - (d.data.expandable !== false ? EXPAND_W : PAD_X);
      const node = this as SVGTextElement;
      let text = node.textContent ?? '';
      while (text.length > 4 && node.getComputedTextLength() > available) {
        text = text.slice(0, -2);
        node.textContent = `${text}…`;
      }
    });

  nodeSel
    .select('g.expand')
    .attr('display', (d) => (d.data.expandable !== false && d.data.kind !== 'more' ? null : 'none'))
    .attr('transform', (d) => `translate(${w(d) - EXPAND_W},0)`);

  nodeSel
    .select('rect.expand-hit')
    .attr('x', 0)
    .attr('y', -BOX_H / 2 + 4)
    .attr('width', EXPAND_W - 4)
    .attr('height', BOX_H - 8);

  // Chevron: right when closed, down when open.
  nodeSel
    .select('path.chevron')
    .attr('d', (d) => (d.data.open ? 'M3,-2 L7,3 L11,-2' : 'M4,-4 L9,1 L4,6'));

  if (!userZoomed.value) fitToView();
}

function fitToView() {
  const host = container.value;
  const el = svg.value;
  if (!host || !el || !zoomBehavior) return;

  const layer = d3.select(el).select<SVGGElement>('g.zoom').node();
  const bbox = layer?.getBBox();
  if (!bbox || bbox.width === 0 || bbox.height === 0) return;

  const width = host.clientWidth;
  const height = props.height;
  const pad = 20;
  // Never magnify: a two-node graph at 3x is a diagram of nothing.
  const scale = Math.min((width - pad) / bbox.width, (height - pad) / bbox.height, 1);
  const tx = width / 2 - (bbox.x + bbox.width / 2) * scale;
  const ty = height / 2 - (bbox.y + bbox.height / 2) * scale;

  d3.select(el)
    .transition()
    .duration(250)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function zoomIn() {
  if (!svg.value || !zoomBehavior) return;
  d3.select(svg.value).transition().duration(200).call(zoomBehavior.scaleBy, 1.3);
}

function zoomOut() {
  if (!svg.value || !zoomBehavior) return;
  d3.select(svg.value).transition().duration(200).call(zoomBehavior.scaleBy, 0.75);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(draw);
  if (container.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(container.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => props.root.key,
  () => {
    tree.value = { ...props.root, open: false };
    selectedKey.value = null;
    userZoomed.value = false;
    nextTick(draw);
  },
);
</script>

<style scoped>
.graph {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.canvas {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  cursor: grab;
}

.canvas:active {
  cursor: grabbing;
}

.canvas-svg {
  display: block;
  color: rgb(var(--v-theme-on-surface));
}

.canvas-svg :deep(.link) {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.22);
  stroke-width: 1.2;
}

.canvas-svg :deep(.label) {
  font-size: 0.75rem;
  fill: currentColor;
  pointer-events: none;
}

.canvas-svg :deep(rect.box) {
  fill: rgb(var(--v-theme-surface));
}

.canvas-svg :deep(.node-body:hover rect.box) {
  fill: rgba(var(--v-theme-on-surface), 0.04);
}

.canvas-svg :deep(rect.expand-hit) {
  fill: transparent;
}

.canvas-svg :deep(.expand:hover rect.expand-hit) {
  fill: rgba(var(--v-theme-on-surface), 0.08);
}

.canvas-svg :deep(path.chevron) {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.6);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.zoom-bar {
  position: absolute;
  top: 8px;
  left: 8px;
}

.zoom-group {
  background: rgba(var(--v-theme-surface), 0.95);
  box-shadow: 0 1px 6px rgba(var(--v-theme-on-surface), 0.12);
}

.zoom-label {
  min-width: 52px !important;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.inspector {
  flex: 0 0 240px;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  display: inline-block;
}

.break {
  word-break: break-word;
}

@media (max-width: 760px) {
  .graph {
    flex-direction: column;
  }
  .inspector {
    flex: 0 0 auto;
    height: auto !important;
  }
}
</style>
