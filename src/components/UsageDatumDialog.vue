<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="90vw">
    <v-card>
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-table-arrow-down</v-icon>
          Usage Statistics
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          @click="$emit('update:modelValue', false)"></v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <v-card-text>
        <!-- Top bar: shell script button + date -->
        <div class="d-flex align-center flex-wrap ga-3 mb-4">
          <v-btn
            prepend-icon="mdi-console"
            color="secondary"
            variant="tonal"
            size="large"
            :disabled="rows.length === 0"
            @click="scriptDialog = true">
            Shell Script
          </v-btn>

          <v-text-field
            v-model="datumDate"
            type="date"
            label="Date"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 180px"></v-text-field>

          <v-text-field
            v-model="creator"
            label="Creator"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 220px"></v-text-field>

          <v-text-field
            :model-value="licenseCustomer"
            label="Customer"
            density="compact"
            variant="outlined"
            hide-details
            readonly
            style="max-width: 220px"></v-text-field>

          <v-text-field
            :model-value="licenseId"
            label="License ID"
            density="compact"
            variant="outlined"
            hide-details
            readonly
            style="min-width: 260px"></v-text-field>
        </div>

        <!-- Script preview dialog -->
        <v-dialog v-model="scriptDialog" max-width="860">
          <v-card>
            <v-toolbar color="transparent" density="compact" flat>
              <v-toolbar-title class="text-subtitle-1">
                <v-icon class="mr-2" color="secondary">mdi-console</v-icon>
                Usage Statistics Shell Script
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <v-btn icon="mdi-close" size="small" variant="text" @click="scriptDialog = false"></v-btn>
            </v-toolbar>
            <v-divider></v-divider>
            <v-card-text>
              <v-textarea
                :model-value="scriptContent"
                readonly
                variant="outlined"
                density="compact"
                rows="20"
                no-resize
                class="font-mono text-caption"></v-textarea>
            </v-card-text>
            <v-divider></v-divider>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn prepend-icon="mdi-content-copy" variant="text" @click="copyScript">
                Copy
              </v-btn>
              <v-btn
                prepend-icon="mdi-download"
                color="secondary"
                variant="tonal"
                @click="downloadScript">
                Download .sh
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

        <v-alert v-if="loadError" type="error" density="compact" class="mb-4">
          {{ loadError }}
        </v-alert>

        <div v-if="!loading && rows.length === 0 && !loadError" class="text-body-2 text-center py-6">
          No warehouses found.
        </div>

        <div v-if="rows.length > 0" style="overflow-x: auto">
          <v-table density="compact" class="usage-datum-table">
            <thead>
              <tr>
                <th>Server ID</th>
                <th>Project IDs</th>
                <th>Warehouse IDs</th>
                <th>Bucket / Prefix</th>
                <th style="min-width: 150px">
                  Volume (GB)
                  <v-btn
                    icon="mdi-eraser"
                    size="x-small"
                    variant="text"
                    title="Reset all volumes"
                    @click="resetVolumes"></v-btn>
                </th>
                <th style="min-width: 200px">
                  Comments
                  <v-btn
                    icon="mdi-eraser"
                    size="x-small"
                    variant="text"
                    title="Reset all comments"
                    @click="resetKommentare"></v-btn>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i">
                <td class="text-caption mono">{{ row.serverId }}</td>
                <td class="text-caption mono">
                  <div v-for="pid in row.projectIds" :key="pid">{{ pid }}</div>
                </td>
                <td class="text-caption mono">
                  <div v-for="wid in row.warehouseIds" :key="wid">{{ wid }}</div>
                </td>
                <td class="text-caption mono">{{ row.bucketPrefix }}</td>
                <td>
                  <v-text-field
                    v-model="row.volumeGb"
                    density="compact"
                    variant="outlined"
                    hide-details
                    type="number"
                    min="0"
                    style="min-width: 120px"
                    class="my-1"></v-text-field>
                </td>
                <td>
                  <v-text-field
                    v-model="row.comments"
                    density="compact"
                    variant="outlined"
                    hide-details
                    style="min-width: 180px"
                    class="my-1"></v-text-field>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Total below the table -->
          <div class="d-flex justify-end align-center ga-2 mt-3 pr-1">
            <span class="text-body-2 text-medium-emphasis">Total:</span>
            <span class="text-subtitle-1 font-weight-bold">{{ totalPb }} PB</span>
            <span class="text-caption text-medium-emphasis">(Σ GB / 1,000,000, decimal)</span>
          </div>
        </div>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          prepend-icon="mdi-content-copy"
          variant="text"
          :disabled="rows.length === 0"
          @click="copyCsv">
          Copy CSV
        </v-btn>
        <v-btn
          prepend-icon="mdi-download"
          color="primary"
          variant="tonal"
          :disabled="rows.length === 0"
          @click="downloadCsv">
          Download CSV
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { useUserStore } from '@/stores/user';
import type { StorageProfile } from '@/gen/management/types.gen';

