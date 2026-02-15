<template>
  <v-sheet class="d-flex flex-column" color="transparent" height="100%" style="overflow: hidden">
    <v-sheet color="transparent" class="text-subtitle-2 py-2 px-3 flex-shrink-0 nav-header">
      Warehouse: {{ warehouseName }}
    </v-sheet>
    <v-divider class="border-opacity-25"></v-divider>
    <v-sheet color="transparent" class="flex-grow-1" style="overflow-y: auto; overflow-x: auto">
      <v-treeview
        v-model:opened="openedItems"
        :items="treeItems"
        item-value="id"
        density="compact"
        open-on-click
        class="tree-view pa-2">
        <template v-slot:prepend="{ item }">
          <v-icon size="small" v-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="small" v-else-if="item.type === 'table'">mdi-table</v-icon>
          <v-icon size="small" v-else-if="item.type === 'view'">mdi-eye-outline</v-icon>
          <v-icon
            v-else-if="item.type === 'field' && item.fieldType"
            :icon="getTypeIcon(item.fieldType)"
            :color="getTypeColor(item.fieldType)"
            size="small"></v-icon>
        </template>
        <template v-slot:title="{ item }">
          <div
            class="tree-item-container"
            @mouseenter="hoveredItem = item.id"
            @mouseleave="hoveredItem = null"
            @click="navigationMode ? handleNavigate(item) : undefined"
            :style="{
              cursor:
                navigationMode &&
                (item.type === 'namespace' || item.type === 'table' || item.type === 'view')
                  ? 'pointer'
                  : 'default',
            }">
            <span class="tree-item-title text-caption" :title="item.fieldType || item.name">
              {{ item.name }}
            </span>
            <v-btn
              v-if="!navigationMode && (item.type === 'table' || item.type === 'view')"
              icon
              size="x-small"
              variant="text"
              class="tree-item-insert-btn"
              :style="{ opacity: hoveredItem === item.id ? 1 : 0, transition: 'opacity 0.2s ease' }"
              @click.stop="handleItemClick(item)"
              :title="`Insert ${item.type} path into query`">
              <v-icon size="small">mdi-plus-circle-outline</v-icon>
            </v-btn>
            <v-btn
              v-if="!navigationMode && item.type === 'field'"
              icon
              size="x-small"
              variant="text"
              class="tree-item-insert-btn"
              :style="{ opacity: hoveredItem === item.id ? 1 : 0, transition: 'opacity 0.2s ease' }"
              @click.stop="handleFieldClick(item)"
              :title="`Insert field name`">
              <v-icon size="small">mdi-plus-circle-outline</v-icon>
            </v-btn>
          </div>
        </template>
      </v-treeview>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

const functions = useFunctions();

const props = defineProps<{
  warehouseId: string;
  warehouseName: string;
  navigationMode?: boolean; // If true, clicking navigates instead of inserting text
}>();

const emit = defineEmits<{
  (e: 'item-selected', item: { type: string; namespaceId?: string; name: string }): void;
  (
    e: 'navigate',
    item: { type: string; warehouseId: string; namespaceId?: string; name: string; id?: string },
  ): void;
}>();

interface TreeItem {
  id: string;
  name: string;
  type: 'namespace' | 'table' | 'view' | 'field';
  children?: TreeItem[];
  warehouseId: string;
  namespaceId?: string; // Full namespace path with dots (e.g., 'finance.sub')
  loaded?: boolean;
  fieldType?: string; // For field items: int, string, float, etc.
  parentType?: 'table' | 'view'; // For field items: parent's type
  parentName?: string; // For field items: parent table/view name
}

const treeItems = ref<TreeItem[]>([]);
const openedItems = ref<string[]>([]);
const hoveredItem = ref<string | null>(null);

// Helper function to convert namespace path with dots to API format
function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

// Load root namespaces on mount
async function loadNamespaces() {
  try {
    const response = await functions.listNamespaces(props.warehouseId);

    if (response.namespaces && Array.isArray(response.namespaces)) {
      treeItems.value = response.namespaces.map((nsArray: string[]) => {
        const fullPath = nsArray.join('.');
        return {
          id: `ns-${fullPath}`,
          name: nsArray[nsArray.length - 1], // Display only the last part
          type: 'namespace' as const,
          children: [],
          warehouseId: props.warehouseId,
          namespaceId: fullPath, // Store full path with dots for display
          loaded: false,
        };
      });
    }
  } catch (error) {
    console.error('Error loading namespaces:', error);
  }
}

