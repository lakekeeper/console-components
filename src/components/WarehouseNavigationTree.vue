<template>
  <v-card class="pa-2" elevation="0" style="height: 100%; overflow-y: auto">
    <v-progress-linear v-if="loading" indeterminate color="primary" />
    <v-treeview
      v-if="!loading"
      v-model:opened="openedNodes"
      :items="treeItems"
      item-title="name"
      item-value="id"
      density="compact"
      activatable
      @update:activated="handleItemClick">
      <template #prepend="{ item }">
        <v-icon v-if="item.type === 'namespace'" size="small">mdi-folder-outline</v-icon>
        <v-icon v-else-if="item.type === 'table'" size="small">mdi-table</v-icon>
        <v-icon v-else-if="item.type === 'view'" size="small">mdi-eye-outline</v-icon>
      </template>
    </v-treeview>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

interface TreeItem {
  id: string;
  name: string;
  type: 'namespace' | 'table' | 'view';
  children?: TreeItem[];
  warehouseId?: string;
  namespaceId?: string;
  loaded?: boolean;
}

interface Props {
  warehouseId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  itemSelected: [item: { type: string; warehouseId: string; namespaceId?: string; name: string }];
}>();

const functions = useFunctions();
const treeItems = ref<TreeItem[]>([]);
const loading = ref(false);
const openedNodes = ref<string[]>([]);

async function loadNamespaces() {
  loading.value = true;
  try {
    const response = await functions.listNamespaces(props.warehouseId);
    const namespaces = response.namespaces || [];
    
    treeItems.value = namespaces.map((nsArray: string[]) => {
      const namespaceStr = nsArray.join('.');
      return {
        id: `ns-${namespaceStr}`,
        name: namespaceStr,
        type: 'namespace' as const,
        warehouseId: props.warehouseId,
        namespaceId: namespaceStr,
        children: [],
        loaded: false,
      };
    });
    
    console.log('Loaded namespaces:', treeItems.value.length);
  } catch (error) {
    console.error('Failed to load namespaces:', error);
    treeItems.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadChildrenForNamespace(item: TreeItem) {
  if (item.type !== 'namespace' || !item.namespaceId || item.loaded) return;

  try {
    console.log(`Loading children for namespace: ${item.namespaceId}`);
    
    // Load tables and views
    const tablesResponse = await functions.listTables(props.warehouseId, item.namespaceId);
    const identifiers = tablesResponse.identifiers || [];
    
    console.log(`Found ${identifiers.length} identifiers in ${item.namespaceId}:`, identifiers);
    
    const tables = identifiers
      .filter((id: any) => {
        console.log(`Identifier: name=${id.name}, type=${id.type}`);
        return id.type === 'TABLE';
      })
      .map((table: any) => ({
        id: `table-${item.namespaceId}-${table.name}`,
        name: table.name,
        type: 'table' as const,
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId,
      }));

    const views = identifiers
      .filter((id: any) => id.type === 'VIEW')
      .map((view: any) => ({
        id: `view-${item.namespaceId}-${view.name}`,
        name: view.name,
        type: 'view' as const,
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId,
      }));

    // Also check for nested namespaces (type === 'NAMESPACE')
    const childNamespaces = identifiers
      .filter((id: any) => id.type === 'NAMESPACE')
      .map((ns: any) => ({
        id: `ns-${item.namespaceId}.${ns.name}`,
        name: ns.name,
        type: 'namespace' as const,
        warehouseId: props.warehouseId,
        namespaceId: `${item.namespaceId}.${ns.name}`,
        children: [],
        loaded: false,
      }));

    item.children = [...childNamespaces, ...tables, ...views];
    item.loaded = true;
    
    console.log(`Loaded ${childNamespaces.length} namespaces, ${tables.length} tables, and ${views.length} views`);
    
    // Force reactivity update
    treeItems.value = [...treeItems.value];
  } catch (error) {
    console.error('Failed to load tables/views:', error);
    item.children = [];
    item.loaded = true;
  }
}

function handleItemClick(items: string[]) {
  if (items.length === 0) return;
  
  const itemId = items[0];
  const item = findItemById(treeItems.value, itemId);
  
  console.log('Item clicked:', item);
  
  if (item) {
    if (item.type === 'namespace') {
      // Toggle namespace expansion when clicked
      const index = openedNodes.value.indexOf(itemId);
      if (index === -1) {
        openedNodes.value.push(itemId);
      } else {
        openedNodes.value.splice(index, 1);
      }
    } else {
      // Emit event for table/view selection
      emit('itemSelected', {
        type: item.type,
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId!,
        name: item.name,
      });
    }
  }
}

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

// Watch for nodes being opened
watch(openedNodes, async (newOpened, oldOpened) => {
  console.log('Opened nodes changed:', newOpened);
  
  // Find newly opened nodes
  const newlyOpened = newOpened.filter(id => !oldOpened.includes(id));
  
  for (const itemId of newlyOpened) {
    const item = findItemById(treeItems.value, itemId);
    if (item && item.type === 'namespace' && !item.loaded) {
      await loadChildrenForNamespace(item);
    }
  }
});

onMounted(() => {
  loadNamespaces();
});

watch(() => props.warehouseId, () => {
  loadNamespaces();
});
</script>

<style scoped>
.v-treeview {
  font-size: 0.875rem;
}
</style>