const props = defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

interface RawWarehouse {
  serverId: string;
  projectId: string;
  warehouseId: string;
  bucketPrefix: string;
  storageType: string;
  endpoint: string;
}

interface DatumRow {
  serverId: string;
  projectIds: string[];
  warehouseIds: string[];
  bucketPrefix: string;
  storageType: string;
  endpoint: string;
  volumeGb: string;
  comments: string;
}

const functions = useFunctions();
const visual = useVisualStore();
const userStore = useUserStore();

const loading = ref(false);
const loadError = ref('');
const rows = ref<DatumRow[]>([]);
const scriptDialog = ref(false);

const datumDate = computed({
  get: () => visual.usageDatumDate,
  set: (v) => { visual.usageDatumDate = v; },
});

const creator = computed({
  get: () => visual.usageDatumCreator,
  set: (v) => { visual.usageDatumCreator = v; },
});

const licenseCustomer = computed(
  () => visual.getServerInfo()['license-status']?.customer ?? '',
);
const licenseId = computed(
  () => visual.getServerInfo()['license-status']?.['license-id'] ?? '',
);

const scriptContent = computed(() => toShellScript());

const totalPb = computed(() => {
  const sumGb = rows.value.reduce((acc, r) => acc + (parseFloat(r.volumeGb) || 0), 0);
  const pb = sumGb / 1_000_000;
  return (Math.floor(pb * 100) / 100).toFixed(2);
});

// ── Pinia persistence ─────────────────────────────────────────────────────────

function resetVolumes() {
  for (const row of rows.value) {
    row.volumeGb = '';
    visual.setUsageDatumRow(row.bucketPrefix, '', row.comments);
  }
}

function resetKommentare() {
  for (const row of rows.value) {
    row.comments = '';
    visual.setUsageDatumRow(row.bucketPrefix, row.volumeGb, '');
  }
}

function saveRowToStore(row: DatumRow) {
  visual.setUsageDatumRow(row.bucketPrefix, row.volumeGb, row.comments);
}

function restoreFromStore() {
  for (const row of rows.value) {
    const saved = visual.getUsageDatumRow(row.bucketPrefix);
    if (saved) {
      row.volumeGb = saved.volumeGb;
      row.comments = saved.comments;
    }
  }
}

// ── Storage profile helpers ───────────────────────────────────────────────────

function bucketPrefixFromProfile(profile: StorageProfile): string {
  if (profile.type === 's3') {
    const base = `s3://${profile.bucket}`;
    return profile['key-prefix'] ? `${base}/${profile['key-prefix']}` : base;
  }
  if (profile.type === 'gcs') {
    const base = `gs://${profile.bucket}`;
    return profile['key-prefix'] ? `${base}/${profile['key-prefix']}` : base;
  }
  if (profile.type === 'adls') {
    const base = profile.filesystem;
    return profile['key-prefix'] ? `${base}/${profile['key-prefix']}` : base;
  }
  if (profile.type === 'onelake') {
    const parts = [profile['workspace-id'], profile['lakehouse-id']];
    if (profile['top-level-folder']) parts.push(profile['top-level-folder']);
    if (profile['directory-rel-path']) parts.push(profile['directory-rel-path']);
    return parts.join('/');
  }
  return '';
}

function endpointFromProfile(profile: StorageProfile): string {
  if (profile.type === 's3' && profile.endpoint) return profile.endpoint;
  return '';
}

