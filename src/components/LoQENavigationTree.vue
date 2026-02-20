<template>
  <v-sheet class="d-flex flex-column" color="transparent" style="height: 100%; overflow: hidden">
    <!-- Header -->
    <v-sheet
      color="transparent"
      class="text-subtitle-2 py-2 px-3 flex-shrink-0 d-flex align-center">
      <v-icon size="small" class="mr-1">mdi-file-tree-outline</v-icon>
      <span class="flex-grow-1">Object Browser</span>
      <v-btn
        icon
        size="x-small"
        variant="text"
        @click="refreshTree"
        :loading="isLoading"
        title="Refresh">
        <v-icon size="small">mdi-refresh</v-icon>
      </v-btn>
    </v-sheet>

    <v-divider />

    <!-- Loading state -->
    <div v-if="isLoading && treeItems.length === 0" class="text-center py-4">
      <v-progress-circular indeterminate size="24" color="primary" />
      <div class="text-caption mt-2 text-grey">Loading warehouses…</div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!isLoading && treeItems.length === 0" class="text-center py-4 px-3">
      <v-icon size="32" color="grey-lighten-1">mdi-database-off-outline</v-icon>
      <div class="text-caption mt-2 text-grey">No warehouses found</div>
    </div>

    <!-- Tree -->
    <v-sheet
      v-else
      color="transparent"
      class="flex-grow-1"
      style="overflow-y: auto; overflow-x: auto">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        class="tree-view pa-2"
        style="background-color: transparent !important">
        <template v-slot:prepend="{ item }">
          <!-- Warehouse: cloud provider icon -->
          <v-icon
            v-if="
              item.type === 'warehouse' && item.storageType === 's3' && item.storageFlavor === 'aws'
            "
            size="small"
            color="orange">
            mdi-aws
          </v-icon>
          <v-icon
            v-else-if="
              item.type === 'warehouse' &&
              item.storageType === 's3' &&
              item.storageEndpoint?.includes('cloudflarestorage')
            "
            size="small">
            <v-img :src="cfIcon" width="18" height="18" />
          </v-icon>
          <v-icon v-else-if="item.type === 'warehouse' && item.storageType === 's3'" size="small">
            <v-img :src="s3Icon" width="18" height="18" />
          </v-icon>
          <v-icon
            v-else-if="item.type === 'warehouse' && item.storageType === 'adls'"
            size="small"
            color="primary">
            mdi-microsoft-azure
          </v-icon>
          <v-icon
            v-else-if="item.type === 'warehouse' && item.storageType === 'gcs'"
            size="small"
            color="info">
            mdi-google-cloud
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'warehouse'" color="blue-grey">
            mdi-database
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="small" v-else-if="item.type === 'table'">mdi-table</v-icon>
          <v-icon size="small" v-else-if="item.type === 'view'">mdi-eye-outline</v-icon>
          <v-icon
            v-else-if="item.type === 'field' && item.fieldType"
            :icon="getTypeIcon(item.fieldType)"
            :color="getTypeColor(item.fieldType)"
            size="small" />
        </template>

        <template v-slot:title="{ item }">
          <div
            class="tree-item-container"
            @mouseenter="hoveredItem = item.id"
            @mouseleave="hoveredItem = null">
            <span class="tree-item-title text-caption" :title="item.fieldType || item.name">
              {{ item.name }}
            </span>

            <!-- Attach chip on warehouse -->
            <v-chip
              v-if="item.type === 'warehouse' && isWarehouseAttached(item.warehouseId)"
              size="x-small"
              color="success"
              variant="flat"
              class="ml-1"
              style="height: 16px; font-size: 0.6rem">
              attached
            </v-chip>

            <!-- Insert button for tables/views -->
            <v-btn
              v-if="item.type === 'table' || item.type === 'view'"
              icon
              size="x-small"
              variant="text"
              class="tree-item-insert-btn"
              :style="{ opacity: hoveredItem === item.id ? 1 : 0 }"
              @click.stop="handleInsertPath(item)"
              title="Insert path into query">
              <v-icon size="small">mdi-plus-circle-outline</v-icon>
            </v-btn>

            <!-- Insert button for fields -->
            <v-btn
              v-if="item.type === 'field'"
              icon
              size="x-small"
              variant="text"
              class="tree-item-insert-btn"
              :style="{ opacity: hoveredItem === item.id ? 1 : 0 }"
              @click.stop="handleInsertField(item)"
              title="Insert field name">
              <v-icon size="small">mdi-plus-circle-outline</v-icon>
            </v-btn>
          </div>
        </template>
      </v-treeview>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
