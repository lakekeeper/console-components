<template>
  <v-sheet class="d-flex flex-column" color="transparent" style="height: 100%; overflow: hidden">
    <v-sheet
      color="transparent"
      class="text-subtitle-2 py-2 px-3 flex-shrink-0 d-flex align-center nav-header">
      <span class="flex-grow-1 mr-2">Volumes</span>
      <v-btn
        icon
        size="x-small"
        variant="text"
        @click="refreshWarehouses"
        :loading="isLoading"
        title="Refresh warehouses"
        class="ml-1">
        <v-icon size="small">mdi-refresh</v-icon>
      </v-btn>
    </v-sheet>
    <v-divider class="border-opacity-25"></v-divider>

    <!-- Tree View -->
    <v-sheet color="transparent" class="flex-grow-1" style="overflow-y: auto; overflow-x: auto">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        indent-lines="default"
        class="tree-view pa-2"
        style="background-color: transparent !important; --v-treeview-indent-line-opacity: 0.5">
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
          <v-icon
            v-else-if="item.type === 'warehouse' && item.storageType === 'onelake'"
            size="small">
            <v-img :src="oneLakeIcon" width="18" height="18" />
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'warehouse'">mdi-database</v-icon>
          <v-icon size="x-small" v-else-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="x-small" v-else-if="item.type === 'dataset'" color="amber-darken-2">
            mdi-folder-multiple-outline
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'load-more'" color="grey">
            mdi-dots-horizontal
          </v-icon>
        </template>
        <template v-slot:title="{ item }">
          <div
            class="tree-item-container"
            :class="{ 'tree-leaf-row': item.type === 'dataset' }"
            :style="
              isActiveItem(item)
                ? 'background: rgba(var(--v-theme-primary), 0.14); border-radius: 4px; padding-left: 4px;'
                : ''
            "
            @mouseenter="hoveredItem = item.id"
            @mouseleave="hoveredItem = null">
            <span
              class="tree-item-title text-caption"
              :title="item.name"
              @click="onTitleClick(item)"
              :style="{
                cursor:
                  item.type === 'load-more' ||
                  item.type === 'warehouse' ||
                  item.type === 'namespace' ||
                  item.type === 'dataset'
                    ? 'pointer'
                    : 'default',
                fontStyle: item.type === 'load-more' ? 'italic' : 'normal',
                fontWeight:
                  isActiveItem(item) || item.type === 'namespace' || item.type === 'warehouse'
                    ? 600
                    : 400,
                color: isActiveItem(item)
                  ? 'rgb(var(--v-theme-primary))'
                  : item.type === 'load-more'
                    ? 'grey'
                    : undefined,
              }">
              {{ item.name }}
            </span>
          </div>
        </template>
      </v-treeview>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { Type } from '@/common/enums';
import { logError } from '@/common/errorUtils';
import s3Icon from '@/assets/s3.svg';
import cfIcon from '@/assets/cf.svg';
import oneLakeIcon from '@/assets/onelake.png';

const props = defineProps<{
  warehouseId?: string;
}>();

const functions = useFunctions();
const visualStore = useVisualStore();

const emit = defineEmits<{
  (
    e: 'navigate',
    item: {
      type: string;
      warehouseId: string;
      namespaceId?: string;
      name: string;
      id?: string;
    },
  ): void;
}>();

interface TreeItem {
  id: string;
  name: string;
  type: 'warehouse' | 'namespace' | 'dataset' | 'load-more';
  children?: TreeItem[];
  warehouseId: string;
  namespaceId?: string;
  loaded?: boolean;
  storageType?: 's3' | 'adls' | 'gcs' | 'onelake';
  storageFlavor?: string;
  storageEndpoint?: string;
  loadMoreTypes?: ('namespace' | 'dataset')[];
}

/** Max items per API page — keeps DOM light. */
const TREE_PAGE_SIZE = 100;

const treeItems = ref<TreeItem[]>([]);
const openedItems = ref<string[]>([]);
const isLoading = ref(false);
const hoveredItem = ref<string | null>(null);

