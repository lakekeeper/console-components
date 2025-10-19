<template>
  <div style="height: 100%; display: flex; flex-direction: column; background: white;">
    <div style="padding: 8px 12px; font-size: 0.875rem; font-weight: 500; background: #f5f5f5; flex-shrink: 0;">
      Warehouse Navigation
    </div>
    <v-divider></v-divider>
    <div style="flex: 1; overflow: auto; min-height: 0;">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        style="font-size: 0.75rem; padding: 8px;"
      >
        <template v-slot:prepend="{ item }">
          <v-icon size="small" v-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="small" v-else-if="item.type === 'table'">mdi-table</v-icon>
          <v-icon size="small" v-else-if="item.type === 'view'">mdi-eye-outline</v-icon>
        </template>
        <template v-slot:title="{ item }">
          <div 
            @click="handleItemClick(item)"
            style="cursor: pointer; user-select: none; white-space: nowrap; font-size: 0.75rem;"
            :title="item.name"
          >
            {{ item.name }}
          </div>
        </template>
      </v-treeview>
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

function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F')
}

async function loadNamespaces() {
  try {
    const response = await functions.listNamespaces(props.warehouseId)
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
    }
  } catch (error) {
    console.error('Error loading namespaces:', error)
  }
}

async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || item.type !== 'namespace') return
  
  try {
    const apiNamespace = namespacePathToApiFormat(item.namespaceId!)
    
    const [namespacesResponse, tablesResponse, viewsResponse] = await Promise.all([
      functions.listNamespaces(props.warehouseId, apiNamespace),
      functions.listTables(props.warehouseId, apiNamespace),
      functions.listViews(props.warehouseId, apiNamespace)
    ])
    
    const children: TreeItem[] = []
    
    (namespacesResponse.namespaces || []).forEach((nsArray: string[]) => {
      children.push({
        id: `ns-${nsArray.join('.')}`,
        name: nsArray[nsArray.length - 1],
        type: 'namespace',
        children: [],
        warehouseId: props.warehouseId,
        namespaceId: nsArray.join('.'),
        loaded: false
      })
    })
    
    (tablesResponse.identifiers || []).forEach((table: { name: string }) => {
      children.push({
        id: `table-${item.namespaceId}-${table.name}`,
        name: table.name,
        type: 'table',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId
      })
    })
    
    (viewsResponse.identifiers || []).forEach((view: { name: string }) => {
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
  } catch (error) {
    console.error('Error loading children:', error)
  }
}

watch(openedItems, async (newOpened, oldOpened) => {
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

<style>
/* Global unscoped styles to override Vuetify with maximum specificity */
.v-treeview .v-list-item {
  white-space: nowrap !important;
}

.v-treeview .v-list-item__content {
  white-space: nowrap !important;
}

.v-treeview .v-list-item-title {
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
}
</style>
