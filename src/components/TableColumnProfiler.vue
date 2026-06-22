<template>
  <v-card variant="outlined" class="mb-4" elevation="1">
    <v-card-title class="d-flex align-center flex-wrap text-subtitle-1 py-3" style="gap: 8px">
      <v-icon class="mr-2" color="primary">mdi-file-tree</v-icon>
      Schema
      <v-chip size="x-small" variant="tonal">{{ primitiveColumns.length }} fields</v-chip>
      <v-spacer></v-spacer>
      <v-select
        v-model="rowLimit"
        :items="ROW_LIMIT_OPTIONS"
        label="Rows to scan"
        density="compact"
        variant="outlined"
        hide-details
        style="min-width: 160px; max-width: 190px"></v-select>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        prepend-icon="mdi-play"
        :loading="analyzingAll"
        :disabled="!canQuery"
        @click="analyzeAll">
        Analyze all
      </v-btn>
    </v-card-title>
    <v-divider></v-divider>

    <div class="pa-3">
      <v-alert v-if="!canQuery" type="info" variant="tonal" density="compact" class="mb-2">
        Profiling requires the catalog connection (warehouse, namespace, table, and catalog URL).
      </v-alert>
      <div v-else class="text-caption text-medium-emphasis mb-3">
        Reads the
        {{ rowLimit > 0 ? `first ${rowLimit.toLocaleString()} rows` : 'full table' }}; statistics
        reflect that subset.
      </div>

      <div class="profiler-scroll">
        <v-table density="comfortable" class="profiler-table">
          <thead>
            <tr>
              <th class="col-field">Field</th>
              <th class="text-right">Null&nbsp;%</th>
              <th class="text-right">Distinct</th>
              <th>Min</th>
              <th>Max</th>
              <th class="text-right">Mean</th>
              <th class="text-right">Std&nbsp;dev</th>
              <th class="text-right">p50</th>
              <th class="text-right">p95</th>
              <th class="text-right">p99</th>
              <th class="col-top">Top values</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="col in primitiveColumns" :key="col.name">
              <tr>
                <!-- Field -->
                <td class="col-field">
                  <div class="d-flex align-center" style="gap: 6px">
                    <v-btn
                      icon
                      size="x-small"
                      variant="tonal"
                      color="primary"
                      :loading="results[col.name]?.loading"
                      :disabled="!canQuery || analyzingAll"
                      @click="analyzeOne(col)">
                      <v-icon size="small">mdi-play</v-icon>
                      <v-tooltip activator="parent" location="top">Analyze this field</v-tooltip>
                    </v-btn>
                    <v-btn
                      v-if="results[col.name]?.data?.histogram"
                      icon
                      size="small"
                      variant="flat"
                      color="teal"
                      @click="openHistogram(col.name)">
                      <v-icon>mdi-chart-histogram</v-icon>
                      <v-tooltip activator="parent" location="top">Show distribution</v-tooltip>
                    </v-btn>
                    <div>
                      <div class="font-mono font-weight-medium">{{ col.name }}</div>
                      <span class="text-caption text-medium-emphasis">{{ col.type }}</span>
                    </div>
                  </div>
                </td>

                <!-- Stats (when analyzed) -->
                <template v-if="results[col.name]?.data">
                  <td class="text-right num">{{ results[col.name]!.data!.nullPct }}%</td>
                  <td class="text-right num">{{ results[col.name]!.data!.distinct }}</td>
                  <td class="num">{{ results[col.name]!.data!.min }}</td>
                  <td class="num">{{ results[col.name]!.data!.max }}</td>
                  <td class="text-right num">{{ results[col.name]!.data!.mean ?? '—' }}</td>
                  <td class="text-right num">{{ results[col.name]!.data!.std ?? '—' }}</td>
                  <td class="text-right num">{{ results[col.name]!.data!.p50 ?? '—' }}</td>
                  <td class="text-right num">{{ results[col.name]!.data!.p95 ?? '—' }}</td>
                  <td class="text-right num">{{ results[col.name]!.data!.p99 ?? '—' }}</td>
                  <td class="col-top">
                    <div
                      v-if="results[col.name]!.data!.topValues.length > 0"
                      class="d-flex flex-wrap"
                      style="gap: 4px">
                      <v-chip
                        v-for="(t, i) in results[col.name]!.data!.topValues"
                        :key="i"
                        size="x-small"
                        variant="tonal">
                        {{ t.value }}
                        <span class="text-medium-emphasis ml-1">
                          {{ t.count.toLocaleString() }}
                        </span>
                      </v-chip>
                    </div>
                    <span v-else class="text-disabled">—</span>
                  </td>
                </template>

                <!-- Loading / error / idle -->
                <td v-else colspan="10">
                  <span
                    v-if="results[col.name]?.loading"
                    class="d-inline-flex align-center text-caption text-medium-emphasis">
                    <v-progress-circular indeterminate size="14" width="2" class="mr-2" />
                    analyzing…
                  </span>
                  <span v-else-if="results[col.name]?.error" class="text-caption text-error">
                    {{ results[col.name]?.error }}
                  </span>
                  <span v-else class="text-caption text-disabled">Not analyzed</span>
                </td>
              </tr>
            </template>
          </tbody>
        </v-table>
      </div>
    </div>

    <!-- Value distribution popup (numeric columns) -->
    <v-dialog v-model="histDialogOpen" max-width="680">
      <v-card v-if="histData">
        <v-card-title class="d-flex align-center text-subtitle-1 py-3">
          <v-icon class="mr-2" color="primary">mdi-chart-histogram</v-icon>
          Value distribution —
          <span class="font-mono ml-1">{{ histColName }}</span>
          <v-spacer></v-spacer>
          <v-btn icon variant="text" size="small" @click="histDialogOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-2">
            {{ histData.bins.length }} bins · range {{ fmtNum(histData.min) }} –
            {{ fmtNum(histData.max) }}
          </div>
          <div ref="histChartRef" style="width: 100%; min-height: 240px"></div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import * as d3 from 'd3';