// import { useUserStore } from '@/stores/user';
import type { AttachedCatalog } from '../composables/loqe/types';
import s3Icon from '@/assets/s3.svg';
import cfIcon from '@/assets/cf.svg';

// ── Props / Emits ─────────────────────────────────────────────────────

const props = defineProps<{
  /** List of currently attached catalogs in LoQE */
  attachedCatalogs: AttachedCatalog[];
}>();

const emit = defineEmits<{
  /** User clicked a table/view/field to insert into the SQL editor */
  (
    e: 'item-selected',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId?: string;
      name: string;
    },
  ): void;
  /** User expanded a warehouse that is not yet attached — request auto-attach */
  (
    e: 'attach-warehouse',
    warehouse: { warehouseId: string; warehouseName: string; catalogUrl: string },
  ): void;
}>();

// ── Dependencies ──────────────────────────────────────────────────────

const functions = useFunctions();
const visualStore = useVisualStore();
// const appConfig = inject<any>('appConfig', {});

// ── Types ─────────────────────────────────────────────────────────────

interface TreeItem {
  id: string;
  name: string;
  type: 'warehouse' | 'namespace' | 'table' | 'view' | 'field';
  children?: TreeItem[];
  warehouseId: string;
  warehouseName?: string;
  namespaceId?: string;
  loaded?: boolean;
  fieldType?: string;
  parentType?: 'table' | 'view';
  parentName?: string;
  /** Storage profile type — only set on warehouse nodes. */
  storageType?: 's3' | 'adls' | 'gcs';
  storageFlavor?: string;
  storageEndpoint?: string;
}

// ── State ─────────────────────────────────────────────────────────────

const treeItems = ref<TreeItem[]>([]);
const openedItems = ref<string[]>([]);
const hoveredItem = ref<string | null>(null);
const isLoading = ref(false);

// Cached warehouse metadata (warehouseId → name)
const warehouseNames = new Map<string, string>();

// ── Helpers ───────────────────────────────────────────────────────────

function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

function isWarehouseAttached(warehouseId: string): boolean {
  const whName = warehouseNames.get(warehouseId);
  if (!whName) return false;
  return props.attachedCatalogs.some((c) => c.catalogName === whName);
}

function getCatalogUrl(): string {
  return functions.icebergCatalogUrlSuffixed();
}

// ── Load warehouses ───────────────────────────────────────────────────

async function loadWarehouses() {
  isLoading.value = true;
  try {
    const response = await functions.listWarehouses(false);
    if (response?.warehouses) {
      treeItems.value = response.warehouses.map((wh: any) => {
        warehouseNames.set(wh['warehouse-id'] || wh.id, wh.name);
        const sp = wh['storage-profile'];
        return {
          id: `wh-${wh['warehouse-id'] || wh.id}`,
          name: wh.name,
          type: 'warehouse' as const,
          warehouseId: wh['warehouse-id'] || wh.id,
          warehouseName: wh.name,
          children: [],
          loaded: false,
          storageType: sp?.type,
          storageFlavor: sp?.flavor,
          storageEndpoint: sp?.endpoint,
        };
      });

      // Auto-attach every warehouse that isn't already attached so
      // the user can query any catalog immediately without clicking.
      const catalogUrl = getCatalogUrl();
      for (const item of treeItems.value) {
        if (!isWarehouseAttached(item.warehouseId)) {
          emit('attach-warehouse', {
            warehouseId: item.warehouseId,
            warehouseName: item.warehouseName || item.name,
            catalogUrl,
          });
        }
      }
    }
  } catch (e) {
    console.error('[LoQE Tree] Failed to load warehouses:', e);
  } finally {
    isLoading.value = false;
  }
}

async function refreshTree() {
  openedItems.value = [];
  await loadWarehouses();
}

// ── Load namespaces for warehouse ─────────────────────────────────────