function consolidate(raw: RawWarehouse[]): DatumRow[] {
  const map = new Map<string, DatumRow>();
  for (const w of raw) {
    const existing = map.get(w.bucketPrefix);
    if (existing) {
      if (!existing.projectIds.includes(w.projectId)) existing.projectIds.push(w.projectId);
      if (!existing.warehouseIds.includes(w.warehouseId)) existing.warehouseIds.push(w.warehouseId);
    } else {
      map.set(w.bucketPrefix, {
        serverId: w.serverId,
        projectIds: [w.projectId],
        warehouseIds: [w.warehouseId],
        bucketPrefix: w.bucketPrefix,
        storageType: w.storageType,
        endpoint: w.endpoint,
        volumeGb: '',
        comments: '',
      });
    }
  }
  return Array.from(map.values());
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
  loading.value = true;
  loadError.value = '';
  rows.value = [];

  if (!visual.usageDatumDate) {
    visual.usageDatumDate = new Date().toISOString().slice(0, 10);
  }
  if (!visual.usageDatumCreator) {
    const u = userStore.user;
    visual.usageDatumCreator =
      u.given_name && u.family_name ? `${u.given_name} ${u.family_name}` : u.preferred_username;
  }

  try {
    const serverInfo = visual.getServerInfo();
    const serverId = serverInfo['server-id'] || '';
    const projects = await functions.loadProjectList();
    const raw: RawWarehouse[] = [];

    await Promise.all(
      projects.map(async (project) => {
        try {
          const result = await functions.listWarehousesByProject(project['project-id']);
          for (const wh of result.warehouses ?? []) {
            const profile = wh['storage-profile'];
            raw.push({
              serverId,
              projectId: project['project-id'],
              warehouseId: wh['warehouse-id'],
              bucketPrefix: bucketPrefixFromProfile(profile),
              storageType: profile.type,
              endpoint: endpointFromProfile(profile),
            });
          }
        } catch {
          // skip projects where we lack permission
        }
      }),
    );

    rows.value = consolidate(raw);
    restoreFromStore();
  } catch (error: any) {
    loadError.value = error?.error?.message ?? error?.message ?? 'Failed to load data';
  } finally {
    loading.value = false;
  }
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function toCsv(): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines: string[] = [
    ['Date', datumDate.value, '', '', '', ''].map(esc).join(','),
    ['Creator', creator.value, '', '', '', ''].map(esc).join(','),
    ['Customer', licenseCustomer.value, '', '', '', ''].map(esc).join(','),
    ['License ID', licenseId.value, '', '', '', ''].map(esc).join(','),
    ['Server ID', 'Project IDs', 'Warehouse IDs', 'Bucket / Prefix', 'Volume (GB)', 'Comments']
      .map(esc)
      .join(','),
    ...rows.value.map((r) =>
      [
        r.serverId,
        r.projectIds.join(', '),
        r.warehouseIds.join(', '),
        r.bucketPrefix,
        r.volumeGb,
        r.comments,
      ]
        .map(esc)
        .join(','),
    ),
    ['Total', `${totalPb.value} PB`, '', '', '', ''].map(esc).join(','),
    ['', '', '', '', '', ''].map(esc).join(','),
    ['Send this report to', 'account@vakamo.com', '', '', '', ''].map(esc).join(','),
  ];
  return lines.join('\r\n');
}

function copyCsv() {
  const csv = toCsv();
  if (functions?.copyToClipboard) functions.copyToClipboard(csv);
  else navigator.clipboard?.writeText(csv);
}

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  const serverId = visual.getServerInfo()['server-id'] || 'lakekeeper';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(toCsv(), 'text/csv;charset=utf-8;', `usage-statistics-${serverId}-${stamp}.csv`);
}

// ── Shell script ──────────────────────────────────────────────────────────────

