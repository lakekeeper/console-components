<template>
  <v-card-text>
    <div class="d-flex align-center mb-3" style="gap: 8px">
      <v-icon color="primary">mdi-folder-search-outline</v-icon>
      <div class="text-subtitle-1">Files explorer</div>
      <v-chip v-if="rootUri" size="x-small" variant="outlined" class="font-mono">
        {{ rootUri }}
      </v-chip>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        icon="mdi-refresh"
        :loading="loading"
        title="Reload (refresh credentials)"
        @click="reload"></v-btn>
    </div>

    <v-alert v-if="topError" type="warning" variant="tonal" density="compact" class="mb-3">
      <div class="font-weight-medium mb-1">Storage listing unavailable</div>
      <div class="text-caption" style="white-space: pre-wrap">{{ topError }}</div>
    </v-alert>

    <div v-if="loading && !rootNodes.length" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-sheet v-else-if="!topError" rounded="lg" border>
      <div v-if="!rootNodes.length" class="text-medium-emphasis pa-4 text-caption">
        No objects under this prefix.
      </div>
      <div
        v-for="row in visibleRows"
        :key="row.node.path"
        class="storage-row d-flex align-center"
        :style="{ paddingLeft: 8 + row.depth * 18 + 'px' }">
        <!-- folder toggle / file spacer -->
        <v-btn
          v-if="row.node.isFolder"
          :icon="row.node.expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
          size="x-small"
          variant="text"
          @click="toggle(row.node)"></v-btn>
        <span v-else style="width: 28px; display: inline-block"></span>

        <v-icon size="x-small" class="mr-1" :color="row.node.isFolder ? 'amber-darken-2' : 'grey'">
          {{ row.node.isFolder ? 'mdi-folder-outline' : fileIcon(row.node.name) }}
        </v-icon>
        <span
          class="text-caption font-mono storage-name cursor-pointer"
          :title="row.node.name"
          @click="onRowClick(row.node)">
          {{ row.node.name }}
        </span>

        <v-spacer />
        <span v-if="row.node.loading" class="mr-2">
          <v-progress-circular indeterminate size="14" width="2" color="primary" />
        </span>
        <span
          v-if="!row.node.isFolder && row.node.size != null"
          class="text-caption text-medium-emphasis mr-2">
          {{ formatBytes(row.node.size) }}
        </span>
        <v-btn
          v-if="!row.node.isFolder"
          icon="mdi-eye-outline"
          size="x-small"
          variant="text"
          title="Preview"
          @click="openPreview(row.node)"></v-btn>
        <v-btn
          v-if="!row.node.isFolder"
          icon="mdi-download-outline"
          size="x-small"
          variant="text"
          title="Download"
          @click="download(row.node)"></v-btn>
        <v-btn
          icon="mdi-content-copy"
          size="x-small"
          variant="text"
          title="Copy path"
          @click="copyPath(row.node)"></v-btn>

        <!-- per-folder error -->
        <span v-if="row.node.error" class="text-caption text-error ml-2" :title="row.node.error">
          <v-icon size="x-small" color="error">mdi-alert-circle-outline</v-icon>
        </span>
      </div>
    </v-sheet>

    <!-- File preview -->
    <v-dialog v-model="previewOpen" max-width="1100" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center text-subtitle-1 py-2">
          <v-icon class="mr-2" color="primary">{{ fileIcon(previewNode?.name || '') }}</v-icon>
          <span class="font-mono text-truncate">{{ previewNode?.name }}</span>
          <v-chip v-if="previewNode?.size != null" size="x-small" variant="outlined" class="ml-2">
            {{ formatBytes(previewNode?.size) }}
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="previewNode"
            size="small"
            variant="text"
            prepend-icon="mdi-download-outline"
            @click="download(previewNode)">
            Download
          </v-btn>
          <v-btn icon="mdi-close" variant="text" size="small" @click="previewOpen = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text style="min-height: 200px">
          <div v-if="previewLoading" class="d-flex justify-center pa-6">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <v-alert v-else-if="previewError" type="warning" variant="tonal" density="compact">
            <div class="text-caption" style="white-space: pre-wrap">{{ previewError }}</div>
          </v-alert>

          <!-- tabular (parquet / csv via DuckDB) -->
          <div v-else-if="previewKind === 'table'">
            <div class="text-caption text-medium-emphasis mb-2">
              First {{ previewRows.length }} rows · {{ previewColumns.length }} columns (DuckDB)
            </div>
            <div style="overflow: auto; max-height: 60vh">
              <v-table density="compact" class="preview-table">
                <thead>
                  <tr>
                    <th v-for="c in previewColumns" :key="c" class="font-mono">{{ c }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in previewRows" :key="ri">
                    <td v-for="(c, ci) in previewColumns" :key="ci" class="font-mono text-caption">
                      {{ r[ci] }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </div>

          <!-- json / text -->
          <pre
            v-else-if="previewKind === 'json' || previewKind === 'text'"
            class="preview-pre text-caption"
            >{{ previewText }}</pre
          >

          <!-- too large / unsupported -->
          <div v-else class="text-medium-emphasis pa-4 text-caption">
            <template v-if="previewKind === 'toolarge'">
              File is too large to preview in the browser. Use Download instead.
            </template>
            <template v-else-if="previewKind === 'avro'">
              Avro preview isn't supported yet (DuckDB-WASM lacks the avro reader in this build).
              Use Download.
            </template>
            <template v-else>No inline preview for this file type. Use Download.</template>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, inject } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useLoQE } from '../composables/useLoQE';
