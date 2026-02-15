<template>
  <v-sheet class="d-flex flex-column" height="100%" style="overflow: hidden">
    <v-sheet class="text-subtitle-2 py-2 px-3 flex-shrink-0" color="grey-lighten-4">
      All Warehouses
    </v-sheet>
    <v-divider></v-divider>
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
            <span class="tree-item-title text-caption" :title="item.name">
              {{ item.name }}
            </span>
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

const functions = useFunctions();
const visualStore = useVisualStore();

const emit = defineEmits<{
  (
    e: 'navigate',
    item: { type: string; warehouseId: string; namespaceId?: string; name: string; id?: string },
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

// Get projectId from visual store
const projectId = computed(() => visualStore.projectSelected['project-id']);

// Helper function to convert namespace path from API format to display format
function apiFormatToNamespacePath(apiPath: string): string {
  return apiPath.split('\x1F').join('.');
}

// Helper function to convert namespace path with dots to API format
function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

// Load all warehouses
async function loadWarehouses() {
  try {
    const response = await functions.listWarehouses(false);
    if (response && response.warehouses) {
      treeItems.value = response.warehouses.map((warehouse: any) => ({
        id: `warehouse-${warehouse.id}`,
        name: warehouse.name,
        type: 'warehouse' as const,
        warehouseId: warehouse.id,
        children: [],
        loaded: false,
      }));
    }
  } catch (error) {
    console.error('Error loading warehouses:', error);
  }
}

// Load namespaces for a warehouse
async function loadNamespacesForWarehouse(item: TreeItem) {
  if (item.loaded) return;

  try {
    const response = await functions.listNamespaces(item.warehouseId);

    if (response && response.namespaces) {
      const namespaceItems: TreeItem[] = response.namespaces.map((ns: any) => {
        const namespacePath = Array.isArray(ns.namespace)
          ? ns.namespace.join('.')
          : apiFormatToNamespacePath(ns.namespace);

        return {
          id: `namespace-${item.warehouseId}-${namespacePath}`,
          name: ns.namespace[ns.namespace.length - 1] || namespacePath, // Display only the last segment
          type: 'namespace' as const,
          warehouseId: item.warehouseId,
          namespaceId: namespacePath,
          children: [],
          loaded: false,
        };
      });

      item.children = namespaceItems;
      item.loaded = true;
    }
  } catch (error) {
    console.error('Error loading namespaces for warehouse:', item.name, error);
  }
}

// Load tables and views for a namespace
async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || !item.namespaceId) return;

  try {
    const apiNamespace = namespacePathToApiFormat(item.namespaceId);

    // Load both tables and views in parallel
    const [tablesResponse, viewsResponse] = await Promise.all([
      functions.listTables(item.warehouseId, apiNamespace),
      functions.listViews(item.warehouseId, apiNamespace),
    ]);

    const children: TreeItem[] = [];

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

onMounted(() => {
  loadWarehouses();
});

// Watch for project changes and reload warehouses
watch(projectId, () => {
  loadWarehouses();
});
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

.tree-view :deep(.v-list-item) {
  overflow-x: auto !important;
  min-width: max-content;
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
</style>
