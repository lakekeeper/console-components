<template>
  <v-card class="tree-card" height="100%">
    <v-card-title class="text-subtitle-2 py-2">Warehouse Navigation</v-card-title>
    <v-card-text class="tree-content pa-2">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        class="tree-view"
      >
        <template v-slot:prepend="{ item }">
          <v-icon size="small" v-if="item.type === 'namespace'">
            mdi-folder-outline
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'table'">
            mdi-table
          </v-icon>
          <v-icon size="small" v-else-if="item.type === 'view'">
            mdi-eye-outline
          </v-icon>
        </template>
        <template v-slot:title="{ item }">
          <span 
            @click="handleItemClick(item)"
            class="tree-item-title text-caption"
            :title="item.name"
          >
            {{ item.name }}
          </span>
        </template>
      </v-treeview>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useFunctions } from '@/plugins/functions'

const functions = useFunctions()

const props = defineProps<{
  warehouseId: string
}>()

const emit = defineEmits<{
  (e: 'item-selected', item: { type: string, namespace?: string, name: string }): void
}>()

interface TreeItem {
  id: string
  name: string
  type: 'namespace' | 'table' | 'view'
  children?: TreeItem[]
  warehouseId: string
  namespaceId?: string // Full namespace path with dots (e.g., 'finance.sub')
  loaded?: boolean
}

const treeItems = ref<TreeItem[]>([])
const openedItems = ref<string[]>([])

// Helper function to convert namespace array to API format
// Iceberg REST API expects namespace parts separated by Unit Separator (%1F)
function namespaceToApiFormat(nsArray: string[]): string {
  return nsArray.join('\x1F')
}

// Helper function to convert namespace path with dots to API format
function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F')
}

// Load root namespaces on mount
async function loadNamespaces() {
  console.log('Loading root namespaces for warehouse:', props.warehouseId)
  try {
    const response = await functions.listNamespaces(props.warehouseId)
    console.log('Root namespaces response:', response)
    
    if (response.namespaces && Array.isArray(response.namespaces)) {
      treeItems.value = response.namespaces.map((nsArray: string[]) => {
        const fullPath = nsArray.join('.')
        return {
          id: `ns-${fullPath}`,
          name: nsArray[nsArray.length - 1], // Display only the last part
          type: 'namespace' as const,
          children: [],
          warehouseId: props.warehouseId,
          namespaceId: fullPath, // Store full path with dots for display
          loaded: false
        }
      })
      console.log('Created tree items:', treeItems.value)
    }
  } catch (error) {
    console.error('Error loading namespaces:', error)
  }
}

// Load children (sub-namespaces, tables, views) for a namespace when expanded
async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || item.type !== 'namespace') return
  
  console.log('Loading children for namespace:', item.namespaceId)
  
  try {
    // Convert namespace path to API format (replace dots with Unit Separator)
    const apiNamespace = namespacePathToApiFormat(item.namespaceId!)
    console.log('API namespace format:', apiNamespace, 'from:', item.namespaceId)
    
    // Load child namespaces
    const namespacesResponse = await functions.listNamespaces(props.warehouseId, apiNamespace)
    console.log('Child namespaces response:', namespacesResponse)
    
    // Load tables
    const tablesResponse = await functions.listTables(props.warehouseId, apiNamespace)
    console.log('Tables response:', tablesResponse)
    
    // Load views
    const viewsResponse = await functions.listViews(props.warehouseId, apiNamespace)
    console.log('Views response:', viewsResponse)
    
    const childNamespaces = namespacesResponse.namespaces || []
    const tables = tablesResponse.identifiers || []
    const views = viewsResponse.identifiers || []
    
    console.log(`Found ${childNamespaces.length} child namespaces, ${tables.length} tables, and ${views.length} views in ${item.namespaceId}`)
    
    const children: TreeItem[] = []
    
    // Add child namespaces
    // nsArray is the full path like ['finance', 'products1']
    // We need to join it to get the full path for API calls
    childNamespaces.forEach((nsArray: string[]) => {
      const fullPath = nsArray.join('.') // Full path with dots
      children.push({
        id: `ns-${fullPath}`,
        name: nsArray[nsArray.length - 1], // Display only the last segment
        type: 'namespace',
        children: [],
        warehouseId: props.warehouseId,
        namespaceId: fullPath,
        loaded: false
      })
    })
    
    // Add tables
    tables.forEach((table: { name: string }) => {
      children.push({
        id: `table-${item.namespaceId}-${table.name}`,
        name: table.name,
        type: 'table',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId
      })
    })
    
    // Add views
    views.forEach((view: { name: string }) => {
      children.push({
        id: `view-${item.namespaceId}-${view.name}`,
        name: view.name,
        type: 'view',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId
      })
    })
    
    item.children = children
    item.loaded = true
    console.log('Loaded children:', children)
  } catch (error) {
    console.error('Error loading children for namespace:', item.namespaceId, error)
  }
}

// Watch for opened items changes and load children
watch(openedItems, async (newOpened, oldOpened) => {
  console.log('Opened items changed:', newOpened)
  
  // Find newly opened items
  const newlyOpened = newOpened.filter(id => !oldOpened.includes(id))
  
  for (const itemId of newlyOpened) {
    // Find the item in the tree
    const item = findItemById(treeItems.value, itemId)
    if (item && item.type === 'namespace' && !item.loaded) {
      await loadChildrenForNamespace(item)
    }
  }
})

// Helper to find item by ID in tree
function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

function handleItemClick(item: TreeItem) {
  if (item.type === 'table' || item.type === 'view') {
    emit('item-selected', {
      type: item.type,
      namespace: item.namespaceId,
      name: item.name
    })
  }
}

onMounted(() => {
  loadNamespaces()
})
</script>

<style scoped>
.tree-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-content {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  min-height: 0;
}

.tree-view {
  font-size: 0.75rem;
}

.tree-item-title {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.tree-item-title:hover {
  text-decoration: underline;
}

/* Customize scrollbar for better appearance */
.tree-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.tree-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.tree-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.tree-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>
