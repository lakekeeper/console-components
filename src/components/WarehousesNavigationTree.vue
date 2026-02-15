<template>
  <v-sheet class="d-flex flex-column" style="height: 100%; overflow: hidden">
    <v-sheet class="text-subtitle-2 py-2 px-3 flex-shrink-0 d-flex align-center nav-header">
      <span class="flex-grow-1">{{ headerTitle }}</span>
      <v-btn
        icon
        size="x-small"
        variant="text"
        @click="refreshWarehouses"
        :loading="isLoading"
        title="Refresh warehouses">
        <v-icon size="small">mdi-refresh</v-icon>
      </v-btn>
    </v-sheet>
    <v-divider class="border-opacity-25"></v-divider>
    <v-sheet class="flex-grow-1" style="overflow-y: auto; overflow-x: auto">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        class="tree-view pa-2">
        <template v-slot:prepend="{ item }">
          <v-icon size="small" v-if="item.type === 'warehouse'">mdi-database</v-icon>
          <v-icon size="small" v-else-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="small" v-else-if="item.type === 'table'">mdi-table</v-icon>
          <v-icon size="small" v-else-if="item.type === 'view'">mdi-eye-outline</v-icon>
        </template>
        <template v-slot:title="{ item }">
          <div
            class="tree-item-container"
            @mouseenter="hoveredItem = item.id"
            @mouseleave="hoveredItem = null">
            <span
              class="tree-item-title text-caption"
              :title="item.name"
              @click="handleNavigate(item)"
              :style="{
                cursor:
                  item.type === 'warehouse' ||
                  item.type === 'namespace' ||
                  item.type === 'table' ||
                  item.type === 'view'
                    ? 'pointer'
                    : 'default',
              }">
              {{ item.name }}
            </span>
            <v-menu v-if="item.type === 'namespace'">
              <template v-slot:activator="{ props }">
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  v-bind="props"
                  class="tree-item-action-btn"
                  @click.stop
                  title="Go to namespace tab">
                  <v-icon size="x-small">mdi-open-in-new</v-icon>
                </v-btn>
              </template>
              <v-list density="compact" class="compact-menu">
                <v-list-item @click="navigateToTab(item, 'namespaces')" density="compact">
                  <v-list-item-title class="text-caption">
                    <v-icon size="x-small" class="mr-1">mdi-folder-multiple</v-icon>
                    Namespaces
                  </v-list-item-title>
                </v-list-item>
                <v-list-item @click="navigateToTab(item, 'tables')" density="compact">
                  <v-list-item-title class="text-caption">
                    <v-icon size="x-small" class="mr-1">mdi-table</v-icon>
                    Tables
                  </v-list-item-title>
                </v-list-item>
                <v-list-item @click="navigateToTab(item, 'views')" density="compact">
                  <v-list-item-title class="text-caption">
                    <v-icon size="x-small" class="mr-1">mdi-eye-outline</v-icon>
                    Views
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
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

const props = defineProps<{
  warehouseId?: string; // Optional: filter to show only this warehouse
  warehouseName?: string; // Optional: warehouse name for header
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
      tab?: string;
    },
  ): void;
}>();

interface TreeItem {
  id: string;
  name: string;
  type: 'warehouse' | 'namespace' | 'table' | 'view';
  children?: TreeItem[];
  warehouseId: string;
  namespaceId?: string; // Full namespace path with dots (e.g., 'finance.sub')
  loaded?: boolean;
}

const treeItems = ref<TreeItem[]>([]);
const openedItems = ref<string[]>([]);
const isLoading = ref(false);
const hoveredItem = ref<string | null>(null);

// Get projectId from visual store
const projectId = computed(() => visualStore.projectSelected['project-id']);

// Computed header title
const headerTitle = computed(() => {
  if (props.warehouseId && props.warehouseName) {
    return props.warehouseName;
  }
  return 'All Warehouses';
});

