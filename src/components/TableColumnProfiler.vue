<template>
  <section class="tdx-section mb-4">
    <!-- A toolbar, not a heading: the tab is already called Schema. What is
         left is where the numbers came from and what acts on the table. -->
    <div class="tdx-head flex-wrap" style="gap: 8px">
      <span class="tdx-head__count">{{ schemaTree.length }} fields</span>
      <span v-if="manifest.loading.value" class="tdx-head__count d-inline-flex align-center">
        <v-progress-circular indeterminate size="12" width="2" class="mr-2" />
        reading manifests…
      </span>
      <span v-else-if="manifestStats" class="tdx-head__count">
        · {{ fmtCount(manifestStats.recordCount) }} rows in
        {{ fmtCount(manifestStats.dataFileCount) }} files
        <v-tooltip activator="parent" location="bottom" max-width="420">
          Counts come from the table's manifests — every file of the current snapshot, not a sample.
          Distinct values and distributions are not recorded there; those come from Analyze, which
          reads data.
        </v-tooltip>
      </span>

      <v-chip
        v-if="metricsCoverage"
        size="x-small"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-information-outline">
        metrics on {{ fmtCount(metricsCoverage.covered) }} of
        {{ fmtCount(metricsCoverage.total) }} leaf fields
        <v-tooltip activator="parent" location="bottom" max-width="440">
          The {{ fmtCount(schemaTree.length) }} top-level fields expand to
          {{ fmtCount(metricsCoverage.total) }} leaves once structs, lists and maps are opened, and
          metrics are recorded per leaf. {{ noMetricsHint }}
        </v-tooltip>
      </v-chip>

      <v-spacer></v-spacer>

      <v-select
        v-if="canQuery"
        v-model="rowLimit"
        :items="ROW_LIMIT_OPTIONS"
        label="Analyze reads"
        density="compact"
        variant="outlined"
        hide-details
        no-data-text="No row limits available"
        style="min-width: 150px; max-width: 180px"></v-select>
      <v-btn
        v-if="hasResults"
        variant="text"
        size="small"
        prepend-icon="mdi-delete-outline"
        @click="dropResults">
        Drop samples
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        prepend-icon="mdi-code-json"
        @click="schemaJsonOpen = true">
        View JSON
      </v-btn>
    </div>

    <div class="profiler-body">
      <!-- One line, and it does not stretch: this sits in a flex column, so an
           alert without a flex basis grows to fill the whole pane. -->
      <div v-if="manifest.error.value" class="manifest-note" :title="manifest.error.value">
        <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
        Column counts unavailable — {{ shortError(manifest.error.value) }}
      </div>

      <div v-if="columnTags.readError" class="manifest-note">
        <v-icon size="14" class="mr-1">mdi-eye-off-outline</v-icon>
        {{ columnTags.readError }}
      </div>
      <div v-if="columnTags.orphanTagCount" class="manifest-note">
        <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
        {{ columnTags.orphanTagCount }} tag{{ columnTags.orphanTagCount === 1 ? '' : 's' }}
        belong to columns no longer in the current schema and are not shown.
      </div>

      <div class="profiler-scroll">
        <v-table
          density="comfortable"
          class="profiler-table"
          fixed-header
          height="100%"
          style="height: 100%">
          <thead>
            <tr>
              <th class="col-field">Field</th>
              <th class="col-type">Type</th>
              <th class="col-tags">Tags</th>
              <th class="text-right col-num">Values</th>
              <th class="text-right col-num">Nulls</th>
              <th class="text-right col-num">Size</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in visibleRows" :key="row.key">
              <tr :class="{ 'nested-row': row.depth > 0 }">
                <!-- Field -->
                <td class="col-field">
                  <div class="d-flex tree-row" style="align-items: stretch; min-height: 42px">
                    <!-- Indent guide lines (one vertical line per ancestor level,
                           centered under that ancestor's expand arrow) -->
                    <span
                      v-for="d in row.depth"
                      :key="d"
                      style="position: relative; flex: 0 0 32px; align-self: stretch">
                      <!-- Vertical line, centered in the 32px block (under the parent chevron) -->
                      <span
                        style="
                          position: absolute;
                          top: 0;
                          bottom: 0;
                          left: 16px;
                          border-left: 1px solid rgba(var(--v-theme-on-surface), 0.3);
                        "></span>
                      <!-- Elbow: horizontal connector into this node -->
                      <span
                        v-if="d === row.depth"
                        style="
                          position: absolute;
                          top: 50%;
                          left: 16px;
                          width: 32px;
                          border-top: 1px solid rgba(var(--v-theme-on-surface), 0.3);
                        "></span>
                    </span>

                    <div class="d-flex align-center flex-grow-1" style="min-width: 0">
                      <!-- Fixed-width gutter so toggles, analyze buttons and leaf
                             rows all align at the same x (independent of scoped CSS) -->
                      <span
                        style="
                          flex: 0 0 28px;
                          display: inline-flex;
                          align-items: center;
                          justify-content: center;
                        ">
                        <!-- Expand toggle for nested (struct/list/map) nodes -->
                        <v-btn
                          v-if="row.expandable"
                          :icon="expanded.has(row.key) ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                          size="x-small"
                          variant="text"
                          @click="toggleExpand(row.key)"></v-btn>
                        <!-- Analyze, on top-level primitive columns and only
                             where its results have somewhere to land. A greyed
                             button on every row of the Tags view is a control
                             the reader has to work out the irrelevance of. -->
                        <v-btn
                          v-else-if="row.profilable && canQuery"
                          icon="mdi-play"
                          size="x-small"
                          variant="text"
                          color="primary"
                          :loading="results[row.name]?.loading"
                          :disabled="!canQuery"
                          @click="analyzeOne(row)">
                          <v-icon></v-icon>
                          <v-tooltip activator="parent" location="top">
                            Analyze this field
                          </v-tooltip>
                        </v-btn>
                      </span>

                      <div class="flex-grow-1 ml-2" style="min-width: 0">
                        <div class="font-mono font-weight-medium">{{ row.name }}</div>
                        <div v-if="row.doc" class="field-doc text-caption text-medium-emphasis">
                          {{ row.doc }}
                        </div>
                      </div>
                      <v-btn
                        v-if="row.profilable && hasChart(row.name)"
                        icon="mdi-chart-bar"
                        size="small"
                        variant="text"
                        color="secondary"
                        @click="openChart(row.name)">
                        <v-icon></v-icon>
                        <v-tooltip activator="parent" location="top">Show chart</v-tooltip>
                      </v-btn>
                    </div>
                  </div>
                </td>

                <!-- Type (own column) -->
                <td class="col-type font-mono">{{ row.type }}</td>

                <!-- Column tags, edited on the row they describe. Struct fields
                     carry their own (address.zip); nothing inside a list or a
                     map can, so those rows only ever show a dash. -->
                <td class="col-tags">
                  <div class="tag-cell">
                    <!-- The add control leads the cell, always on screen: the row
                         is where a column is tagged, without a mode to enter. -->
                    <TagAddMenu
                      v-if="canTag && row.taggable"
                      compact
                      :definitions="columnTags.columnDefinitions"
                      :assigned-names="columnTags.tagsFor(row.key).map((t) => t.name)"
                      :busy="columnTags.busy"
                      :can-apply="columnTags.canApply"
                      :error="columnTags.cellErrors[row.key]"
                      :definitions-error="columnTags.definitionsError"
                      :target="row.key"
                      :check-rights="columnTags.ensureRights"
                      @apply="(name, value) => columnTags.apply([row.key], name, value)" />
                    <TagChip
                      v-for="tag in cellTags(row)"
                      :key="tag['tag-definition-id']"
                      :tag="tag"
                      :definition="columnTags.definitionByName.get(tag.name)"
                      :removable="
                        canTag &&
                        row.taggable &&
                        columnTags.canRemove(tag['tag-definition-id']) === true
                      "
                      :editable="
                        canTag &&
                        row.taggable &&
                        columnTags.canApply(tag['tag-definition-id']) === true
                      "
                      :busy="columnTags.busy === tag.name"
                      :target="row.key"
                      :max-value="24"
                      @apply="(name, value) => columnTags.apply([row.key], name, value)"
                      @remove="(name) => columnTags.remove(row.key, name)" />
                    <v-chip
                      v-if="hiddenTagCount(row)"
                      size="small"
                      variant="text"
                      class="text-medium-emphasis"
                      @click="toggleTagCell(row.key)">
                      +{{ hiddenTagCount(row) }}
                    </v-chip>
                    <v-chip
                      v-else-if="expandedTagCells.has(row.key)"
                      size="small"
                      variant="text"
                      class="text-medium-emphasis"
                      @click="toggleTagCell(row.key)">
                      less
                    </v-chip>
                    <span
                      v-if="!(canTag && row.taggable) && !columnTags.tagsFor(row.key).length"
                      class="text-disabled">
                      —
                    </span>
                  </div>
                  <!-- A refused change on this row, said on this row. -->
                  <div v-if="columnTags.cellErrors[row.key]" class="tag-cell-error text-caption">
                    {{ columnTags.cellErrors[row.key] }}
                    <v-btn
                      size="x-small"
                      variant="text"
                      @click="columnTags.cellErrors[row.key] = ''">
                      Dismiss
                    </v-btn>
                  </div>
                </td>

                <!-- Facts from the manifests: exact, whole-table, and present
                     for nested leaves too, because they are keyed by field id
                     rather than by a column reference a query could name. -->
                <td class="text-right num col-num">
                  <span v-if="statsFor(row)?.valueCount != null">
                    {{ fmtCount(statsFor(row)!.valueCount!) }}
                    <v-tooltip v-if="row.repeated" activator="parent" location="top">
                      Elements across all rows — this field sits inside a list or a map.
                    </v-tooltip>
                  </span>
                  <span v-else class="text-disabled" :title="noMetricsHint">—</span>
                </td>
                <td class="text-right num col-num">
                  <template v-if="statsFor(row)?.nullCount != null">
                    {{ fmtCount(statsFor(row)!.nullCount!) }}
                    <span v-if="nullPct(row) !== null" class="text-medium-emphasis">
                      ({{ nullPct(row) }}%)
                    </span>
                  </template>
                  <span v-else class="text-disabled" :title="noMetricsHint">—</span>
                </td>
                <td class="text-right num col-num">
                  <span v-if="statsFor(row)?.sizeBytes != null">
                    {{ fmtBytes(statsFor(row)!.sizeBytes!) }}
                  </span>
                  <span v-else class="text-disabled" :title="noMetricsHint">—</span>
                </td>
              </tr>
            </template>
          </tbody>
        </v-table>
      </div>
    </div>

    <!-- Distribution popup: histogram (numeric) or top-values bar (categorical) -->
    <v-dialog v-model="histDialogOpen" max-width="640" scrollable>
      <v-card v-if="chartData">
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">
            {{ chartData.histogram ? 'mdi-chart-histogram' : 'mdi-chart-bar' }}
          </v-icon>
          Sample —
          <span class="font-mono ml-1">{{ histColName }}</span>
          <v-spacer></v-spacer>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="histDialogOpen = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <!-- Everything in this dialog came from reading data, and only as
               much of it as the row limit allowed. Said here, once, next to
               the numbers — the toolbar was too far away to be read as a
               qualifier on a percentile. -->
          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            Sampled from the
            {{ rowLimit > 0 ? `first ${rowLimit.toLocaleString()} rows` : 'full table' }}. Counts,
            nulls and sizes in the table behind this dialog are exact — these are not.
          </v-alert>

          <v-table density="compact" class="mb-3">
            <tbody>
              <tr>
                <td class="text-medium-emphasis">Distinct (approx.)</td>
                <td class="num text-right">{{ chartData.distinct }}</td>
                <td class="text-medium-emphasis">Null</td>
                <td class="num text-right">{{ chartData.nullPct }}%</td>
              </tr>
              <tr>
                <td class="text-medium-emphasis">Min</td>
                <td class="num text-right">{{ chartData.min }}</td>
                <td class="text-medium-emphasis">Max</td>
                <td class="num text-right">{{ chartData.max }}</td>
              </tr>
              <tr v-if="chartData.mean !== null && chartData.mean !== undefined">
                <td class="text-medium-emphasis">Mean</td>
                <td class="num text-right">{{ chartData.mean }}</td>
                <td class="text-medium-emphasis">Std dev</td>
                <td class="num text-right">{{ chartData.std ?? '—' }}</td>
              </tr>
              <tr v-if="chartData.p50 !== null && chartData.p50 !== undefined">
                <td class="text-medium-emphasis">p50</td>
                <td class="num text-right">{{ chartData.p50 }}</td>
                <td class="text-medium-emphasis">p95 · p99</td>
                <td class="num text-right">
                  {{ chartData.p95 ?? '—' }} · {{ chartData.p99 ?? '—' }}
                </td>
              </tr>
            </tbody>
          </v-table>

          <div class="text-caption text-medium-emphasis mb-2">
            <template v-if="chartData.histogram">
              {{ chartData.histogram.bins.length }} bins · range
              {{ fmtNum(chartData.histogram.min) }} – {{ fmtNum(chartData.histogram.max) }}
            </template>
            <template v-else>Top {{ chartData.topValues.length }} values by row count</template>
          </div>
          <div ref="histChartRef" style="width: 100%; min-height: 260px"></div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Raw schema JSON -->
    <v-dialog v-model="schemaJsonOpen" max-width="1000" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-code-json</v-icon>
          Schema JSON
          <v-chip v-if="currentSchema" size="x-small" variant="tonal" class="ml-2">
            schema-id {{ currentSchema['schema-id'] ?? 0 }}
          </v-chip>
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-content-copy"
            @click="copySchemaJson">
            Copy
          </v-btn>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="schemaJsonOpen = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text style="max-height: 70vh">
          <vue-json-pretty
            v-if="currentSchema"
            :data="currentSchema"
            :deep="4"
            :theme="visual.themeLight ? 'light' : 'dark'"
            :show-line-number="true"
            :virtual="false" />
          <div v-else class="text-medium-emphasis pa-3">No schema available</div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import {
  histogramBoundary,
  numericHistogramQuery,
  numericProfileScale,
  numericSummaryQuery,
} from '@/composables/numericProfile';
import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import * as d3 from 'd3';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useFunctions } from '../plugins/functions';
import { loqeVendingReason } from '../common/vendedCredentials';
import {
  useTableManifestStats,
  type ManifestColumnStats,
} from '../composables/useTableManifestStats';
import { useLoQE } from '../composables/useLoQE';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';
import { useLoQEStore } from '../stores/loqe';
import type { StructField, TableMetadata } from '../gen/iceberg/types.gen';
import { useTablePermissions } from '../composables/useCatalogPermissions';
import { useColumnTags } from '../composables/useColumnTags';
import TagChip from './TagChip.vue';
import TagAddMenu from './TagAddMenu.vue';