// Load children (sub-namespaces, tables, views) for a namespace when expanded
async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || item.type !== 'namespace') return;

  try {
    // Convert namespace path to API format (replace dots with Unit Separator)
    const apiNamespace = namespacePathToApiFormat(item.namespaceId!);

    // Load child namespaces
    const namespacesResponse = await functions.listNamespaces(props.warehouseId, apiNamespace);

    // Load tables
    const tablesResponse = await functions.listTables(props.warehouseId, apiNamespace);

    // Load views
    const viewsResponse = await functions.listViews(props.warehouseId, apiNamespace);

    const childNamespaces = namespacesResponse.namespaces || [];
    const tables = tablesResponse.identifiers || [];
    const views = viewsResponse.identifiers || [];

    const children: TreeItem[] = [];

    // Add child namespaces
    // nsArray is the full path like ['finance', 'products1']
    // We need to join it to get the full path for API calls
    childNamespaces.forEach((nsArray: string[]) => {
      const fullPath = nsArray.join('.'); // Full path with dots
      children.push({
        id: `ns-${fullPath}`,
        name: nsArray[nsArray.length - 1], // Display only the last segment
        type: 'namespace',
        children: [],
        warehouseId: props.warehouseId,
        namespaceId: fullPath,
        loaded: false,
      });
    });

    // Add tables
    tables.forEach((table: { name: string }) => {
      children.push({
        id: `table-${item.namespaceId}-${table.name}`,
        name: table.name,
        type: 'table',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId,
        children: [],
        loaded: false,
      });
    });

    // Add views
    views.forEach((view: { name: string }) => {
      children.push({
        id: `view-${item.namespaceId}-${view.name}`,
        name: view.name,
        type: 'view',
        warehouseId: props.warehouseId,
        namespaceId: item.namespaceId,
        children: [],
        loaded: false,
      });
    });

    item.children = children;
    item.loaded = true;
  } catch (error) {
    console.error('Error loading children for namespace:', item.namespaceId, error);
  }
}

