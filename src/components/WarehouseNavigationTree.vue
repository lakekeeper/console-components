<template>
  <div class="tree-container">
    <div class="tree-header text-subtitle-2 py-2 px-3">Warehouse Navigation</div>
    <v-divider></v-divider>
    <div class="tree-scroll-area">
      <div class="tree-content">
        <v-treeview
          v-model:opened="openedItems"
          :items="treeItems"
          item-value="id"
          density="compact"
          open-on-click
          class="tree-view pa-2"
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
            <div 
              @click="handleItemClick(item)"
              class="tree-item-title text-caption"
              :title="item.name"
            >
              {{ item.name }}
            </div>
          </template>
        </v-treeview>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useFunctions } from '@/plugins/functions'

const functions = useFunctions()

const props = defineProps<{
  warehouseId: string
}>()

const emit = defineEmits<{
  (e: 'item-selected', item: { type: string, namespaceId?: string, name: string }): void
}>()

interface TreeItem {
  id: string
  name: string
  type: 'namespace' | 'table' | 'view'
  children?: TreeItem[]
  warehouseId: string
  namespaceId?: string
  loaded?: boolean
}

const treeItems = ref<TreeItem[]>([])
const openedItems = ref<string[]>([])

function namespaceToApiFormat(nsArray: string[]): string {
  return nsArray.join('\x1F')
}

function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F')
}

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
          name: nsArray[nsArray.length - 1],
          type: 'namespace' as const,
          children: [],
          warehouseId: props.warehouseId,
          namespaceId: fullPath,
          loaded: false
        }
      })
      console.log('Created tree items:', treeItems.value)
    }
  } catch (error) {
    console.error('Error loading namespaces:', error)
  }
}

async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || item.type !== 'namespace') return
  
  console.log('Loading children for namespace:', item.namespaceId)
  
  try {
    const apiNamespace = namespacePathToApiFormat(item.namespaceId!)
    console.log('API namespace format:', apiNamespace, 'from:', item.namespaceId)
    
    const namespacesResponse = await functions.listNamespaces(props.warehouseId, apiNamespace)
    console.log('Child namespaces response:', namespacesResponse)
    
    const tablesResponse = await functions.listTables(props.warehouseId, apiNamespace)
    console.log('Tables response:', tablesResponse)
    
    const viewsResponse = await functions.listViews(props.warehouseId, apiNamespace)
    console.log('Views response:', viewsResponse)
    
    const childNamespaces = namespacesResponse.namespaces || []
    const tables = tablesResponse.identifiers || []
    const views = viewsResponse.identifiers || []
    
    console.log(`Found ${childNamespaces.length} child namespaces, ${tables.length} tables, and ${views.length} views in ${item.namespaceId}`)
    
    const children: TreeItem[] = []
    
    childNamespaces.forEach((nsArray: string[]) => {
      const fullPath = nsArray.join('.')
      children.push({
        id: `ns-${fullPath}`,
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        children: [],
        warehouseId: props.warehouseId,
        namespaceId: fullPath,
        loaded: false
      })
    })
    
    tables.forEach((table: { name: string }) => {
      children.push({
        id: `table-${item.namespaceId}-${table.name}`,
        name: table.name,
        type: 'table',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId
      })
    })
    
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

watch(openedItems, async (newOpened, oldOpened) => {
  console.log('Opened items changed:', newOpened)
  
  const newlyOpened = newOpened.filter(id => !oldOpened.includes(id))
  
  for (const itemId of newlyOpened) {
    const item = findItemById(treeItems.value, itemId)
    if (item && item.type === 'namespace' && !item.loaded) {
      await loadChildrenForNamespace(item)
    }
  }
})

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
      namespaceId: item.namespaceId,
      name: item.name
    })
  }
}

onMounted(() => {
  loadNamespaces()
})
</script>

<style scoped>
.tree-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  position: relative;
}

.tree-header {
  flex-shrink: 0;
  font-weight: 500;
  background: #f5f5f5;
}

.tree-scroll-area {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}

.tree-content {
  min-width: max-content;
  width: 100%;
}

.tree-view {
  font-size: 0.75rem;
}

/* Override Vuetify's default styles to prevent wrapping */
.tree-view :deep(.v-list-item) {
  white-space: nowrap !important;
}

.tree-view :deep(.v-list-item__content) {
  white-space: nowrap !important;
}

.tree-view :deep(.v-treeview-item) {
  white-space: nowrap !important;
}

.tree-view :deep(.v-treeview-item__content) {
  white-space: nowrap !important;
}

.tree-view :deep(.v-list-item-title) {
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.tree-item-title {
  cursor: pointer;
  user-select: none;
  white-space: nowrap !important;
  display: inline-block;
}

.tree-item-title:hover {
  text-decoration: underline;
}

/* Visible scrollbars */
.tree-scroll-area::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.tree-scroll-area::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.tree-scroll-area::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

.tree-scroll-area::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Firefox */
.tree-scroll-area {
  scrollbar-width: auto;
  scrollbar-color: #888 #f1f1f1;
}
</style>