const route = useRoute();
const activeMatch = computed(() => {
  const p = route.path || '';
  const prm = route.params as Record<string, string>;
  const wh = prm.id;
  if (!wh) return null;
  const nsDotted = (prm.nsid || '').split('\x1F').join('.');
  if (prm.tid && p.includes('/dataset/'))
    return { type: 'dataset', warehouseId: wh, namespaceId: nsDotted, name: prm.tid };
  if (prm.nsid) return { type: 'namespace', warehouseId: wh, namespaceId: nsDotted, name: '' };
  return { type: 'warehouse', warehouseId: wh, namespaceId: '', name: '' };
});

function isActiveItem(item: {
  type: string;
  warehouseId: string;
  namespaceId?: string;
  name: string;
}): boolean {
  const a = activeMatch.value;
  if (!a || item.warehouseId !== a.warehouseId) return false;
  if (a.type === 'warehouse') return item.type === 'warehouse';
  if (a.type === 'namespace')
    return item.type === 'namespace' && item.namespaceId === a.namespaceId;
  return item.type === a.type && item.namespaceId === a.namespaceId && item.name === a.name;
}

// Pagination tokens keyed by parent node id → { namespaces, datasets }
const pageTokens = ref<Record<string, { namespaces?: string; datasets?: string }>>({});

// Get projectId from visual store
const projectId = computed(() => visualStore.projectSelected['project-id']);

// Storage key for tree state — uses `storage-` prefix to avoid collision with WarehousesNavigationTree
const storageKey = computed(() => {
  if (props.warehouseId) {
    return `storage-${projectId.value}-${props.warehouseId}`;
  }
  return `storage-${projectId.value}`;
});

function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

function onTitleClick(item: TreeItem) {
  if (item.type === 'load-more') {
    handleLoadMore(item);
    return;
  }
  handleNavigate(item);
}

// Load all warehouses
async function loadWarehouses() {
  isLoading.value = true;
  try {
    const response = await functions.listWarehouses(false);
    if (response && response.warehouses) {
      let warehouses = response.warehouses;

      if (props.warehouseId) {
        warehouses = warehouses.filter((wh: any) => wh.id === props.warehouseId);
      }

      treeItems.value = warehouses.map((warehouse: any) => {
        const sp = warehouse['storage-profile'];
        return {
          id: `warehouse-${warehouse.id}`,
          name: warehouse.name,
          type: 'warehouse' as const,
          warehouseId: warehouse.id,
          children: [],
          loaded: false,
          storageType: sp?.type,
          storageFlavor: sp?.flavor,
          storageEndpoint: sp?.endpoint,
        };
      });

      if (props.warehouseId && treeItems.value.length > 0) {
        openedItems.value = [treeItems.value[0].id];
      }
    }
  } catch (error) {
    logError('loadWarehouses', error);
  } finally {
    isLoading.value = false;
  }
}

// Refresh warehouses while preserving expanded state
async function refreshWarehouses() {
  const previouslyOpened = [...openedItems.value];

  await loadWarehouses();

  function nodeDepth(id: string): number {
    if (id.startsWith('warehouse-')) return 0;
    if (id.startsWith('namespace-')) {
      const parts = id.split('-');
      const nsPart = parts.slice(6).join('-');
      return 1 + (nsPart.match(/\./g) || []).length;
    }
    return 999;
  }
  const sorted = previouslyOpened.sort((a, b) => nodeDepth(a) - nodeDepth(b));

  for (const nodeId of sorted) {
    const item = findItemById(treeItems.value, nodeId);
    if (item) {
      if (item.type === 'warehouse') {
        await loadNamespacesForWarehouse(item);
      } else if (item.type === 'namespace') {
        await loadChildrenForNamespace(item);
      }
    }
  }

  openedItems.value = previouslyOpened.filter((id) => findItemById(treeItems.value, id));
}

