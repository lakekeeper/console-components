<template>
  <v-card variant="outlined" elevation="1">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon
          class="mr-2"
          :color="
            recommendedActions.length > 0 ? 'warning' : partitionLoading ? 'grey' : 'success'
          ">
          {{
            recommendedActions.length > 0
              ? 'mdi-lightbulb-on-outline'
              : partitionLoading
                ? 'mdi-timer-sand'
                : 'mdi-check-circle-outline'
          }}
        </v-icon>
        Recommended Actions
      </v-toolbar-title>
      <v-spacer></v-spacer>
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
              Recommended Actions Logic
            </v-card-title>
            <v-divider></v-divider>
            <v-card-text class="text-body-2">
              <p class="mb-3">
                Actions are derived by correlating snapshot summary statistics with partition
                distribution data from DuckDB's
                <code>iceberg_metadata()</code>
                . The engine cross-references file sizes, file counts, partition cardinality, and
                skew ratios to determine the
                <strong>root cause</strong>
                rather than just the symptom.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="error" class="mr-1">mdi-table-split-cell</v-icon>
                Over-partitioning
              </h4>
              <p class="mb-3">
                Detected when files are small but partition distribution is
                <strong>balanced with ~1–3 files per partition</strong>
                . Compaction cannot merge files across partition boundaries, so the fix is coarser
                partitioning. Suggests
                <code>bucket()</code>
                for
                <code>identity()</code>
                transforms,
                <code>month()</code>
                for
                <code>day()</code>
                , etc.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-merge</v-icon>
                Compaction
              </h4>
              <p class="mb-3">
                Recommended when files are small and there are
                <strong>enough files per partition</strong>
                (≥ 4) to merge effectively, or the table is unpartitioned. Also recommended when
                delete files accumulate, causing merge-on-read overhead.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-scale-unbalanced</v-icon>
                Partition Skew
              </h4>
              <p class="mb-3">
                Flagged when the largest partition is
                <strong>&gt; 5×</strong>
                the median by record count. Skewed partitions cause uneven query performance — some
                queries scan much more data than others. May indicate the partition key has a highly
                non-uniform distribution.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="warning" class="mr-1">mdi-camera-burst</v-icon>
                Snapshot Expiration
              </h4>
              <p class="mb-3">
                Triggered at
                <strong>&gt; 100</strong>
                snapshots. Each snapshot adds to the metadata file size that must be loaded before
                any query. Over 500 is critical. Use
                <code>expire_snapshots</code>
                to retain only recent history.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">
                  mdi-arrow-up-bold-circle-outline
                </v-icon>
                Format Upgrade
              </h4>
              <p class="mb-3">
                Tables on Iceberg format v1 miss row-level deletes, improved column statistics, and
                full schema evolution. Upgrading to
                <strong>v2</strong>
                is non-destructive and enables modern features.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-sort-variant</v-icon>
                Sort Order
              </h4>
              <p class="mb-3">
                For tables
                <strong>&gt; 1 GB</strong>
                without a sort order, sorting on high-selectivity columns enables min/max metadata
                pruning during query planning and improves data locality.
              </p>

              <h4 class="text-subtitle-2 mb-1">
                <v-icon size="small" color="info" class="mr-1">mdi-tray-arrow-down</v-icon>
                Write Batch Size
              </h4>
              <p>
                For unpartitioned tables with very small files (&lt; 1 MB avg), the issue is likely
                at the
                <strong>writer</strong>
                level — commits happen too frequently with too little data. Buffering more data or
                using a streaming framework that batches commits resolves this without compaction.
              </p>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn variant="text" @click="isActive.value = false">Close</v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
      <v-chip
        v-if="recommendedActions.length > 0"
        :color="
          recommendedActions.some((a) => a.severity === 'critical')
            ? 'error'
            : recommendedActions.some((a) => a.severity === 'warning')
              ? 'warning'
              : 'info'
        "
        size="small"
        variant="flat">
        {{ recommendedActions.length }} action{{ recommendedActions.length !== 1 ? 's' : '' }}
      </v-chip>
      <v-chip v-else-if="partitionLoading" color="grey" size="small" variant="flat">
        Analyzing…
      </v-chip>
      <v-chip v-else color="success" size="small" variant="flat">No issues</v-chip>
    </v-toolbar>
    <v-divider></v-divider>
    <v-list v-if="recommendedActions.length > 0" lines="three" density="compact">
      <v-list-item v-for="(action, idx) in recommendedActions" :key="idx" class="py-2">
        <template #prepend>
          <v-icon :color="action.color" class="mt-1">{{ action.icon }}</v-icon>
        </template>
        <v-list-item-title class="text-body-2 font-weight-medium text-wrap">
          {{ action.title }}
        </v-list-item-title>
        <v-list-item-subtitle
          class="text-caption text-medium-emphasis text-wrap mt-1"
          style="white-space: normal; -webkit-line-clamp: unset; line-clamp: unset">
          {{ action.description }}
        </v-list-item-subtitle>
        <div class="mt-2 d-flex flex-wrap ga-1">
          <v-chip
            v-for="(corr, ci) in action.correlations"
            :key="ci"
            size="x-small"
            variant="outlined"
            color="secondary"
            class="font-mono">
            {{ corr }}
          </v-chip>
        </div>
      </v-list-item>
      <v-list-item v-if="partitionLoading" class="py-2 text-caption text-medium-emphasis">
        <template #prepend>
          <v-progress-circular indeterminate size="16" width="2" class="mt-1"></v-progress-circular>
        </template>
        <v-list-item-title class="text-caption text-medium-emphasis">
          Partition analysis in progress — additional actions may appear…
        </v-list-item-title>
      </v-list-item>
      <v-list-item
        v-else-if="isPartitioned && (!partitionData || partitionData.length === 0)"
        class="py-2 text-caption text-medium-emphasis">
        <template #prepend>
          <v-icon size="small" color="grey">mdi-information-outline</v-icon>
        </template>
        <v-list-item-title class="text-caption text-medium-emphasis">
          Partition distribution data unavailable — some partition-specific checks were skipped.
        </v-list-item-title>
      </v-list-item>
    </v-list>
    <div v-else class="pa-4 text-center">
      <v-icon color="success" size="large" class="mb-2">mdi-check-circle-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis">No issues detected — table looks healthy.</div>
      <div
        v-if="partitionLoading"
        class="text-caption text-medium-emphasis mt-2 d-flex align-center justify-center">
        <v-progress-circular indeterminate size="12" width="2" class="mr-2"></v-progress-circular>
        Partition analysis in progress — additional actions may appear.
      </div>
      <div
        v-else-if="isPartitioned && (!partitionData || partitionData.length === 0)"
        class="text-caption text-medium-emphasis mt-2">
        Partition distribution data unavailable — some partition-specific checks were skipped.
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TableMetadata } from '../gen/iceberg/types.gen';

