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
        style="min-width: 170px; max-width: 200px"></v-select>
    </v-card-title>
    <v-divider></v-divider>

    <div class="pa-3">
      <div class="text-caption text-medium-emphasis mb-2">
        Profiling scans table data. Pick how many rows to read, expand a field, and run Analyze.
        Sampled results are approximate.
      </div>

      <v-alert v-if="!canQuery" type="info" variant="tonal" density="compact" class="mb-2">
        Profiling requires the catalog connection (warehouse, namespace, table, and catalog URL).
      </v-alert>

      <v-expansion-panels variant="accordion" multiple>
        <v-expansion-panel v-for="col in primitiveColumns" :key="col.name">
          <v-expansion-panel-title>
            <span class="font-mono text-body-2">{{ col.name }}</span>
            <v-chip size="x-small" variant="tonal" class="ml-2">{{ col.type }}</v-chip>
            <v-chip
              v-if="results[col.name]?.data"
              size="x-small"
              color="success"
              variant="tonal"
              class="ml-2">
              analyzed
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="d-flex align-center mb-3" style="gap: 12px">
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                prepend-icon="mdi-play"
                :loading="results[col.name]?.loading"
                :disabled="!canQuery"
                @click="profile(col)">
                {{ results[col.name]?.data ? 'Re-analyze' : 'Analyze' }}
              </v-btn>
              <span class="text-caption text-medium-emphasis">
                {{ rowLimit > 0 ? `Sampling ${rowLimit.toLocaleString()} rows` : 'Full scan' }}
              </span>
            </div>

            <v-alert v-if="results[col.name]?.error" type="error" variant="tonal" density="compact">
              {{ results[col.name]?.error }}
            </v-alert>

            <div v-if="results[col.name]?.data">
              <v-chip
                v-if="results[col.name]!.data!.sampled"
                size="x-small"
                variant="tonal"
                class="mb-2">
                approx · sampled
              </v-chip>
              <div class="d-flex flex-wrap" style="gap: 8px">
                <div
                  v-for="m in results[col.name]!.data!.metrics"
                  :key="m.label"
                  class="profiler-metric">
                  <div class="text-caption text-medium-emphasis">{{ m.label }}</div>
                  <div class="text-body-2 font-weight-medium">{{ m.value }}</div>
                </div>
              </div>

              <template v-if="results[col.name]!.data!.topValues.length > 0">
                <div class="text-overline text-medium-emphasis mt-4">Top values</div>
                <v-table density="compact" class="mt-1">
                  <thead>
                    <tr>
                      <th>Value</th>
                      <th class="text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(tv, i) in results[col.name]!.data!.topValues" :key="i">
                      <td class="text-caption">{{ tv.value }}</td>
                      <td class="text-right text-caption">{{ tv.count.toLocaleString() }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
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
  { title: '1,000 rows', value: 1000 },
  { title: '10,000 rows', value: 10000 },
  { title: '50,000 rows', value: 50000 },
  { title: '100,000 rows', value: 100000 },
  { title: 'Full table', value: 0 },
];
const rowLimit = ref(50000);

const functions = useFunctions();
const config = inject<any>('appConfig', { enabledAuthentication: false });
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
const userStore = useUserStore();

interface ProfileData {
  sampled: boolean;
  metrics: { label: string; value: string }[];
  topValues: { value: string; count: number }[];
}
interface ColumnState {
  loading: boolean;
  error: string | null;
  data: ProfileData | null;
}
const results = reactive<Record<string, ColumnState>>({});

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

async function profile(col: { name: string; type: string }) {
  if (!canQuery.value) return;
  const state: ColumnState = results[col.name] ?? { loading: false, error: null, data: null };
  results[col.name] = state;
  state.loading = true;
  state.error = null;
  try {
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

    const tablePath = `"${warehouseName}"."${namespaceDisplay.value}"."${props.tableName}"`;
    const sampled = rowLimit.value > 0;
    const sampleClause = sampled ? ` USING SAMPLE ${rowLimit.value} ROWS` : '';
    const source = `(SELECT "${col.name}" AS c FROM ${tablePath}${sampleClause})`;
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

    const metrics: { label: string; value: string }[] = [
      { label: 'Rows scanned', value: fmtNum(total) },
      { label: 'Null %', value: `${nullPct}%` },
      { label: 'Distinct (approx)', value: fmtNum(get('ndv')) },
      { label: 'Min', value: fmtNum(get('min_v')) },
      { label: 'Max', value: fmtNum(get('max_v')) },
    ];
    if (numeric) {
      metrics.push(
        { label: 'Mean', value: fmtNum(get('mean_v')) },
        { label: 'Std dev', value: fmtNum(get('stddev_v')) },
        { label: 'p50', value: fmtNum(get('p50')) },
        { label: 'p95', value: fmtNum(get('p95')) },
        { label: 'p99', value: fmtNum(get('p99')) },
      );
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

    state.data = { sampled, metrics, topValues };
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
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
}
.profiler-metric {
  min-width: 110px;
  padding: 8px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 6px;
}
</style>