// Load root namespaces for a warehouse
async function loadNamespacesForWarehouse(item: TreeItem) {
  if (item.loaded) return;

  try {
    const response = await functions.listNamespaces(
      item.warehouseId,
      undefined,
      undefined,
      false,
      TREE_PAGE_SIZE,
    );

    if (response && response.namespaces) {
      const existingChildrenById = new Map<string, TreeItem>();
      if (item.children) {
        for (const child of item.children) {
          existingChildrenById.set(child.id, child);
        }
      }

      const namespaceItems: TreeItem[] = response.namespaces.map((ns: string[]) => {
        const namespacePath = ns.join('.');
        const displayName = ns[ns.length - 1];
        const childId = `namespace-${item.warehouseId}-${namespacePath}`;

        const existing = existingChildrenById.get(childId);
        if (existing) {
          existing.name = displayName;
          return existing;
        }

        return {
          id: childId,
          name: displayName,
          type: 'namespace' as const,
          warehouseId: item.warehouseId,
          namespaceId: namespacePath,
          children: [],
          loaded: false,
        };
      });

      item.children = namespaceItems;
      item.loaded = true;

      const nsToken = response['next-page-token'];
      if (nsToken && (response.namespaces?.length ?? 0) >= TREE_PAGE_SIZE) {
        pageTokens.value[item.id] = { namespaces: nsToken };
        namespaceItems.push({
          id: `load-more-${item.id}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: item.warehouseId,
          loaded: true,
          loadMoreTypes: ['namespace'],
        });
      } else {
        delete pageTokens.value[item.id];
      }

      treeItems.value = [...treeItems.value];
    }
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visualStore.setSnackbarMsg({
        function: 'loadNamespacesForWarehouse',
        text: `Access denied: warehouse "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visualStore.setSnackbarMsg({
        function: 'loadNamespacesForWarehouse',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    openedItems.value = openedItems.value.filter((id) => id !== item.id);
  }
}

// Load sub-namespaces and datasets for a namespace
async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || !item.namespaceId) return;

  const apiNamespace = namespacePathToApiFormat(item.namespaceId);

  const existingChildrenById = new Map<string, TreeItem>();
  if (item.children) {
    for (const child of item.children) {
      existingChildrenById.set(child.id, child);
    }
  }

  const [namespacesResult, datasetsResult] = await Promise.allSettled([
    functions.listNamespaces(item.warehouseId, apiNamespace, undefined, false, TREE_PAGE_SIZE),
    functions.listGenericTables(item.warehouseId, apiNamespace, undefined, false, TREE_PAGE_SIZE),
  ]);

  if (namespacesResult.status === 'rejected' && datasetsResult.status === 'rejected') {
    const error: any = namespacesResult.reason;
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visualStore.setSnackbarMsg({
        function: 'loadChildrenForNamespace',
        text: `Access denied: namespace "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visualStore.setSnackbarMsg({
        function: 'loadChildrenForNamespace',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    openedItems.value = openedItems.value.filter((id) => id !== item.id);
    return;
  }

  const children: TreeItem[] = [];

  if (namespacesResult.status === 'fulfilled') {
    const namespacesResponse = namespacesResult.value;
    if (namespacesResponse && namespacesResponse.namespaces) {
      namespacesResponse.namespaces.forEach((ns: string[]) => {
        const subNamespacePath = ns.join('.');
        const displayName = ns[ns.length - 1];
        const childId = `namespace-${item.warehouseId}-${subNamespacePath}`;

        const existing = existingChildrenById.get(childId);
        if (existing) {
          existing.name = displayName;
          children.push(existing);
        } else {
          children.push({
            id: childId,
            name: displayName,
            type: 'namespace',
            warehouseId: item.warehouseId,
            namespaceId: subNamespacePath,
            children: [],
            loaded: false,
          });
        }
      });
    }
  }

  if (datasetsResult.status === 'fulfilled') {
    const gtResponse = datasetsResult.value;
    if (gtResponse && gtResponse.identifiers) {
      gtResponse.identifiers
        .filter((gt: any) => gt.format === 'dataset')
        .forEach((gt: any) => {
          children.push({
            id: `dataset-${item.warehouseId}-${item.namespaceId}-${gt.name}`,
            name: gt.name,
            type: 'dataset',
            warehouseId: item.warehouseId,
            namespaceId: item.namespaceId,
            loaded: true,
          });
        });
    }
  }

  item.children = children;
  item.loaded = true;

  const tokens: { namespaces?: string; datasets?: string } = {};
  if (
    namespacesResult.status === 'fulfilled' &&
    namespacesResult.value?.['next-page-token'] &&
    (namespacesResult.value.namespaces?.length ?? 0) >= TREE_PAGE_SIZE
  ) {
    tokens.namespaces = namespacesResult.value['next-page-token'];
  }
  if (
    datasetsResult.status === 'fulfilled' &&
    datasetsResult.value?.['next-page-token'] &&
    (datasetsResult.value.identifiers?.filter((gt: any) => gt.format === 'dataset').length ?? 0) >=
      TREE_PAGE_SIZE
  ) {
    tokens.datasets = datasetsResult.value['next-page-token'];
  }

  const loadMoreTypes: ('namespace' | 'dataset')[] = [];
  if (tokens.namespaces) loadMoreTypes.push('namespace');
  if (tokens.datasets) loadMoreTypes.push('dataset');

  if (loadMoreTypes.length > 0) {
    pageTokens.value[item.id] = tokens;
    children.push({
      id: `load-more-${item.id}`,
      name: 'Load more…',
      type: 'load-more',
      warehouseId: item.warehouseId,
      namespaceId: item.namespaceId,
      loaded: true,
      loadMoreTypes,
    });
  } else {
    delete pageTokens.value[item.id];
  }

  treeItems.value = [...treeItems.value];
}

// Handle "Load more…" node clicks
async function handleLoadMore(loadMoreItem: TreeItem) {
  const parentId = loadMoreItem.id.replace('load-more-', '');
  const parent = findItemById(treeItems.value, parentId);
  if (!parent || !parent.children) return;

  const tokens = pageTokens.value[parentId];
  if (!tokens) return;

  loadMoreItem.name = 'Loading…';
  treeItems.value = [...treeItems.value];

  try {
    if (parent.type === 'warehouse' && tokens.namespaces) {
      const response = await functions.listNamespaces(
        parent.warehouseId,
        undefined,
        tokens.namespaces,
        false,
        TREE_PAGE_SIZE,
      );

      parent.children = parent.children.filter((c) => c.id !== loadMoreItem.id);

      if (response?.namespaces) {
        response.namespaces.forEach((ns: string[]) => {
          const namespacePath = ns.join('.');
          const displayName = ns[ns.length - 1];
          parent.children!.push({
            id: `namespace-${parent.warehouseId}-${namespacePath}`,
            name: displayName,
            type: 'namespace',
            warehouseId: parent.warehouseId,
            namespaceId: namespacePath,
            children: [],
            loaded: false,
          });
        });
      }

      if (response?.['next-page-token'] && (response.namespaces?.length ?? 0) >= TREE_PAGE_SIZE) {
        pageTokens.value[parentId] = { namespaces: response['next-page-token'] };
        parent.children.push({
          id: `load-more-${parentId}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: parent.warehouseId,
          loaded: true,
          loadMoreTypes: ['namespace'],
        });
      } else {
        delete pageTokens.value[parentId];
      }
    }

    if (parent.type === 'namespace' && parent.namespaceId) {
      const apiNamespace = namespacePathToApiFormat(parent.namespaceId);

      const calls: Promise<any>[] = [];
      const callTypes: string[] = [];
      if (tokens.namespaces) {
        calls.push(
          functions.listNamespaces(
            parent.warehouseId,
            apiNamespace,
            tokens.namespaces,
            false,
            TREE_PAGE_SIZE,
          ),
        );
        callTypes.push('namespaces');
      }
      if (tokens.datasets) {
        calls.push(
          functions.listGenericTables(
            parent.warehouseId,
            apiNamespace,
            tokens.datasets,
            false,
            TREE_PAGE_SIZE,
          ),
        );
        callTypes.push('datasets');
      }

      const results = await Promise.allSettled(calls);

      parent.children = parent.children.filter((c) => c.id !== loadMoreItem.id);

      const newTokens: { namespaces?: string; datasets?: string } = {};

      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') return;
        const data = result.value;
        const type = callTypes[idx];

        if (type === 'namespaces' && data?.namespaces) {
          data.namespaces.forEach((ns: string[]) => {
            const subPath = ns.join('.');
            parent.children!.push({
              id: `namespace-${parent.warehouseId}-${subPath}`,
              name: ns[ns.length - 1],
              type: 'namespace',
              warehouseId: parent.warehouseId,
              namespaceId: subPath,
              children: [],
              loaded: false,
            });
          });
          if (data['next-page-token'] && (data.namespaces?.length ?? 0) >= TREE_PAGE_SIZE) {
            newTokens.namespaces = data['next-page-token'];
          }
        }

        if (type === 'datasets' && data?.identifiers) {
          data.identifiers
            .filter((gt: any) => gt.format === 'dataset')
            .forEach((gt: any) => {
              parent.children!.push({
                id: `dataset-${parent.warehouseId}-${parent.namespaceId}-${gt.name}`,
                name: gt.name,
                type: 'dataset',
                warehouseId: parent.warehouseId,
                namespaceId: parent.namespaceId,
                loaded: true,
              });
            });
          if (data['next-page-token'] && (data.identifiers?.length ?? 0) >= TREE_PAGE_SIZE) {
            newTokens.datasets = data['next-page-token'];
          }
        }
      });

      const loadMoreTypes: ('namespace' | 'dataset')[] = [];
      if (newTokens.namespaces) loadMoreTypes.push('namespace');
      if (newTokens.datasets) loadMoreTypes.push('dataset');

      if (loadMoreTypes.length > 0) {
        pageTokens.value[parentId] = newTokens;
        parent.children.push({
          id: `load-more-${parentId}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: parent.warehouseId,
          namespaceId: parent.namespaceId,
          loaded: true,
          loadMoreTypes,
        });
      } else {
        delete pageTokens.value[parentId];
      }
    }
  } catch (error: any) {
    logError('[StorageNavTree] handleLoadMore', error);
    loadMoreItem.name = 'Load more…';
  }

  treeItems.value = [...treeItems.value];
}

// Watch for opened items changes and load children
watch(openedItems, async (newOpened, oldOpened) => {
  const newlyOpened = newOpened.filter((id) => !oldOpened.includes(id));

  for (const itemId of newlyOpened) {
    const item = findItemById(treeItems.value, itemId);
    if (item && !item.loaded) {
      if (item.type === 'warehouse') {
        await loadNamespacesForWarehouse(item);
      } else if (item.type === 'namespace') {
        await loadChildrenForNamespace(item);
      }
    }
  }

  const newlyClosed = oldOpened.filter((id) => !newOpened.includes(id));

  for (const itemId of newlyClosed) {
    const item = findItemById(treeItems.value, itemId);
    if (item && (item.type === 'warehouse' || item.type === 'namespace')) {
      item.loaded = false;
      treeItems.value = [...treeItems.value];
    }
  }
});

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

async function expandTreeToPath(warehouseId: string, namespacePath: string) {
  const warehouseNodeId = `warehouse-${warehouseId}`;
  const warehouseNode = findItemById(treeItems.value, warehouseNodeId);

  if (!warehouseNode) return;

  if (!warehouseNode.loaded) {
    await loadNamespacesForWarehouse(warehouseNode);
  }
  if (!openedItems.value.includes(warehouseNodeId)) {
    openedItems.value = [...openedItems.value, warehouseNodeId];
  }

  const segments = namespacePath.split('.');
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath = i === 0 ? segments[0] : `${currentPath}.${segments[i]}`;
    const nsNodeId = `namespace-${warehouseId}-${currentPath}`;
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

async function handleNavigate(item: TreeItem) {
  if (item.type === 'warehouse') {
    emit('navigate', {
      type: item.type,
      warehouseId: item.warehouseId,
      name: item.name,
      id: item.id,
    });
    return;
  }

  if (item.type === 'namespace') {
    emit('navigate', {
      type: item.type,
      warehouseId: item.warehouseId,
      namespaceId: item.namespaceId,
      name: item.name,
      id: item.id,
    });
    return;
  }

  if (item.type === 'dataset') {
    emit('navigate', {
      type: item.type,
      warehouseId: item.warehouseId,
      namespaceId: item.namespaceId,
      name: item.name,
      id: item.id,
    });
    return;
  }
}

// Discard cache if nodes are missing format (migration guard — not needed here but kept for consistency)
function stripStaleLoadMore(items: TreeItem[]): void {
  for (const item of items) {
    if (item.children?.length) {
      item.children = item.children.filter((c) => c.type !== 'load-more');
      stripStaleLoadMore(item.children);
    }
  }
}

onMounted(async () => {
  const savedState = visualStore.warehouseTreeState[storageKey.value];

  if (savedState && savedState.treeItems.length > 0) {
    try {
      const response = await functions.listWarehouses(false);
      if (response && response.warehouses) {
        let serverWarehouses = response.warehouses;
        if (props.warehouseId) {
          serverWarehouses = serverWarehouses.filter((wh: any) => wh.id === props.warehouseId);
        }
        const validWarehouseIds = new Set(serverWarehouses.map((wh: any) => wh.id));

        const validTreeItems = savedState.treeItems.filter((item: TreeItem) =>
          validWarehouseIds.has(item.warehouseId),
        );

        if (validTreeItems.length > 0) {
          stripStaleLoadMore(validTreeItems);
          treeItems.value = validTreeItems;
          openedItems.value = (savedState.openedItems || []).filter((id: string) =>
            validTreeItems.some((wh: TreeItem) => id === wh.id || id.includes(wh.warehouseId)),
          );
          return;
        }
      }
    } catch {
      // Fall through to fresh load
    }
  }

  await loadWarehouses();

  if (props.warehouseId) {
    const warehouseNodeId = `warehouse-${props.warehouseId}`;
    if (treeItems.value.length > 0) {
      const node = findItemById(treeItems.value, warehouseNodeId);
      if (node) await loadNamespacesForWarehouse(node);
    }
  }
});

// Save tree state when it changes
watch(
  [treeItems, openedItems],
  () => {
    if (storageKey.value && treeItems.value.length > 0) {
      visualStore.warehouseTreeState[storageKey.value] = {
        treeItems: treeItems.value,
        openedItems: openedItems.value,
      };
    }
  },
  { deep: true },
);

// Watch for project changes
watch(projectId, () => {
  loadWarehouses();
});

// Watch for warehouseId prop changes
watch(
  () => props.warehouseId,
  () => {
    loadWarehouses();
  },
);

// Watch for warehouse list changes
watch(
  () => visualStore.warehouseListRefreshSignal,
  async () => {
    await refreshWarehouses();
  },
);

// Watch for navTreeRefreshSignal
watch(
  () => visualStore.navTreeRefreshSignal,
  async (signal) => {
    if (!signal.warehouseId) return;
    if (props.warehouseId && props.warehouseId !== signal.warehouseId) return;

    if (signal.namespaceId) {
      const nodeId = `namespace-${signal.warehouseId}-${signal.namespaceId}`;
      const node = findItemById(treeItems.value, nodeId);
      if (node) {
        node.loaded = false;
        await loadChildrenForNamespace(node);
        if (!openedItems.value.includes(nodeId)) {
          openedItems.value = [...openedItems.value, nodeId];
        }
      }
    } else {
      const nodeId = `warehouse-${signal.warehouseId}`;
      const node = findItemById(treeItems.value, nodeId);
      if (node) {
        node.loaded = false;
        await loadNamespacesForWarehouse(node);
        if (!openedItems.value.includes(nodeId)) {
          openedItems.value = [...openedItems.value, nodeId];
        }
      }
    }
  },
  { deep: true },
);

// Clean up on unmount
onBeforeUnmount(() => {
  if (storageKey.value && treeItems.value.length > 0) {
    visualStore.warehouseTreeState[storageKey.value] = {
      treeItems: treeItems.value,
      openedItems: openedItems.value,
    };
  }
});

defineExpose({ expandTreeToPath, refreshWarehouses });
</script>

<style scoped>
.tree-view {
  font-size: 0.75rem;
  min-width: max-content;
  background-color: transparent !important;
}

/* Force transparency on all treeview internal components */
.tree-view :deep(.v-treeview),
.tree-view :deep(.v-treeview-node),
.tree-view :deep(.v-treeview-node__root),
.tree-view :deep(.v-list),
.tree-view :deep(.v-list-item__overlay) {
  background-color: transparent !important;
}

/* Prevent text wrapping in tree items */
.tree-view :deep(.v-treeview-item) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item__content) {
  white-space: nowrap;
}

/* Remove all row backgrounds for complete transparency */
.tree-view :deep(.v-treeview-item .v-list-item) {
  background-color: transparent !important;
}

.tree-view :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.tree-view :deep(.v-list-item) {
  overflow-x: auto !important;
  min-width: max-content;
  min-height: 26px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
/* Leaf rows (datasets) are more compact than container rows (warehouse/namespace). */
.tree-view :deep(.v-list-item:has(.tree-leaf-row)) {
  min-height: 20px !important;
}
.tree-view :deep(.v-list-item__content) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.tree-view :deep(.v-treeview-item__content),
.tree-view :deep(.v-list-item-title) {
  line-height: 1.2 !important;
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

.tree-item-action-btn {
  flex-shrink: 0;
}
</style>
