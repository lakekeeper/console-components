<template>
  <v-card class="pa-2" elevation="0" style="height: 100%; overflow-y: auto">
    <v-treeview
      :items="treeItems"
      :load-children="loadChildren"
      item-title="name"
      item-value="id"
      density="compact"
      :open-on-click="true"
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
      };
    });
  } catch (error) {
    console.error('Failed to load namespaces:', error);
    treeItems.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadChildren(item: TreeItem) {
  if (item.type !== 'namespace' || !item.namespaceId) return;

  try {
    // Load tables and views
    const tablesResponse = await functions.listTables(props.warehouseId, item.namespaceId);
    const identifiers = tablesResponse.identifiers || [];
    
    const tables = identifiers
      .filter((id: any) => id.type === 'TABLE')
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

    item.children = [...tables, ...views];
  } catch (error) {
    console.error('Failed to load tables/views:', error);
    item.children = [];
  }
}

function handleItemClick(items: string[]) {
  if (items.length === 0) return;
  
  const itemId = items[0];
  const item = findItemById(treeItems.value, itemId);
  
  if (item && item.type !== 'namespace') {
    emit('itemSelected', {
      type: item.type,
      warehouseId: props.warehouseId,
      namespaceId: item.namespaceId!,
      name: item.name,
    });
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