async function loadNamespacesForWarehouse(item: TreeItem) {
  if (item.loaded) return;

  try {
    const response = await functions.listNamespaces(item.warehouseId, undefined, undefined, false);

    if (response?.namespaces) {
      item.children = response.namespaces.map((ns: string[]) => {
        const fullPath = ns.join('.');
        return {
          id: `ns-${item.warehouseId}-${fullPath}`,
          name: ns[ns.length - 1],
          type: 'namespace' as const,
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName || item.name,
          namespaceId: fullPath,
          children: [],
          loaded: false,
        };
      });
    }

    item.loaded = true;
    treeItems.value = [...treeItems.value]; // force reactivity

    // Emit attach-warehouse if not already attached
    if (!isWarehouseAttached(item.warehouseId)) {
      emit('attach-warehouse', {
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName || item.name,
        catalogUrl: getCatalogUrl(),
      });
    }
  } catch (error: any) {
    console.error('[LoQE Tree] Failed to load namespaces:', error);
    // Collapse back on error
    openedItems.value = openedItems.value.filter((id) => id !== item.id);
  }
}

// ── Load children for namespace ───────────────────────────────────────

async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || !item.namespaceId) return;

  try {
    const apiNs = namespacePathToApiFormat(item.namespaceId);

    const [namespacesRes, tablesRes, viewsRes] = await Promise.all([
      functions.listNamespaces(item.warehouseId, apiNs, undefined, false),
      functions.listTables(item.warehouseId, apiNs, undefined, false),
      functions.listViews(item.warehouseId, apiNs, undefined, false),
    ]);

    const children: TreeItem[] = [];

    // Sub-namespaces
    if (namespacesRes?.namespaces) {
      namespacesRes.namespaces.forEach((ns: string[]) => {
        const fullPath = ns.join('.');
        children.push({
          id: `ns-${item.warehouseId}-${fullPath}`,
          name: ns[ns.length - 1],
          type: 'namespace',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: fullPath,
          children: [],
          loaded: false,
        });
      });
    }

    // Tables
    if (tablesRes?.identifiers) {
      tablesRes.identifiers.forEach((t: any) => {
        children.push({
          id: `table-${item.warehouseId}-${item.namespaceId}-${t.name}`,
          name: t.name,
          type: 'table',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: item.namespaceId,
          children: [],
          loaded: false,
        });
      });
    }

    // Views
    if (viewsRes?.identifiers) {
      viewsRes.identifiers.forEach((v: any) => {
        children.push({
          id: `view-${item.warehouseId}-${item.namespaceId}-${v.name}`,
          name: v.name,
          type: 'view',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: item.namespaceId,
          children: [],
          loaded: false,
        });
      });
    }

    item.children = children;
    item.loaded = true;
    treeItems.value = [...treeItems.value];
  } catch (error: any) {
    console.error('[LoQE Tree] Failed to load namespace children:', error);
    openedItems.value = openedItems.value.filter((id) => id !== item.id);
  }
}

// ── Load fields for table/view ────────────────────────────────────────

async function loadFieldsForTableOrView(item: TreeItem) {
  if (item.loaded || (item.type !== 'table' && item.type !== 'view')) return;

  try {
    const apiNs = namespacePathToApiFormat(item.namespaceId!);

    const metadata: any =
      item.type === 'table'
        ? await functions.loadTable(item.warehouseId, apiNs, item.name, false)
        : await functions.loadView(item.warehouseId, apiNs, item.name, false);

    const fields: TreeItem[] = [];

    if (item.type === 'view') {
      if (metadata?.metadata?.versions) {
        const currentVersionId = metadata.metadata['current-version-id'];
        const currentVersion = metadata.metadata.versions.find(
          (v: any) => v['version-id'] === currentVersionId,
        );
        if (currentVersion) {
          const schemaId = currentVersion['schema-id'];
          const schema = metadata.metadata.schemas?.find((s: any) => s['schema-id'] === schemaId);
          schema?.fields?.forEach((field: any) => {
            fields.push(makeFieldItem(item, field));
          });
        }
      }
    } else {
      if (metadata?.metadata?.schemas) {
        const currentSchemaId = metadata.metadata['current-schema-id'] || 0;
        const schema = metadata.metadata.schemas.find(
          (s: any) => s['schema-id'] === currentSchemaId,
        );
        schema?.fields?.forEach((field: any) => {
          fields.push(makeFieldItem(item, field));
        });
      }
    }

    item.children = fields;
    item.loaded = true;
    treeItems.value = [...treeItems.value];
  } catch (error: any) {
    console.error(`[LoQE Tree] Failed to load fields for ${item.type}:`, error);
  }
}