function toShellScript(): string {
  const serverId = visual.getServerInfo()['server-id'] || '';
  const stamp = new Date().toISOString();

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# Lakekeeper Usage Statistics',
    `# Server:    ${serverId}`,
    `# Generated: ${stamp}`,
    '# Requires: aws CLI (S3), gsutil (GCS).',
    '# For S3-compatible endpoints (NetApp, MinIO …) aws CLI uses --endpoint-url.',
    '# Output volume is in GB (bytes / 1 000 000 000, decimal). Total = sum(GB) / 1 000 000 → PB.',
    '',
    'set -euo pipefail',
    '',
    '# ── Credentials & endpoint ─────────────────────────────────────────────────',
    'export AWS_ACCESS_KEY_ID=""         # S3 access key',
    'export AWS_SECRET_ACCESS_KEY=""     # S3 secret key',
    'export AWS_DEFAULT_REGION=""        # region string (e.g. us-east-1), or empty for S3-compatible',
    'S3_HOST=""                          # custom S3 endpoint hostname (e.g. minio.example.com), or empty for native AWS',
    '',
    `SERVER_ID=${JSON.stringify(serverId)}`,
    'TOTAL_GB=0',
    '',
    '_csv() {',
    '  local v="$1"',
    '  v="${v//\\"/\\"\\"}"',
    '  printf \'"%s"\' "$v"',
    '}',
    '',
    `echo "Date,${datumDate.value}"`,
    `echo "Creator,${creator.value}"`,
    'echo "Server ID,Project IDs,Warehouse IDs,Bucket / Prefix,Volume (GB),Comments"',
    '',
  ];

  for (const row of rows.value) {
    const projectIdsStr = row.projectIds.join(', ');
    const warehouseIdsStr = row.warehouseIds.join(', ');

    lines.push(`# ── ${row.bucketPrefix} ${'─'.repeat(Math.max(0, 60 - row.bucketPrefix.length))}`);
    lines.push(`# Projects:   ${projectIdsStr}`);
    lines.push(`# Warehouses: ${warehouseIdsStr}`);

    if (row.storageType === 's3') {
      const s3Path = row.bucketPrefix.endsWith('/') ? row.bucketPrefix : `${row.bucketPrefix}/`;
      const endpointFlag = row.endpoint
        ? ` --endpoint-url ${row.endpoint}`
        : ' ${S3_HOST:+--endpoint-url "https://$S3_HOST"}';
      lines.push(
        `_bytes=$(aws s3 ls "${s3Path}" --recursive --summarize${endpointFlag} 2>/dev/null \\`,
        `  | awk '/Total Size:/{gsub(/[^0-9]/,"",$NF); print $NF}')`,
        `_gb=$(awk "BEGIN{printf \\"%.3f\\", ${'"${_bytes:-0}"'}/1000000000}")`,
      );
    } else if (row.storageType === 'gcs') {
      lines.push(
        `_bytes=$(gsutil du -sb "${row.bucketPrefix}" 2>/dev/null | awk '{print $1}')`,
        `_gb=$(awk "BEGIN{printf \\"%.3f\\", ${'"${_bytes:-0}"'}/1000000000}")`,
      );
    } else {
      lines.push(`_gb=""  # Manual: check Azure portal or az CLI for ${row.bucketPrefix}`);
    }

    lines.push(
      `TOTAL_GB=$(awk "BEGIN{printf \\"%.3f\\", $TOTAL_GB + ${'"${_gb:-0}"'}}")`,
      `printf '%s,%s,%s,%s,%s,%s\\n' \\`,
      `  "$(_csv "$SERVER_ID")" \\`,
      `  "$(_csv ${JSON.stringify(projectIdsStr)})" \\`,
      `  "$(_csv ${JSON.stringify(warehouseIdsStr)})" \\`,
      `  "$(_csv ${JSON.stringify(row.bucketPrefix)})" \\`,
      `  "$(_csv "$_gb")" \\`,
      `  "$(_csv "")"`,
      '',
    );
  }

  lines.push(
    '# ── Summary ────────────────────────────────────────────────────────────────',
    `TOTAL_PB=$(awk "BEGIN{printf \\"%.2f\\", int($TOTAL_GB/10000)/100}")`,
    'echo "Total (PB),\\"$TOTAL_PB\\""',
  );

  return lines.join('\n');
}

function copyScript() {
  if (functions?.copyToClipboard) functions.copyToClipboard(scriptContent.value);
  else navigator.clipboard?.writeText(scriptContent.value);
}

function downloadScript() {
  const serverId = visual.getServerInfo()['server-id'] || 'lakekeeper';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(toShellScript(), 'text/x-sh', `usage-statistics-${serverId}-${stamp}.sh`);
}

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadData();
  },
);

watch(
  rows,
  (updated) => {
    for (const row of updated) saveRowToStore(row);
  },
  { deep: true },
);
</script>

<style scoped>
.usage-datum-table th {
  white-space: nowrap;
}
.mono {
  font-family: monospace;
}
</style>
