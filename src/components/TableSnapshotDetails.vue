<template>
  <v-card>
    <v-card-title class="d-flex align-center text-subtitle-1 snapshot-header">
      <v-icon class="mr-2">mdi-camera-outline</v-icon>
      {{ title || 'Snapshot Details' }}
      <v-spacer></v-spacer>
      <slot name="append"></slot>
    </v-card-title>
    <v-divider></v-divider>

    <v-card-text v-if="!snapshot" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1">mdi-camera-off-outline</v-icon>
      <div class="text-h6 mt-2 text-grey-lighten-1">No snapshot available</div>
    </v-card-text>

    <v-list v-else density="compact">
      <!-- Snapshot ID -->
      <v-list-item>
        <v-list-item-title>Snapshot ID</v-list-item-title>
        <v-list-item-subtitle class="d-flex align-center">
          <span class="mr-2 font-mono">{{ snapshot['snapshot-id'] }}</span>
          <v-btn
            icon="mdi-content-copy"
            size="small"
            variant="flat"
            @click="copyToClipboard(String(snapshot['snapshot-id']))"></v-btn>
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Sequence Number -->
      <v-list-item v-if="snapshot['sequence-number']">
        <v-list-item-title>Sequence Number</v-list-item-title>
        <v-list-item-subtitle>
          {{ snapshot['sequence-number'] }}
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Schema ID -->
      <v-list-item v-if="snapshot['schema-id']">
        <v-list-item-title>Schema ID</v-list-item-title>
        <v-list-item-subtitle>
          {{ snapshot['schema-id'] }}
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Timestamp -->
      <v-list-item v-if="snapshot['timestamp-ms']">
        <v-list-item-title>Timestamp</v-list-item-title>
        <v-list-item-subtitle>
          {{ formatTimestamp(snapshot['timestamp-ms']) }}
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Parent Snapshot -->
      <v-list-item v-if="snapshot['parent-snapshot-id']">
        <v-list-item-title>Parent Snapshot</v-list-item-title>
        <v-list-item-subtitle class="d-flex align-center">
          <span class="mr-2 font-mono">{{ snapshot['parent-snapshot-id'] }}</span>
          <v-btn
            icon="mdi-content-copy"
            size="small"
            variant="flat"
            @click="copyToClipboard(String(snapshot['parent-snapshot-id']))"></v-btn>
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Operation -->
      <v-list-item v-if="snapshot.summary?.operation">
        <v-list-item-title>Operation</v-list-item-title>
        <v-list-item-subtitle>
          <v-chip
            :color="getOperationColor(snapshot.summary.operation)"
            size="small"
            variant="flat">
            {{ snapshot.summary.operation }}
          </v-chip>
        </v-list-item-subtitle>
      </v-list-item>

      <!-- Manifest List -->
      <v-list-item v-if="snapshot['manifest-list']">
        <v-list-item-title>Manifest List</v-list-item-title>
        <v-list-item-subtitle class="d-flex align-center">
          <span class="mr-2 font-mono text-wrap">
            {{ snapshot['manifest-list'] }}
          </span>
          <v-btn
            icon="mdi-content-copy"
            size="small"
            variant="flat"
            @click="copyToClipboard(snapshot['manifest-list'])"></v-btn>
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <!-- Summary — always visible: highlights + remaining fields -->
    <template v-if="(highlights.length || otherEntries.length) && showSummary">
      <v-divider></v-divider>
      <v-card-text>
        <div class="text-subtitle-2 mb-3 d-flex align-center">
          <v-icon size="18" class="mr-1">mdi-clipboard-text-outline</v-icon>
          Summary
        </div>

        <v-row v-if="highlights.length" dense class="mb-2">
          <v-col v-for="h in highlights" :key="h.label" cols="6" sm="3">
            <v-sheet border rounded="lg" class="pa-3 h-100">
              <div class="d-flex align-center text-caption text-medium-emphasis mb-1">
                <v-icon size="14" class="mr-1">{{ h.icon }}</v-icon>
                {{ h.label }}
              </div>
              <div class="text-h6 font-weight-medium summary-value">{{ h.value }}</div>
              <div v-if="h.added || h.deleted" class="text-caption">
                <span v-if="h.added" class="text-success">+{{ h.added }}</span>
                <span v-if="h.deleted" class="text-error ml-1">−{{ h.deleted }}</span>
              </div>
            </v-sheet>
          </v-col>
        </v-row>

        <template v-if="otherEntries.length">
          <div class="text-caption text-medium-emphasis text-uppercase mt-3 mb-1">All fields</div>
          <v-table density="compact" class="summary-table">
            <tbody>
              <tr v-for="e in otherEntries" :key="e.key">
                <td class="text-medium-emphasis" style="width: 45%">
                  {{ formatSummaryKey(e.key) }}
                </td>
                <td class="font-mono summary-value">{{ e.display }}</td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card-text>
    </template>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFunctions } from '../plugins/functions';