const props = defineProps<{
  metadata: TableMetadata;
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  catalogUrl?: string;
  tableId?: string;
}>();

const ROW_LIMIT_OPTIONS = [
  { title: '100 rows', value: 100 },
  { title: '1,000 rows', value: 1000 },
  { title: '10,000 rows', value: 10000 },
  { title: '50,000 rows', value: 50000 },
  { title: '100,000 rows', value: 100000 },
  { title: 'Full table', value: 0 },
];
const rowLimit = ref(100);

const functions = useFunctions();
const config = inject<any>('appConfig', { enabledAuthentication: false });
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });

// Counts, nulls and sizes come from the table's own manifests: exact, whole
// table, every leaf of the schema, and a few kilobytes of Avro to read.
const manifest = useTableManifestStats(loqe);
const manifestStats = computed(() => manifest.stats.value);

function statsFor(row: SchemaNode): ManifestColumnStats | null {
  if (row.fieldId === undefined) return null;
  return manifestStats.value?.columns.get(row.fieldId) ?? null;
}

/**
 * Against the values present for this field, not against the table's record
 * count: inside a list or a map the two are different numbers.
 */
function nullPct(row: SchemaNode): string | null {
  const st = statsFor(row);
  if (!st || st.nullCount === null || !st.valueCount) return null;
  const pct = (st.nullCount / st.valueCount) * 100;
  if (pct === 0) return '0';
  return pct < 0.1 ? '<0.1' : pct.toFixed(1);
}

