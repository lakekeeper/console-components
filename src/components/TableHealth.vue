<template>
  <v-card v-if="healthChecks.length > 0" variant="outlined" class="mb-4" elevation="1">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" :color="overallHealthColor">mdi-heart-pulse</v-icon>
        Table Health
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-select
        v-if="branchOptions.length > 1"
        v-model="selectedBranch"
        :items="branchOptions"
        density="compact"
        variant="outlined"
        hide-details
        style="max-width: 180px"
        class="mr-2"
        prepend-inner-icon="mdi-source-branch"></v-select>
      <v-chip
        v-else
        size="x-small"
        variant="outlined"
        class="mr-2"
        prepend-icon="mdi-source-branch">
        {{ selectedBranch }}
      </v-chip>
      <v-dialog max-width="600">
        <template #activator="{ props: dialogProps }">
          <v-btn
            v-bind="dialogProps"
            icon="mdi-information-outline"
            size="x-small"
            variant="text"
            color="info"
            class="mr-1"></v-btn>
        </template>
        <template #default="{ isActive }">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon class="mr-2" color="info">mdi-information-outline</v-icon>
              Health Check Logic
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="text-body-2">
              <p class="mb-3">
                Health checks are derived from the current snapshot's summary statistics. No
                additional API calls are made. The Partition Distribution chart uses DuckDB's
                <code>iceberg_metadata()</code>
                to query manifest files for per-partition statistics.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-file-alert-outline</v-icon>
                Small Files
              </h4>
              <p class="mb-3">
                Compares average file size (total size ÷ file count) against targets. Files under
                <strong>1 MB</strong>
                avg are flagged as very small; under
                <strong>8 MB</strong>
                avg (with 10+ files) as small. Optimal Iceberg file sizes are
                <strong>128–512 MB</strong>
                . Small files increase query planning time and metadata overhead. Fix with
                compaction or larger write batches.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-delete-clock-outline</v-icon>
                Delete Files
              </h4>
              <p class="mb-3">
                Checks for positional or equality delete files. These cause merge-on-read overhead
                at query time. Severity increases with the ratio of delete files to data files.
                Running compaction merges deletes into data files.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-camera-burst</v-icon>
                Snapshot Count
              </h4>
              <p class="mb-3">
                Counts total snapshots in table metadata. Over
                <strong>100</strong>
                snapshots increases metadata file sizes and load times. Over
                <strong>500</strong>
                is critical. Fix with snapshot expiration (
                <code>expire_snapshots</code>
                ).
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-file-multiple-outline</v-icon>
                High File Count
              </h4>
              <p class="mb-3">
                Flags tables with over
                <strong>1,000</strong>
                data files (even if file sizes are healthy). High file counts increase query
                planning time. Fix with compaction.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-update</v-icon>
                Format Version
              </h4>
              <p class="mb-3">
                Checks the Iceberg format version. v1 tables lack row-level deletes, improved column
                statistics, and full schema evolution. Upgrade to
                <strong>v2</strong>
                is recommended.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-table-split-cell</v-icon>
                Partitioning
              </h4>
              <p class="mb-3">
                Detects unpartitioned tables with many files (&gt; 100), which can hurt query
                performance. Also tracks partition spec evolution count — many changes add metadata
                overhead.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-sort-variant</v-icon>
                Sort Order
              </h4>
              <p class="mb-3">
                Flags large tables (&gt; 1 GB) with no sort order defined. Sorting improves data
                clustering and enables min/max column pruning during query planning.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-file-tree-outline</v-icon>
                Schema Evolution
              </h4>
              <p class="mb-3">
                Tracks the number of schema versions in metadata. Informational — many schema
                changes are normal but worth noting.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="success" class="mr-1">mdi-database-outline</v-icon>
                Table Size
              </h4>
              <p>
                Informational — shows total record count and data size from the snapshot summary.
              </p>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn variant="text" @click="isActive.value = false">Close</v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
      <v-chip :color="overallHealthColor" size="small" variant="flat" class="mr-2">
        {{ overallHealthLabel }}
      </v-chip>
    </v-toolbar>
    <v-divider></v-divider>
    <v-expansion-panels variant="accordion" flat>
      <v-expansion-panel v-for="check in healthChecks" :key="check.label">
        <v-expansion-panel-title class="py-2">
          <template #default>
            <div class="d-flex align-center flex-grow-1">
              <v-icon :color="check.color" size="small" class="mr-3">{{ check.icon }}</v-icon>
              <div class="flex-grow-1">
                <div class="text-body-2 font-weight-medium">{{ check.label }}</div>
                <div class="text-caption text-medium-emphasis text-wrap">{{ check.detail }}</div>
              </div>
              <v-chip :color="check.color" size="x-small" variant="flat" class="ml-2 mr-2">
                {{ check.severity }}
              </v-chip>
            </div>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-table density="compact" class="text-caption">
            <thead>
              <tr>
                <th class="text-left" style="width: 45%">Metric</th>
                <th class="text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in check.reasoning" :key="idx">
                <td class="font-mono text-medium-emphasis">{{ row.label }}</td>
                <td class="font-mono">{{ row.value }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Snapshot Trends Chart -->
    <div v-if="healthBranchSnapshots.length > 0">
      <v-divider></v-divider>
      <div class="pa-3">
        <div class="d-flex align-center mb-2">
          <v-icon size="small" class="mr-2" color="primary">mdi-chart-areaspline</v-icon>
          <span class="text-subtitle-2 font-weight-medium">Snapshot Trends</span>
          <v-spacer></v-spacer>
          <v-select
            v-model="selectedMetric"
            :items="availableMetrics"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 220px"
            class="mr-2"></v-select>
        </div>
        <div ref="healthChartRef" class="health-chart-container"></div>
        <div v-if="allChartPoints.length > 1" class="mt-2 d-flex align-center">
          <v-btn-toggle
            v-model="chartWindowSize"
            mandatory
            density="compact"
            variant="outlined"
            divided
            color="primary">
            <v-btn v-for="opt in chartWindowOptions" :key="opt" :value="opt" size="x-small">
              {{ opt }}
            </v-btn>
            <v-btn :value="allChartPoints.length" size="x-small">All</v-btn>
          </v-btn-toggle>
          <span
            v-if="allChartPoints.length > effectiveWindowSize"
            class="text-caption text-medium-emphasis ml-3">
            showing {{ effectiveWindowSize }} of {{ allChartPoints.length }} snapshots
          </span>
        </div>
      </div>
    </div>
  </v-card>

  <!-- Partition Distribution -->
  <v-card v-if="partitionChartAvailable" variant="outlined" class="mb-4" elevation="1">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" color="primary">mdi-chart-bar</v-icon>
        Partition Distribution
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn-toggle
        v-model="partitionMetric"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        class="mr-2">
        <v-btn value="records" size="x-small">Records</v-btn>
        <v-btn value="files" size="x-small">Files</v-btn>
      </v-btn-toggle>
    </v-toolbar>
    <v-divider></v-divider>
    <div v-if="partitionLoading" class="d-flex justify-center align-center pa-6">
      <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
      <span class="ml-3 text-body-2 text-medium-emphasis">
        Querying partition metadata via DuckDB…
      </span>
    </div>
    <div v-else-if="partitionError" class="pa-4">
      <v-alert type="warning" variant="tonal" density="compact" class="text-body-2">
        {{ partitionError }}
        <template v-if="partitionError.includes('CORS')" #append>
          <CorsConfigDialog />
        </template>
      </v-alert>
    </div>
    <div v-else-if="partitionData.length > 0" class="pa-3">
      <div ref="partitionChartRef" class="partition-chart-container"></div>
      <div v-if="partitionSkewRatio !== null" class="mt-2 d-flex align-center flex-wrap">
        <v-chip
          :color="partitionSkewRatio > 5 ? 'error' : partitionSkewRatio > 2 ? 'warning' : 'success'"
          size="x-small"
          variant="flat"
          class="mr-2">
          {{
            partitionSkewRatio > 5 ? 'High Skew' : partitionSkewRatio > 2 ? 'Skewed' : 'Balanced'
          }}
        </v-chip>
        <span class="text-caption text-medium-emphasis mr-4">
          Largest / median ratio: {{ partitionSkewRatio.toFixed(1) }}x ·
          {{ partitionData.length }} partition{{ partitionData.length !== 1 ? 's' : '' }}
        </span>
        <span class="d-inline-flex align-center ga-3 text-caption text-medium-emphasis">
          <span class="d-inline-flex align-center">
            <span
              style="
                width: 10px;
                height: 10px;
                border-radius: 2px;
                background: #66bb6a;
                display: inline-block;
              "
              class="mr-1"></span>
            Balanced
          </span>
          <span class="d-inline-flex align-center">
            <span
              style="
                width: 10px;
                height: 10px;
                border-radius: 2px;
                background: #fdd835;
                display: inline-block;
              "
              class="mr-1"></span>
            Moderate
          </span>
          <span class="d-inline-flex align-center">
            <span
              style="
                width: 10px;
                height: 10px;
                border-radius: 2px;
                background: #fb8c00;
                display: inline-block;
              "
              class="mr-1"></span>
            High
          </span>
          <span class="d-inline-flex align-center">
            <span
              style="
                width: 10px;
                height: 10px;
                border-radius: 2px;
                background: #e53935;
                display: inline-block;
              "
              class="mr-1"></span>
            Extreme
          </span>
          <span class="d-inline-flex align-center">
            <span
              style="
                width: 10px;
                height: 10px;
                border-radius: 2px;
                background: #42a5f5;
                display: inline-block;
              "
              class="mr-1"></span>
            Undersized
          </span>
        </span>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount, inject } from 'vue';