import { useFunctions } from '../plugins/functions';
import { useLoQE } from '../composables/useLoQE';
import { useUserStore } from '../stores/user';
import type { TableMetadata } from '../gen/iceberg/types.gen';

const props = defineProps<{
  metadata: TableMetadata;
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  catalogUrl?: string;
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
const userStore = useUserStore();

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
const analyzingAll = ref(false);

// Distribution popup state.
const histDialogOpen = ref(false);
const histColName = ref<string | null>(null);
const histData = computed(() =>
  histColName.value ? (results[histColName.value]?.data?.histogram ?? null) : null,
);
const histChartRef = ref<HTMLDivElement | null>(null);
function openHistogram(name: string) {
  histColName.value = name;
  histDialogOpen.value = true;
}

// Draw the distribution histogram (axes + bars) once the dialog is on screen.
function renderHistogram() {
  const el = histChartRef.value;
  const h = histData.value;
  if (!el || !h) return;
  d3.select(el).selectAll('*').remove();

  const width = el.clientWidth || 620;
  const height = 240;
  const margin = { top: 16, right: 18, bottom: 46, left: 56 };
  const cw = width - margin.left - margin.right;
  const ch = height - margin.top - margin.bottom;
  const binWidth = (h.max - h.min) / h.bins.length;

  const x = d3.scaleLinear().domain([h.min, h.max]).range([0, cw]);
  const y = d3.scaleLinear().domain([0, h.peak]).nice().range([ch, 0]);

  const svg = d3
    .select(el)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('font-family', "'Roboto Mono', monospace")
    .style('font-size', '10px')
    .style('color', 'inherit');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const bw = Math.max(1, x(h.min + binWidth) - x(h.min) - 2);
  g.selectAll('rect')
    .data(h.bins)
    .join('rect')
    .attr('x', (_d, i) => x(h.min + i * binWidth) + 1)
    .attr('width', bw)
    .attr('y', (d) => y(d))
    .attr('height', (d) => ch - y(d))
    .attr('rx', 1)
    .attr('fill', '#42a5f5')
    .append('title')
    .text(
      (d, i) =>
        `${fmtNum(h.min + i * binWidth)} – ${fmtNum(h.min + (i + 1) * binWidth)}: ${d.toLocaleString()} rows`,
    );

  g.append('g')
    .attr('transform', `translate(0,${ch})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(6)
        .tickFormat(d3.format('~s') as any),
    )
    .selectAll('text')
    .attr('fill', 'currentColor');
  g.append('g')
    .call(
      d3
        .axisLeft(y)
        .ticks(4)
        .tickFormat(d3.format('~s') as any),
    )
    .selectAll('text')
    .attr('fill', 'currentColor');
  g.selectAll('.domain, .tick line').attr('stroke', 'currentColor').attr('stroke-opacity', 0.2);

  svg
    .append('text')
    .attr('x', margin.left + cw / 2)
    .attr('y', height - 6)
    .attr('text-anchor', 'middle')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.7)
    .text('value');
  svg
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + ch / 2))
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.7)
    .text('rows');
}

watch([histDialogOpen, histColName], async ([open]) => {
  if (open && histData.value) {
    await nextTick();
    await nextTick();
    renderHistogram();
  }
});

const canQuery = computed(
  () => !!props.warehouseId && !!props.namespaceId && !!props.tableName && !!props.catalogUrl,
);

// Primitive (profile-able) columns from the current schema.
const primitiveColumns = computed(() => {
  const schemas = props.metadata?.schemas ?? [];
  const currentId = props.metadata?.['current-schema-id'];
  const schema = schemas.find((s) => s['schema-id'] === currentId) ?? schemas[0];
  return (schema?.fields ?? [])
    .filter((f) => typeof f.type === 'string')
    .map((f) => ({ name: f.name, type: f.type as string }));
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
            'avg(c) AS mean_v',
            'stddev_samp(c) AS stddev_v',
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

    // Histogram for numeric columns — width_bucket over [min, max] on the same scan.
    let histogram: Histogram | null = null;
    if (numeric) {
      const minN = Number(String(get('min_v') ?? '').replace(/"/g, ''));
      const maxN = Number(String(get('max_v') ?? '').replace(/"/g, ''));
      if (Number.isFinite(minN) && Number.isFinite(maxN) && maxN > minN) {
        const NB = 24;
        const binWidth = (maxN - minN) / NB;
        // width_bucket isn't in this DuckDB build — bin with floor() + clamp.
        const hRes = await loqe.query(
          `SELECT least(${NB - 1}, greatest(0, floor((c - ${minN}) / ${binWidth}))) AS b,
                  count(*) AS cnt
           FROM ${source} WHERE c IS NOT NULL GROUP BY b ORDER BY b`,
        );
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
      mean: numeric ? fmtNum(get('mean_v')) : null,
      std: numeric ? fmtNum(get('stddev_v')) : null,
      p50: numeric ? fmtNum(get('p50')) : null,
      p95: numeric ? fmtNum(get('p95')) : null,
      p99: numeric ? fmtNum(get('p99')) : null,
      topValues,
      histogram,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    state.error =
      msg.includes('CORS') || msg.includes('Failed to fetch')
        ? 'Cannot scan table data — CORS not configured for direct browser access to storage.'
        : msg;
  } finally {
    state.loading = false;
  }
}

async function analyzeOne(col: { name: string; type: string }) {
  if (!canQuery.value) return;
  try {
    const tablePath = await resolveTablePath();
    await profile(col, tablePath);
  } catch (err: any) {
    results[col.name] = { loading: false, error: err?.message || String(err), data: null };
  }
}

async function analyzeAll() {
  if (!canQuery.value || analyzingAll.value) return;
  analyzingAll.value = true;
  try {
    const tablePath = await resolveTablePath();
    for (const col of primitiveColumns.value) {
      await profile(col, tablePath);
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    for (const col of primitiveColumns.value) {
      results[col.name] = { loading: false, error: msg, data: null };
    }
  } finally {
    analyzingAll.value = false;
  }
}
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
}
.profiler-scroll {
  overflow-x: auto;
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
  min-width: 180px;
  white-space: normal;
}
.profiler-table :deep(.col-top) {
  white-space: normal;
  min-width: 220px;
}
</style>