import type { Snapshot } from '../gen/iceberg/types.gen';

// Props
const props = withDefaults(
  defineProps<{
    snapshot?: Snapshot;
    title?: string;
    showSummary?: boolean;
  }>(),
  {
    showSummary: true,
  },
);

// Composables
const functions = useFunctions();

const summary = computed<Record<string, any>>(
  () => (props.snapshot?.summary as Record<string, any>) ?? {},
);
const has = (k: string) => summary.value[k] !== undefined;
const n = (k: string) => {
  const v = Number(summary.value[k]);
  return Number.isFinite(v) ? v : 0;
};
// Format integer counters string-safely so i64 values above
// Number.MAX_SAFE_INTEGER are grouped without precision loss.
const fmtCount = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '0';
  const s = String(v);
  if (/^-?\d+$/.test(s)) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = Number(s);
  return Number.isFinite(num) ? num.toLocaleString() : '0';
};
// Count formatter keyed by summary field (preserves precision from the raw string).
const countFmt = (k: string) => fmtCount(summary.value[k]);
const fmtBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
};

// Prominent metrics with added/deleted deltas
const highlights = computed(() => {
  const out: Array<{
    label: string;
    value: string;
    icon: string;
    added: string;
    deleted: string;
  }> = [];
  // Show the cumulative total when the writer reports it; otherwise fall back to
  // the per-commit "added" count (DuckDB writes added-* but not always total-*),
  // and only "—" when neither exists — never a misleading 0.
  const add = (
    label: string,
    icon: string,
    totalKey: string,
    addedKey: string,
    deletedKey: string,
    fmt: (k: string) => string,
  ) => {
    const hasTotal = has(totalKey);
    const value = hasTotal ? fmt(totalKey) : has(addedKey) ? fmt(addedKey) : '—';
    out.push({
      label,
      icon,
      value,
      // Only show delta badges alongside a real cumulative total.
      added: hasTotal && has(addedKey) && n(addedKey) > 0 ? fmt(addedKey) : '',
      deleted: hasTotal && has(deletedKey) && n(deletedKey) > 0 ? fmt(deletedKey) : '',
    });
  };
  if (has('total-records') || has('added-records') || has('deleted-records'))
    add('Records', 'mdi-table-row', 'total-records', 'added-records', 'deleted-records', countFmt);
  if (has('total-data-files') || has('added-data-files') || has('deleted-data-files'))
    add(
      'Data files',
      'mdi-file-multiple-outline',
      'total-data-files',
      'added-data-files',
      'deleted-data-files',
      countFmt,
    );
  if (has('total-delete-files') || has('added-delete-files') || has('removed-delete-files'))
    add(
      'Delete files',
      'mdi-file-remove-outline',
      'total-delete-files',
      'added-delete-files',
      'removed-delete-files',
      countFmt,
    );
  if (
    has('total-position-deletes') ||
    has('added-position-deletes') ||
    has('removed-position-deletes')
  )
    add(
      'Positional deletes',
      'mdi-file-document-minus-outline',
      'total-position-deletes',
      'added-position-deletes',
      'removed-position-deletes',
      countFmt,
    );
  if (
    has('total-equality-deletes') ||
    has('added-equality-deletes') ||
    has('removed-equality-deletes')
  )
    add(
      'Equality deletes',
      'mdi-equal-box-outline',
      'total-equality-deletes',
      'added-equality-deletes',
      'removed-equality-deletes',
      countFmt,
    );
  if (has('total-files-size') || has('added-files-size') || has('removed-files-size')) {
    const bytes = (k: string) => fmtBytes(n(k));
    add(
      'Total size',
      'mdi-database-outline',
      'total-files-size',
      'added-files-size',
      'removed-files-size',
      bytes,
    );
  }
  return out;
});

// The complete summary as a key/value table (every field, like Snapshot Compare).
const otherEntries = computed(() => {
  const s = summary.value;
  return Object.keys(s)
    .filter((key) => key !== 'operation')
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const raw = s[key];
      return {
        key,
        display: /size|bytes/.test(key)
          ? fmtBytes(n(key))
          : /^-?\d+$/.test(String(raw))
            ? fmtCount(raw)
            : formatSummaryValue(raw),
      };
    });
});

// Methods
const copyToClipboard = (text: string) => {
  functions.copyToClipboard(text);
};

const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

const formatSummaryKey = (key: string): string => {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatSummaryValue = (value: any): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (typeof value === 'number') {
    // Format large numbers with commas
    if (value >= 1000) {
      return value.toLocaleString();
    }
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'string') {
    // Check if it's a timestamp
    if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return new Date(value).toLocaleString();
    }
    return value;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const getOperationColor = (operation: string): string => {
  const operationColors: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };

  return operationColors[operation?.toLowerCase()] || 'default';
};
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
}
.snapshot-header {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.summary-value {
  word-break: break-word;
}
</style>