import * as d3 from 'd3';
import { useFunctions } from '../plugins/functions';
import { useLoQE } from '../composables/useLoQE';
import { useUserStore } from '../stores/user';
import CorsConfigDialog from './CorsConfigDialog.vue';
import type { LoadTableResult, Snapshot } from '../gen/iceberg/types.gen';

// Props
const props = defineProps<{
  table: LoadTableResult;
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  catalogUrl?: string;
  storageType?: string;
}>();

// Composables for partition distribution
const functions = useFunctions();
const config = inject<any>('appConfig', { enabledAuthentication: false });
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
const userStore = useUserStore();

// --- Health Check Types ---
interface HealthCheck {
  label: string;
  detail: string;
  severity: 'Good' | 'Info' | 'Warning' | 'Critical';
  color: string;
  icon: string;
  reasoning: { label: string; value: string }[];
}

// Branch selector for health analysis
const branchOptions = computed(() => {
  if (!props.table?.metadata) return [{ title: 'main', value: 'main' }];
  const refs = props.table.metadata.refs;
  if (!refs) return [{ title: 'main', value: 'main' }];
  return Object.entries(refs)
    .filter(([, ref]) => ref.type === 'branch')
    .map(([name]) => ({ title: name, value: name }));
});

const selectedBranch = ref<string>('main');

const currentSnapshot = computed<Snapshot | null>(() => {
  if (!props.table?.metadata?.snapshots || props.table.metadata.snapshots.length === 0) return null;
  return (
    props.table.metadata.snapshots.find(
      (snapshot: Snapshot) =>
        snapshot['snapshot-id'] === props.table.metadata['current-snapshot-id'],
    ) || null
  );
});

const healthBranchSnapshot = computed<Snapshot | null>(() => {
  if (!props.table?.metadata) return null;
  const refs = props.table.metadata.refs;
  const allSnapshots = props.table.metadata.snapshots;
  if (!refs || !allSnapshots) return currentSnapshot.value;
  const branchRef = refs[selectedBranch.value];
  if (!branchRef) return currentSnapshot.value;
  const snapId = String(branchRef['snapshot-id']);
  return allSnapshots.find((s) => String(s['snapshot-id']) === snapId) || currentSnapshot.value;
});

const healthSummaryNum = (...keys: string[]): number | null => {
  for (const key of keys) {
    const val = healthBranchSnapshot.value?.summary?.[key];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!isNaN(n)) return n;
    }
  }
  return null;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Walk the selected branch by following parent-snapshot-id from branch tip
