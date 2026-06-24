<template>
  <v-card-text>
    <div class="d-flex align-center mb-2" style="gap: 8px">
      <v-icon color="primary">mdi-folder-search-outline</v-icon>
      <div class="text-subtitle-1">Files explorer</div>
      <v-spacer />
      <template v-if="selectedPaths.length > 0">
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-download-outline"
          @click="bulkDownload">
          Download ({{ selectedPaths.length }})
        </v-btn>
        <v-btn
          v-if="canWrite"
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete-outline"
          @click="bulkDeleteOpen = true">
          Delete ({{ selectedPaths.length }})
        </v-btn>
      </template>
      <v-progress-circular
        v-if="moveLoading"
        indeterminate
        size="18"
        width="2"
        color="primary"
        class="mr-1"
        title="Moving files…" />
      <v-btn
        size="small"
        variant="text"
        icon="mdi-refresh"
        :loading="loading"
        title="Reload (refresh credentials)"
        @click="reload"></v-btn>
    </div>

    <input ref="fileInputRef" type="file" multiple style="display: none" @change="onFilesPicked" />

    <!-- Upload progress -->
    <div v-if="uploads.length" class="mb-2">
      <div v-for="u in uploads" :key="u.id" class="d-flex align-center mb-1 px-1">
        <v-icon size="x-small" class="mr-1" :color="u.error ? 'error' : 'primary'">
          {{ u.error ? 'mdi-alert-circle-outline' : fileIcon(u.name) }}
        </v-icon>
        <span class="text-caption font-mono text-truncate" style="max-width: 180px">
          {{ u.name }}
        </span>
        <v-progress-linear
          :model-value="u.fraction * 100"
          :color="u.error ? 'error' : 'primary'"
          height="4"
          class="mx-2 flex-grow-1"
          :indeterminate="!u.done && u.fraction === 0 && !u.error" />
        <span class="text-caption text-medium-emphasis" style="min-width: 36px; text-align: right">
          {{ u.error ? 'Error' : u.done ? 'Done' : Math.round(u.fraction * 100) + '%' }}
        </span>
      </div>
    </div>

    <v-alert v-if="topError" type="warning" variant="tonal" density="compact" class="mb-3">
      <div class="font-weight-medium mb-1">Storage listing unavailable</div>
      <div class="text-caption" style="white-space: pre-wrap">{{ topError }}</div>
    </v-alert>

    <div v-if="loading && !rootNodes.length" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-sheet
      v-else-if="!topError"
      rounded="lg"
      border
      :class="{ 'drag-over': isDraggingOver && canWrite }"
      @dragover.prevent="canWrite && onDragOver()"
      @dragleave="onDragLeave"
      @drop.prevent="canWrite && onDrop($event)">
      <!-- Permanent root row -->
      <div
        class="storage-row d-flex align-center"
        :class="{ 'drop-target': canWrite && dragOverFolder === '__root__' }"
        style="padding-left: 8px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08)"
        @dragover.prevent="canWrite && dragPaths.length && (dragOverFolder = '__root__')"
        @dragleave.self="dragOverFolder === '__root__' && (dragOverFolder = null)"
        @drop.prevent="canWrite && dragPaths.length && onRootDrop()">
        <!-- select-all checkbox sits where the expand toggle would be -->
        <input
          type="checkbox"
          :checked="selectAllState === 'all'"
          :indeterminate="selectAllState === 'some'"
          style="width: 16px; height: 16px; flex-shrink: 0; margin-right: 12px; cursor: pointer"
          title="Select all"
          @change.stop="toggleSelectAll"
          @click.stop />
        <v-icon size="x-small" class="mr-2" color="amber-darken-2">
          {{ dragOverFolder === '__root__' ? 'mdi-folder-open' : 'mdi-folder-multiple-outline' }}
        </v-icon>
        <span class="text-caption font-weight-medium mr-2">Root</span>
        <code
          v-if="rootUri"
          class="text-caption text-truncate text-medium-emphasis"
          style="flex: 1; min-width: 0; font-size: 10px">
          {{ rootUri }}
        </code>
        <v-btn
          v-if="rootUri"
          icon="mdi-content-copy"
          size="x-small"
          variant="text"
          title="Copy root URI"
          @click.stop="functions.copyToClipboard(rootUri)" />
        <v-spacer v-else />
        <template v-if="canWrite">
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-folder-plus-outline"
            title="Create new folder"
            @click.stop="triggerCreateFolder(null)" />
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-upload"
            title="Upload files to root"
            @click.stop="triggerUpload(null)" />
        </template>
      </div>

      <div v-if="!rootNodes.length" class="text-medium-emphasis pa-4 text-caption">
        No objects under this prefix.
      </div>
      <div
        v-for="row in visibleRows"
        :key="row.node.path"
        class="storage-row d-flex align-center"
        :class="{
          'drop-target': canWrite && row.node.isFolder && dragOverFolder === row.node.path,
        }"
        :style="{ paddingLeft: 8 + row.depth * 18 + 'px' }"
        :draggable="canWrite && !row.node.isFolder ? 'true' : 'false'"
        @dragstart="canWrite && !row.node.isFolder && onFileDragStart($event, row.node)"
        @dragend="onFileDragEnd"
        @dragover.prevent="canWrite && row.node.isFolder && onFolderDragOver($event, row.node)"
        @dragleave.self="canWrite && row.node.isFolder && onFolderDragLeave($event, row.node)"
        @drop.prevent="canWrite && row.node.isFolder && onFolderDrop($event, row.node)">
        <!-- folder toggle / file spacer -->
        <v-btn
          v-if="row.node.isFolder"
          :icon="row.node.expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
          size="x-small"
          variant="text"
          @click="toggle(row.node)"></v-btn>
        <span v-else style="width: 28px; display: inline-block"></span>
        <!-- checkbox: files → simple toggle; folders → toggle folder + visible children -->
        <input
          v-if="row.node.isFolder"
          type="checkbox"
          :checked="folderCheckState(row.node) === true"
          :indeterminate="folderCheckState(row.node) === 'indeterminate'"
          style="width: 16px; height: 16px; flex-shrink: 0; margin-right: 20px; cursor: pointer"
          @change.stop="toggleSelectFolder(row.node)"
          @click.stop />
        <input
          v-else
          type="checkbox"
          :checked="isSelected(row.node.path)"
          style="width: 16px; height: 16px; flex-shrink: 0; margin-right: 20px; cursor: pointer"
          @change.stop="toggleSelect(row.node.path)"
          @click.stop />

        <v-icon size="x-small" class="mr-2" :color="row.node.isFolder ? 'amber-darken-2' : 'grey'">
          {{
            row.node.isFolder
              ? dragOverFolder === row.node.path
                ? 'mdi-folder-open'
                : 'mdi-folder-outline'
              : fileIcon(row.node.name)
          }}
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
          v-if="!row.node.isFolder && row.node.lastModified"
          class="text-caption text-medium-emphasis mr-3">
          {{ formatDate(row.node.lastModified) }}
        </span>
        <span
          v-if="!row.node.isFolder && row.node.size != null"
          class="text-caption text-medium-emphasis mr-2">
          {{ formatBytes(row.node.size) }}
        </span>
        <v-btn
          v-if="canWrite && row.node.isFolder"
          icon="mdi-folder-plus-outline"
          size="x-small"
          variant="text"
          title="Create subfolder here"
          @click.stop="triggerCreateFolder(row.node)"></v-btn>
        <v-btn
          v-if="canWrite && row.node.isFolder"
          icon="mdi-upload"
          size="x-small"
          variant="text"
          title="Upload files here"
          @click.stop="triggerUpload(row.node)"></v-btn>
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
        <v-btn
          v-if="canWrite && row.node.isFolder"
          icon="mdi-delete-outline"
          size="x-small"
          variant="text"
          color="error"
          title="Delete folder"
          @click.stop="confirmDeleteFolder(row.node)"></v-btn>
        <v-btn
          v-if="canWrite && !row.node.isFolder"
          icon="mdi-delete-outline"
          size="x-small"
          variant="text"
          color="error"
          title="Delete file"
          @click="confirmDelete(row.node)"></v-btn>

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
                    <th v-for="col in previewColumns" :key="col" class="font-mono">{{ col }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in previewRows" :key="ri">
                    <td v-for="(_, ci) in previewColumns" :key="ci" class="font-mono text-caption">
                      {{ r[ci] }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </div>

          <!-- json: vue-json-pretty if parsed, fallback to pre -->
          <div v-else-if="previewKind === 'json'" style="overflow: auto; max-height: 65vh">
            <vue-json-pretty
              v-if="previewJson !== null"
              :data="previewJson"
              :deep="3"
              show-length
              show-line />
            <pre v-else class="preview-pre text-caption">{{ previewText }}</pre>
          </div>

          <!-- text -->
          <pre v-else-if="previewKind === 'text'" class="preview-pre text-caption">{{
            previewText
          }}</pre>

          <!-- image inline -->
          <div v-else-if="previewKind === 'image'" class="d-flex justify-center pa-2">
            <img
              :src="previewBlobUrl || ''"
              style="max-width: 100%; max-height: 70vh; object-fit: contain" />
          </div>

          <!-- PDF inline -->
          <div v-else-if="previewKind === 'pdf'" style="height: 70vh">
            <embed
              :src="previewBlobUrl || ''"
              type="application/pdf"
              style="width: 100%; height: 100%" />
          </div>

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

    <!-- Create folder dialog -->
    <v-dialog v-model="createFolderOpen" max-width="400" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">New folder</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newFolderName"
            label="Folder name"
            density="compact"
            variant="outlined"
            hide-details="auto"
            autofocus
            :rules="[
              (v: string) => !!v.trim() || 'Required',
              (v: string) => !v.includes('/') || 'Cannot contain \'/\'',
            ]"
            @keyup.enter="executeCreateFolder" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="createFolderLoading" @click="createFolderOpen = false">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="createFolderLoading"
            :disabled="!newFolderName.trim() || newFolderName.includes('/')"
            @click="executeCreateFolder">
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete folder confirm -->
    <v-dialog v-model="deleteFolderOpen" max-width="400">
      <v-card>
        <v-card-title class="text-subtitle-1">Delete folder?</v-card-title>
        <v-card-text>
          <span class="font-mono text-caption">{{ deleteFolderNode?.name }}</span>
          <div class="text-caption text-error mt-1">
            All files inside will be permanently deleted.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="deleteFolderLoading" @click="deleteFolderOpen = false">
            Cancel
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            :loading="deleteFolderLoading"
            @click="executeDeleteFolder">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Bulk delete confirm -->
    <v-dialog v-model="bulkDeleteOpen" max-width="400">
      <v-card>
        <v-card-title class="text-subtitle-1">
          Delete {{ selectedPaths.length }} files?
        </v-card-title>
        <v-card-text class="text-error font-weight-bold">This cannot be undone.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="bulkDeleting" @click="bulkDeleteOpen = false">
            Cancel
          </v-btn>
          <v-btn color="error" variant="tonal" :loading="bulkDeleting" @click="executeBulkDelete">
            Delete all
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirm -->
    <v-dialog v-model="deleteOpen" max-width="400">
      <v-card>
        <v-card-title class="text-subtitle-1">Delete file?</v-card-title>
        <v-card-text>
          <span class="font-mono text-caption">{{ deleteNode?.name }}</span>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="tonal" :loading="deleteLoading" @click="doDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, inject } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
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
  canWrite?: boolean;
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
      if (node.name === '.keep') continue;
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

// Vended STS creds expire (~1h). When an op fails on an expired/denied error,
// re-load the entity (fresh creds, cache:'no-store') and retry once.
function looksExpired(e: any): boolean {
  const m = String(e?.message || '').toLowerCase();
  const st = e?.status;
  return (
    st === 400 ||
    st === 403 ||
    m.includes('expired') ||
    m.includes('token') ||
    m.includes('accessdenied') ||
    m.includes('invalidaccesskeyid')
  );
}

async function withRenew<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (looksExpired(e)) {
      storageRes.value = await loadEntity(); // refresh vended credentials
      return await op();
    }
    throw e;
  }
}