import {
  useStorageExplorer,
  StorageListError,
  type StorageEntry,
  type StorageLoadResult,
} from '../composables/useStorageExplorer';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  entityName: string;
  entityType?: 'table' | 'generic-table';
}>();

const functions = useFunctions();
const explorer = useStorageExplorer();
const appConfig = inject<{ baseUrlPrefix?: string }>('appConfig', {});
const loqe = useLoQE({ baseUrlPrefix: appConfig.baseUrlPrefix ?? '' });

interface TreeNode extends StorageEntry {
  depth: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error?: string;
  children: TreeNode[];
}

const loading = ref(false);
const topError = ref<string | null>(null);
const storageRes = ref<StorageLoadResult | null>(null);
const rootNodes = ref<TreeNode[]>([]);
const rootUri = ref('');

function toNode(e: StorageEntry, depth: number): TreeNode {
  return { ...e, depth, expanded: false, loaded: false, loading: false, children: [] };
}

// Depth-first flatten of expanded nodes for rendering.
const visibleRows = computed(() => {
  const rows: { node: TreeNode; depth: number }[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      rows.push({ node, depth: node.depth });
      if (node.isFolder && node.expanded) walk(node.children);
    }
  };
  walk(rootNodes.value);
  return rows;
});

async function loadEntity(): Promise<StorageLoadResult> {
  if (props.entityType === 'generic-table') {
    const g: any = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.entityName,
      false,
    );
    return {
      location: g?.table?.['base-location'] || '',
      config: g?.config,
      'storage-credentials': g?.['storage-credentials'],
    };
  }
  const t: any = await functions.loadTableCustomized(
    props.warehouseId,
    props.namespaceId,
    props.entityName,
    false,
  );
  return {
    location: t?.metadata?.location || '',
    config: t?.config,
    'storage-credentials': t?.['storage-credentials'],
  };
}