const healthBranchSnapshots = computed<Snapshot[]>(() => {
  if (!props.table?.metadata) return [];
  const allSnapshots = props.table.metadata.snapshots;
  if (!allSnapshots || allSnapshots.length === 0) return [];
  const snapshotMap = new Map<string, Snapshot>();
  for (const s of allSnapshots) {
    if (s['snapshot-id']) snapshotMap.set(String(s['snapshot-id']), s);
  }
  const chain: Snapshot[] = [];
  const refs = props.table.metadata.refs;
  let startId: string | number | undefined;
  if (refs && refs[selectedBranch.value]) {
    startId = refs[selectedBranch.value]['snapshot-id'];
  } else {
    startId = props.table.metadata['current-snapshot-id'];
  }
  let id: string | number | undefined = startId;
  while (id !== undefined && id !== null) {
    const snap = snapshotMap.get(String(id));
    if (!snap) break;
    chain.push(snap);
    id = snap['parent-snapshot-id'];
  }
  return chain;
});

const healthChecks = computed<HealthCheck[]>(() => {
  if (!props.table?.metadata || !healthBranchSnapshot.value?.summary) return [];
  const checks: HealthCheck[] = [];

  const dataFiles = healthSummaryNum('total-data-files-count', 'total-data-files');
  const deleteFiles = healthSummaryNum('total-delete-files-count', 'total-delete-files');
  const eqDeletes = healthSummaryNum('total-equality-deletes-count', 'total-equality-deletes');
  const posDeletes = healthSummaryNum('total-position-deletes-count', 'total-position-deletes');
  const totalRecords = healthSummaryNum('total-records-count', 'total-records');
  const totalSize = healthSummaryNum('total-files-size-in-bytes', 'total-files-size');
  const totalSnapshotCount = props.table.metadata.snapshots?.length ?? 0;
  const branchSnapshotCount = healthBranchSnapshots.value.length;

  // Analyze branch operation history
  const opCounts: Record<string, number> = {};
  for (const snap of healthBranchSnapshots.value) {
    const op = snap.summary?.['operation'] ?? 'unknown';
    opCounts[op] = (opCounts[op] ?? 0) + 1;
  }
  const deleteOps = opCounts['delete'] ?? 0;
  const overwriteOps = opCounts['overwrite'] ?? 0;
  const replaceOps = opCounts['replace'] ?? 0;
  const mutatingOps = deleteOps + overwriteOps + replaceOps;

  // Small files detection
  if (dataFiles !== null && totalSize !== null && dataFiles > 0) {
    const avgFileSize = totalSize / dataFiles;
    if (avgFileSize < 1024 * 1024 && dataFiles > 1) {
      checks.push({
        label: 'Very small files detected',
        detail: `${dataFiles} data files with avg size ${formatBytes(avgFileSize)}. Files are significantly undersized (target: 128–512 MB). Consider compaction or increasing write batch sizes.`,
        severity: dataFiles > 10 ? 'Critical' : 'Warning',
        color: dataFiles > 10 ? 'error' : 'warning',
        icon: 'mdi-file-alert-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          { label: 'Threshold', value: 'avg < 1 MB with > 1 file' },
          {
            label: 'Result',
            value: `${formatBytes(avgFileSize)} < 1 MB, ${dataFiles} files > 1 → ${dataFiles > 10 ? 'Critical (>10 files)' : 'Warning (≤10 files)'}`,
          },
        ],
      });
    } else if (avgFileSize < 8 * 1024 * 1024 && dataFiles > 10) {
      checks.push({
        label: 'Small files detected',
        detail: `${dataFiles} data files with avg size ${formatBytes(avgFileSize)}. Consider compaction to improve read performance (target: 128–512 MB per file).`,
        severity: 'Warning',
        color: 'warning',
        icon: 'mdi-file-alert-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          { label: 'Threshold', value: 'avg < 8 MB with > 10 files' },
          {
            label: 'Result',
            value: `${formatBytes(avgFileSize)} < 8 MB, ${dataFiles} files > 10 → Warning`,
          },
        ],
      });
    } else {
      checks.push({
        label: 'File sizes healthy',
        detail: `${dataFiles} data file${dataFiles > 1 ? 's' : ''}, avg ${formatBytes(avgFileSize)}.`,
        severity: 'Good',
        color: 'success',
        icon: 'mdi-file-check-outline',
        reasoning: [
          { label: 'total-data-files-count', value: `${dataFiles}` },
          {
            label: 'total-files-size-in-bytes',
            value: `${totalSize!.toLocaleString()} (${formatBytes(totalSize!)})`,
          },
          { label: 'Avg file size', value: `${formatBytes(avgFileSize)}` },
          {
            label: 'Threshold',
            value: 'avg < 1 MB → Warning/Critical, avg < 8 MB with >10 files → Warning',
          },
          { label: 'Result', value: `${formatBytes(avgFileSize)} is within healthy range → Good` },
        ],
      });
    }
  } else {
    checks.push({
      label: 'File sizes',
      detail:
        dataFiles === 0
          ? 'No data files yet.'
          : 'File size data not available in snapshot summary.',
      severity: 'Good',
      color: 'success',
      icon: 'mdi-file-check-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${dataFiles ?? 'N/A'}` },
        { label: 'total-files-size-in-bytes', value: `${totalSize ?? 'N/A'}` },
        {
          label: 'Result',
          value:
            dataFiles === 0
              ? 'No data files — nothing to check'
              : 'Metrics unavailable in snapshot summary',
        },
      ],
    });
  }

  // Delete files accumulation
  if (deleteFiles !== null && deleteFiles > 0) {
    const deleteRatio = dataFiles ? deleteFiles / dataFiles : deleteFiles;
    const totalDeletes = (eqDeletes ?? 0) + (posDeletes ?? 0);
    const severity: HealthCheck['severity'] =
      deleteRatio > 0.5 || deleteFiles > 100 ? 'Critical' : deleteFiles > 10 ? 'Warning' : 'Info';
    checks.push({
      label: 'Delete files present',
      detail: `${deleteFiles} delete file${deleteFiles > 1 ? 's' : ''}${totalDeletes > 0 ? ` (${totalDeletes.toLocaleString()} deletes)` : ''}. Run compaction to merge deletes into data files.`,
      severity,
      color: severity === 'Critical' ? 'error' : severity === 'Warning' ? 'warning' : 'info',
      icon: 'mdi-delete-clock-outline',
      reasoning: [
        { label: 'total-delete-files-count', value: `${deleteFiles}` },
        { label: 'total-data-files-count', value: `${dataFiles ?? 'N/A'}` },
        { label: 'total-equality-deletes-count', value: `${eqDeletes ?? 'N/A'}` },
        { label: 'total-position-deletes-count', value: `${posDeletes ?? 'N/A'}` },
        {
          label: 'Delete-to-data ratio',
          value: `${deleteFiles} / ${dataFiles ?? '?'} = ${deleteRatio.toFixed(2)}`,
        },
        {
          label: 'Threshold',
          value: 'ratio > 0.5 or > 100 delete files → Critical, > 10 → Warning, else Info',
        },
        {
          label: 'Result',
          value: `ratio ${deleteRatio.toFixed(2)}, ${deleteFiles} delete files → ${severity}`,
        },
      ],
    });
  } else {
    checks.push({
      label: 'Delete files',
      detail: 'No delete files. Table is clean.',
      severity: 'Good',
      color: 'success',
      icon: 'mdi-delete-off-outline',
      reasoning: [
        { label: 'total-delete-files-count', value: `${deleteFiles ?? 0}` },
        { label: 'total-equality-deletes-count', value: `${eqDeletes ?? 0}` },
        { label: 'total-position-deletes-count', value: `${posDeletes ?? 0}` },
        { label: 'Result', value: 'No delete files present → Good' },
      ],
    });
  }

  // Branch operation history
  if (branchSnapshotCount > 0) {
    const opSummary = Object.entries(opCounts)
      .map(([op, count]) => `${count} ${op}`)
      .join(', ');
    const mutatingRatio = branchSnapshotCount > 0 ? mutatingOps / branchSnapshotCount : 0;
    let severity: HealthCheck['severity'] = 'Good';
    let color = 'success';
    if (mutatingRatio > 0.5 && mutatingOps > 5) {
      severity = 'Warning';
      color = 'warning';
    } else if (mutatingOps > 0) {
      severity = 'Info';
      color = 'info';
    }
    checks.push({
      label: mutatingOps > 0 ? 'Mutating operations detected' : 'Append-only history',
      detail:
        mutatingOps > 0
          ? `${mutatingOps} delete/overwrite/replace operation${mutatingOps > 1 ? 's' : ''} across ${branchSnapshotCount} snapshots on "${selectedBranch.value}". Frequent mutations may indicate need for compaction.`
          : `All ${branchSnapshotCount} snapshots on "${selectedBranch.value}" are appends.`,
      severity,
      color,
      icon: mutatingOps > 0 ? 'mdi-swap-horizontal' : 'mdi-plus-circle-outline',
      reasoning: [
        { label: 'Branch', value: `${selectedBranch.value}` },
        { label: 'Branch snapshots', value: `${branchSnapshotCount}` },
        { label: 'Operations breakdown', value: opSummary },
        {
          label: 'Mutating operations',
          value: `${mutatingOps} (delete: ${deleteOps}, overwrite: ${overwriteOps}, replace: ${replaceOps})`,
        },
        {
          label: 'Mutating ratio',
          value: `${mutatingOps}/${branchSnapshotCount} = ${(mutatingRatio * 100).toFixed(0)}%`,
        },
        {
          label: 'Threshold',
          value: 'ratio > 50% with > 5 mutations → Warning, any mutations → Info, none → Good',
        },
        {
          label: 'Result',
          value: `${(mutatingRatio * 100).toFixed(0)}% mutating, ${mutatingOps} mutations → ${severity}`,
        },
      ],
    });
  }

  // Snapshot accumulation
  if (totalSnapshotCount > 100) {
    checks.push({
      label: 'Many snapshots accumulated',
      detail: `${totalSnapshotCount} total snapshots (${branchSnapshotCount} on "${selectedBranch.value}"). Consider running snapshot expiration to reduce metadata size.`,
      severity: totalSnapshotCount > 500 ? 'Critical' : 'Warning',
      color: totalSnapshotCount > 500 ? 'error' : 'warning',
      icon: 'mdi-camera-burst',
      reasoning: [
        {
          label: 'Total snapshots',
          value: `${totalSnapshotCount} (all branches, from metadata.snapshots.length)`,
        },
        {
          label: `"${selectedBranch.value}" branch snapshots`,
          value: `${branchSnapshotCount} (following parent chain from branch tip)`,
        },
        { label: 'Other snapshots', value: `${totalSnapshotCount - branchSnapshotCount}` },
        { label: 'Threshold', value: '> 500 total → Critical, > 100 total → Warning' },
        {
          label: 'Result',
          value: `${totalSnapshotCount} total snapshots → ${totalSnapshotCount > 500 ? 'Critical' : 'Warning'}`,
        },
      ],
    });
  } else if (totalSnapshotCount > 0) {
    checks.push({
      label: 'Snapshot count',
      detail: `${totalSnapshotCount} total snapshot${totalSnapshotCount > 1 ? 's' : ''} (${branchSnapshotCount} on "${selectedBranch.value}").`,
      severity: 'Good',
      color: 'success',
      icon: 'mdi-camera-outline',
      reasoning: [
        {
          label: 'Total snapshots',
          value: `${totalSnapshotCount} (all branches, from metadata.snapshots.length)`,
        },
        {
          label: `"${selectedBranch.value}" branch snapshots`,
          value: `${branchSnapshotCount} (following parent chain from branch tip)`,
        },
        { label: 'Other snapshots', value: `${totalSnapshotCount - branchSnapshotCount}` },
        {
          label: 'Threshold',
          value: '> 500 total → Critical, > 100 total → Warning, ≤ 100 → Good',
        },
        { label: 'Result', value: `${totalSnapshotCount} ≤ 100 → Good` },
      ],
    });
  }

  // File count check
  if (dataFiles !== null && dataFiles > 1000) {
    checks.push({
      label: 'High file count',
      detail: `${dataFiles.toLocaleString()} data files. Large file counts increase planning time. Consider compaction.`,
      severity: dataFiles > 10000 ? 'Warning' : 'Info',
      color: dataFiles > 10000 ? 'warning' : 'info',
      icon: 'mdi-file-multiple-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${dataFiles.toLocaleString()}` },
        { label: 'Threshold', value: '> 10,000 → Warning, > 1,000 → Info, ≤ 1,000 → Good' },
        {
          label: 'Result',
          value: `${dataFiles.toLocaleString()} files → ${dataFiles > 10000 ? 'Warning' : 'Info'}`,
        },
      ],
    });
  } else {
    checks.push({
      label: 'File count',
      detail: `${(dataFiles ?? 0).toLocaleString()} data files.`,
      severity: 'Good',
      color: 'success',
      icon: 'mdi-file-multiple-outline',
      reasoning: [
        { label: 'total-data-files-count', value: `${(dataFiles ?? 0).toLocaleString()}` },
        { label: 'Threshold', value: '> 10,000 → Warning, > 1,000 → Info, ≤ 1,000 → Good' },
        { label: 'Result', value: `${(dataFiles ?? 0).toLocaleString()} ≤ 1,000 → Good` },
      ],
    });
  }

  // Format version check
  const formatVersion = props.table.metadata['format-version'];
  if (formatVersion !== undefined) {
    if (formatVersion < 2) {
      checks.push({
        label: 'Legacy format version',
        detail: `Table uses Iceberg format v${formatVersion}. v2 adds row-level deletes, improved statistics, and schema evolution. Consider upgrading.`,
        severity: 'Info',
        color: 'info',
        icon: 'mdi-update',
        reasoning: [
          { label: 'format-version', value: `${formatVersion}` },
          { label: 'Threshold', value: 'v1 → Info (upgrade recommended), v2+ → Good' },
          { label: 'Result', value: `v${formatVersion} < v2 → Info` },
        ],
      });
    } else {
      checks.push({
        label: 'Format version',
        detail: `Iceberg format v${formatVersion}.`,
        severity: 'Good',
        color: 'success',
        icon: 'mdi-check-circle-outline',
        reasoning: [
          { label: 'format-version', value: `${formatVersion}` },
          { label: 'Result', value: `v${formatVersion} is current → Good` },
        ],
      });
    }
  }

  // Partition spec check
  const partitionSpecs = props.table.metadata['partition-specs'];
  const defaultSpecId = props.table.metadata['default-spec-id'];
  if (partitionSpecs) {
    const currentSpec =
      partitionSpecs.find((s: any) => s['spec-id'] === defaultSpecId) ??
      partitionSpecs[partitionSpecs.length - 1];
    const isUnpartitioned = !currentSpec?.fields || currentSpec.fields.length === 0;
    const specEvolutions = partitionSpecs.length;

    if (isUnpartitioned && dataFiles !== null && dataFiles > 100) {
      checks.push({
        label: 'Unpartitioned table with many files',
        detail: `Table has ${dataFiles.toLocaleString()} data files but no partition spec. Partitioning can significantly improve query performance and file organization.`,
        severity: 'Warning',
        color: 'warning',
        icon: 'mdi-table-split-cell',
        reasoning: [
          { label: 'Partition fields', value: 'None (unpartitioned)' },
          { label: 'total-data-files-count', value: `${dataFiles.toLocaleString()}` },
          { label: 'Threshold', value: 'Unpartitioned with > 100 files → Warning' },
          { label: 'Result', value: `${dataFiles.toLocaleString()} files, no partition → Warning` },
        ],
      });
    } else if (isUnpartitioned) {
      checks.push({
        label: 'Partitioning',
        detail:
          'Table is unpartitioned.' +
          (dataFiles !== null ? ` ${dataFiles} data file${dataFiles !== 1 ? 's' : ''}.` : ''),
        severity: 'Good',
        color: 'success',
        icon: 'mdi-table-split-cell',
        reasoning: [
          { label: 'Partition fields', value: 'None (unpartitioned)' },
          { label: 'total-data-files-count', value: `${dataFiles ?? 'N/A'}` },
          { label: 'Result', value: 'Unpartitioned but file count is low → Good' },
        ],
      });
    } else {
      const fieldNames = currentSpec.fields
        .map((f: any) => `${f.transform}(${f.name || `col-${f['source-id']}`})`)
        .join(', ');
      checks.push({
        label: specEvolutions > 1 ? 'Partition spec evolved' : 'Partitioning',
        detail:
          specEvolutions > 1
            ? `${specEvolutions} partition specs recorded. Current: ${fieldNames}. Partition evolution adds metadata overhead.`
            : `Partitioned by: ${fieldNames}.`,
        severity: specEvolutions > 3 ? 'Info' : 'Good',
        color: specEvolutions > 3 ? 'info' : 'success',
        icon: 'mdi-table-split-cell',
        reasoning: [
          { label: 'Current partition spec', value: fieldNames },
          { label: 'Partition spec count', value: `${specEvolutions}` },
          { label: 'Threshold', value: '> 3 spec evolutions → Info, else Good' },
          {
            label: 'Result',
            value: `${specEvolutions} spec${specEvolutions > 1 ? 's' : ''} → ${specEvolutions > 3 ? 'Info' : 'Good'}`,
          },
        ],
      });
    }
  }

  // Sort order check
  const sortOrders = props.table.metadata['sort-orders'];
  if (sortOrders) {
    const defaultSortId = props.table.metadata['default-sort-order-id'];
    const currentSort =
      sortOrders.find((s: any) => s['order-id'] === defaultSortId) ??
      sortOrders[sortOrders.length - 1];
    const isUnsorted = !currentSort?.fields || currentSort.fields.length === 0;

    if (isUnsorted && totalSize !== null && totalSize > 1024 * 1024 * 1024) {
      checks.push({
        label: 'No sort order on large table',
        detail: `Table is ${formatBytes(totalSize)} with no sort order. Sorting can improve query performance through better data clustering and min/max pruning.`,
        severity: 'Info',
        color: 'info',
        icon: 'mdi-sort-variant',
        reasoning: [
          { label: 'Sort order', value: 'None (unsorted)' },
          { label: 'Table size', value: formatBytes(totalSize) },
          { label: 'Threshold', value: 'Unsorted with > 1 GB → Info' },
          { label: 'Result', value: `${formatBytes(totalSize)} > 1 GB, unsorted → Info` },
        ],
      });
    } else {
      const sortDesc = isUnsorted
        ? 'Unsorted'
        : currentSort.fields
            .map((f: any) => `${f.transform || 'identity'}(col-${f['source-id']}) ${f.direction}`)
            .join(', ');
      checks.push({
        label: 'Sort order',
        detail: isUnsorted ? 'No sort order defined.' : `Sorted by: ${sortDesc}.`,
        severity: 'Good',
        color: 'success',
        icon: 'mdi-sort-variant',
        reasoning: [
          { label: 'Sort order', value: sortDesc },
          {
            label: 'Result',
            value: isUnsorted ? 'Unsorted, table is small → Good' : 'Sort order defined → Good',
          },
        ],
      });
    }
  }

  // Schema evolution count
  const schemas = props.table.metadata.schemas;
  if (schemas && schemas.length > 1) {
    checks.push({
      label: 'Schema evolution',
      detail: `${schemas.length} schema versions recorded. Frequent schema changes are tracked in metadata.`,
      severity: schemas.length > 10 ? 'Info' : 'Good',
      color: schemas.length > 10 ? 'info' : 'success',
      icon: 'mdi-file-tree-outline',
      reasoning: [
        { label: 'Schema versions', value: `${schemas.length}` },
        {
          label: 'Current schema ID',
          value: `${props.table.metadata['current-schema-id'] ?? 'N/A'}`,
        },
        { label: 'Threshold', value: '> 10 schemas → Info, else Good' },
        {
          label: 'Result',
          value: `${schemas.length} schemas → ${schemas.length > 10 ? 'Info' : 'Good'}`,
        },
      ],
    });
  }

  // Table size summary (informational)
  checks.push({
    label: 'Table size',
    detail:
      totalSize !== null && totalRecords !== null
        ? `${totalRecords.toLocaleString()} records across ${formatBytes(totalSize)}.`
        : 'Size data not available in snapshot summary.',
    severity: 'Good',
    color: 'success',
    icon: 'mdi-database-outline',
    reasoning: [
      { label: 'total-records-count', value: `${totalRecords?.toLocaleString() ?? 'N/A'}` },
      {
        label: 'total-files-size-in-bytes',
        value:
          totalSize !== null ? `${totalSize.toLocaleString()} (${formatBytes(totalSize)})` : 'N/A',
      },
      { label: 'Result', value: 'Informational metric — no threshold applied' },
    ],
  });

  return checks;
});