async function toggle(node: TreeNode) {
  if (!node.isFolder) return;
  node.expanded = !node.expanded;
  if (node.expanded && !node.loaded && storageRes.value) {
    node.loading = true;
    node.error = undefined;
    try {
      const entries = await withRenew(() => explorer.listPrefix(storageRes.value!, node.path));
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
const previewKind = ref<
  'json' | 'text' | 'table' | 'avro' | 'toolarge' | 'binary' | 'image' | 'pdf' | ''
>('');
const previewText = ref('');
const previewJson = ref<any>(null);
const previewColumns = shallowRef<string[]>([]);
const previewRows = shallowRef<string[][]>([]);
let previewSeq = 0;
// Blob URL for image/PDF inline preview — revoked on dialog close.
const previewBlobUrl = ref<string | null>(null);

// Upload state
interface UploadItem {
  id: number;
  name: string;
  fraction: number;
  done: boolean;
  error?: string;
}
let uploadSeq = 0;
const uploads = ref<UploadItem[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadTarget = ref<string | null>(null);
const isDraggingOver = ref(false);

// Delete state
const deleteOpen = ref(false);
const deleteNode = ref<TreeNode | null>(null);
const deleteLoading = ref(false);

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
  const stream = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(ds);
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
  previewJson.value = null;
  previewColumns.value = [];
  previewRows.value = [];
  try {
    const ext = extOf(node.name);
    // Paimon files have no extension — detect by name pattern
    const paimonAvro = node.name.startsWith('manifest-');
    const paimonJson = node.name.startsWith('schema-') || node.name.startsWith('snapshot-');
    const paimonText = node.name === 'LATEST';
    const isAvro = ext === 'avro' || /\.avro$/i.test(node.name) || paimonAvro;
    const isParquet = ext === 'parquet';
    const isCsv = ext === 'csv' || ext === 'tsv';
    const isJson = ext === 'json' || paimonJson;
    const isText = ['txt', 'log', 'yaml', 'yml'].includes(ext) || paimonText;
    const tabular = isParquet || isCsv || isAvro;
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    const isPdf = ext === 'pdf';
    if (tabular && node.size != null && node.size > PREVIEW_SIZE_CAP) {
      previewKind.value = 'toolarge';
      return;
    }
    if (isJson || isText) {
      const raw = await withRenew(() => explorer.getObject(storageRes.value!, node.path));
      const text = new TextDecoder().decode(await maybeGunzip(raw));
      if (isJson) {
        try {
          previewJson.value = JSON.parse(text);
        } catch {
          previewJson.value = null;
          previewText.value = text;
        }
        previewKind.value = 'json';
      } else {
        previewText.value = text.slice(0, 200_000);
        previewKind.value = 'text';
      }
    } else if (tabular) {
      const raw = await withRenew(() => explorer.getObject(storageRes.value!, node.path));
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
    } else if (isImage || isPdf) {
      const raw = await withRenew(() => explorer.getObject(storageRes.value!, node.path));
      const mime = isPdf
        ? 'application/pdf'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      if (previewBlobUrl.value) URL.revokeObjectURL(previewBlobUrl.value);
      previewBlobUrl.value = URL.createObjectURL(
        new Blob([raw.buffer as ArrayBuffer], { type: mime }),
      );
      previewKind.value = isPdf ? 'pdf' : 'image';
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
    const bytes = await withRenew(() => explorer.getObject(storageRes.value!, node.path));
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]));
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

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  if (ext === 'json') return 'mdi-code-json';
  if (ext === 'crc') return 'mdi-file-check-outline';
  if (ext === 'pdf') return 'mdi-file-pdf-box';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'mdi-image-outline';
  if (['csv', 'tsv'].includes(ext || '')) return 'mdi-file-delimited-outline';
  return 'mdi-file-outline';
}

// ---- Create folder ----------------------------------------------------------
const createFolderOpen = ref(false);
const createFolderLoading = ref(false);
const newFolderName = ref('');
const createFolderTarget = ref<string | null>(null);

function triggerCreateFolder(node: TreeNode | null) {
  createFolderTarget.value = node ? node.path : null;
  newFolderName.value = '';
  createFolderOpen.value = true;
}

async function executeCreateFolder() {
  if (!storageRes.value || !newFolderName.value.trim() || newFolderName.value.includes('/')) return;
  createFolderLoading.value = true;
  try {
    const base = createFolderTarget.value ?? explorer.rootPrefix(storageRes.value.location);
    const keepPath = base + newFolderName.value.trim() + '/.keep';
    const emptyFile = new File([''], '.keep', { type: 'application/octet-stream' });
    await withRenew(() => explorer.putObject(storageRes.value!, keepPath, emptyFile, () => {}));
    createFolderOpen.value = false;
    await refreshFolder(createFolderTarget.value);
    if (createFolderTarget.value) {
      const parent = findNode(rootNodes.value, createFolderTarget.value);
      if (parent && !parent.expanded) await toggle(parent);
    }
  } catch (e: any) {
    functions.handleError(e, 'Create folder');
  } finally {
    createFolderLoading.value = false;
  }
}

// ---- Upload -----------------------------------------------------------------
function triggerUpload(node: TreeNode | null) {
  uploadTarget.value = node ? node.path : null;
  fileInputRef.value?.click();
}

function onFilesPicked(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  (e.target as HTMLInputElement).value = '';
  if (files.length) void uploadFiles(files, uploadTarget.value);
}

async function uploadFiles(files: File[], targetPrefix: string | null) {
  if (!storageRes.value) return;
  const prefix = targetPrefix ?? explorer.rootPrefix(storageRes.value.location);
  const tasks = files.map((file) => {
    const id = ++uploadSeq;
    const item: UploadItem = { id, name: file.name, fraction: 0, done: false };
    uploads.value.push(item);
    return { file, item, absPath: prefix + file.name };
  });
  await Promise.all(
    tasks.map(async ({ file, item, absPath }) => {
      try {
        await withRenew(() =>
          explorer.putObject(storageRes.value!, absPath, file, (f) => {
            item.fraction = f;
          }),
        );
        item.fraction = 1;
        item.done = true;
      } catch (e: any) {
        item.error = e instanceof StorageListError ? e.message : e?.message || String(e);
      }
    }),
  );
  await refreshFolder(targetPrefix);
  setTimeout(() => {
    uploads.value = uploads.value.filter((u) => !u.done);
  }, 2000);
}

async function refreshFolder(path: string | null) {
  if (!storageRes.value) return;
  if (!path) {
    const entries = await withRenew(() =>
      explorer.listPrefix(storageRes.value!, explorer.rootPrefix(storageRes.value!.location)),
    );
    rootNodes.value = entries.map((e) => toNode(e, 0));
    return;
  }
  const node = findNode(rootNodes.value, path);
  if (node?.isFolder) {
    const entries = await withRenew(() => explorer.listPrefix(storageRes.value!, path));
    node.children = entries.map((e) => toNode(e, node.depth + 1));
  }
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isFolder) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function onDragOver() {
  isDraggingOver.value = true;
}
function onDragLeave() {
  isDraggingOver.value = false;
}
async function onDrop(e: DragEvent) {
  isDraggingOver.value = false;
  // Ignore intra-explorer drags (no OS files)
  if (dragPaths.value.length) return;
  const files = Array.from(e.dataTransfer?.files || []);
  if (files.length) await uploadFiles(files, null);
}

// ---- Intra-explorer drag-to-move -------------------------------------------
const dragPaths = ref<string[]>([]);
const dragOverFolder = ref<string | null>(null);
const moveLoading = ref(false);

function onFileDragStart(e: DragEvent, node: TreeNode) {
  // Drag the multi-selection if this file is part of it, otherwise just this file.
  const paths = selectedPaths.value.includes(node.path) ? [...selectedPaths.value] : [node.path];
  dragPaths.value = paths;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', paths.join('\n'));
  // Custom drag ghost: show count badge when dragging multiple items
  if (paths.length > 1) {
    const ghost = document.createElement('div');
    ghost.textContent = `${paths.length} items`;
    ghost.style.cssText =
      'position:fixed;top:-999px;left:-999px;padding:4px 10px;background:#1976d2;color:#fff;border-radius:12px;font:12px sans-serif;white-space:nowrap;pointer-events:none';
    document.body.appendChild(ghost);
    e.dataTransfer!.setDragImage(ghost, ghost.offsetWidth / 2, 14);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }
}

function onFileDragEnd() {
  dragPaths.value = [];
  dragOverFolder.value = null;
  if (autoExpandTimer) {
    clearTimeout(autoExpandTimer);
    autoExpandTimer = null;
  }
}

function onFolderDragOver(e: DragEvent, node: TreeNode) {
  if (!dragPaths.value.length) return;
  e.dataTransfer!.dropEffect = 'move';
  if (dragOverFolder.value !== node.path) {
    dragOverFolder.value = node.path;
    // Auto-expand collapsed folder after 700ms hover
    if (!node.expanded) {
      if (autoExpandTimer) clearTimeout(autoExpandTimer);
      autoExpandTimer = setTimeout(() => {
        if (dragOverFolder.value === node.path) toggle(node);
        autoExpandTimer = null;
      }, 700);
    }
  }
}

let autoExpandTimer: ReturnType<typeof setTimeout> | null = null;

function onFolderDragLeave(e: DragEvent, node: TreeNode) {
  // Only clear when the pointer truly leaves the row element (not a child)
  const rel = e.relatedTarget as Element | null;
  if (rel && (e.currentTarget as Element).contains(rel)) return;
  if (dragOverFolder.value === node.path) dragOverFolder.value = null;
  if (autoExpandTimer) {
    clearTimeout(autoExpandTimer);
    autoExpandTimer = null;
  }
}

async function onRootDrop() {
  if (!storageRes.value) return;
  const rootPrefix = explorer.rootPrefix(storageRes.value.location);
  const fakeRoot = { path: rootPrefix, name: '', isFolder: true } as TreeNode;
  await onFolderDrop(new DragEvent('drop'), fakeRoot);
  await refreshFolder(null);
}

async function onFolderDrop(_e: DragEvent, targetFolder: TreeNode) {
  dragOverFolder.value = null;
  const paths = [...dragPaths.value];
  dragPaths.value = [];
  if (!paths.length || !storageRes.value) return;
  // Filter out files already in this folder
  const toMove = paths.filter((p) => {
    const parentPrefix = p.substring(0, p.lastIndexOf('/') + 1);
    return parentPrefix !== targetFolder.path;
  });
  if (!toMove.length) return;
  moveLoading.value = true;
  try {
    for (const srcPath of toMove) {
      const fileName = srcPath.replace(/\/$/, '').split('/').pop()!;
      const destPath = targetFolder.path + fileName;
      const bytes = await withRenew(() => explorer.getObject(storageRes.value!, srcPath));
      const file = new File([bytes.buffer as ArrayBuffer], fileName);
      await withRenew(() => explorer.putObject(storageRes.value!, destPath, file, () => {}));
      await withRenew(() => explorer.deleteObject(storageRes.value!, srcPath));
      pruneNode(rootNodes.value, srcPath);
    }
    // Expand target folder and refresh its children
    targetFolder.expanded = true;
    await refreshFolder(targetFolder.path);
    selectedPaths.value = selectedPaths.value.filter((p) => !toMove.includes(p));
  } catch (e: any) {
    functions.handleError(e, 'Move files');
  } finally {
    moveLoading.value = false;
  }
}

// ---- Multi-select -----------------------------------------------------------
const selectedPaths = ref<string[]>([]);

const allVisiblePaths = computed(() => visibleRows.value.map((r) => r.node.path));

const selectAllState = computed<'all' | 'some' | 'none'>(() => {
  if (!allVisiblePaths.value.length) return 'none';
  const sel = selectedPaths.value;
  const count = allVisiblePaths.value.filter((p) => sel.includes(p)).length;
  if (count === 0) return 'none';
  if (count === allVisiblePaths.value.length) return 'all';
  return 'some';
});

function toggleSelectAll() {
  if (selectAllState.value === 'all') {
    selectedPaths.value = [];
  } else {
    selectedPaths.value = [...allVisiblePaths.value];
  }
}

function toggleSelect(path: string) {
  const idx = selectedPaths.value.indexOf(path);
  if (idx >= 0) selectedPaths.value.splice(idx, 1);
  else selectedPaths.value.push(path);
}

function isSelected(path: string) {
  return selectedPaths.value.includes(path);
}

function collectVisiblePaths(node: TreeNode): string[] {
  const paths: string[] = [node.path];
  if (node.isFolder && node.expanded) {
    for (const child of node.children) paths.push(...collectVisiblePaths(child));
  }
  return paths;
}

function toggleSelectFolder(node: TreeNode) {
  const paths = collectVisiblePaths(node);
  const allSelected = paths.every((p) => selectedPaths.value.includes(p));
  if (allSelected) {
    selectedPaths.value = selectedPaths.value.filter((p) => !paths.includes(p));
  } else {
    for (const p of paths) {
      if (!selectedPaths.value.includes(p)) selectedPaths.value.push(p);
    }
  }
}

function folderCheckState(node: TreeNode): boolean | 'indeterminate' {
  const paths = collectVisiblePaths(node);
  const count = paths.filter((p) => selectedPaths.value.includes(p)).length;
  if (count === 0) return false;
  if (count === paths.length) return true;
  return 'indeterminate';
}

async function bulkDownload() {
  for (const path of selectedPaths.value) {
    const node = findNode(rootNodes.value, path);
    if (node && !node.isFolder) await download(node);
  }
}

const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);

async function executeBulkDelete() {
  if (!storageRes.value) return;
  bulkDeleting.value = true;
  try {
    const paths = [...selectedPaths.value];
    // Expand folders to their contained file paths, skip folders that are
    // children of another selected folder (already covered).
    const filePaths: string[] = [];
    for (const path of paths) {
      const node = findNode(rootNodes.value, path);
      if (!node) continue;
      if (node.isFolder) {
        // Skip if a parent folder is also selected (will be deleted as part of it)
        const parentSelected = paths.some(
          (p) => p !== path && path.startsWith(p) && p.endsWith('/'),
        );
        if (!parentSelected) {
          filePaths.push(...(await collectAllFilePaths(path)));
        }
      } else {
        filePaths.push(path);
      }
    }
    await Promise.all(
      filePaths.map((path) => withRenew(() => explorer.deleteObject(storageRes.value!, path))),
    );
    for (const path of paths) pruneNode(rootNodes.value, path);
    selectedPaths.value = [];
    bulkDeleteOpen.value = false;
  } catch (e: any) {
    functions.handleError(e, 'Delete files');
  } finally {
    bulkDeleting.value = false;
  }
}

// ---- Delete folder ----------------------------------------------------------
const deleteFolderOpen = ref(false);
const deleteFolderLoading = ref(false);
const deleteFolderNode = ref<TreeNode | null>(null);

function confirmDeleteFolder(node: TreeNode) {
  deleteFolderNode.value = node;
  deleteFolderOpen.value = true;
}

async function collectAllFilePaths(prefix: string): Promise<string[]> {
  const entries = await withRenew(() => explorer.listPrefix(storageRes.value!, prefix));
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isFolder) {
      paths.push(...(await collectAllFilePaths(entry.path)));
    } else {
      paths.push(entry.path);
    }
  }
  return paths;
}

