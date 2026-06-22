<template>
  <v-card variant="outlined" class="mb-4" elevation="1">
    <v-card-title class="d-flex align-center flex-wrap text-subtitle-1 py-3" style="gap: 8px">
      <v-icon class="mr-2" color="primary">mdi-chart-box-outline</v-icon>
      Schema Profiler
      <v-chip size="x-small" variant="tonal">on demand</v-chip>
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
            <tr v-for="col in primitiveColumns" :key="col.name">
              <!-- Field -->
              <td class="col-field">
                <div class="d-flex align-center" style="gap: 8px">
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
                      <span class="text-medium-emphasis ml-1">{{ t.count.toLocaleString() }}</span>
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
          </tbody>
        </v-table>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref } from 'vue';
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
}
interface ColumnState {
  loading: boolean;
  error: string | null;
  data: ProfileData | null;
}
const results = reactive<Record<string, ColumnState>>({});
const analyzingAll = ref(false);

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