// Load fields for a table or view when expanded
async function loadFieldsForTableOrView(item: TreeItem) {
  if (item.loaded || (item.type !== 'table' && item.type !== 'view')) return;

  try {
    const apiNamespace = namespacePathToApiFormat(item.namespaceId!);

    // Load table or view metadata
    const metadata: any =
      item.type === 'table'
        ? await functions.loadTable(props.warehouseId, apiNamespace, item.name)
        : await functions.loadView(props.warehouseId, apiNamespace, item.name);

    // Extract fields from the current schema
    const fields: TreeItem[] = [];

    if (item.type === 'view') {
      // For views, use current-version-id to find the correct version, then get its schema
      if (metadata && metadata['metadata'] && metadata['metadata']['versions']) {
        const currentVersionId = metadata['metadata']['current-version-id'];
        // Find the current version
        const currentVersion = metadata['metadata']['versions'].find(
          (v: any) => v['version-id'] === currentVersionId,
        );

        if (currentVersion && currentVersion['schema-id'] !== undefined) {
          const schemaId = currentVersion['schema-id'];

          // Now find the schema by schema-id
          const schemas = metadata['metadata']['schemas'];
          const currentSchema = schemas?.find((s: any) => s['schema-id'] === schemaId);

          if (currentSchema && currentSchema.fields) {
            currentSchema.fields.forEach((field: any) => {
              const fieldType =
                typeof field.type === 'string' ? field.type : JSON.stringify(field.type);
              fields.push({
                id: `field-${item.id}-${field.id}`,
                name: field.name,
                type: 'field',
                fieldType: fieldType,
                warehouseId: props.warehouseId,
                namespaceId: item.namespaceId,
                parentType: item.type as 'table' | 'view',
                parentName: item.name,
              });
            });
          }
        }
      }
    } else {
      // For tables, use current-schema-id directly
      if (metadata && metadata['metadata'] && metadata['metadata']['schemas']) {
        const schemas = metadata['metadata']['schemas'];
        const currentSchemaId = metadata['metadata']['current-schema-id'] || 0;

        // Find the current schema
        const currentSchema = schemas.find((s: any) => s['schema-id'] === currentSchemaId);

        if (currentSchema && currentSchema.fields) {
          currentSchema.fields.forEach((field: any) => {
            const fieldType =
              typeof field.type === 'string' ? field.type : JSON.stringify(field.type);
            fields.push({
              id: `field-${item.id}-${field.id}`,
              name: field.name,
              type: 'field',
              fieldType: fieldType,
              warehouseId: props.warehouseId,
              namespaceId: item.namespaceId,
              parentType: item.type as 'table' | 'view',
              parentName: item.name,
            });
          });
        }
      }
    }

    item.children = fields;
    item.loaded = true;
  } catch (error) {
    console.error(`Error loading fields for ${item.type}:`, item.name, error);
  }
} // Watch for opened items changes and load children
watch(openedItems, async (newOpened, oldOpened) => {
  // Find newly opened items
  const newlyOpened = newOpened.filter((id) => !oldOpened.includes(id));

  for (const itemId of newlyOpened) {
    // Find the item in the tree
    const item = findItemById(treeItems.value, itemId);
    if (item && !item.loaded) {
      if (item.type === 'namespace') {
        await loadChildrenForNamespace(item);
      } else if (item.type === 'table' || item.type === 'view') {
        await loadFieldsForTableOrView(item);
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

// Get icon for field type
function getTypeIcon(fieldType: string): string {
  const type = fieldType.toLowerCase();

  // Numeric types
  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  ) {
    return 'mdi-numeric';
  }
  // Float/Double types
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) {
    return 'mdi-decimal';
  }
  // String types
  if (type.includes('string') || type.includes('char') || type.includes('varchar')) {
    return 'mdi-format-text';
  }
  // Boolean
  if (type.includes('bool')) {
    return 'mdi-checkbox-marked-circle-outline';
  }
  // Date/Time types
  if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
    return 'mdi-calendar-clock';
  }
  // Binary
  if (type.includes('binary') || type.includes('bytes')) {
    return 'mdi-file-code';
  }
  // UUID
  if (type.includes('uuid')) {
    return 'mdi-identifier';
  }
  // Struct/Map/List (complex types)
  if (
    type.includes('struct') ||
    type.includes('map') ||
    type.includes('list') ||
    type.includes('array')
  ) {
    return 'mdi-code-json';
  }

  // Default
  return 'mdi-help-circle-outline';
}

// Get color for field type
function getTypeColor(fieldType: string): string {
  const type = fieldType.toLowerCase();

  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  ) {
    return 'blue';
  }
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) {
    return 'cyan';
  }
  if (type.includes('string') || type.includes('char') || type.includes('varchar')) {
    return 'green';
  }
  if (type.includes('bool')) {
    return 'orange';
  }
  if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
    return 'purple';
  }
  if (type.includes('binary') || type.includes('bytes')) {
    return 'grey';
  }
  if (type.includes('uuid')) {
    return 'indigo';
  }
  if (
    type.includes('struct') ||
    type.includes('map') ||
    type.includes('list') ||
    type.includes('array')
  ) {
    return 'amber';
  }

  return 'grey';
}

function handleFieldClick(item: TreeItem) {
  if (item.type === 'field') {
    emit('item-selected', {
      type: item.type,
      namespaceId: item.namespaceId,
      name: item.name,
    });
  }
}

function handleItemClick(item: TreeItem) {
  if (item.type === 'table' || item.type === 'view') {
    emit('item-selected', {
      type: item.type,
      namespaceId: item.namespaceId,
      name: item.name,
    });
  }
}

function handleNavigate(item: TreeItem) {
  // Only emit navigation for namespace, table, and view types
  if (item.type === 'namespace' || item.type === 'table' || item.type === 'view') {
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
  loadNamespaces();
});
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

.tree-item-insert-btn {
  opacity: 0 !important;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.tree-item-container:hover .tree-item-insert-btn {
  opacity: 1 !important;
}

.tree-item-title:hover {
  text-decoration: underline;
}

/* Vuetify v-sheet handles scrolling natively */
</style>