async function executeDeleteFolder() {
  if (!storageRes.value || !deleteFolderNode.value) return;
  deleteFolderLoading.value = true;
  try {
    const paths = await collectAllFilePaths(deleteFolderNode.value.path);
    await Promise.all(
      paths.map((path) => withRenew(() => explorer.deleteObject(storageRes.value!, path))),
    );
    pruneNode(rootNodes.value, deleteFolderNode.value.path);
    deleteFolderOpen.value = false;
  } catch (e: any) {
    functions.handleError(e, 'Delete folder');
  } finally {
    deleteFolderLoading.value = false;
  }
}

// ---- Delete -----------------------------------------------------------------
function confirmDelete(node: TreeNode) {
  deleteNode.value = node;
  deleteOpen.value = true;
}

async function doDelete() {
  if (!storageRes.value || !deleteNode.value) return;
  deleteLoading.value = true;
  try {
    await withRenew(() => explorer.deleteObject(storageRes.value!, deleteNode.value!.path));
    pruneNode(rootNodes.value, deleteNode.value.path);
    deleteOpen.value = false;
  } catch (e: any) {
    functions.handleError(e, 'Delete file');
  } finally {
    deleteLoading.value = false;
  }
}

function pruneNode(nodes: TreeNode[], path: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].path === path) {
      nodes.splice(i, 1);
      return true;
    }
    if (nodes[i].isFolder && pruneNode(nodes[i].children, path)) return true;
  }
  return false;
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.entityName, props.entityType], load);
watch(previewOpen, (open) => {
  if (!open && previewBlobUrl.value) {
    URL.revokeObjectURL(previewBlobUrl.value);
    previewBlobUrl.value = null;
  }
});
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
.storage-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-right: 20px;
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
.drag-over {
  outline: 2px dashed rgba(var(--v-theme-primary), 0.5);
  background: rgba(var(--v-theme-primary), 0.04);
}
.drop-target {
  outline: 2px solid rgba(var(--v-theme-primary), 0.7);
  background: rgba(var(--v-theme-primary), 0.08);
  border-radius: 4px;
}
</style>
