<template>
  <v-dialog v-model="dialogVisible" max-width="1100" scrollable>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-compare-horizontal"
        :disabled="snapshots.length < 2">
        Compare Snapshots
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-compare-horizontal</v-icon>
        Snapshot Comparison
      </v-card-title>
      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <!-- Snapshot selectors -->
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="leftSnapshotId"
              :items="snapshotItems"
              item-title="label"
              item-value="id"
              label="Base snapshot (older)"
              variant="outlined"
              density="compact"
              hide-details
              prepend-inner-icon="mdi-camera-outline"></v-select>
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="rightSnapshotId"
              :items="rightSnapshotItems"
              item-title="label"
              item-value="id"
              label="Compare snapshot (newer)"
              variant="outlined"
              density="compact"
              hide-details
              :disabled="!leftSnapshotId"
              prepend-inner-icon="mdi-camera-outline"></v-select>
          </v-col>
        </v-row>

        <!-- No selection state -->
        <div v-if="!leftSnapshot || !rightSnapshot" class="text-center pa-8 text-medium-emphasis">
          <v-icon size="48" color="grey-lighten-1">mdi-compare-horizontal</v-icon>
          <div class="text-body-1 mt-2">Select two snapshots to compare</div>
        </div>

        <!-- Same snapshot selected -->
        <div
          v-else-if="leftSnapshotId === rightSnapshotId"
          class="text-center pa-8 text-medium-emphasis">
          <v-icon size="48" color="warning">mdi-equal</v-icon>
          <div class="text-body-1 mt-2">Same snapshot selected — pick two different ones</div>
        </div>

        <!-- Comparison view -->
        <div v-else class="mt-4">
          <!-- Delta summary cards -->
          <v-row>
            <v-col v-for="metric in deltaMetrics" :key="metric.key" cols="6" sm="4" md="2">
              <v-card variant="tonal" :color="metric.color" class="text-center pa-2">
                <div class="text-caption text-medium-emphasis">{{ metric.label }}</div>
                <div class="text-h6 font-weight-bold">{{ metric.display }}</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Side-by-side details -->
          <v-row class="mt-4">
            <v-col cols="12" md="6">
              <v-card variant="outlined">
                <v-toolbar color="transparent" density="compact" flat>
                  <v-toolbar-title class="text-subtitle-2">
                    <v-icon size="small" class="mr-1">mdi-camera-outline</v-icon>
                    Base — #{{ leftSnapshot['sequence-number'] }}
                  </v-toolbar-title>
                  <v-chip
                    v-if="leftSnapshot.summary?.operation"
                    :color="getOperationColor(leftSnapshot.summary.operation)"
                    size="x-small"
                    variant="flat">
                    {{ leftSnapshot.summary.operation }}
                  </v-chip>
                </v-toolbar>
                <v-divider></v-divider>
                <v-table density="compact" class="snapshot-table" fixed-header height="280px">
                  <tbody>
                    <tr v-for="row in leftRows" :key="row.key">
                      <td class="font-weight-medium" style="width: 160px">{{ row.label }}</td>
                      <td class="font-mono" :class="row.changed ? 'text-warning' : ''">
                        {{ row.value }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-col>

            <v-col cols="12" md="6">
              <v-card variant="outlined">
                <v-toolbar color="transparent" density="compact" flat>
                  <v-toolbar-title class="text-subtitle-2">
                    <v-icon size="small" class="mr-1">mdi-camera-outline</v-icon>
                    Compare — #{{ rightSnapshot['sequence-number'] }}
                  </v-toolbar-title>
                  <v-chip
                    v-if="rightSnapshot.summary?.operation"
                    :color="getOperationColor(rightSnapshot.summary.operation)"
                    size="x-small"
                    variant="flat">
                    {{ rightSnapshot.summary.operation }}
                  </v-chip>
                </v-toolbar>
                <v-divider></v-divider>
                <v-table density="compact" class="snapshot-table" fixed-header height="280px">
                  <tbody>
                    <tr v-for="row in rightRows" :key="row.key">
                      <td class="font-weight-medium" style="width: 160px">{{ row.label }}</td>
                      <td class="font-mono" :class="row.changed ? 'text-warning' : ''">
                        {{ row.value }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-col>
          </v-row>

          <!-- Summary diff table -->
          <v-row class="mt-2">
            <v-col cols="12">
              <v-card variant="outlined">
                <v-toolbar color="transparent" density="compact" flat>
                  <v-toolbar-title class="text-subtitle-2">
                    <v-icon size="small" class="mr-1">mdi-swap-horizontal</v-icon>
                    Summary Changes
                  </v-toolbar-title>
                </v-toolbar>
                <v-divider></v-divider>
                <v-table density="compact" fixed-header height="300px">
                  <thead>
                    <tr>
                      <th style="width: 200px">Property</th>
                      <th>Base (#{{ leftSnapshot['sequence-number'] }})</th>
                      <th>Compare (#{{ rightSnapshot['sequence-number'] }})</th>
                      <th style="width: 120px">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in summaryDiffRows"
                      :key="row.key"
                      :class="row.changed ? '' : 'text-medium-emphasis'">
                      <td class="font-weight-medium">{{ row.label }}</td>
                      <td class="font-mono">{{ row.leftValue }}</td>
                      <td class="font-mono">{{ row.rightValue }}</td>
                      <td>
                        <v-chip
                          v-if="row.delta"
                          :color="row.deltaColor"
                          size="x-small"
                          variant="flat">
                          {{ row.delta }}
                        </v-chip>
                        <span v-else-if="row.changed" class="text-caption text-warning">
                          changed
                        </span>
                        <span v-else class="text-caption text-medium-emphasis">—</span>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-col>
          </v-row>

          <!-- Schema diff (only when schemas differ) -->
          <v-row v-if="schemaDiff" class="mt-2">
            <v-col cols="12">
              <v-card variant="outlined">
                <v-toolbar color="transparent" density="compact" flat>
                  <v-toolbar-title class="text-subtitle-2">
                    <v-icon size="small" class="mr-1">mdi-file-tree</v-icon>
                    Schema Changes
                  </v-toolbar-title>
                  <v-chip size="x-small" variant="flat" color="warning" class="ml-2">
                    Schema {{ schemaDiff.fromId }} → {{ schemaDiff.toId }}
                  </v-chip>
                </v-toolbar>
                <v-divider></v-divider>
                <v-table density="compact" fixed-header height="300px">
                  <thead>
                    <tr>
                      <th style="width: 30px"></th>
                      <th>Field</th>
                      <th>Type</th>
                      <th style="width: 80px">Required</th>
                      <th style="width: 100px">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="field in schemaDiff.fields"
                      :key="field.id"
                      :class="field.statusClass">
                      <td>
                        <v-icon :color="field.statusColor" size="x-small">
                          {{ field.icon }}
                        </v-icon>
                      </td>
                      <td>{{ field.name }}</td>
                      <td class="font-mono" style="font-size: 0.85rem">
                        {{ field.type }}
                        <span v-if="field.typeChanged" class="text-caption text-warning ml-1">
                          (was: {{ field.oldType }})
                        </span>
                      </td>
                      <td>
                        <v-icon v-if="field.required" color="error" size="x-small">
                          mdi-asterisk
                        </v-icon>
                      </td>
                      <td>
                        <v-chip :color="field.statusColor" size="x-small" variant="flat">
                          {{ field.status }}
                        </v-chip>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" text="Close" @click="dialogVisible = false"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Snapshot } from '../gen/iceberg/types.gen';

const props = defineProps<{
  snapshots: Snapshot[];
  schemas?: any[];
}>();

const dialogVisible = ref(false);
const leftSnapshotId = ref<string | null>(null);
const rightSnapshotId = ref<string | null>(null);

// Build select items sorted by sequence number (oldest first for left picker)
const snapshotItems = computed(() => {
  const sorted = [...props.snapshots].sort(
    (a, b) => (a['sequence-number'] || 0) - (b['sequence-number'] || 0),
  );
  return sorted.map((s) => ({
    id: String(s['snapshot-id']),
    label: `#${s['sequence-number']} — ${s.summary?.operation || '?'} — ${s['timestamp-ms'] ? new Date(s['timestamp-ms']).toLocaleString() : '?'}`,
    seq: s['sequence-number'] ?? 0,
  }));
});

// Right dropdown: only snapshots with higher sequence number than left
const rightSnapshotItems = computed(() => {
  if (!leftSnapshotId.value) return [];
  const leftItem = snapshotItems.value.find((i) => i.id === leftSnapshotId.value);
  if (!leftItem) return [];
  return snapshotItems.value.filter((i) => i.seq > leftItem.seq);
});

// Clear right selection when left changes and right is no longer valid
watch(leftSnapshotId, () => {
  if (rightSnapshotId.value) {
    const stillValid = rightSnapshotItems.value.some((i) => i.id === rightSnapshotId.value);
    if (!stillValid) rightSnapshotId.value = null;
  }
});

const leftSnapshot = computed(
  () => props.snapshots.find((s) => String(s['snapshot-id']) === leftSnapshotId.value) || null,
);
const rightSnapshot = computed(
  () => props.snapshots.find((s) => String(s['snapshot-id']) === rightSnapshotId.value) || null,
);

// ─── Summary helpers ─────────────────────────────────────────────────────────

function getNumeric(summary: Record<string, any> | undefined, key: string): number | null {
  if (!summary || summary[key] === undefined) return null;
  const v = Number(summary[key]);
  return isNaN(v) ? null : v;
}

function delta(
  left: number | null,
  right: number | null,
): { display: string; color: string } | null {
  if (left === null || right === null) return null;
  const d = right - left;
  if (d === 0) return { display: '0', color: 'default' };
  const sign = d > 0 ? '+' : '';
  const color = d > 0 ? 'success' : 'error';
  return { display: `${sign}${d >= 1000 || d <= -1000 ? d.toLocaleString() : d}`, color };
}

// ─── Delta summary metrics ───────────────────────────────────────────────────

const deltaMetrics = computed(() => {
  if (!leftSnapshot.value || !rightSnapshot.value) return [];
  const ls = leftSnapshot.value.summary;
  const rs = rightSnapshot.value.summary;

  const metrics: { key: string; label: string; display: string; color: string }[] = [];

  const pairs: [string, string][] = [
    ['total-records', 'Records'],
    ['total-data-files', 'Data Files'],
    ['total-files-size', 'File Size (bytes)'],
    ['total-delete-files', 'Delete Files'],
    ['total-equality-deletes', 'Eq. Deletes'],
    ['total-position-deletes', 'Pos. Deletes'],
  ];

  for (const [key, label] of pairs) {
    const l = getNumeric(ls, key);
    const r = getNumeric(rs, key);
    const d = delta(l, r);
    if (d) {
      metrics.push({ key, label, display: d.display, color: d.color });
    }
  }
  return metrics;
});

// ─── Row builders ────────────────────────────────────────────────────────────

interface InfoRow {
  key: string;
  label: string;
  value: string;
  changed: boolean;
}

function buildInfoRows(snap: Snapshot, other: Snapshot): InfoRow[] {
  const rows: InfoRow[] = [
    {
      key: 'id',
      label: 'Snapshot ID',
      value: String(snap['snapshot-id']),
      changed: false,
    },
    {
      key: 'seq',
      label: 'Sequence',
      value: String(snap['sequence-number'] ?? '—'),
      changed: snap['sequence-number'] !== other['sequence-number'],
    },
    {
      key: 'ts',
      label: 'Timestamp',
      value: snap['timestamp-ms'] ? new Date(snap['timestamp-ms']).toLocaleString() : '—',
      changed: snap['timestamp-ms'] !== other['timestamp-ms'],
    },
    {
      key: 'op',
      label: 'Operation',
      value: snap.summary?.operation || '—',
      changed: snap.summary?.operation !== other.summary?.operation,
    },
    {
      key: 'schema',
      label: 'Schema ID',
      value: String(snap['schema-id'] ?? '—'),
      changed: snap['schema-id'] !== other['schema-id'],
    },
    {
      key: 'parent',
      label: 'Parent ID',
      value: snap['parent-snapshot-id'] ? String(snap['parent-snapshot-id']) : '—',
      changed:
        String(snap['parent-snapshot-id'] ?? '') !== String(other['parent-snapshot-id'] ?? ''),
    },
  ];
  return rows;
}

const leftRows = computed(() => {
  if (!leftSnapshot.value || !rightSnapshot.value) return [];
  return buildInfoRows(leftSnapshot.value, rightSnapshot.value);
});

const rightRows = computed(() => {
  if (!leftSnapshot.value || !rightSnapshot.value) return [];
  return buildInfoRows(rightSnapshot.value, leftSnapshot.value);
});

// ─── Summary diff ────────────────────────────────────────────────────────────

interface SummaryDiffRow {
  key: string;
  label: string;
  leftValue: string;
  rightValue: string;
  changed: boolean;
  delta: string | null;
  deltaColor: string;
}

const summaryDiffRows = computed((): SummaryDiffRow[] => {
  if (!leftSnapshot.value || !rightSnapshot.value) return [];
  const ls: Record<string, any> = leftSnapshot.value.summary || {};
  const rs: Record<string, any> = rightSnapshot.value.summary || {};

  const allKeys = new Set([...Object.keys(ls), ...Object.keys(rs)]);
  // Sort: numeric-valued keys first, then alphabetical
  const sorted = [...allKeys].sort((a, b) => {
    const aNum = !isNaN(Number(ls[a])) || !isNaN(Number(rs[a]));
    const bNum = !isNaN(Number(ls[b])) || !isNaN(Number(rs[b]));
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return a.localeCompare(b);
  });

  return sorted.map((key) => {
    const lv = ls[key] ?? null;
    const rv = rs[key] ?? null;
    const leftStr = lv !== null ? String(lv) : '—';
    const rightStr = rv !== null ? String(rv) : '—';
    const changed = leftStr !== rightStr;

    let deltaStr: string | null = null;
    let deltaColor = 'default';
    const ln = Number(lv);
    const rn = Number(rv);
    if (!isNaN(ln) && !isNaN(rn) && changed) {
      const d = delta(ln, rn);
      if (d) {
        deltaStr = d.display;
        deltaColor = d.color;
      }
    }

    return {
      key,
      label: formatSummaryKey(key),
      leftValue: formatNumericIfPossible(leftStr),
      rightValue: formatNumericIfPossible(rightStr),
      changed,
      delta: deltaStr,
      deltaColor,
    };
  });
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSummaryKey(key: string): string {
  return key
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatNumericIfPossible(val: string): string {
  if (val === '—') return val;
  const n = Number(val);
  if (!isNaN(n) && n >= 1000) return n.toLocaleString();
  return val;
}

function getOperationColor(operation: string): string {
  const colors: Record<string, string> = {
    append: 'success',
    overwrite: 'warning',
    delete: 'error',
    replace: 'primary',
    merge: 'info',
    optimize: 'secondary',
    expire: 'orange',
    compact: 'teal',
  };
  return colors[operation?.toLowerCase()] || 'default';
}

// ─── Schema diff ─────────────────────────────────────────────────────────────

function getSchemaById(schemaId: number | undefined) {
  if (schemaId == null || !props.schemas?.length) return null;
  return props.schemas.find((s: any) => s['schema-id'] === schemaId) || null;
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

interface SchemaDiffField {
  id: number;
  name: string;
  type: string;
  oldType?: string;
  typeChanged: boolean;
  required: boolean;
  status: string;
  statusColor: string;
  statusClass: string;
  icon: string;
}

const schemaDiff = computed(() => {
  if (!leftSnapshot.value || !rightSnapshot.value) return null;
  const leftSchemaId = leftSnapshot.value['schema-id'] ?? 0;
  const rightSchemaId = rightSnapshot.value['schema-id'] ?? 0;
  if (leftSchemaId === rightSchemaId) return null;

  const leftSchema = getSchemaById(leftSchemaId);
  const rightSchema = getSchemaById(rightSchemaId);
  if (!leftSchema && !rightSchema) return null;

  const leftFields: any[] = leftSchema?.fields || [];
  const rightFields: any[] = rightSchema?.fields || [];
  const leftMap = new Map(leftFields.map((f: any) => [f.id, f]));
  const rightMap = new Map(rightFields.map((f: any) => [f.id, f]));

  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const fields: SchemaDiffField[] = [];

  for (const id of allIds) {
    const lf = leftMap.get(id);
    const rf = rightMap.get(id);

    if (rf && !lf) {
      // Added in right
      fields.push({
        id,
        name: rf.name,
        type: getFieldTypeString(rf.type),
        typeChanged: false,
        required: rf.required || false,
        status: 'added',
        statusColor: 'success',
        statusClass: 'text-success',
        icon: getFieldIcon(rf),
      });
    } else if (lf && !rf) {
      // Removed in right
      fields.push({
        id,
        name: lf.name,
        type: getFieldTypeString(lf.type),
        typeChanged: false,
        required: lf.required || false,
        status: 'removed',
        statusColor: 'error',
        statusClass: 'text-error text-decoration-line-through',
        icon: getFieldIcon(lf),
      });
    } else if (lf && rf) {
      const lt = getFieldTypeString(lf.type);
      const rt = getFieldTypeString(rf.type);
      const nameChanged = lf.name !== rf.name;
      const typeChanged = lt !== rt;
      const changed = nameChanged || typeChanged;
      fields.push({
        id,
        name: rf.name + (nameChanged ? ` (was: ${lf.name})` : ''),
        type: rt,
        oldType: typeChanged ? lt : undefined,
        typeChanged,
        required: rf.required || false,
        status: changed ? 'modified' : 'unchanged',
        statusColor: changed ? 'warning' : 'default',
        statusClass: changed ? 'text-warning' : '',
        icon: getFieldIcon(rf),
      });
    }
  }

  // Sort: added first, then modified, then unchanged, then removed
  const order: Record<string, number> = { added: 0, modified: 1, unchanged: 2, removed: 3 };
  fields.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return {
    fromId: leftSchemaId,
    toId: rightSchemaId,
    fields,
  };
});
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
}
.snapshot-table td {
  font-size: 0.85rem;
}
</style>
