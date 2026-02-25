<template>
  <div class="pa-4">
    <div
      v-if="!table.metadata.refs || Object.keys(table.metadata.refs).length === 0"
      class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1">mdi-source-branch-remove</v-icon>
      <div class="text-h6 mt-2 text-grey-lighten-1">No branches found</div>
      <div class="text-body-1 text-grey-lighten-1">This table has no branch references</div>
    </div>

    <div v-else class="graph-wrapper">
      <!-- Full-width chart with overlays -->
      <div class="chart-outer">
        <!-- D3 renders the SVG here -->
        <div ref="chartRef" class="chart-container"></div>

        <!-- Floating zoom controls — top-left -->
        <div class="zoom-overlay">
          <v-btn-group variant="flat" density="compact" class="zoom-group">
            <v-btn size="x-small" icon="mdi-plus" @click="zoomIn"></v-btn>
            <v-btn size="x-small" class="zoom-label" @click="resetZoom">
              {{ Math.round(currentZoom * 100) }}%
            </v-btn>
            <v-btn size="x-small" icon="mdi-minus" @click="zoomOut"></v-btn>
            <v-btn size="x-small" icon="mdi-fit-to-screen" @click="fitToView"></v-btn>
          </v-btn-group>
        </div>

        <!-- Subtle inline legend — bottom-left -->
        <div class="legend-overlay">
          <span
            v-for="entry in legendEntries"
            :key="entry.name"
            class="legend-item"
            :style="{ opacity: entry.opacity }">
            <span class="legend-dot" :style="{ backgroundColor: entry.color }"></span>
            <span class="legend-text">{{ entry.name }}</span>
          </span>
          <span class="legend-item">
            <span class="legend-dot legend-dot--schema"></span>
            <span class="legend-text">schema change</span>
          </span>
        </div>

        <!-- Slide-in details panel — right edge -->
        <v-slide-x-reverse-transition>
          <div v-if="selectedSnapshot" class="details-drawer">
            <div class="details-drawer-inner">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-subtitle-1 font-weight-bold d-flex align-center">
                  <v-icon size="18" class="mr-1">mdi-camera-outline</v-icon>
                  Snapshot #{{ selectedSnapshot['sequence-number'] }}
                </span>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  @click="selectedSnapshot = null"></v-btn>
              </div>

              <!-- Core info -->
              <div class="detail-row">
                <span class="detail-label">ID</span>
                <span class="detail-value text-caption">{{ selectedSnapshot['snapshot-id'] }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Schema</span>
                <span class="detail-value">{{ selectedSnapshot['schema-id'] }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time</span>
                <span class="detail-value text-caption">
                  {{
                    selectedSnapshot['timestamp-ms']
                      ? new Date(selectedSnapshot['timestamp-ms']).toLocaleString()
                      : '—'
                  }}
                </span>
              </div>
              <div v-if="selectedSnapshot['parent-snapshot-id']" class="detail-row">
                <span class="detail-label">Parent</span>
                <span class="detail-value text-caption">
                  {{ selectedSnapshot['parent-snapshot-id'] }}
                </span>
              </div>
              <div v-if="selectedSnapshot.summary?.operation" class="detail-row">
                <span class="detail-label">Op</span>
                <v-chip
                  :color="getOperationColor(selectedSnapshot.summary.operation)"
                  size="x-small"
                  variant="flat">
                  {{ selectedSnapshot.summary.operation }}
                </v-chip>
              </div>
              <div v-if="selectedSnapshot['manifest-list']" class="detail-row">
                <span class="detail-label">Manifest</span>
                <span
                  class="detail-value text-caption text-truncate"
                  style="max-width: 200px"
                  :title="selectedSnapshot['manifest-list']">
                  {{ selectedSnapshot['manifest-list'] }}
                </span>
              </div>

              <!-- Collapsible: Operational Summary -->
              <v-expansion-panels
                v-if="selectedSnapshot.summary"
                variant="accordion"
                class="mt-3 details-panels">
                <v-expansion-panel>
                  <v-expansion-panel-title class="text-caption font-weight-bold pa-2">
                    Summary
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="summary-grid">
                      <div
                        v-for="[key, value] in Object.entries(selectedSnapshot.summary)"
                        :key="key"
                        class="summary-row">
                        <span class="summary-key">{{ formatSummaryKey(key) }}</span>
                        <span class="summary-val">{{ formatSummaryValue(value) }}</span>
                      </div>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>

              <!-- Collapsible: Schema Information -->
              <v-expansion-panels variant="accordion" class="mt-2 details-panels">
                <v-expansion-panel>
                  <v-expansion-panel-title class="text-caption font-weight-bold pa-2">
                    Schema
                    <v-chip
                      v-if="getSchemaChanges(selectedSnapshot)"
                      size="x-small"
                      color="warning"
                      variant="flat"
                      class="ml-2">
                      Changed
                    </v-chip>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div v-if="!getEffectiveSchemaInfo(selectedSnapshot)" class="text-center pa-2">
                      <div class="text-caption text-grey-lighten-1">
                        Schema not available (ID: {{ getEffectiveSchemaId(selectedSnapshot) }})
                      </div>
                    </div>
                    <div v-else style="max-height: 220px; overflow-y: auto">
                      <div class="text-caption mb-1" style="opacity: 0.7">
                        Schema ID {{ getEffectiveSchemaId(selectedSnapshot) }}
                      </div>
                      <v-list density="compact" class="pa-0">
                        <v-list-item
                          v-for="field in getEffectiveSchemaInfo(selectedSnapshot)?.fields || []"
                          :key="field.id"
                          class="pa-0 px-1"
                          style="min-height: 28px">
                          <template #prepend>
                            <v-icon
                              :color="isFieldNew(field, selectedSnapshot) ? 'success' : undefined"
                              size="x-small"
                              class="mr-1">
                              {{ getFieldIcon(field) }}
                            </v-icon>
                          </template>
                          <v-list-item-title
                            class="text-caption"
                            :class="
                              isFieldNew(field, selectedSnapshot)
                                ? 'text-success font-weight-bold'
                                : ''
                            ">
                            {{ field.name }}
                            <v-chip
                              v-if="isFieldNew(field, selectedSnapshot)"
                              size="x-small"
                              color="success"
                              variant="flat"
                              class="ml-1">
                              new
                            </v-chip>
                          </v-list-item-title>
                          <v-list-item-subtitle
                            class="text-caption"
                            style="font-size: 0.7rem !important">
                            {{ getFieldTypeString(field.type) }}
                            <span v-if="field.required" class="text-error">*</span>
                          </v-list-item-subtitle>
                        </v-list-item>
                      </v-list>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
          </div>
        </v-slide-x-reverse-transition>

        <!-- Click hint (no selection) -->
        <div v-if="!selectedSnapshot" class="hint-overlay">
          <v-icon size="16" class="mr-1">mdi-cursor-default-click</v-icon>
          <span class="text-caption">Click a node for details</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import * as d3 from 'd3';
import type { LoadTableResult, Snapshot } from '../gen/iceberg/types.gen';

// ─── Props ───────────────────────────────────────────────────────────────────
const props = defineProps<{
  table: LoadTableResult;
  snapshotHistory: Snapshot[];
}>();

// ─── State ───────────────────────────────────────────────────────────────────
const chartRef = ref<HTMLDivElement | null>(null);
const selectedSnapshot = ref<Snapshot | null>(null);
const currentZoom = ref(1);

// D3 selections — kept outside Vue reactivity
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let rootG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

// ─── Branch Colors ───────────────────────────────────────────────────────────
const BRANCH_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2', '#00796b', '#c2185b'];
const DROPPED_COLOR = '#9e9e9e';

// ─── Data Model ──────────────────────────────────────────────────────────────

interface BranchMeta {
  name: string;
  type: 'branch' | 'tag' | 'dropped';
  color: string;
  tipSnapshotId: number;
  ancestry: number[];
}

interface GraphNode {
  id: string;
  snapshotId: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  strokeColor: string;
  sequenceNumber: number;
  branchLabels: { name: string; color: string }[];
  schemaChange?: { from: number; to: number };
}

interface GraphLink {
  id: string;
  path: string;
  color: string;
  opacity: number;
}

// ─── Ancestry helper ─────────────────────────────────────────────────────────

function traceAncestry(tipId: number, snapshotMap: Map<number, Snapshot>): number[] {
  const chain: number[] = [];
  let id: number | undefined = tipId;
  const visited = new Set<number>();
  while (id != null && !visited.has(id)) {
    visited.add(id);
    const snap = snapshotMap.get(id);
    if (!snap) break;
    chain.push(id);
    id = snap['parent-snapshot-id'] ?? undefined;
  }
  return chain;
}

// ─── Computed: branches ──────────────────────────────────────────────────────

const branches = computed<BranchMeta[]>(() => {
  const result: BranchMeta[] = [];
  const refs = props.table.metadata.refs;
  if (!refs) return result;

  const sorted = [...props.snapshotHistory].sort(
    (a, b) => (a['sequence-number'] || 0) - (b['sequence-number'] || 0),
  );
  const snapshotMap = new Map<number, Snapshot>();
  sorted.forEach((s) => snapshotMap.set(s['snapshot-id'], s));

  let colorIdx = 0;
  Object.entries(refs).forEach(([name, refData]: [string, any]) => {
    if (refData.type !== 'branch') return;
    result.push({
      name,
      type: 'branch',
      color: BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length],
      tipSnapshotId: refData['snapshot-id'],
      ancestry: traceAncestry(refData['snapshot-id'], snapshotMap),
    });
  });

  // Dropped branches
  const reachable = new Set<number>();
  result.forEach((b) => b.ancestry.forEach((id) => reachable.add(id)));

  const unreachable = sorted.filter((s) => !reachable.has(s['snapshot-id']));
  if (unreachable.length > 0) {
    const childrenMap = new Map<number, number[]>();
    sorted.forEach((s) => {
      const pid = s['parent-snapshot-id'];
      if (pid != null) {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(s['snapshot-id']);
      }
    });
    const unreachableIds = new Set(unreachable.map((s) => s['snapshot-id']));
    const tips = unreachable.filter((s) => {
      const children = childrenMap.get(s['snapshot-id']) || [];
      return !children.some((c) => unreachableIds.has(c));
    });
    tips.forEach((tip) => {
      const ancestry = traceAncestry(tip['snapshot-id'], snapshotMap);
      const droppedAncestry = ancestry.filter((id) => unreachableIds.has(id));
      if (droppedAncestry.length === 0) return;
      result.push({
        name: `dropped-seq-${tip['sequence-number']}`,
        type: 'dropped',
        color: DROPPED_COLOR,
        tipSnapshotId: tip['snapshot-id'],
        ancestry: droppedAncestry,
      });
    });
  }

  return result;
});

// ─── Computed: nodes ─────────────────────────────────────────────────────────

const graphNodes = computed<GraphNode[]>(() => {
  if (!props.snapshotHistory.length || branches.value.length === 0) return [];

  const sorted = [...props.snapshotHistory].sort(
    (a, b) => (a['sequence-number'] || 0) - (b['sequence-number'] || 0),
  );

  const mainBranch = branches.value.find((b) => b.name === 'main' || b.name === 'master');
  const namedBranches = branches.value.filter((b) => b.type === 'branch' && b !== mainBranch);
  const droppedBranches = branches.value.filter((b) => b.type === 'dropped');

  const snapshotRow = new Map<number, number>();
  if (mainBranch) mainBranch.ancestry.forEach((id) => snapshotRow.set(id, 0));
  namedBranches.forEach((branch, idx) => {
    branch.ancestry.forEach((id) => {
      if (!snapshotRow.has(id)) snapshotRow.set(id, -(idx + 1));
    });
  });
  droppedBranches.forEach((branch, idx) => {
    branch.ancestry.forEach((id) => {
      if (!snapshotRow.has(id)) snapshotRow.set(id, idx + 1);
    });
  });

  // Horizontal layout: x = time (left→right), y = branch row
  const spacingX = 90;
  const spacingY = 100;
  const allRows = Array.from(snapshotRow.values());
  const minRow = Math.min(...allRows, 0);
  const originY = Math.abs(minRow) * spacingY + 80;

  const tipMap = new Map<number, BranchMeta[]>();
  branches.value.forEach((b) => {
    if (!tipMap.has(b.tipSnapshotId)) tipMap.set(b.tipSnapshotId, []);
    tipMap.get(b.tipSnapshotId)!.push(b);
  });

  return sorted.map((snapshot, index) => {
    const sid = snapshot['snapshot-id'];
    const row = snapshotRow.get(sid) ?? 0;
    const x = 60 + index * spacingX;
    const y = originY + row * spacingY;
    const sc = getSchemaChangeInfo(snapshot);
    const ownerBranch = branches.value.find((b) => b.ancestry.includes(sid));
    const isDropped = ownerBranch?.type === 'dropped';
    const branchColor = ownerBranch?.color || '#666';
    const tipBranches = tipMap.get(sid) || [];

    return {
      id: `node-${sid}`,
      snapshotId: sid,
      x,
      y,
      radius: sc ? 14 : 11,
      color: sc ? '#ff9800' : branchColor,
      strokeColor: sc ? '#f57c00' : isDropped ? '#757575' : branchColor,
      sequenceNumber: snapshot['sequence-number'] || 0,
      branchLabels: tipBranches.map((b) => ({ name: b.name, color: b.color })),
      schemaChange: sc || undefined,
    };
  });
});

// ─── Computed: links ─────────────────────────────────────────────────────────

const graphLinks = computed<GraphLink[]>(() => {
  if (graphNodes.value.length === 0) return [];

  const nodeMap = new Map<number, GraphNode>();
  graphNodes.value.forEach((n) => nodeMap.set(n.snapshotId, n));

  const linkGen = d3
    .linkHorizontal<{ source: [number, number]; target: [number, number] }, [number, number]>()
    .source((d) => d.source)
    .target((d) => d.target);

  const links: GraphLink[] = [];
  const seen = new Set<string>();

  function addLink(
    parentNode: GraphNode,
    childNode: GraphNode,
    color: string,
    opacity: number,
    keyPrefix = '',
  ) {
    const key = `${keyPrefix}${parentNode.snapshotId}-${childNode.snapshotId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const sameRow = Math.abs(childNode.y - parentNode.y) < 5;
    let path: string;
    if (sameRow) {
      path = `M ${parentNode.x + parentNode.radius} ${parentNode.y} L ${childNode.x - childNode.radius} ${childNode.y}`;
    } else {
      path =
        linkGen({
          source: [parentNode.x + parentNode.radius, parentNode.y],
          target: [childNode.x - childNode.radius, childNode.y],
        }) || '';
    }
    links.push({ id: key, path, color, opacity });
  }

  branches.value.forEach((branch) => {
    const opacity = branch.type === 'dropped' ? 0.5 : 0.8;

    // Chain edges
    for (let i = 0; i < branch.ancestry.length - 1; i++) {
      const child = nodeMap.get(branch.ancestry[i]);
      const parent = nodeMap.get(branch.ancestry[i + 1]);
      if (child && parent) addLink(parent, child, branch.color, opacity);
    }

    // Divergence from main
    if (branch.type === 'branch' && branch.name !== 'main' && branch.name !== 'master') {
      const mainBranch = branches.value.find((b) => b.name === 'main' || b.name === 'master');
      if (mainBranch) {
        const mainSet = new Set(mainBranch.ancestry);
        for (let i = 0; i < branch.ancestry.length; i++) {
          if (mainSet.has(branch.ancestry[i]) && i > 0) {
            const from = nodeMap.get(branch.ancestry[i]);
            const to = nodeMap.get(branch.ancestry[i - 1]);
            if (from && to) addLink(from, to, branch.color, 0.8, 'diverge-');
            break;
          }
        }
      }
    }

    // Dropped branch divergence
    if (branch.type === 'dropped' && branch.ancestry.length > 0) {
      const lastId = branch.ancestry[branch.ancestry.length - 1];
      const lastSnap = props.snapshotHistory.find((s) => s['snapshot-id'] === lastId);
      if (lastSnap?.['parent-snapshot-id']) {
        const from = nodeMap.get(lastSnap['parent-snapshot-id']);
        const to = nodeMap.get(lastId);
        if (from && to) addLink(from, to, DROPPED_COLOR, 0.5, 'drop-');
      }
    }
  });

  return links;
});

// ─── Legend (Vue-rendered) ───────────────────────────────────────────────────

const legendEntries = computed(() => {
  const entries: { name: string; color: string; type: string; opacity: number }[] = [];
  let droppedCount = 0;

  branches.value.forEach((b) => {
    if (b.type === 'dropped') {
      droppedCount++;
    } else {
      entries.push({ name: b.name, color: b.color, type: b.type, opacity: 1 });
    }
  });
  if (droppedCount > 0) {
    entries.push({
      name: `dropped branches (${droppedCount})`,
      color: DROPPED_COLOR,
      type: 'dropped',
      opacity: 0.7,
    });
  }
  return entries;
});

// ─── D3 Rendering ────────────────────────────────────────────────────────────

function renderChart() {
  if (!chartRef.value) return;

  const container = chartRef.value;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;

  // Tear down previous SVG
  d3.select(container).selectAll('svg').remove();

  // Create fresh SVG
  svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block');

  // Filter definition
  const defs = svg.append('defs');
  const filter = defs
    .append('filter')
    .attr('id', 'nodeShadow')
    .attr('x', '-20%')
    .attr('y', '-20%')
    .attr('width', '140%')
    .attr('height', '140%');
  filter
    .append('feDropShadow')
    .attr('dx', 1)
    .attr('dy', 1)
    .attr('stdDeviation', 2)
    .attr('flood-opacity', 0.25);

  // Root group for zoom/pan
  rootG = svg.append('g');

  // ── Zoom behavior ──
  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 5])
    .on('zoom', (event) => {
      rootG!.attr('transform', event.transform.toString());
      currentZoom.value = event.transform.k;
    });

  svg.call(zoomBehavior);
  svg.on('dblclick.zoom', null); // disable double-click zoom

  // ── Draw links ──
  const linksG = rootG.append('g').attr('class', 'links');
  linksG
    .selectAll('path')
    .data(graphLinks.value)
    .join('path')
    .attr('d', (d) => d.path)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 3)
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('opacity', (d) => d.opacity);

  // ── Draw nodes ──
  const nodesG = rootG.append('g').attr('class', 'nodes');
  const nodeGroups = nodesG
    .selectAll('g')
    .data(graphNodes.value)
    .join('g')
    .style('cursor', 'pointer')
    .on('click', (_event, d) => {
      const snap = props.snapshotHistory.find((s) => s['snapshot-id'] === d.snapshotId);
      if (snap) selectedSnapshot.value = snap;
    });

  // Circle
  nodeGroups
    .append('circle')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => d.color)
    .attr('stroke', (d) => d.strokeColor)
    .attr('stroke-width', 2.5)
    .attr('filter', 'url(#nodeShadow)');

  // Sequence number
  nodeGroups
    .append('text')
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y - 2)
    .attr('font-size', 10)
    .attr('font-weight', 'bold')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', 'none')
    .text((d) => d.sequenceNumber);

  // Schema change label inside node
  nodeGroups
    .filter((d) => !!d.schemaChange)
    .append('text')
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y + 8)
    .attr('font-size', 8)
    .attr('font-weight', 'bold')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', 'none')
    .style('opacity', 0.9)
    .text((d) => `S${d.schemaChange!.from}\u2192${d.schemaChange!.to}`);

  // Schema change badge circle
  nodeGroups
    .filter((d) => !!d.schemaChange)
    .append('circle')
    .attr('cx', (d) => d.x + d.radius - 2)
    .attr('cy', (d) => d.y - d.radius + 2)
    .attr('r', 6)
    .attr('fill', '#ff5722')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .style('pointer-events', 'none');

  // Schema change badge text
  nodeGroups
    .filter((d) => !!d.schemaChange)
    .append('text')
    .attr('x', (d) => d.x + d.radius - 2)
    .attr('y', (d) => d.y - d.radius + 5)
    .attr('font-size', 8)
    .attr('font-weight', 'bold')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', 'none')
    .text('S');

  // Branch labels on tip nodes — above the node for horizontal layout
  nodeGroups.each(function (d) {
    d.branchLabels.forEach((label, idx) => {
      d3.select(this)
        .append('text')
        .attr('x', d.x)
        .attr('y', d.y - d.radius - 8 - idx * 14)
        .attr('font-size', 11)
        .attr('font-weight', '600')
        .attr('fill', label.color)
        .attr('text-anchor', 'middle')
        .style('pointer-events', 'none')
        .text(label.name);
    });
  });

  // Tooltip
  nodeGroups
    .append('title')
    .text(
      (d) =>
        `Seq ${d.sequenceNumber} | ID ${d.snapshotId}${d.schemaChange ? ` | Schema ${d.schemaChange.from}\u2192${d.schemaChange.to}` : ''}`,
    );

  // Auto fit
  setTimeout(fitToView, 50);
}

// ─── Zoom controls ───────────────────────────────────────────────────────────

function zoomIn() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
}

function zoomOut() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
}

function resetZoom() {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
}

function fitToView() {
  if (!svg || !zoomBehavior || !chartRef.value || graphNodes.value.length === 0) return;

  const containerW = chartRef.value.clientWidth || 800;
  const containerH = chartRef.value.clientHeight || 500;
  const pad = 50;

  const xs = graphNodes.value.map((n) => n.x);
  const ys = graphNodes.value.map((n) => n.y);
  const minX = Math.min(...xs) - 30;
  const maxX = Math.max(...xs) + 30;
  const minY = Math.min(...ys) - 40;
  const maxY = Math.max(...ys) + 40;

  const gW = maxX - minX;
  const gH = maxY - minY;
  const scale = Math.min((containerW - pad * 2) / gW, (containerH - pad * 2) / gH, 2);
  const tx = containerW / 2 - ((minX + maxX) / 2) * scale;
  const ty = containerH / 2 - ((minY + maxY) / 2) * scale;

  svg
    .transition()
    .duration(500)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

// ─── Schema helpers ──────────────────────────────────────────────────────────

function getSchemaChangeInfo(snapshot: Snapshot): { from: number; to: number } | null {
  if (!snapshot['parent-snapshot-id']) return null;
  const parent = props.snapshotHistory.find(
    (s) => s['snapshot-id'] === snapshot['parent-snapshot-id'],
  );
  if (!parent || snapshot['schema-id'] === parent['schema-id']) return null;
  return { from: parent['schema-id'] ?? 0, to: snapshot['schema-id'] ?? 0 };
}

function getSchemaInfo(schemaId: number | undefined) {
  if (schemaId == null || !props.table.metadata.schemas?.length) return null;
  return props.table.metadata.schemas.find((s: any) => s['schema-id'] === schemaId);
}

function getEffectiveSchemaId(snapshot: Snapshot): number | undefined {
  return snapshot['schema-id'] ?? props.table.metadata['current-schema-id'];
}

function getEffectiveSchemaInfo(snapshot: Snapshot) {
  return getSchemaInfo(getEffectiveSchemaId(snapshot));
}

function getSchemaChanges(snapshot: Snapshot): boolean {
  return getSchemaChangeInfo(snapshot) !== null;
}

function isFieldNew(field: any, snapshot: Snapshot): boolean {
  const idx = props.snapshotHistory.findIndex((s) => s['snapshot-id'] === snapshot['snapshot-id']);
  if (idx === props.snapshotHistory.length - 1) return false;
  const nextVersion = props.snapshotHistory[idx + 1];
  const nextSchema = getSchemaInfo(nextVersion['schema-id']);
  if (!nextSchema) return true;
  return !nextSchema.fields.some((f: any) => f.id === field.id);
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function getFieldIcon(field: any): string {
  const type = field.type;
  if (typeof type === 'string') {
    switch (type.toLowerCase()) {
      case 'string':
        return 'mdi-format-text';
      case 'int':
      case 'integer':
      case 'long':
      case 'double':
      case 'float':
        return 'mdi-numeric';
      case 'boolean':
        return 'mdi-checkbox-outline';
      case 'date':
        return 'mdi-calendar';
      case 'timestamp':
        return 'mdi-clock-outline';
      default:
        return 'mdi-file-outline';
    }
  }
  if (typeof type === 'object') {
    if (type.type === 'list') return 'mdi-format-list-bulleted';
    if (type.type === 'map') return 'mdi-code-braces';
    if (type.type === 'struct') return 'mdi-code-braces-box';
  }
  return 'mdi-file-outline';
}

function getFieldTypeString(type: any): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'object') {
    if (type.type === 'list') return `list<${getFieldTypeString(type.element)}>`;
    if (type.type === 'map')
      return `map<${getFieldTypeString(type.key)}, ${getFieldTypeString(type.value)}>`;
    if (type.type === 'struct') return 'struct';
    return type.type || 'unknown';
  }
  return 'unknown';
}

function formatSummaryKey(key: string): string {
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatSummaryValue(value: any): string {
  if (value == null) return 'N/A';
  if (typeof value === 'number') return value >= 1000 ? value.toLocaleString() : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/))
      return new Date(value).toLocaleString();
    return value;
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function getOperationColor(operation: string): string {
  const map: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };
  return map[operation?.toLowerCase()] || 'default';
}

// ─── Lifecycle: D3 owns the SVG ─────────────────────────────────────────────

// Render when the container div appears and when data changes
watch(
  [chartRef, () => props.snapshotHistory.length],
  () => {
    if (chartRef.value && props.snapshotHistory.length > 0) {
      renderChart();
    }
  },
  { immediate: true },
);

// Update selected node highlight when selection changes
watch(selectedSnapshot, (snap) => {
  if (!rootG) return;
  rootG
    .selectAll<SVGCircleElement, GraphNode>('.nodes circle')
    .attr('stroke-width', (d) => (snap && snap['snapshot-id'] === d.snapshotId ? 4 : 2.5));
});

onBeforeUnmount(() => {
  if (chartRef.value) {
    d3.select(chartRef.value).selectAll('svg').remove();
  }
});
</script>

<style scoped>
.graph-wrapper {
  width: 100%;
}

.chart-outer {
  position: relative;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  overflow: hidden;
}

.chart-container {
  height: 500px;
  touch-action: none;
  user-select: none;
}

/* Floating zoom controls */
.zoom-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
}

.zoom-group {
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.zoom-label {
  min-width: 48px !important;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

/* Subtle legend */
.legend-overlay {
  position: absolute;
  bottom: 8px;
  left: 10px;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 4px 10px;
  background: rgba(var(--v-theme-surface), 0.7);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  font-size: 0.72rem;
  pointer-events: none;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0.85;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot--schema {
  background: #ff9800;
  border: 1.5px solid #f57c00;
}

.legend-text {
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

/* Hint overlay */
.hint-overlay {
  position: absolute;
  bottom: 8px;
  right: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 4px 10px;
  background: rgba(var(--v-theme-surface), 0.7);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  opacity: 0.6;
  pointer-events: none;
}

/* Slide-in details drawer */
.details-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 40%;
  z-index: 3;
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(8px);
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow-y: auto;
}

.details-drawer-inner {
  padding: 14px 16px;
}

.detail-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.06);
}

.detail-label {
  flex-shrink: 0;
  width: 56px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.detail-value {
  flex: 1;
  min-width: 0;
}

.details-panels :deep(.v-expansion-panel) {
  background: transparent !important;
}

.details-panels :deep(.v-expansion-panel-title) {
  min-height: 32px !important;
  padding: 4px 8px !important;
}

.details-panels :deep(.v-expansion-panel-text__wrapper) {
  padding: 4px 8px 8px !important;
}

.summary-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-row {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  font-size: 0.75rem;
}

.summary-key {
  flex-shrink: 0;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.summary-val {
  color: rgba(var(--v-theme-on-surface), 0.85);
}
</style>