// --- Types ---

export interface PartitionBucket {
  partition: string;
  fileCount: number;
  totalRecords: number;
}

interface RecommendedAction {
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  color: string;
  icon: string;
  correlations: string[];
}

// --- Props ---

const props = defineProps<{
  /** The table's metadata object */
  metadata: TableMetadata;
  /** Snapshot summary from the active branch's current snapshot */
  snapshotSummary?: Record<string, string>;
  /** Partition distribution data (from DuckDB iceberg_metadata query) */
  partitionData?: PartitionBucket[];
  /** Whether the table is partitioned (from metadata partition spec) */
  isPartitioned?: boolean;
  /** Partition skew ratio (largest/median) */
  skewRatio?: number | null;
  /** Whether partition data is still loading */
  partitionLoading?: boolean;
}>();

// --- Helpers ---

const summaryNum = (...keys: string[]): number | null => {
  if (!props.snapshotSummary) return null;
  for (const key of keys) {
    const val = props.snapshotSummary[key];
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

// --- Recommended Actions ---

const recommendedActions = computed<RecommendedAction[]>(() => {
  if (!props.metadata || !props.snapshotSummary) return [];
  const actions: RecommendedAction[] = [];

  // Gather health metrics
  const dataFiles = summaryNum('total-data-files-count', 'total-data-files');
  const totalSize = summaryNum('total-files-size-in-bytes', 'total-files-size');
  const totalRecords = summaryNum('total-records-count', 'total-records');
  const deleteFiles = summaryNum('total-delete-files-count', 'total-delete-files');
  const totalSnapshotCount = props.metadata.snapshots?.length ?? 0;
  const avgFileSize = dataFiles && totalSize && dataFiles > 0 ? totalSize / dataFiles : null;
  const hasSmallFiles =
    avgFileSize !== null && avgFileSize < 8 * 1024 * 1024 && (dataFiles ?? 0) > 1;
  const hasVerySmallFiles =
    avgFileSize !== null && avgFileSize < 1024 * 1024 && (dataFiles ?? 0) > 1;

  // Partition context
  const partitions = props.partitionData ?? [];
  const partCount = partitions.length;
  const isPartitioned = props.isPartitioned ?? false;
  const skew = props.skewRatio ?? null;
  // A skew < 5x means the distribution is "balanced enough" that compaction across
  // partition boundaries won't help — the root cause is too many partitions.
  // This aligns with the dedicated skew action threshold (> 5x).
  const isBalanced = skew === null || skew < 5;
  const filesPerPartition = partCount > 0 && dataFiles ? dataFiles / partCount : 0;
  const avgRecordsPerPartition = partCount > 0 && totalRecords ? totalRecords / partCount : 0;

  // Partition spec info
  const specs = props.metadata['partition-specs'];
  const defaultSpecId = props.metadata['default-spec-id'];
  const currentSpec = specs
    ? (specs.find((s: any) => s['spec-id'] === defaultSpecId) ?? specs[specs.length - 1])
    : null;
  const partitionFields = currentSpec?.fields ?? [];
  const partitionFieldNames = partitionFields
    .map((f: any) => `${f.transform}(${f.name || `col-${f['source-id']}`})`)
    .join(', ');
  const hasIdentityTransform = partitionFields.some((f: any) => f.transform === 'identity');
  const hasDayTransform = partitionFields.some((f: any) => f.transform === 'day');

  // ── 1. Over-partitioning: small files + many partitions + balanced + ~1 file/partition
  if (hasSmallFiles && isPartitioned && partCount > 0 && isBalanced && filesPerPartition < 4) {
    const coarserSuggestion = hasIdentityTransform
      ? 'Replace identity() transforms with bucket() or truncate() to reduce cardinality.'
      : hasDayTransform
        ? 'Consider month() or year() instead of day() to produce fewer, larger partitions.'
        : 'Reduce partition cardinality by using coarser transforms (e.g., month instead of day, bucket instead of identity).';
    const skewDesc = skew !== null ? `${skew.toFixed(1)}x skew` : 'no extreme skew';
    actions.push({
      title: 'Over-partitioned — repartition with coarser granularity',
      description: `${partCount} partitions produce only ~${filesPerPartition.toFixed(1)} file${filesPerPartition >= 1.5 ? 's' : ''}/partition (avg ${formatBytes(avgFileSize!)}). Distribution shows ${skewDesc}, so compaction cannot merge files across partition boundaries. ${coarserSuggestion}`,
      severity: hasVerySmallFiles ? 'critical' : 'warning',
      color: hasVerySmallFiles ? 'error' : 'warning',
      icon: 'mdi-table-split-cell',
      correlations: [
        `${partCount} partitions, ${dataFiles} files → ${filesPerPartition.toFixed(1)} files/partition`,
        `Avg file size: ${formatBytes(avgFileSize!)} (target: 128–512 MB)`,
        skew !== null ? `Skew: ${skew.toFixed(1)}x (compaction ineffective)` : '',
        `Current partition: ${partitionFieldNames}`,
        avgRecordsPerPartition > 0
          ? `Avg records/partition: ${avgRecordsPerPartition.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : '',
      ].filter(Boolean),
    });
  }

  // ── 1b. Over-partitioning (no DuckDB data): small files + partitioned with identity transform
  // When partition distribution data is unavailable, we can still flag likely over-partitioning
  // based on identity transforms which typically produce high-cardinality partitions
  else if (
    hasSmallFiles &&
    isPartitioned &&
    partCount === 0 &&
    !props.partitionLoading &&
    hasIdentityTransform
  ) {
    actions.push({
      title: 'Likely over-partitioned — consider coarser granularity',
      description: `${dataFiles} small files (avg ${formatBytes(avgFileSize!)}) on a table partitioned by ${partitionFieldNames}. identity() transforms often produce high-cardinality partitions where compaction is ineffective. Consider bucket() or truncate() instead.`,
      severity: 'warning',
      color: 'warning',
      icon: 'mdi-table-split-cell',
      correlations: [
        `${dataFiles} data files, avg ${formatBytes(avgFileSize!)}`,
        `Current partition: ${partitionFieldNames}`,
        'Partition distribution unavailable — estimate based on partition spec',
      ],
    });
  }

  // ── 2. Compaction effective: small files + (unpartitioned OR enough files per partition to merge)
  else if (hasSmallFiles && (!isPartitioned || (partCount > 0 && filesPerPartition >= 4))) {
    const skewNote =
      skew !== null && skew > 2
        ? ` Partition skew is ${skew.toFixed(1)}x — focus compaction on the largest partitions first.`
        : '';
    actions.push({
      title: 'Run compaction to merge small files',
      description: `${dataFiles} files averaging ${formatBytes(avgFileSize!)} can be merged${isPartitioned ? ` (~${filesPerPartition.toFixed(0)} files/partition)` : ''}.${skewNote} Target 128–512 MB per file for optimal read performance.`,
      severity: hasVerySmallFiles ? 'critical' : 'warning',
      color: hasVerySmallFiles ? 'error' : 'warning',
      icon: 'mdi-merge',
      correlations: [
        `${dataFiles} data files, avg ${formatBytes(avgFileSize!)}`,
        isPartitioned
          ? `${partCount} partitions, ~${filesPerPartition.toFixed(0)} files/partition`
          : 'Table is unpartitioned',
        skew !== null ? `Skew: ${skew.toFixed(1)}x` : '',
      ].filter(Boolean),
    });
  }

  // ── 3. Delete file cleanup (independent of file size issues)
  if (deleteFiles !== null && deleteFiles > 0) {
    const deleteRatio = dataFiles ? deleteFiles / dataFiles : deleteFiles;
    actions.push({
      title: 'Compact to merge delete files',
      description: `${deleteFiles} delete file${deleteFiles > 1 ? 's' : ''} cause merge-on-read overhead at query time. Compaction will merge deletes into data files, eliminating the read penalty.`,
      severity: deleteRatio > 0.5 || deleteFiles > 100 ? 'critical' : 'warning',
      color: deleteRatio > 0.5 || deleteFiles > 100 ? 'error' : 'warning',
      icon: 'mdi-delete-sweep-outline',
      correlations: [
        `${deleteFiles} delete files / ${dataFiles ?? '?'} data files (ratio: ${deleteRatio.toFixed(2)})`,
      ],
    });
  }

  // ── 4. Partition skew with large partitions
  if (skew !== null && skew > 5 && isPartitioned && !hasSmallFiles) {
    const largest =
      partitions.length > 0
        ? partitions.reduce((a, b) => (a.totalRecords > b.totalRecords ? a : b))
        : null;
    actions.push({
      title: 'Rebalance skewed partitions',
      description: `Partition skew is ${skew.toFixed(1)}x (largest/median).${largest ? ` Largest partition: ${largest.partition} with ${largest.totalRecords.toLocaleString()} records.` : ''} Skewed partitions cause uneven query performance and resource utilization.`,
      severity: 'warning',
      color: 'warning',
      icon: 'mdi-scale-unbalanced',
      correlations: [
        `Skew ratio: ${skew.toFixed(1)}x (> 5x is high)`,
        `${partCount} partitions`,
        largest
          ? `Largest: ${largest.partition} (${largest.totalRecords.toLocaleString()} records, ${largest.fileCount} files)`
          : '',
      ].filter(Boolean),
    });
  }

  // ── 5. Snapshot expiration
  if (totalSnapshotCount > 100) {
    actions.push({
      title: 'Expire old snapshots',
      description: `${totalSnapshotCount} snapshots accumulate metadata overhead. Run expire_snapshots to retain only recent snapshots and reduce metadata file sizes and load times.`,
      severity: totalSnapshotCount > 500 ? 'critical' : 'warning',
      color: totalSnapshotCount > 500 ? 'error' : 'warning',
      icon: 'mdi-camera-burst',
      correlations: [
        `${totalSnapshotCount} total snapshots`,
        totalSnapshotCount > 500
          ? 'Metadata file sizes may be significantly impacted'
          : 'Consider retaining last 10–50 snapshots',
      ],
    });
  }

  // ── 6. Format version upgrade
  const formatVersion = props.metadata['format-version'];
  if (formatVersion !== undefined && formatVersion < 2) {
    actions.push({
      title: 'Upgrade to Iceberg format v2',
      description:
        'Format v1 lacks row-level deletes, improved column statistics, and full schema evolution. Upgrading to v2 enables modern Iceberg features.',
      severity: 'info',
      color: 'info',
      icon: 'mdi-arrow-up-bold-circle-outline',
      correlations: [`Current format: v${formatVersion}`],
    });
  }

  // ── 7. Sort order recommendation for large unsorted tables
  const sortOrders = props.metadata['sort-orders'];
  if (sortOrders && totalSize !== null && totalSize > 1024 * 1024 * 1024) {
    const defaultSortId = props.metadata['default-sort-order-id'];
    const currentSort =
      sortOrders.find((s: any) => s['order-id'] === defaultSortId) ??
      sortOrders[sortOrders.length - 1];
    const isUnsorted = !currentSort?.fields || currentSort.fields.length === 0;
    if (isUnsorted) {
      actions.push({
        title: 'Add sort order for query optimization',
        description: `Table is ${formatBytes(totalSize)} with no sort order. Adding a sort order on frequently-queried columns enables min/max pruning during query planning and improves data locality.`,
        severity: 'info',
        color: 'info',
        icon: 'mdi-sort-variant',
        correlations: [
          `Table size: ${formatBytes(totalSize)}`,
          isPartitioned ? `Partition: ${partitionFieldNames}` : 'Unpartitioned',
          'Sort on high-selectivity columns used in WHERE clauses',
        ],
      });
    }
  }

  // ── 8. Unpartitioned with many files
  if (!isPartitioned && dataFiles !== null && dataFiles > 100 && !hasSmallFiles) {
    actions.push({
      title: 'Consider adding partitioning',
      description: `Table has ${dataFiles.toLocaleString()} data files but no partition spec. Partitioning on a commonly-filtered column (e.g., date, region) can significantly improve query performance by enabling partition pruning.`,
      severity: 'info',
      color: 'info',
      icon: 'mdi-table-split-cell',
      correlations: [
        `${dataFiles} data files, ${formatBytes(totalSize ?? 0)} total`,
        'No partition spec defined',
      ],
    });
  }

  // ── 9. Write batch size too small (unpartitioned + very small files)
  if (hasVerySmallFiles && !isPartitioned) {
    actions.push({
      title: 'Increase write batch sizes',
      description: `Files average ${formatBytes(avgFileSize!)} — indicating very small write commits. Buffer more data before committing (target: 128–512 MB per write) or use a streaming framework that batches commits.`,
      severity: 'warning',
      color: 'warning',
      icon: 'mdi-tray-arrow-down',
      correlations: [
        `Avg file size: ${formatBytes(avgFileSize!)}`,
        `${dataFiles} data files`,
        'Unpartitioned — each commit creates undersized files',
      ],
    });
  }

  return actions;
});
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.8125rem;
}

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