async function load() {
  loading.value = true;
  topError.value = null;
  rootNodes.value = [];
  try {
    const res = await loadEntity();
    storageRes.value = res;
    if (!res.location) {
      topError.value = 'This entity has no storage location.';
      return;
    }
    rootUri.value = res.location.replace(/\/+$/, '');
    const entries = await explorer.listPrefix(res, explorer.rootPrefix(res.location));
    rootNodes.value = entries.map((e) => toNode(e, 0));
  } catch (e: any) {
    topError.value =
      e instanceof StorageListError ? e.message : e?.error?.message || e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function reload() {
  load();
}

async function toggle(node: TreeNode) {
  if (!node.isFolder) return;
  node.expanded = !node.expanded;
  if (node.expanded && !node.loaded && storageRes.value) {
    node.loading = true;
    node.error = undefined;
    try {
      const entries = await explorer.listPrefix(storageRes.value, node.path);
      node.children = entries.map((e) => toNode(e, node.depth + 1));
      node.loaded = true;
    } catch (e: any) {
      node.error = e instanceof StorageListError ? e.message : e?.message || String(e);
    } finally {
      node.loading = false;
    }
  }
}

function copyPath(node: TreeNode) {
  const uri = storageRes.value ? explorer.toUri(storageRes.value.location, node.path) : node.path;
  functions.copyToClipboard(uri);
}

function onRowClick(node: TreeNode) {
  if (node.isFolder) toggle(node);
  else openPreview(node);
}

// ---- File preview ----------------------------------------------------------
const PREVIEW_SIZE_CAP = 50 * 1024 * 1024; // 50 MB
const previewOpen = ref(false);
const previewLoading = ref(false);
const previewError = ref('');
const previewNode = ref<TreeNode | null>(null);
const previewKind = ref<'json' | 'text' | 'table' | 'avro' | 'toolarge' | 'binary' | ''>('');
const previewText = ref('');
const previewColumns = shallowRef<string[]>([]);
const previewRows = shallowRef<string[][]>([]);
let previewSeq = 0;

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

// Iceberg often stores gzip-compressed metadata (`*.gz.metadata.json`).
// Detect the gzip magic bytes and inflate via the browser's DecompressionStream.
async function maybeGunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const isGz = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGz) return bytes;
  if (typeof (globalThis as any).DecompressionStream === 'undefined') {
    throw new Error('This file is gzip-compressed and your browser cannot inflate it.');
  }
  const ds = new (globalThis as any).DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function openPreview(node: TreeNode) {
  if (!storageRes.value) return;
  previewNode.value = node;
  previewOpen.value = true;
  previewLoading.value = true;
  previewError.value = '';
  previewKind.value = '';
  previewText.value = '';
  previewColumns.value = [];
  previewRows.value = [];
  try {
    const ext = extOf(node.name);
    const isAvro = ext === 'avro' || /\.avro$/i.test(node.name);
    const isParquet = ext === 'parquet';
    const isCsv = ext === 'csv' || ext === 'tsv';
    const tabular = isParquet || isCsv || isAvro;
    if (tabular && node.size != null && node.size > PREVIEW_SIZE_CAP) {
      previewKind.value = 'toolarge';
      return;
    }
    if (ext === 'json' || ext === 'txt' || ext === 'log' || ext === 'yaml' || ext === 'yml') {
      const raw = await explorer.getObject(storageRes.value, node.path);
      const text = new TextDecoder().decode(await maybeGunzip(raw));
      if (ext === 'json') {
        try {
          previewText.value = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          previewText.value = text;
        }
        previewKind.value = 'json';
      } else {
        previewText.value = text.slice(0, 200_000);
        previewKind.value = 'text';
      }
    } else if (tabular) {
      const raw = await explorer.getObject(storageRes.value, node.path);
      const bytes = await maybeGunzip(raw); // some files (e.g. .json.gz) are gzipped
      const seq = ++previewSeq;
      let fname: string;
      let reader: string;
      let ensureExt: string | null = null;
      if (isAvro) {
        fname = `preview_${seq}.avro`;
        reader = `read_avro('${fname}')`;
        ensureExt = 'avro';
      } else if (isParquet) {
        fname = `preview_${seq}.parquet`;
        reader = `read_parquet('${fname}')`;
        ensureExt = 'parquet';
      } else {
        fname = `preview_${seq}.csv`;
        reader = `read_csv_auto('${fname}')`;
      }
      if (ensureExt) {
        try {
          await loqe.installExtension(ensureExt);
        } catch {
          /* builtin in this build; ignore */
        }
      }
      const result: any = await loqe.queryBuffer(fname, bytes, `SELECT * FROM ${reader} LIMIT 200`);
      // Stringify cells up front: DuckDB rows can contain nested structs / Arrow
      // objects that Vue cannot proxy (it throws on non-extensible objects).
      previewColumns.value = result.columns || [];
      previewRows.value = (result.rows || []).map((r: any[]) => r.map(cellText));
      previewKind.value = 'table';
    } else {
      previewKind.value = 'binary';
    }
  } catch (e: any) {
    previewError.value = e instanceof StorageListError ? e.message : e?.message || String(e);
  } finally {
    previewLoading.value = false;
  }
}

async function download(node: TreeNode) {
  if (!storageRes.value) return;
  try {
    const bytes = await explorer.getObject(storageRes.value, node.path);
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement('a');
    a.href = url;
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    previewNode.value = node;
    previewOpen.value = true;
    previewError.value = e instanceof StorageListError ? e.message : e?.message || String(e);
  }
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function formatBytes(n?: number): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'parquet') return 'mdi-file-table-outline';
  if (ext === 'avro') return 'mdi-file-cog-outline';
  if (ext === 'json' || ext === 'metadata.json') return 'mdi-code-json';
  if (ext === 'crc') return 'mdi-file-check-outline';
  return 'mdi-file-outline';
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.entityName, props.entityType], load);
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
}
.storage-row {
  min-height: 30px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.storage-row:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.storage-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.cursor-pointer {
  cursor: pointer;
}
.preview-pre {
  white-space: pre;
  overflow: auto;
  max-height: 60vh;
  font-family: 'Roboto Mono', monospace;
}
.preview-table th,
.preview-table td {
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