// Helper function to convert namespace path from API format to display format
// function apiFormatToNamespacePath(apiPath: string): string {
//   return apiPath.split('\x1F').join('.');
// }

// Helper function to convert namespace path with dots to API format
function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

// Load all warehouses
async function loadWarehouses() {
  isLoading.value = true;
  try {
    const response = await functions.listWarehouses(false);
    if (response && response.warehouses) {
      let warehouses = response.warehouses;

      // Filter to specific warehouse if warehouseId prop is provided
      if (props.warehouseId) {
        warehouses = warehouses.filter((wh: any) => wh.id === props.warehouseId);
      }

      treeItems.value = warehouses.map((warehouse: any) => ({
        id: `warehouse-${warehouse.id}`,
        name: warehouse.name,
        type: 'warehouse' as const,
        warehouseId: warehouse.id,
        children: [],
        loaded: false,
      }));

      // Auto-expand the warehouse if filtering to specific one
      if (props.warehouseId && treeItems.value.length > 0) {
        openedItems.value = [treeItems.value[0].id];
      }
    }
  } catch (error) {
    console.error('Error loading warehouses:', error);
  } finally {
    isLoading.value = false;
  }
}

// Refresh warehouses and reset tree state
async function refreshWarehouses() {
  openedItems.value = [];
  await loadWarehouses();
  
  // Clear saved state on refresh
  if (visualStore.projectSelected['project-id']) {
    delete visualStore.warehouseTreeState[visualStore.projectSelected['project-id']];
  }
}