const overallHealthColor = computed(() => {
  if (healthChecks.value.some((c) => c.severity === 'Critical')) return 'error';
  if (healthChecks.value.some((c) => c.severity === 'Warning')) return 'warning';
  return 'success';
});

const overallHealthLabel = computed(() => {
  if (healthChecks.value.some((c) => c.severity === 'Critical')) return 'Needs Attention';
  if (healthChecks.value.some((c) => c.severity === 'Warning')) return 'Minor Issues';
  return 'Healthy';
});

// --- Snapshot Trends Chart ---

const healthChartRef = ref<HTMLDivElement | null>(null);
const chartWindowSize = ref(50);
const chartWindowOptions = [50, 100, 200, 500, 1000];
const snapshotWindowStart = ref(0);

interface MetricDef {
  title: string;
  value: string;
  keys: string[];
  format: (n: number) => string;
  color: string;
}

const availableMetrics: MetricDef[] = [
  {
    title: 'Added Data Files',
    value: 'added-data-files',
    keys: ['added-data-files-count', 'added-data-files'],
    format: (n: number) => n.toLocaleString(),
    color: '#1976d2',
  },
  {
    title: 'Added Records',
    value: 'added-records',
    keys: ['added-records-count', 'added-records'],
    format: (n: number) =>
      n >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : n.toLocaleString(),
    color: '#388e3c',
  },
  {
    title: 'Total Data Files',
    value: 'total-data-files',
    keys: ['total-data-files-count', 'total-data-files'],
    format: (n: number) => n.toLocaleString(),
    color: '#f57c00',
  },
  {
    title: 'Total Records',
    value: 'total-records',
    keys: ['total-records-count', 'total-records'],
    format: (n: number) =>
      n >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : n.toLocaleString(),
    color: '#7b1fa2',
  },
  {
    title: 'Added Files Size',
    value: 'added-files-size',
    keys: ['added-files-size-in-bytes', 'added-files-size'],
    format: (n: number) => formatBytes(n),
    color: '#00796b',
  },
  {
    title: 'Total Files Size',
    value: 'total-files-size',
    keys: ['total-files-size-in-bytes', 'total-files-size'],
    format: (n: number) => formatBytes(n),
    color: '#c2185b',
  },
];

