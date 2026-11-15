<template>
  <!-- One operator of a run's plan, then its inputs below it: rows out, rows
       read from storage, time with a bar for its share, and what DuckDB says
       it did (filters and columns pushed into a scan, files, groups). -->
  <div class="lpt" :class="{ 'lpt--child': depth > 0 }">
    <div
      class="lpt-row"
      :class="{ 'lpt-row--slowest': node.timeMs > 0 && node.timeMs === slowestMs }">
      <span class="lpt-name">{{ node.name }}</span>
      <span class="lpt-num" title="Rows passed on">{{ fmtRows(node.rows) }} rows</span>
      <span v-if="node.scanned" class="lpt-num text-medium-emphasis" title="Rows read from storage">
        · scanned {{ fmtRows(node.scanned) }}
      </span>
      <v-spacer />
      <span class="lpt-num text-medium-emphasis">{{ fmtMs(node.timeMs) }}</span>
    </div>
    <div class="lpt-bar" :aria-hidden="true">
      <div class="lpt-bar-fill" :style="{ width: `${share}%` }"></div>
    </div>
    <div v-for="[key, value] in infoLines" :key="key" class="lpt-info">
      <span class="lpt-key">{{ key }}</span>
      <details v-if="Array.isArray(value) && value.length > 3">
        <summary>{{ value.length }} {{ key === 'Filename(s)' ? 'files' : 'items' }}</summary>
        <div v-for="(v, i) in value" :key="i" class="lpt-list">{{ v }}</div>
      </details>
      <span v-else class="lpt-val">{{ Array.isArray(value) ? value.join(', ') : value }}</span>
    </div>
    <LoQEPlanTree
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :total-ms="totalMs"
      :slowest-ms="slowestMs"
      :depth="depth + 1" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LoQEPlanNode } from '../composables/loqe/runProfile';

defineOptions({ name: 'LoQEPlanTree' });

const props = withDefaults(
  defineProps<{
    node: LoQEPlanNode;
    /** The whole plan's operator time, for each operator's share. */
    totalMs: number;
    /** The slowest operator's time, to mark it. */
    slowestMs: number;
    depth?: number;
  }>(),
  { depth: 0 },
);

// Said by the numbers on the row already, or DuckDB's guess where the row has the real count.
const HIDDEN = new Set(['Estimated Cardinality', 'Function']);

const infoLines = computed(() =>
  Object.entries(props.node.info).filter(([k, v]) => !HIDDEN.has(k) && v !== '' && v.length !== 0),
);

const share = computed(() =>
  props.totalMs > 0 ? Math.max(1, Math.round((props.node.timeMs / props.totalMs) * 100)) : 0,
);

const fmtRows = (n: number) => n.toLocaleString();
function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
</script>

<style scoped>
.lpt--child {
  margin-left: 10px;
  padding-left: 10px;
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.15);
}
.lpt-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-top: 6px;
  font-size: 12px;
}
.lpt-name {
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.lpt-row--slowest .lpt-name {
  color: rgb(var(--v-theme-warning));
}
.lpt-num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lpt-bar {
  height: 3px;
  margin: 2px 0 2px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.lpt-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: rgba(var(--v-theme-primary), 0.6);
}
.lpt-row--slowest + .lpt-bar .lpt-bar-fill {
  background: rgb(var(--v-theme-warning));
}
.lpt-info {
  display: flex;
  gap: 6px;
  font-size: 11px;
  line-height: 1.5;
  min-width: 0;
}
.lpt-key {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.lpt-val,
.lpt-list {
  min-width: 0;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
details summary {
  cursor: pointer;
}
</style>