// Load namespaces for a warehouse
async function loadNamespacesForWarehouse(item: TreeItem) {
  if (item.loaded) return;

  try {
    const response = await functions.listNamespaces(item.warehouseId);

    if (response && response.namespaces) {
      const namespaceItems: TreeItem[] = response.namespaces.map((ns: string[]) => {
        // ns is already an array like ["f-inance"] or ["finance", "sub"]
        const namespacePath = ns.join('.');
        const displayName = ns[ns.length - 1]; // Display only the last segment

        return {
          id: `namespace-${item.warehouseId}-${namespacePath}`,
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

      // Force reactivity by creating a new array reference
      treeItems.value = [...treeItems.value];
    }
  } catch (error) {
    console.error('Error loading namespaces for warehouse:', item.name, error);
  }
}

// Load sub-namespaces, tables and views for a namespace
async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || !item.namespaceId) return;

  try {
    const apiNamespace = namespacePathToApiFormat(item.namespaceId);

    // Load sub-namespaces, tables and views in parallel
    const [namespacesResponse, tablesResponse, viewsResponse] = await Promise.all([
      functions.listNamespaces(item.warehouseId, apiNamespace),
      functions.listTables(item.warehouseId, apiNamespace),
      functions.listViews(item.warehouseId, apiNamespace),
    ]);

    const children: TreeItem[] = [];

    // Add sub-namespaces
    if (namespacesResponse && namespacesResponse.namespaces) {
      namespacesResponse.namespaces.forEach((ns: string[]) => {
        // API returns full namespace path, not relative
        const subNamespacePath = ns.join('.');
        const displayName = ns[ns.length - 1];

        children.push({
          id: `namespace-${item.warehouseId}-${subNamespacePath}`,
          name: displayName,
          type: 'namespace',
          warehouseId: item.warehouseId,
          namespaceId: subNamespacePath,
          children: [],
          loaded: false,
        });
      });
    }

    // Add tables
    if (tablesResponse && tablesResponse.identifiers) {
      tablesResponse.identifiers.forEach((table: any) => {
        children.push({
          id: `table-${item.warehouseId}-${item.namespaceId}-${table.name}`,
          name: table.name,
          type: 'table',
          warehouseId: item.warehouseId,
          namespaceId: item.namespaceId,
          loaded: true,
        });
      });
    }

    // Add views
    if (viewsResponse && viewsResponse.identifiers) {
      viewsResponse.identifiers.forEach((view: any) => {
        children.push({
          id: `view-${item.warehouseId}-${item.namespaceId}-${view.name}`,
          name: view.name,
          type: 'view',
          warehouseId: item.warehouseId,
          namespaceId: item.namespaceId,
          loaded: true,
        });
      });
    }

    item.children = children;
    item.loaded = true;

    // Force reactivity by creating a new array reference
    treeItems.value = [...treeItems.value];
  } catch (error) {
    console.error('Error loading children for namespace:', item.name, error);
  }
}

// Watch for opened items changes and load children
watch(openedItems, async (newOpened, oldOpened) => {
  // Find newly opened items
  const newlyOpened = newOpened.filter((id) => !oldOpened.includes(id));

  for (const itemId of newlyOpened) {
    // Find the item in the tree
    const item = findItemById(treeItems.value, itemId);
    if (item && !item.loaded) {
      if (item.type === 'warehouse') {
        await loadNamespacesForWarehouse(item);
      } else if (item.type === 'namespace') {
        await loadChildrenForNamespace(item);
      }
    }
  }
});

// Helper to find item by ID in tree
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

function handleNavigate(item: TreeItem) {
  // Emit navigation for warehouse, namespace, table, and view types
  if (
    item.type === 'warehouse' ||
    item.type === 'namespace' ||
    item.type === 'table' ||
    item.type === 'view'
  ) {
    emit('navigate', {
      type: item.type,
      warehouseId: item.warehouseId,
      namespaceId: item.namespaceId,
      name: item.name,
      id: item.id,
    });
  }
}

function navigateToTab(item: TreeItem, tab: string) {
  if (item.type === 'namespace') {
    emit('navigate', {
      type: item.type,
      warehouseId: item.warehouseId,
      namespaceId: item.namespaceId,
      name: item.name,
      id: item.id,
      tab: tab,
    });
  }
}

onMounted(() => {
  // Try to restore saved state first
  const savedState = visualStore.warehouseTreeState[projectId.value];
  if (savedState && savedState.treeItems.length > 0) {
    treeItems.value = savedState.treeItems;
    openedItems.value = savedState.openedItems || [];
  } else {
    loadWarehouses();
  }
});

// Save tree state when it changes
watch([treeItems, openedItems], () => {
  if (projectId.value && treeItems.value.length > 0) {
    visualStore.warehouseTreeState[projectId.value] = {
      treeItems: treeItems.value,
      openedItems: openedItems.value,
    };
  }
}, { deep: true });

// Watch for project changes and reload warehouses
watch(projectId, () => {
  const savedState = visualStore.warehouseTreeState[projectId.value];
  if (savedState && savedState.treeItems.length > 0) {
    treeItems.value = savedState.treeItems;
    openedItems.value = savedState.openedItems || [];
  } else {
    loadWarehouses();
  }
});

// Watch for warehouseId changes and reload (filtering mode)
watch(
  () => props.warehouseId,
  () => {
    // In filter mode, always reload (don't use saved state)
    loadWarehouses();
  },
);
</script>

<style scoped>
.tree-view {
  font-size: 0.75rem;
  min-width: max-content;
}

/* Prevent text wrapping in tree items */
.tree-view :deep(.v-treeview-item) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item__content) {
  white-space: nowrap;
}

.nav-header {
  background-color: rgba(var(--v-theme-surface-variant));
}

/* Alternating row colors for better visibility */
.tree-view :deep(.v-treeview-item:nth-of-type(odd) .v-list-item) {
  background-color: rgba(var(--v-theme-surface));
}

.tree-view :deep(.v-treeview-item:nth-of-type(even) .v-list-item) {
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
}

.tree-view :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.tree-view :deep(.v-list-item) {
  overflow-x: auto !important;
  min-width: max-content;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
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

.compact-menu :deep(.v-list-item) {
  min-height: 28px !important;
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.compact-menu :deep(.v-list-item-title) {
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}
</style>