const selectedMetric = ref<string>('total-files-size');

const currentMetricDef = computed(
  () => availableMetrics.find((m) => m.value === selectedMetric.value) ?? availableMetrics[0],
);

interface ChartPoint {
  index: number;
  seqNum: number;
  value: number;
  timestamp: number;
  operation: string;
}

// All chart points (chronological)
const allChartPoints = computed<ChartPoint[]>(() => {
  const metric = currentMetricDef.value;
  const snapshots = [...healthBranchSnapshots.value].reverse();
  const points: ChartPoint[] = [];
  snapshots.forEach((snap, idx) => {
    let val: number | null = null;
    for (const key of metric.keys) {
      const raw = snap.summary?.[key];
      if (raw !== undefined && raw !== null) {
        const n = Number(raw);
        if (!isNaN(n)) {
          val = n;
          break;
        }
      }
    }
    if (val !== null) {
      points.push({
        index: idx,
        seqNum: snap['sequence-number'] ?? idx,
        value: val,
        timestamp: snap['timestamp-ms'] ?? 0,
        operation: String(snap.summary?.['operation'] ?? 'unknown'),
      });
    }
  });
  return points;
});

const effectiveWindowSize = computed(() =>
  Math.min(chartWindowSize.value, allChartPoints.value.length),
);