/** The engine's errors carry a SQL listing; the first sentence is the reason. */
function shortError(message: string): string {
  const first = message.split(/ LINE \d|\n/)[0].trim();
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/**
 * A dash is "the writer recorded nothing for this field", not "zero". Iceberg
 * collects column metrics for the first 100 columns of a table by default, so
 * on a wide schema the numbers legitimately stop partway down the list.
 */
const noMetricsHint = computed(() => {
  const configured = (props.metadata as any)?.properties?.[
    'write.metadata.metrics.max-inferred-column-defaults'
  ];
  const limit = configured ?? 100;
  return (
    "Not recorded in this table's manifests. Iceberg collects column metrics for the " +
    `first ${limit} columns by default; the rest are governed by the ` +
    'write.metadata.metrics.* table properties.'
  );
});

/**
 * How much of the schema the manifests actually describe. Shown only when the
 * answer is "not all of it": otherwise it is a line saying nothing is wrong.
 */
const metricsCoverage = computed(() => {
  if (!manifestStats.value) return null;
  const leaves: SchemaNode[] = [];
  const walk = (nodes: SchemaNode[]) => {
    for (const n of nodes) {
      if (n.children.length) walk(n.children);
      else leaves.push(n);
    }
  };
  walk(schemaTree.value);
  const covered = leaves.filter((n) => statsFor(n) !== null).length;
  if (!covered || covered >= leaves.length) return null;
  return { covered, total: leaves.length };
});

function fmtCount(n: number): string {
  return Number(n).toLocaleString();
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

// No catalog attach and no data scan: the manifests are fetched with the
// table's vended credentials and handed to DuckDB as bytes.
async function loadManifestStats() {
  if (!props.warehouseId || !props.namespaceId || !props.tableName) return;
  await manifest.load({
    warehouseId: props.warehouseId,
    namespaceId: props.namespaceId,
    tableName: props.tableName,
  });
}
const userStore = useUserStore();
const visual = useVisualStore();

// Raw schema JSON popup.
const schemaJsonOpen = ref(false);
const currentSchema = computed(() => {
  const schemas = props.metadata?.schemas ?? [];
  const currentId = props.metadata?.['current-schema-id'];
  return schemas.find((s) => s['schema-id'] === currentId) ?? schemas[0] ?? null;
});
function copySchemaJson() {
  if (currentSchema.value) functions.copyToClipboard(JSON.stringify(currentSchema.value, null, 2));
}

interface Histogram {
  bins: number[];
  min: number;
  max: number;
  peak: number;
}
interface ProfileData {
  nullPct: string;
  distinct: string;
  min: string;
  max: string;
  mean: string | null;
  std: string | null;
  p50: string | null;
  p95: string | null;
  p99: string | null;
  topValues: { value: string; count: number }[];
  histogram: Histogram | null;
}
interface ColumnState {
  loading: boolean;
  error: string | null;
  data: ProfileData | null;
}
const results = reactive<Record<string, ColumnState>>({});

// Persisted per-table profile cache (survives reloads).
const loqeStore = useLoQEStore();
const tableKey = computed(() => `${props.warehouseId}/${props.namespaceId}/${props.tableName}`);
const hasResults = computed(() => Object.values(results).some((r) => r?.data));

// Hydrate cached results for this table on mount / when the table changes.
function hydrateFromStore() {
  for (const k of Object.keys(results)) delete results[k];
  const cached = loqeStore.getTableProfiles(tableKey.value) as Record<string, ProfileData>;
  for (const [col, data] of Object.entries(cached)) {
    results[col] = { loading: false, error: null, data };
  }
}
hydrateFromStore();
watch(tableKey, hydrateFromStore);

function dropResults() {
  loqeStore.clearTableProfiles(tableKey.value);
  for (const k of Object.keys(results)) delete results[k];
  histDialogOpen.value = false;
}

// Distribution popup state.
const histDialogOpen = ref(false);
const histColName = ref<string | null>(null);
const chartData = computed(() =>
  histColName.value ? (results[histColName.value]?.data ?? null) : null,
);
const histChartRef = ref<HTMLDivElement | null>(null);

// A field can show a chart once analyzed: numeric → histogram, else → top values.
function hasChart(name: string): boolean {
  const d = results[name]?.data;
  return !!d && (!!d.histogram || d.topValues.length > 0);
}
function openChart(name: string) {
  histColName.value = name;
  histDialogOpen.value = true;
}

const colorAxis = (sel: any) =>
  sel
    .call((s: any) =>
      s.selectAll('.domain, .tick line').attr('stroke', 'currentColor').attr('stroke-opacity', 0.2),
    )
    .selectAll('text')
    .attr('fill', 'currentColor');

function newSvgGroup(el: HTMLElement, height: number, margin: any) {
  const width = el.clientWidth || 620;
  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('font-family', "'Roboto Mono', monospace")
    .style('font-size', '10px')
    .style('color', 'inherit');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  return { g, cw: width - margin.left - margin.right, ch: height - margin.top - margin.bottom };
}

// Numeric value-distribution histogram.
function renderHistogram(el: HTMLElement, h: NonNullable<ProfileData['histogram']>) {
  const { g, cw, ch } = newSvgGroup(el, 260, { top: 16, right: 18, bottom: 40, left: 56 });
  const boundary = (i: number) => histogramBoundary(h.min, h.max, i, h.bins.length);
  const x = d3.scaleLinear().domain([0, h.bins.length]).range([0, cw]);
  const y = d3.scaleLinear().domain([0, h.peak]).nice().range([ch, 0]);
  const bw = Math.max(1, x(1) - x(0) - 2);

  g.selectAll('rect')
    .data(h.bins)
    .join('rect')
    .attr('x', (_d, i) => x(i) + 1)
    .attr('width', bw)
    .attr('y', (d) => y(d))
    .attr('height', (d) => ch - y(d))
    .attr('rx', 1)
    .style('fill', 'rgb(var(--v-theme-secondary))')
    .append('title')
    .text(
      (d, i) => `${fmtNum(boundary(i))} – ${fmtNum(boundary(i + 1))}: ${d.toLocaleString()} rows`,
    );

  g.append('g')
    .attr('transform', `translate(0,${ch})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(6)
        .tickFormat((i) => d3.format('~s')(boundary(Number(i)))),
    )
    .call(colorAxis);
  g.append('g')
    .call(
      d3
        .axisLeft(y)
        .ticks(4)
        .tickFormat(d3.format('~s') as any),
    )
    .call(colorAxis);
}

// Categorical top-values bar chart (same counts as the chips).
function renderBars(el: HTMLElement, items: { value: string; count: number }[]) {
  const { g, cw, ch } = newSvgGroup(el, 260, { top: 16, right: 18, bottom: 70, left: 56 });
  const x = d3
    .scaleBand<string>()
    .domain(items.map((d) => d.value))
    .range([0, cw])
    .padding(0.3);
  const peak = Math.max(...items.map((d) => d.count), 1);
  const y = d3.scaleLinear().domain([0, peak]).nice().range([ch, 0]);

  g.selectAll('rect')
    .data(items)
    .join('rect')
    .attr('x', (d) => x(d.value) ?? 0)
    .attr('width', x.bandwidth())
    .attr('y', (d) => y(d.count))
    .attr('height', (d) => ch - y(d.count))
    .attr('rx', 2)
    .style('fill', 'rgb(var(--v-theme-secondary))')
    .append('title')
    .text((d) => `${d.value}: ${d.count.toLocaleString()} rows`);

  g.append('g')
    .attr('transform', `translate(0,${ch})`)
    .call(
      d3
        .axisBottom(x)
        .tickSize(0)
        .tickFormat((d: any) => (String(d).length > 14 ? String(d).slice(0, 13) + '…' : d)),
    )
    .call(colorAxis)
    .selectAll('text')
    .attr('transform', 'rotate(-25)')
    .attr('text-anchor', 'end');
  g.append('g')
    .call(
      d3
        .axisLeft(y)
        .ticks(4)
        .tickFormat(d3.format('~s') as any),
    )
    .call(colorAxis);
}

function renderChart() {
  const el = histChartRef.value;
  const d = chartData.value;
  if (!el || !d) return;
  d3.select(el).selectAll('*').remove();
  if (d.histogram) renderHistogram(el, d.histogram);
  else if (d.topValues.length) renderBars(el, d.topValues);
}

watch([histDialogOpen, histColName], async ([open]) => {
  if (open && chartData.value) {
    await nextTick();
    await nextTick();
    renderChart();
  }
});

const canQuery = computed(
  () => !!props.warehouseId && !!props.namespaceId && !!props.tableName && !!props.catalogUrl,
);

// Compact type label for a single tree node (does not expand struct fields —
// those become child rows). e.g. `array<struct>`, `map<string, array<struct>>`.
function shortType(t: any): string {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (t.type === 'struct') return 'struct';
  if (t.type === 'list') return `array<${shortType(t.element)}>`;
  if (t.type === 'map') return `map<${shortType(t.key)}, ${shortType(t.value)}>`;
  return t.type || 'complex';
}

interface SchemaNode {
  key: string;
  name: string;
  doc?: string;
  type: string;
  depth: number;
  children: SchemaNode[];
  expandable: boolean;
  profilable: boolean;
  /**
   * Iceberg's id for this leaf. Manifest statistics are keyed by it, which is
   * what lets a field inside a struct carry the same facts as a top-level
   * column — the name never appears in a manifest.
   */
  fieldId?: number;
  /** Inside a list or a map: counts are per element, not per row. */
  repeated?: boolean;
  /**
   * Whether tags can be written to it: the API addresses columns by dotted
   * path, which reaches top-level columns and struct fields under them, but
   * nothing inside a list or a map.
   */
  taggable: boolean;
}

// Child rows for a nested type. Struct → its fields; a list of structs flattens
// its element's fields directly; a list of list/map gets a single `element` row;
// map → `key` and `value` rows.
function childrenOf(t: any, parentKey: string, depth: number, repeated = false): SchemaNode[] {
  if (!t || typeof t !== 'object') return [];
  if (t.type === 'struct') {
    return (t.fields ?? []).map((f: StructField) =>
      makeNode(f.name, f.type, f.doc, parentKey, depth, (f as any).id, repeated, !repeated),
    );
  }
  if (t.type === 'list') {
    const el = t.element;
    if (el && typeof el === 'object') {
      // Everything under a list is counted per element from here down.
      if (el.type === 'struct') return childrenOf(el, parentKey, depth, true);
      return [makeNode('element', el, undefined, parentKey, depth, t['element-id'], true)];
    }
    if (el) return [makeNode('element', el, undefined, parentKey, depth, t['element-id'], true)];
    return [];
  }
  if (t.type === 'map') {
    return [
      makeNode('key', t.key, undefined, parentKey, depth, t['key-id'], true),
      makeNode('value', t.value, undefined, parentKey, depth, t['value-id'], true),
    ];
  }
  return [];
}

function makeNode(
  name: string,
  type: any,
  doc: string | undefined,
  parentKey: string,
  parentDepth: number,
  fieldId?: number,
  repeated?: boolean,
  taggable = false,
): SchemaNode {
  const depth = parentDepth + 1;
  const key = `${parentKey}.${name}`;
  const children = childrenOf(type, key, depth, repeated);
  return {
    key,
    name,
    doc,
    type: shortType(type),
    depth,
    children,
    expandable: children.length > 0,
    // Only top-level primitives can be profiled with column-reference aggregates.
    profilable: false,
    fieldId,
    repeated,
    taggable,
  };
}

// Top-level schema columns as tree nodes (from the same resolved schema as the JSON view).
const schemaTree = computed<SchemaNode[]>(() => {
  return (currentSchema.value?.fields ?? []).map((f) => {
    const children = childrenOf(f.type, f.name, 0);
    return {
      key: f.name,
      name: f.name,
      doc: f.doc,
      type: shortType(f.type),
      depth: 0,
      children,
      expandable: children.length > 0,
      profilable: typeof f.type === 'string',
      fieldId: f.id,
      taggable: true,
    };
  });
});

// Expand/collapse state for complex nodes.
const expanded = reactive(new Set<string>());
function toggleExpand(key: string) {
  if (expanded.has(key)) expanded.delete(key);
  else expanded.add(key);
}

// Every node, expanded or not: what column tags are matched against, and what
// the tagged/untagged filter searches.
const allNodes = computed<SchemaNode[]>(() => {
  const out: SchemaNode[] = [];
  const walk = (nodes: SchemaNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(schemaTree.value);
  return out;
});

// Flatten the tree to the rows currently visible (respecting expansion).
const visibleRows = computed<SchemaNode[]>(() => {
  const out: SchemaNode[] = [];
  const walk = (nodes: SchemaNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.expandable && expanded.has(n.key)) walk(n.children);
    }
  };
  walk(schemaTree.value);
  return out;
});

const isNumeric = (type: string) => /^(int|long|float|double|decimal)/i.test(type);

const namespaceDisplay = computed(() => {
  const ns = props.namespaceId;
  if (!ns) return '';
  return ns.includes('\x1F') ? ns.split('\x1F').join('.') : ns;
});

function fmtNum(v: any): string {
  if (v === null || v === undefined) return '—';
  const n = Number(String(v).replace(/"/g, ''));
  if (Number.isNaN(n)) return String(v);
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

// Resolve + attach the catalog once, returning the qualified table path.
async function resolveTablePath(): Promise<string> {
  await loqe.initialize();
  const wh = await functions.getWarehouse(props.warehouseId!);
  // Profiling reads the data files in the browser, so a warehouse that vends no
  // credentials cannot be profiled at all. Refused here with the reason: past
  // this point the failure is an opaque DuckDB download error that reads as CORS.
  const vendingReason = loqeVendingReason(wh['storage-profile'] as Record<string, any>);
  if (vendingReason) throw new Error(vendingReason);
  const warehouseName = wh.name;
  if (!loqe.attachedCatalogs.value.some((c) => c.catalogName === warehouseName)) {
    await loqe.attachCatalog({
      catalogName: warehouseName,
      restUri: props.catalogUrl!,
      accessToken: userStore.user.access_token,
      projectId: wh['project-id'],
    });
  }
  return `"${warehouseName}"."${namespaceDisplay.value}"."${props.tableName}"`;
}

async function profile(col: { name: string; type: string }, tablePath: string) {
  if (!results[col.name]) results[col.name] = { loading: false, error: null, data: null };
  const state = results[col.name];
  state.loading = true;
  state.error = null;
  try {
    // LIMIT (not USING SAMPLE): a sample scans the whole table, LIMIT stops early.
    const limitClause = rowLimit.value > 0 ? ` LIMIT ${rowLimit.value}` : '';
    const source = `(SELECT "${col.name}" AS c FROM ${tablePath}${limitClause})`;
    const numeric = isNumeric(col.type);

    const aggCols = [
      'count(*) AS total',
      'count(c) AS non_null',
      'approx_count_distinct(c) AS ndv',
      'min(c) AS min_v',
      'max(c) AS max_v',
      ...(numeric
        ? [
            'approx_quantile(c, 0.5) AS p50',
            'approx_quantile(c, 0.95) AS p95',
            'approx_quantile(c, 0.99) AS p99',
          ]
        : []),
    ].join(', ');

    const res = await loqe.query(`SELECT ${aggCols} FROM ${source}`);
    const idx = (n: string) => res.columns.indexOf(n);
    const row = (res.rows[0] ?? []) as any[];
    const get = (n: string) => row[idx(n)];

    const total = Number(String(get('total') ?? 0).replace(/"/g, ''));
    const nonNull = Number(String(get('non_null') ?? 0).replace(/"/g, ''));
    const nullPct = total > 0 ? (((total - nonNull) / total) * 100).toFixed(1) : '0.0';
    const minN = Number(String(get('min_v') ?? '').replace(/"/g, ''));
    const maxN = Number(String(get('max_v') ?? '').replace(/"/g, ''));
    let mean: unknown = null;
    let std: unknown = null;
    if (numeric && nonNull > 0 && Number.isFinite(minN) && Number.isFinite(maxN)) {
      const summary = await loqe.query(
        numericSummaryQuery(source, numericProfileScale(minN, maxN)),
      );
      mean = summary.rows[0]?.[summary.columns.indexOf('mean_v')];
      std = summary.rows[0]?.[summary.columns.indexOf('stddev_v')];
    }

    let topValues: { value: string; count: number }[] = [];
    if (!numeric) {
      const topRes = await loqe.query(
        `SELECT c AS val, count(*) AS cnt FROM ${source} WHERE c IS NOT NULL GROUP BY c ORDER BY cnt DESC LIMIT 5`,
      );
      const vIdx = topRes.columns.indexOf('val');
      const cIdx = topRes.columns.indexOf('cnt');
      topValues = (topRes.rows as any[][]).map((r) => ({
        value: String(r[vIdx]),
        count: Number(String(r[cIdx] ?? 0).replace(/"/g, '')),
      }));
    }

    // Histogram for numeric columns, normalized before subtraction to avoid overflow.
    let histogram: Histogram | null = null;
    if (numeric) {
      if (Number.isFinite(minN) && Number.isFinite(maxN) && maxN > minN) {
        const NB = 24;
        // Bin with floor() + clamp; width_bucket isn't in this DuckDB build.
        const hRes = await loqe.query(numericHistogramQuery(source, minN, maxN, NB));
        const bIdx = hRes.columns.indexOf('b');
        const cIdx = hRes.columns.indexOf('cnt');
        const bins = new Array(NB).fill(0);
        for (const r of hRes.rows as any[][]) {
          let b = Number(String(r[bIdx] ?? 0).replace(/"/g, ''));
          const cnt = Number(String(r[cIdx] ?? 0).replace(/"/g, ''));
          if (!Number.isFinite(b) || b < 0) b = 0;
          if (b > NB - 1) b = NB - 1;
          bins[b] += cnt;
        }
        histogram = { bins, min: minN, max: maxN, peak: Math.max(...bins, 1) };
      }
    }

    state.data = {
      nullPct,
      distinct: fmtNum(get('ndv')),
      min: fmtNum(get('min_v')),
      max: fmtNum(get('max_v')),
      mean: numeric ? fmtNum(mean) : null,
      std: numeric ? fmtNum(std) : null,
      p50: numeric ? fmtNum(get('p50')) : null,
      p95: numeric ? fmtNum(get('p95')) : null,
      p99: numeric ? fmtNum(get('p99')) : null,
      topValues,
      histogram,
    };
    // Persist so results survive a reload.
    loqeStore.setTableProfile(tableKey.value, col.name, state.data);
  } catch (err: any) {
    // Kept as the engine diagnosed it: the old test for the word "CORS" matched
    // the diagnosis itself and traded a specific answer — a 403 from the
    // catalog, an unreachable endpoint — for a sentence about bucket config.
    state.error = err?.message || String(err);
  } finally {
    state.loading = false;
  }
}

async function analyzeOne(col: { name: string; type: string }) {
  if (!canQuery.value) return;
  try {
    const tablePath = await resolveTablePath();
    await profile(col, tablePath);
    if (results[col.name]?.data) openChart(col.name);
  } catch (err: any) {
    results[col.name] = { loading: false, error: err?.message || String(err), data: null };
  }
}

// --- Column tags: edited on the row they describe. Single changes are inline
// on every row; bulk work (tick several, tag them at once, filter by tagged)
// is a mode, so the profiler's own columns are not crowded out the rest of the time.
const tableIdRef = computed(() => props.tableId ?? '');
const warehouseIdRef = computed(() => props.warehouseId ?? '');
const { canManageTags } = useTablePermissions(tableIdRef, warehouseIdRef);
const canTag = computed(() => !!props.tableId && !!props.warehouseId && canManageTags.value);

// Reactive so the template reads its refs unwrapped (columnTags.busy, not .value).
const columnTags = reactive(
  useColumnTags({
    warehouseId: warehouseIdRef,
    tableId: tableIdRef,
    fields: computed(() => allNodes.value.map((n) => ({ path: n.key, fieldId: n.fieldId }))),
    canManage: canTag,
  }),
);

// Chips per cell before the rest fold into "+N", so every row keeps one height.
const CHIPS_PER_CELL = 3;
const expandedTagCells = reactive(new Set<string>());
function cellTags(row: SchemaNode) {
  const all = columnTags.tagsFor(row.key);
  return expandedTagCells.has(row.key) ? all : all.slice(0, CHIPS_PER_CELL);
}
function hiddenTagCount(row: SchemaNode): number {
  if (expandedTagCells.has(row.key)) return 0;
  return Math.max(0, columnTags.tagsFor(row.key).length - CHIPS_PER_CELL);
}
function toggleTagCell(key: string) {
  if (expandedTagCells.has(key)) expandedTagCells.delete(key);
  else expandedTagCells.add(key);
}

// Re-read when the table changes or commits: the manifest list belongs to the
// current snapshot, so a new snapshot is new numbers.
watch(
  () => [props.warehouseId, props.tableName, props.metadata?.['current-snapshot-id']],
  () => loadManifestStats(),
  { immediate: true },
);
</script>

<style scoped>
/* Kept in step with the same block in TableDetails.vue — the two sections sit
   on the same page and have to read as one. */
.tdx-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-height: 48px;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
/* The heading's own words are uppercase; the controls sharing its line are not
   headings and keep their own casing. */
.tdx-head :deep(.v-btn),
.tdx-head :deep(.v-chip),
.tdx-head :deep(.v-label),
.tdx-head :deep(.v-field) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
.tdx-head__count {
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  color: rgba(var(--v-theme-on-surface), 0.85);
}
.tdx-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
}
/* The fields table is what the tab is for, so it takes the height the tab has.
   The table is the scroller, not this box: that is what keeps the column
   headers in place while 250 fields go past under them. */
.profiler-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.profiler-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.manifest-note {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 4px 0 8px;
}
.profiler-table {
  white-space: nowrap;
}
.profiler-table :deep(th) {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.profiler-table :deep(td.num) {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.8rem;
}
.profiler-table :deep(.col-field) {
  min-width: 220px;
  white-space: normal;
}
.field-doc {
  overflow-wrap: anywhere;
  white-space: normal;
}
.profiler-table :deep(.nested-row) td {
  border-bottom: none;
}
.profiler-table :deep(.col-tags) {
  white-space: normal;
  min-width: 260px;
}
.tag-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
/* The per-row plus is always there, quiet until its row is under the pointer,
   so 250 of them read as a column of affordances rather than of noise. */
.tag-cell :deep(.tag-add--compact) {
  opacity: 0.55;
  transition: opacity 0.1s ease;
}
.profiler-table :deep(tr:hover) .tag-cell :deep(.tag-add--compact),
.tag-cell :deep(.tag-add--compact:focus-visible),
.tag-cell :deep(.tag-add--compact[aria-expanded='true']) {
  opacity: 1;
}
.tag-cell-error {
  color: rgb(var(--v-theme-error));
}
/* The fact columns take what they need and no more: three numbers should not
   push the tags column off a laptop screen. */
.profiler-table :deep(.col-num) {
  white-space: nowrap;
  width: 1%;
  min-width: 108px;
  vertical-align: middle;
}
.profiler-table :deep(.col-type) {
  white-space: nowrap;
  min-width: 120px;
  vertical-align: middle;
  font-size: 0.85rem;
}
</style>
