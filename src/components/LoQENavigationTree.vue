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

    <!-- Search -->
    <v-sheet color="transparent" class="px-3 pb-2 pt-1 flex-shrink-0">
      <v-select
        v-model="selectedSearchWarehouse"
        :items="warehouseOptions"
        density="compact"
        variant="outlined"
        placeholder="Select warehouse to search…"
        hide-details
        clearable
        class="filter-field mb-1">
        <template #prepend-inner>
          <v-icon size="x-small">mdi-warehouse</v-icon>
        </template>
      </v-select>
      <v-text-field
        v-model="searchQuery"
        density="compact"
        variant="outlined"
        placeholder="Search tables & views…"
        hide-details
        clearable
        class="filter-field"
        :loading="isSearching"
        :disabled="!selectedSearchWarehouse"
        @keyup.enter="performSearch"
        @click:clear="clearSearch">
        <template #prepend-inner>
          <v-icon size="x-small">mdi-magnify</v-icon>
        </template>
        <template #append-inner>
          <v-btn
            icon
            size="x-small"
            variant="text"
            :disabled="!searchQuery || isSearching || !selectedSearchWarehouse"
            @click="performSearch"
            title="Search warehouse (fuzzy)">
            <v-icon size="small">mdi-arrow-right</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </v-sheet>

    <v-divider class="border-opacity-25" />

    <!-- Search Results -->
    <v-sheet
      v-if="hasSearched"
      color="transparent"
      class="flex-shrink-0"
      style="max-height: 240px; overflow-y: auto">
      <div v-if="isSearching" class="text-center py-3">
        <v-progress-circular color="primary" indeterminate size="20" />
        <div class="text-caption mt-1">Searching…</div>
      </div>
      <div v-else-if="searchResults.length === 0" class="text-center py-3">
        <v-icon size="24" color="grey">mdi-table-search</v-icon>
        <div class="text-caption mt-1 text-grey">No results found</div>
      </div>
      <div v-else>
        <div class="d-flex align-center px-3 pt-2">
          <span class="text-caption text-medium-emphasis flex-grow-1">
            {{ searchResults.length }} result(s)
          </span>
          <v-checkbox
            v-model="visualStore.dismissSearchOnClick"
            density="compact"
            hide-details
            class="flex-grow-0 mr-1"
            style="transform: scale(0.7); transform-origin: right center"
            title="Auto-close search results after clicking a result">
            <template #label>
              <span class="text-caption" style="font-size: 0.65rem !important; white-space: nowrap">
                Auto-close
              </span>
            </template>
          </v-checkbox>
          <v-btn
            size="x-small"
            variant="text"
            @click="dismissSearch"
            title="Dismiss search results">
            <v-icon size="small">mdi-close</v-icon>
          </v-btn>
        </div>
        <v-list density="compact" class="pa-2 pt-0 search-results-list" bg-color="transparent">
          <v-list-item
            v-for="result in searchResults"
            :key="result.id"
            density="compact"
            class="search-result-item"
            @click="handleSearchResultClick(result)">
            <template #prepend>
              <v-icon size="small" :color="result.type === 'table' ? 'blue' : 'green'">
                {{ result.type === 'table' ? 'mdi-table' : 'mdi-eye-outline' }}
              </v-icon>
            </template>
            <v-list-item-title class="text-caption">
              {{ result.name }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption" style="font-size: 0.65rem !important">
              {{ result.namespace }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                v-if="result.distance !== null && result.distance !== undefined"
                size="x-small"
                :color="
                  result.distance <= 0.2 ? 'success' : result.distance <= 0.5 ? 'warning' : 'error'
                "
                variant="flat">
                {{ Math.round((1 - result.distance) * 100) }}%
              </v-chip>
              <v-btn
                icon
                size="x-small"
                variant="text"
                @click.stop="insertSearchResult(result)"
                title="Insert into SQL editor">
                <v-icon size="small">mdi-plus-circle-outline</v-icon>
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </div>
      <v-divider class="border-opacity-25" />
    </v-sheet>

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
            :class="{ 'tree-item-active': item.id === lastFocusedNodeId }"
            :data-node-id="item.id"
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
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
// import { useUserStore } from '@/stores/user';
import { Type } from '@/common/enums';
import type { AttachedCatalog } from '../composables/loqe/types';
import type { SearchTabular } from '@/gen/management/types.gen';
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

// Search state
const searchQuery = ref('');
const selectedSearchWarehouse = ref<string | null>(null);
const isSearching = ref(false);
const hasSearched = ref(false);
const lastFocusedNodeId = ref<string | null>(null);
const searchResults = ref<
  {
    id: string;
    name: string;
    namespace: string;
    type: string;
    distance: number | null;
    warehouseId: string;
    warehouseName: string;
    namespaceId: string;
  }[]
>([]);

// Warehouse options for search picker
const warehouseOptions = computed(() =>
  treeItems.value
    .filter((item) => item.type === 'warehouse')
    .map((item) => ({ title: item.name, value: item.warehouseId })),
);

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

// ── Search ────────────────────────────────────────────────────────────

async function performSearch() {
  if (!searchQuery.value?.trim() || !selectedSearchWarehouse.value) return;

  isSearching.value = true;
  hasSearched.value = true;

  try {
    const response = await functions.searchTabular(selectedSearchWarehouse.value, {
      search: searchQuery.value.trim(),
    });

    const whName = warehouseNames.get(selectedSearchWarehouse.value) || '';

    searchResults.value = (response.tabulars || []).map((result: SearchTabular) => ({
      id: result['tabular-id'].id,
      name: result['tabular-name'],
      namespace: result['namespace-name'].join('.'),
      type: result['tabular-id'].type,
      distance: result.distance ?? null,
      warehouseId: selectedSearchWarehouse.value!,
      warehouseName: whName,
      namespaceId: result['namespace-name'].join('.'),
    }));
  } catch (error: any) {
    console.error('[LoQE Tree] Search failed:', error);
    searchResults.value = [];
    visualStore.setSnackbarMsg({
      function: 'searchTabular',
      text: error?.error?.message || error?.message || 'Search failed',
      ttl: 3000,
      ts: Date.now(),
      type: Type.ERROR,
    });
  } finally {
    isSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = '';
  hasSearched.value = false;
  searchResults.value = [];
}

function dismissSearch() {
  hasSearched.value = false;
  searchResults.value = [];
}

async function expandTreeToPath(warehouseId: string, namespacePath: string) {
  const whNodeId = `wh-${warehouseId}`;
  const whNode = findItemById(treeItems.value, whNodeId);
  if (!whNode) return;

  if (!whNode.loaded) {
    await loadNamespacesForWarehouse(whNode);
  }
  if (!openedItems.value.includes(whNodeId)) {
    openedItems.value = [...openedItems.value, whNodeId];
  }

  const segments = namespacePath.split('.');
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath = i === 0 ? segments[0] : `${currentPath}.${segments[i]}`;
    const nsNodeId = `ns-${warehouseId}-${currentPath}`;
    const nsNode = findItemById(treeItems.value, nsNodeId);
    if (!nsNode) break;

    if (!nsNode.loaded) {
      await loadChildrenForNamespace(nsNode);
    }
    if (!openedItems.value.includes(nsNodeId)) {
      openedItems.value = [...openedItems.value, nsNodeId];
    }
  }
}

async function handleSearchResultClick(result: (typeof searchResults.value)[0]) {
  // Collapse previously focused search result table/view
  if (lastFocusedNodeId.value && openedItems.value.includes(lastFocusedNodeId.value)) {
    openedItems.value = openedItems.value.filter((id) => id !== lastFocusedNodeId.value);
  }

  // Expand tree to the result's namespace
  await expandTreeToPath(result.warehouseId, result.namespaceId);

  // Expand the table/view node itself to show its fields
  const prefix = result.type === 'table' ? 'table' : 'view';
  const itemNodeId = `${prefix}-${result.warehouseId}-${result.namespaceId}-${result.name}`;
  const itemNode = findItemById(treeItems.value, itemNodeId);
  if (itemNode && !itemNode.loaded) {
    await loadFieldsForTableOrView(itemNode);
  }
  if (!openedItems.value.includes(itemNodeId)) {
    openedItems.value = [...openedItems.value, itemNodeId];
  }
  lastFocusedNodeId.value = itemNodeId;

  // Auto-dismiss search results if the option is enabled
  if (visualStore.dismissSearchOnClick) {
    dismissSearch();
  }

  // Scroll the node into view after DOM settles
  await nextTick();
  await nextTick();
  const el = document.querySelector(`[data-node-id="${itemNodeId}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function insertSearchResult(result: (typeof searchResults.value)[0]) {
  emit('item-selected', {
    type: result.type,
    warehouseId: result.warehouseId,
    warehouseName: result.warehouseName,
    namespaceId: result.namespaceId,
    name: result.name,
  });
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

// ── Icon/color helpers ────────────────────────────────────────────────

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

.tree-item-active {
  background-color: rgba(var(--v-theme-primary), 0.15);
  border-radius: 4px;
  margin: -2px -4px;
  padding: 2px 4px;
}

.tree-item-active .tree-item-title {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.filter-field :deep(.v-field) {
  font-size: 0.75rem !important;
}

.filter-field :deep(.v-field__input) {
  min-height: 28px !important;
  padding: 4px 8px !important;
}

.search-results-list :deep(.v-list-item) {
  min-height: 36px !important;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  cursor: pointer;
}

.search-results-list :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.search-result-item :deep(.v-list-item-subtitle) {
  opacity: 0.6;
}
</style>