function makeFieldItem(parent: TreeItem, field: any): TreeItem {
  const fieldType = typeof field.type === 'string' ? field.type : JSON.stringify(field.type);
  return {
    id: `field-${parent.id}-${field.id}`,
    name: field.name,
    type: 'field',
    fieldType,
    warehouseId: parent.warehouseId,
    warehouseName: parent.warehouseName,
    namespaceId: parent.namespaceId,
    parentType: parent.type as 'table' | 'view',
    parentName: parent.name,
  };
}

// ── Watch opened items ────────────────────────────────────────────────

watch(openedItems, async (newOpened, oldOpened) => {
  const newlyOpened = newOpened.filter((id) => !oldOpened.includes(id));

  for (const itemId of newlyOpened) {
    const item = findItemById(treeItems.value, itemId);
    if (!item || item.loaded) continue;

    if (item.type === 'warehouse') {
      await loadNamespacesForWarehouse(item);
    } else if (item.type === 'namespace') {
      await loadChildrenForNamespace(item);
    } else if (item.type === 'table' || item.type === 'view') {
      await loadFieldsForTableOrView(item);
    }
  }
});

// ── Find item in tree ─────────────────────────────────────────────────

function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ── Icon/color helpers (same as WarehouseNavigationTree) ──────────────

function getTypeIcon(fieldType: string): string {
  const type = fieldType.toLowerCase();
  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  )
    return 'mdi-numeric';
  if (type.includes('float') || type.includes('double') || type.includes('decimal'))
    return 'mdi-decimal';
  if (type.includes('string') || type.includes('char') || type.includes('varchar'))
    return 'mdi-format-text';
  if (type.includes('bool')) return 'mdi-checkbox-marked-circle-outline';
  if (type.includes('date') || type.includes('time') || type.includes('timestamp'))
    return 'mdi-calendar-clock';
  if (type.includes('binary') || type.includes('bytes')) return 'mdi-file-code';
  if (type.includes('uuid')) return 'mdi-identifier';
  if (
    type.includes('struct') ||
    type.includes('map') ||
    type.includes('list') ||
    type.includes('array')
  )
    return 'mdi-code-json';
  return 'mdi-help-circle-outline';
}

function getTypeColor(fieldType: string): string {
  const type = fieldType.toLowerCase();
  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  )
    return 'blue';
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) return 'cyan';
  if (type.includes('string') || type.includes('char') || type.includes('varchar')) return 'green';
  if (type.includes('bool')) return 'orange';
  if (type.includes('date') || type.includes('time') || type.includes('timestamp')) return 'purple';
  if (type.includes('binary') || type.includes('bytes')) return 'grey';
  if (type.includes('uuid')) return 'indigo';
  if (
    type.includes('struct') ||
    type.includes('map') ||
    type.includes('list') ||
    type.includes('array')
  )
    return 'amber';
  return 'grey';
}

// ── Emit handlers ─────────────────────────────────────────────────────

function handleInsertPath(item: TreeItem) {
  emit('item-selected', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

function handleInsertField(item: TreeItem) {
  emit('item-selected', {
    type: 'field',
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────

onMounted(() => {
  loadWarehouses();
});

// Watch for project changes
const projectId = computed(() => visualStore.projectSelected['project-id']);
watch(projectId, () => {
  refreshTree();
});
</script>

<style scoped>
.tree-view {
  font-size: 0.75rem;
  min-width: max-content;
  background-color: transparent !important;
}

.tree-view :deep(.v-treeview-item) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item__content) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item .v-list-item) {
  background-color: transparent !important;
}

.tree-view :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.tree-view :deep(.v-list-item) {
  overflow-x: auto !important;
  min-width: max-content;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}

.tree-view :deep(.v-list-item-title) {
  white-space: nowrap !important;
  overflow-x: auto !important;
}

.tree-item-container {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.tree-item-title {
  user-select: none;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.tree-item-title:hover {
  text-decoration: underline;
}

.tree-item-insert-btn {
  opacity: 0 !important;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.tree-item-container:hover .tree-item-insert-btn {
  opacity: 1 !important;
}
</style>