const chartData = computed<ChartPoint[]>(() => {
  const all = allChartPoints.value;
  const winSize = effectiveWindowSize.value;
  if (all.length <= winSize) return all;
  return all.slice(snapshotWindowStart.value, snapshotWindowStart.value + winSize);
});

watch([selectedMetric, healthBranchSnapshots, chartWindowSize], () => {
  const total = allChartPoints.value.length;
  const winSize = effectiveWindowSize.value;
  snapshotWindowStart.value = Math.max(0, total - winSize);
});

function renderHealthChart() {
  if (!healthChartRef.value || chartData.value.length === 0) return;

  const container = healthChartRef.value;
  d3.select(container).selectAll('svg').remove();

  const metric = currentMetricDef.value;
  const data = chartData.value;

  const margin = { top: 16, right: 16, bottom: 32, left: 56 };
  const width = container.clientWidth || 600;
  const height = 200;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('display', 'block')
    .style('color', 'inherit');

  const defs = svg.append('defs');

  const gradientId = `area-grad-${metric.value}`;
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0')
    .attr('y1', '0')
    .attr('x2', '0')
    .attr('y2', '1');
  gradient
    .append('stop')
    .attr('offset', '0%')
    .attr('stop-color', metric.color)
    .attr('stop-opacity', 0.35);
  gradient
    .append('stop')
    .attr('offset', '100%')
    .attr('stop-color', metric.color)
    .attr('stop-opacity', 0.03);

  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const xScale = d3
    .scaleLinear()
    .domain([0, Math.max(data.length - 1, 1)])
    .range([0, chartW]);

  const yMax = d3.max(data, (d) => d.value) ?? 1;
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax * 1.1])
    .nice()
    .range([chartH, 0]);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Subtle grid lines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(4)
        .tickSize(-chartW)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .style('stroke', 'rgba(var(--v-theme-on-surface), 0.06)');
  g.select('.grid .domain').remove();

  // Area + Line (need 2+ points)
  if (data.length > 1) {
    const area = d3
      .area<ChartPoint>()
      .x((d, i) => xScale(i))
      .y0(chartH)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(data).attr('fill', `url(#${gradientId})`).attr('d', area);

    const line = d3
      .line<ChartPoint>()
      .x((d, i) => xScale(i))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', metric.color)
      .attr('stroke-width', 2)
      .attr('d', line);
  }

  // Data dots
  const opColorMap: Record<string, string> = {
    append: '#4caf50',
    overwrite: '#ff9800',
    delete: '#f44336',
    replace: '#2196f3',
    merge: '#00bcd4',
  };

  g.selectAll('circle.data-dot')
    .data(data)
    .join('circle')
    .attr('class', 'data-dot')
    .attr('cx', (d, i) => (data.length === 1 ? chartW / 2 : xScale(i)))
    .attr('cy', (d) => yScale(d.value))
    .attr('r', data.length === 1 ? 6 : data.length > 30 ? 2.5 : 4)
    .attr('fill', (d) => opColorMap[d.operation] ?? metric.color)
    .style('stroke', 'rgba(var(--v-theme-surface), 1)')
    .attr('stroke-width', 1.5)
    .style('cursor', 'pointer');

  // Value label for single data point
  if (data.length === 1) {
    g.append('text')
      .attr('x', chartW / 2)
      .attr('y', yScale(data[0].value) - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', metric.color)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(metric.format(data[0].value));
  }

  // Tooltip
  g.selectAll('circle.data-dot')
    .append('title')
    .text(
      (d: any) =>
        `#${d.seqNum} — ${metric.format(d.value)}\n${d.operation}${d.timestamp ? '\n' + new Date(d.timestamp).toLocaleString() : ''}`,
    );

  // X axis
  const tickStep = Math.max(1, Math.floor(data.length / 8));

  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(data.map((_, i) => i).filter((i) => i % tickStep === 0 || i === data.length - 1))
    .tickFormat((i) => `#${data[i as number]?.seqNum ?? ''}`);

  g.append('g')
    .attr('transform', `translate(0,${chartH})`)
    .call(xAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .style('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(4)
    .tickFormat((d) => metric.format(d as number));

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .style('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  // Remove axis domain lines
  g.selectAll('.domain').style('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');
}

// Watch metric selection, branch data, slider position, and window size
watch(
  [selectedMetric, healthBranchSnapshots, snapshotWindowStart, chartWindowSize],
  async () => {
    if (healthBranchSnapshots.value.length > 0) {
      await nextTick();
      renderHealthChart();
    }
  },
  { immediate: false },
);

// Initial render once data is available
watch(
  healthBranchSnapshots,
  async (snaps) => {
    if (snaps.length > 0) {
      const total = allChartPoints.value.length;
      snapshotWindowStart.value = Math.max(0, total - effectiveWindowSize.value);
      await nextTick();
      renderHealthChart();
    }
  },
  { immediate: true },
);

// Clean up
onBeforeUnmount(() => {
  if (healthChartRef.value) {
    d3.select(healthChartRef.value).selectAll('svg').remove();
  }
  if (partitionChartRef.value) {
    d3.select(partitionChartRef.value).selectAll('svg').remove();
  }
});

// ── Partition Distribution ────────────────────────────────────────────────────

interface PartitionBucket {
  partition: string;
  fileCount: number;
  totalRecords: number;
}

const partitionChartRef = ref<HTMLElement | null>(null);
const partitionData = ref<PartitionBucket[]>([]);
const partitionLoading = ref(false);
const partitionError = ref<string | null>(null);
const partitionMetric = ref<'files' | 'records'>('records');

const partitionChartAvailable = computed(() => {
  // Only show if we have the required props and the table is partitioned
  if (!props.warehouseId || !props.namespaceId || !props.tableName || !props.catalogUrl)
    return false;
  if (!props.table?.metadata) return false;
  const specs = props.table.metadata['partition-specs'];
  const defaultId = props.table.metadata['default-spec-id'];
  if (!specs) return false;
  const currentSpec = specs.find((s: any) => s['spec-id'] === defaultId) ?? specs[specs.length - 1];
  return currentSpec?.fields && currentSpec.fields.length > 0;
});

const partitionSkewRatio = computed<number | null>(() => {
  if (partitionData.value.length < 2) return null;
  const metric = partitionMetric.value;
  const values = partitionData.value
    .map((d) => (metric === 'files' ? d.fileCount : d.totalRecords))
    .sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const max = values[values.length - 1];
  return median > 0 ? max / median : max > 0 ? Infinity : 1;
});

async function loadPartitionData() {
  if (!props.warehouseId || !props.catalogUrl) return;
  partitionLoading.value = true;
  partitionError.value = null;

  try {
    await loqe.initialize();

    // Load warehouse for name + project-id
    const wh = await functions.getWarehouse(props.warehouseId);
    const warehouseName = wh.name;

    // Attach catalog if needed
    const attached = loqe.attachedCatalogs.value;
    if (!attached.some((c) => c.catalogName === warehouseName)) {
      await loqe.attachCatalog({
        catalogName: warehouseName,
        restUri: props.catalogUrl,
        accessToken: userStore.user.access_token,
        projectId: wh['project-id'],
      });
    }

    const tablePath = `"${warehouseName}"."${props.namespaceId}"."${props.tableName}"`;

    const sql = `
      WITH files AS (
        SELECT
          record_count AS rcount,
          CASE
            WHEN file_path LIKE '%/data/%'
            THEN regexp_extract(file_path, '.*/data/(.*)/[^/]+$', 1)
            ELSE NULL
          END AS partition_path
        FROM iceberg_metadata(${tablePath})
        WHERE manifest_content = 'DATA'
      )
      SELECT
        COALESCE(NULLIF(partition_path, ''), '__unpartitioned__') AS partition_value,
        COUNT(*) AS file_count,
        SUM(rcount) AS total_records
      FROM files
      GROUP BY partition_value
      ORDER BY total_records DESC
    `;

    const result = await loqe.query(sql);

    const partColIdx = result.columns.indexOf('partition_value');
    const filesColIdx = result.columns.indexOf('file_count');
    const recsColIdx = result.columns.indexOf('total_records');

    const parseBigInt = (v: any): number => {
      if (v === null || v === undefined) return 0;
      const s = String(v).replace(/"/g, '');
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    partitionData.value = result.rows.map((row: any[]) => ({
      partition: String(row[partColIdx] ?? 'unknown'),
      fileCount: parseBigInt(row[filesColIdx]),
      totalRecords: parseBigInt(row[recsColIdx]),
    }));
  } catch (err: any) {
    console.error('Failed to load partition data:', err);
    const msg = err.message || String(err);
    if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
      partitionError.value =
        'Cannot query table metadata — CORS not configured for direct browser access to storage.';
    } else {
      partitionError.value = msg;
    }
  } finally {
    partitionLoading.value = false;
  }
}

function renderPartitionChart() {
  const container = partitionChartRef.value;
  if (!container || partitionData.value.length === 0) return;

  d3.select(container).selectAll('*').remove();

  const metric = partitionMetric.value;
  const data = partitionData.value.map((d) => ({
    label: d.partition.replace(/^[^=]+=/, ''),
    fullLabel: d.partition,
    value: metric === 'files' ? d.fileCount : d.totalRecords,
  }));

  data.sort((a, b) => b.value - a.value);
  const displayData = data;

  const margin = { top: 16, right: 16, bottom: 80, left: 60 };
  const visibleWidth = container.clientWidth || 600;
  const barWidth = 32;
  const maxVisibleBars = 20;
  const neededWidth = margin.left + margin.right + displayData.length * (barWidth + 6);
  const svgWidth = Math.max(visibleWidth, neededWidth);
  const height = 280;
  const chartW = svgWidth - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', svgWidth)
    .attr('height', height)
    .style('font-family', "'Roboto Mono', monospace")
    .style('font-size', '10px')
    .style('color', 'inherit');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  if (displayData.length > maxVisibleBars) {
    container.style.overflowX = 'auto';
  } else {
    container.style.overflowX = 'hidden';
  }
  const maxVal = d3.max(displayData, (d) => d.value) ?? 1;

  const xScale = d3
    .scaleBand()
    .domain(displayData.map((d) => d.label))
    .range([0, chartW])
    .padding(0.15);

  const yScale = d3
    .scaleLinear()
    .domain([0, maxVal * 1.1])
    .nice()
    .range([chartH, 0]);

  const sortedValues = displayData.map((d) => d.value).sort((a, b) => a - b);
  const median = sortedValues[Math.floor(sortedValues.length / 2)] || 1;

  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickSize(-chartW)
        .tickFormat(() => ''),
    )
    .selectAll('line')
    .style('stroke', 'rgba(var(--v-theme-on-surface), 0.06)');
  g.select('.grid .domain').remove();

  g.append('line')
    .attr('x1', 0)
    .attr('x2', chartW)
    .attr('y1', yScale(median))
    .attr('y2', yScale(median))
    .attr('stroke', '#90A4AE')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .attr('opacity', 0.7);

  g.append('text')
    .attr('x', chartW - 2)
    .attr('y', yScale(median) - 4)
    .attr('text-anchor', 'end')
    .attr('fill', '#90A4AE')
    .attr('font-size', '9px')
    .text(`median: ${median.toLocaleString()}`);

  g.selectAll('rect.bar')
    .data(displayData)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', (d) => xScale(d.label)!)
    .attr('y', (d) => yScale(d.value))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => Math.max(1, chartH - yScale(d.value)))
    .attr('rx', 2)
    .attr('fill', (d) => {
      const ratio = median > 0 ? d.value / median : 1;
      if (ratio > 5) return '#E53935';
      if (ratio > 2) return '#FB8C00';
      if (ratio > 1.3) return '#FDD835';
      if (ratio < 0.5) return '#42A5F5';
      return '#66BB6A';
    })
    .attr('opacity', 0.85);

  if (xScale.bandwidth() > 14 || displayData.length <= 15) {
    g.selectAll('text.value')
      .data(displayData)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => xScale(d.label)! + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.value) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor')
      .attr('opacity', 0.6)
      .attr('font-size', '9px')
      .text((d) => d.value.toLocaleString());
  }

  const xAxis = g
    .append('g')
    .attr('transform', `translate(0,${chartH})`)
    .call(d3.axisBottom(xScale));

  xAxis
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.7)
    .attr('transform', 'rotate(-45)')
    .attr('text-anchor', 'end')
    .attr('dx', '-0.5em')
    .attr('dy', '0.25em')
    .each(function (this: any) {
      const text = d3.select(this).text();
      if (text.length > 16) {
        d3.select(this).text(text.slice(0, 14) + '…');
      }
    });

  xAxis.selectAll('.domain').style('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');

  const yAxis = d3
    .axisLeft(yScale)
    .ticks(5)
    .tickFormat((d) => {
      const n = d as number;
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return `${n}`;
    });

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .attr('font-size', '9px')
    .style('fill', 'rgba(var(--v-theme-on-surface), 0.5)');

  g.selectAll('.domain').style('stroke', 'rgba(var(--v-theme-on-surface), 0.1)');
}

// Re-render when metric changes
watch(partitionMetric, async () => {
  if (partitionData.value.length > 0) {
    await nextTick();
    renderPartitionChart();
  }
});

// Render chart once partition data is loaded and DOM is ready
watch(
  partitionData,
  async (newData) => {
    if (newData.length > 0) {
      await nextTick();
      await nextTick();
      renderPartitionChart();
    }
  },
  { flush: 'post' },
);

// Auto-load partition data when chart becomes available
watch(
  partitionChartAvailable,
  (available) => {
    if (available && partitionData.value.length === 0) {
      loadPartitionData();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}

.health-chart-container {
  width: 100%;
  height: 200px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 1);
}

.partition-chart-container {
  width: 100%;
  height: 280px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 1);
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
