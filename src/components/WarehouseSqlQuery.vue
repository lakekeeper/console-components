<template>
  <v-container fluid class="pa-0">
    <div style="display: flex; height: calc(100vh - 200px); position: relative">
      <!-- Left: Navigation Tree -->
      <div
        v-if="!isNavigationCollapsed"
        :style="{
          width: leftWidth + 'px',
          minWidth: '200px',
          maxWidth: '800px',
          height: '100%',
          overflow: 'visible',
          borderRight: '1px solid #e0e0e0',
        }">
        <WarehouseNavigationTree
          v-if="warehouseId && props.warehouseName"
          :warehouse-id="warehouseId"
          :warehouse-name="props.warehouseName"
          @item-selected="handleTableSelected" />
        <div v-else class="pa-4 text-center text-grey">
          <v-progress-circular indeterminate size="32" class="mb-2" />
          <div class="text-caption">Loading warehouse...</div>
        </div>
      </div>

      <!-- Resizable Divider -->
      <div
        v-if="!isNavigationCollapsed"
        @mousedown="startResize"
        style="
          width: 5px;
          cursor: col-resize;
          user-select: none;
          flex-shrink: 0;
          transition: background 0.5s;
        "
        :style="{ background: dividerHover || isResizing ? '#2196F3' : '#e0e0e0' }"
        @mouseenter="dividerHover = true"
        @mouseleave="dividerHover = false"></div>

      <!-- Right: SQL Query Interface -->
      <div style="flex: 1; height: 100%; overflow-y: auto; min-width: 0">
        <v-container fluid>
          <v-row>
            <v-col cols="12">
              <v-card>
                <v-card-title class="d-flex align-center">
                  <!-- Collapse/Expand Button -->
                  <v-btn icon size="small" variant="text" @click="toggleNavigation" class="mr-2">
                    <v-icon>
                      {{ isNavigationCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left' }}
                    </v-icon>
                  </v-btn>
                  Browser SQL Playground
                  <v-spacer />
                  <v-chip v-if="isCheckingWarehouse" color="info" size="small">
                    <v-icon start>mdi-loading mdi-spin</v-icon>
                    Checking Warehouse...
                  </v-chip>
                  <v-chip v-else-if="warehouseError" color="warning" size="small">
                    <v-icon start>mdi-alert</v-icon>
                    Warehouse Not Ready
                  </v-chip>
                  <v-chip v-else-if="icebergDB.isInitialized.value" color="success" size="small">
                    <v-icon start>mdi-check-circle</v-icon>
                    DuckDB Ready
                  </v-chip>
                  <v-chip
                    v-else-if="icebergDB.isInitializing.value || icebergDB.isLoadingTable.value"
                    color="info"
                    size="small">
                    <v-icon start>mdi-loading mdi-spin</v-icon>
                    Initializing...
                  </v-chip>
                </v-card-title>

                <v-card-text>
                  <!-- Loading/Initializing State -->
                  <v-alert
                    v-if="isInitializingState"
                    type="info"
                    variant="tonal"
                    prominent
                    class="mb-4">
                    <div class="text-body-1 font-weight-bold mb-2">
                      <v-icon class="mr-2">mdi-loading mdi-spin</v-icon>
                      Initializing SQL Environment
                    </div>
                    <div class="text-body-2">
                      {{ isSqlAvailable.reason }}
                    </div>
                  </v-alert>

                  <!-- Warning when SQL is not available (actual errors) -->
                  <v-alert
                    v-else-if="!isSqlAvailable.available"
                    type="warning"
                    variant="tonal"
                    prominent
                    class="mb-4">
                    <div class="text-body-1 font-weight-bold mb-2">
                      <v-icon class="mr-2">mdi-alert</v-icon>
                      SQL Queries Not Available
                    </div>
                    <div class="text-body-2">
                      {{ isSqlAvailable.reason }}
                    </div>
                    <div class="text-body-2 mt-3">
                      <strong>Requirements for DuckDB WASM:</strong>
                      <ul class="mt-2">
                        <li>{{ storageValidation.requirementsText.value.storageRequirement }}</li>
                        <li>{{ storageValidation.requirementsText.value.protocolRequirement }}</li>
                      </ul>
                    </div>
                  </v-alert>
                  <span v-else>
                    <!-- Ready State Info -->
                    <v-alert type="info" variant="tonal" class="mb-4">
                      <div class="text-body-2">
                        <strong>DuckDB WASM SQL</strong>
                        - Select a table from the left panel or query directly using the catalog.
                      </div>
                    </v-alert>

                    <!-- SQL Tabs -->
                    <v-tabs
                      v-model="activeTabIndex"
                      color="primary"
                      class="mb-2"
                      density="compact"
                      show-arrows>
                      <v-tab
                        v-for="(tab, index) in currentWarehouseTabs"
                        :key="tab.id"
                        :value="index"
                        @click="handleTabClick(tab.id)">
                        <span
                          class="text-caption"
                          @dblclick.stop="startRenameTab(tab.id, tab.name)"
                          style="cursor: pointer">
                          {{ tab.name }}
                        </span>
                        <v-menu>
                          <template v-slot:activator="{ props: menuProps }">
                            <v-icon size="x-small" class="ml-1 mr-1" v-bind="menuProps" @click.stop>
                              mdi-dots-horizontal
                            </v-icon>
                          </template>
                          <v-list density="compact">
                            <v-list-item @click="startRenameTab(tab.id, tab.name)">
                              <template v-slot:prepend>
                                <v-icon size="x-small">mdi-pencil</v-icon>
                              </template>
                              <v-list-item-title class="text-subtitle-2">Rename</v-list-item-title>
                            </v-list-item>
                            <v-list-item @click="handleCloseOtherTabs(tab.id)">
                              <template v-slot:prepend>
                                <v-icon size="x-small">mdi-close-box-multiple</v-icon>
                              </template>
                              <v-list-item-title class="text-subtitle-2">
                                Close Other Tabs
                              </v-list-item-title>
                            </v-list-item>
                          </v-list>
                        </v-menu>
                        <v-icon size="x-small" class="ml-1" @click.stop="handleCloseTab(tab.id)">
                          mdi-close
                        </v-icon>
                      </v-tab>
                      <v-btn icon size="x-small" variant="text" class="ml-2" @click="handleAddTab">
                        <v-icon>mdi-plus</v-icon>
                      </v-btn>
                    </v-tabs>

                    <!-- SQL Editor -->
                    <SqlEditor
                      ref="sqlTextarea"
                      v-model="sqlQuery"
                      @click="updateCursorPosition"
                      @keyup="updateCursorPosition"
                      :placeholder="
                        selectedTable
                          ? `SELECT * FROM ${warehouseName}.${selectedTable.namespaceId}.${selectedTable.name} LIMIT 10;`
                          : 'SELECT * FROM catalog.namespace.table LIMIT 10;'
                      "
                      :disabled="isExecuting || !isSqlAvailable.available"
                      clearable />

                    <!-- Action Buttons -->
                    <div class="d-flex gap-2 mb-4 align-center">
                      <v-btn
                        color="primary"
                        class="mr-2"
                        size="small"
                        :loading="isExecuting"
                        :disabled="!sqlQuery.trim() || isExecuting || !isSqlAvailable.available"
                        clearable
                        @click="executeQuery">
                        <v-icon start>mdi-play</v-icon>
                        Execute Query
                      </v-btn>
                      <v-btn
                        color="secondary"
                        variant="outlined"
                        class="mr-2"
                        size="small"
                        @click="sqlTextarea.clearContent()">
                        <v-icon start>mdi-close</v-icon>
                        Clear SQL
                      </v-btn>
                      <v-spacer />
                      <v-btn
                        variant="outlined"
                        :disabled="!queryResult"
                        size="small"
                        @click="clearResults">
                        <v-icon start>mdi-close</v-icon>
                        empty results
                      </v-btn>
                    </div>

                    <!-- Error Display -->
                    <v-alert
                      v-if="error"
                      type="error"
                      closable
                      @click:close="error = null"
                      class="mb-4">
                      <div class="font-weight-bold">Query Error:</div>
                      <pre class="text-caption mt-2">{{ error }}</pre>
                    </v-alert>

                    <!-- Query Results -->
                    <v-card v-if="queryResult" variant="outlined">
                      <v-card-title class="d-flex align-center bg-grey-lighten-4">
                        <v-icon class="mr-2">mdi-table</v-icon>
                        <div class="d-flex flex-column align-start">
                          <span>Query {{ activeQueryName }} Results</span>
                        </div>
                        <v-spacer />
                        <v-chip size="small" class="mr-2">
                          {{ queryResult.rowCount }} row{{ queryResult.rowCount !== 1 ? 's' : '' }}
                        </v-chip>
                        <v-btn
                          size="small"
                          variant="outlined"
                          color="primary"
                          @click="downloadCSV"
                          :disabled="!csvDownload.isDownloadAvailable(queryResult)">
                          <v-icon start>mdi-download</v-icon>
                          CSV
                        </v-btn>
                      </v-card-title>
                      <v-card-text class="pa-0">
                        <v-table density="compact" fixed-header :height="tableHeight + 'px'">
                          <thead>
                            <tr>
                              <th
                                v-for="column in queryResult.columns"
                                :key="column"
                                class="text-left font-weight-bold">
                                {{ column }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(row, rowIdx) in queryResult.rows" :key="rowIdx">
                              <td v-for="(cell, colIdx) in row" :key="colIdx">
                                {{ formatCell(cell) }}
                              </td>
                            </tr>
                          </tbody>
                        </v-table>
                      </v-card-text>

                      <!-- Resizable Handle for Table Height -->
                      <div
                        @mousedown="startTableResize"
                        style="
                          height: 5px;
                          cursor: row-resize;
                          user-select: none;
                          transition: background 0.2s;
                          border-top: 1px solid #e0e0e0;
                        "
                        :style="{
                          background:
                            tableResizeHover || isResizingTable ? '#2196F3' : 'transparent',
                        }"
                        @mouseenter="tableResizeHover = true"
                        @mouseleave="tableResizeHover = false">
                        <div
                          style="
                            text-align: center;
                            font-size: 10px;
                            color: #999;
                            line-height: 5px;
                            user-select: none;
                          ">
                          ⋮
                        </div>
                      </div>
                    </v-card>

                    <!-- Empty State -->
                    <v-card v-else variant="outlined" class="text-center pa-8">
                      <v-icon size="64" color="grey-lighten-1">mdi-database-off-outline</v-icon>
                      <div class="text-h6 mt-4 text-grey">No Results</div>
                      <div class="text-body-2 text-grey">Execute a query to see results here</div>
                    </v-card>
                  </span>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </div>

    <!-- Confirm Close Tab Dialog -->
    <v-dialog v-model="showCloseTabDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          Close Query Tab?
        </v-card-title>
        <v-card-text>
          <p class="mb-2">Are you sure you want to close "{{ tabToClose?.name }}"?</p>
          <p class="text-body-2 text-grey mb-0">
            The SQL query in this tab will be permanently deleted and cannot be recovered.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelCloseTab">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="confirmCloseTab">Delete Tab</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename Tab Dialog -->
    <v-dialog v-model="showRenameDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-pencil</v-icon>
          Rename Query
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTabName"
            label="Query Name"
            autofocus
            @keyup.enter="confirmRename"
            @keyup.esc="cancelRename"
            variant="outlined"
            density="comfortable"
            hint="Press Enter to save, Esc to cancel"
            persistent-hint
            :error="!!renameError"
            :error-messages="renameError" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelRename">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            @click="confirmRename"
            :disabled="!newTabName.trim()">
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Close Other Tabs Confirmation Dialog -->
    <v-dialog v-model="showCloseOtherTabsDialog" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-alert</v-icon>
          Close Other Tabs?
        </v-card-title>
        <v-card-text>
          <p class="mb-2">
            Are you sure you want to close all tabs except "{{ tabToKeep?.name }}"?
          </p>
          <p class="text-body-2 text-grey mb-0">
            {{ otherTabsCount }} tab{{ otherTabsCount !== 1 ? 's' : '' }} will be permanently
            deleted and cannot be recovered.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelCloseOtherTabs">Cancel</v-btn>
          <v-btn color="error" variant="elevated" @click="confirmCloseOtherTabs">
            Close Other Tabs
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, toRef } from 'vue';
import { useIcebergDuckDB } from '../composables/useIcebergDuckDB';
import type { QueryResult } from '../composables/useDuckDB';
import { useUserStore } from '../stores/user';
import { useVisualStore } from '../stores/visual';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { useCsvDownload } from '@/composables/useCsvDownload';
import WarehouseNavigationTree from './WarehouseNavigationTree.vue';
import SqlEditor from './SqlEditor.vue';

// export type WarehouseSqlQueryProps = {
//   warehouseId: string;
//   warehouseName?: string;
//   catalogUrl?: string;
//   useFreshToken?: boolean;
//   storageType?: string; // 's3', 'gcs', 'azure', etc.
// };

// // Replace the current export type and defineProps lines with:
const props = defineProps<{
  warehouseId: string;
  warehouseName?: string;
  catalogUrl?: string;
  useFreshToken?: boolean;
  storageType?: string;
}>();

const icebergDB = useIcebergDuckDB();
const csvDownload = useCsvDownload();
const visualStore = useVisualStore();
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl || ''),
);
const sqlQuery = ref('');
const queryResult = ref<QueryResult | null>(null);
const isExecuting = ref(false);
const error = ref<string | null>(null);
const isCheckingWarehouse = ref(false);
const warehouseError = ref<string | null>(null);
const hasInitialized = ref(false);
const lastExecutedTabName = ref<string>(''); // Track which tab executed the last query

// SQL Tabs
const activeTabIndex = ref(0);
const showCloseTabDialog = ref(false);
const tabToClose = ref<{ id: string; name: string } | null>(null);
const showRenameDialog = ref(false);
const tabToRename = ref<string | null>(null);
const newTabName = ref('');
const renameError = ref('');
const showCloseOtherTabsDialog = ref(false);
const tabToKeep = ref<{ id: string; name: string } | null>(null);

const selectedTable = ref<{ type: string; namespaceId: string; name: string } | null>(null);

// Resizable layout state
const leftWidth = ref(300); // Initial width in pixels
const dividerHover = ref(false);
const sqlTextarea = ref<any>(null);
const cursorPosition = ref(0);
const isResizing = ref(false);
const isNavigationCollapsed = ref(false);

// Resizable table height state
const tableHeight = ref(400); // Initial height in pixels
const isResizingTable = ref(false);
const tableResizeHover = ref(false);

// Check if we're in a loading/initializing state
const isInitializingState = computed(() => {
  return (
    !props.warehouseName ||
    isCheckingWarehouse.value ||
    icebergDB.isInitializing.value ||
    icebergDB.isLoadingTable.value
  );
});

// Computed property for active query name
const activeQueryName = computed(() => {
  // Return the name of the tab that executed the last query
  return lastExecutedTabName.value || '';
});

// Computed property for current warehouse tabs
const currentWarehouseTabs = computed(() => {
  if (!props.warehouseId) return [];
  return visualStore.getSqlTabs(props.warehouseId);
});

// Computed property for count of other tabs
const otherTabsCount = computed(() => {
  if (!tabToKeep.value) return 0;
  return currentWarehouseTabs.value.length - 1;
});

// Check if SQL querying is available based on storage and protocol
const isSqlAvailable = computed(() => {
  // Check if warehouse name is still loading
  if (!props.warehouseName) {
    return { available: false, reason: 'Loading warehouse information...' };
  }

  // Check if warehouse is still being verified
  if (isCheckingWarehouse.value) {
    return { available: false, reason: 'Checking warehouse status...' };
  }

  // Check if warehouse had an error during initialization
  if (warehouseError.value) {
    return { available: false, reason: warehouseError.value };
  }

  if (!props.catalogUrl) {
    return { available: false, reason: 'No catalog URL provided' };
  }

  // Check URL format
  try {
    new URL(props.catalogUrl);
  } catch (e) {
    console.error('Invalid catalog URL:', props.catalogUrl, e);
    return { available: false, reason: 'Invalid catalog URL format' };
  }

  // Use composable for storage validation
  if (!storageValidation.isOperationAvailable.value.available) {
    return {
      available: false,
      reason: storageValidation.isOperationAvailable.value.reason,
    };
  }

  return { available: true, reason: null };
});

function startResize(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = leftWidth.value;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    // Constrain between 200px and 800px
    leftWidth.value = Math.max(200, Math.min(800, newWidth));
  }

  function onMouseUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function startTableResize(e: MouseEvent) {
  isResizingTable.value = true;
  const startY = e.clientY;
  const startHeight = tableHeight.value;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientY - startY;
    const newHeight = startHeight + delta;
    // Constrain between 200px and 800px
    tableHeight.value = Math.max(200, Math.min(800, newHeight));
  }

  function onMouseUp() {
    isResizingTable.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
}

function toggleNavigation() {
  isNavigationCollapsed.value = !isNavigationCollapsed.value;
}

function updateCursorPosition() {
  if (sqlTextarea.value && typeof sqlTextarea.value.getCursorPosition === 'function') {
    cursorPosition.value = sqlTextarea.value.getCursorPosition();
  }
}

function handleTableSelected(item: {
  type: string;
  warehouseId?: string;
  namespaceId?: string;
  name: string;
}) {
  selectedTable.value = {
    type: item.type,
    namespaceId: item.namespaceId || '',
    name: item.name,
  };

  let textToInsert = '';

  // For fields, just insert the field name
  if (item.type === 'field') {
    textToInsert = item.name;
  }
  // For tables/views, insert the full path
  else if (
    (item.type === 'table' || item.type === 'view') &&
    props.warehouseName &&
    item.namespaceId
  ) {
    textToInsert = `${props.warehouseName}.${item.namespaceId}.${item.name}`;
  }

  if (textToInsert) {
    if (!sqlQuery.value) {
      // If textarea is empty, just set the text
      sqlQuery.value = textToInsert;
    } else {
      // Insert at cursor position
      const before = sqlQuery.value.substring(0, cursorPosition.value);
      const after = sqlQuery.value.substring(cursorPosition.value);
      sqlQuery.value = before + textToInsert + after;

      // Update cursor position to after the inserted text
      cursorPosition.value = cursorPosition.value + textToInsert.length;

      // Focus and insert at cursor using SqlEditor's method
      setTimeout(() => {
        if (sqlTextarea.value && typeof sqlTextarea.value.insertAtCursor === 'function') {
          // Text already inserted, just update cursor position
          cursorPosition.value = cursorPosition.value + textToInsert.length;
        }
      }, 0);
    }
  }
}

// Tab Management Functions
function handleAddTab() {
  if (!props.warehouseId) return;
  visualStore.addSqlTab(props.warehouseId);
  activeTabIndex.value = currentWarehouseTabs.value.length - 1;
  // Clear the editor for the new tab
  sqlQuery.value = '';
}

function handleCloseTab(tabId: string) {
  if (!props.warehouseId) return;
  // Find the tab to close
  const tab = currentWarehouseTabs.value.find((t) => t.id === tabId);
  if (!tab) return;

  // Show confirmation dialog
  tabToClose.value = { id: tab.id, name: tab.name };
  showCloseTabDialog.value = true;
}

function cancelCloseTab() {
  showCloseTabDialog.value = false;
  tabToClose.value = null;
}

function confirmCloseTab() {
  if (!tabToClose.value || !props.warehouseId) return;

  visualStore.removeSqlTab(props.warehouseId, tabToClose.value.id);

  // Update active tab index after removal
  const activeTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (activeTab) {
    activeTabIndex.value = currentWarehouseTabs.value.findIndex((t) => t.id === activeTab.id);
    sqlQuery.value = activeTab.content;
  }

  // Close dialog
  showCloseTabDialog.value = false;
  tabToClose.value = null;
}

function startRenameTab(tabId: string, currentName: string) {
  tabToRename.value = tabId;
  newTabName.value = currentName;
  renameError.value = '';
  showRenameDialog.value = true;
}

function cancelRename() {
  showRenameDialog.value = false;
  tabToRename.value = null;
  newTabName.value = '';
  renameError.value = '';
}

function confirmRename() {
  if (!tabToRename.value || !newTabName.value.trim() || !props.warehouseId) return;

  // Check for duplicates (excluding the current tab being renamed)
  const isDuplicate = currentWarehouseTabs.value.some(
    (tab) => tab.id !== tabToRename.value && tab.name === newTabName.value.trim(),
  );

  if (isDuplicate) {
    renameError.value = `A query with the name "${newTabName.value.trim()}" already exists. Please choose a different name.`;
    return;
  }

  visualStore.renameSqlTab(props.warehouseId, tabToRename.value, newTabName.value);

  // Close dialog
  showRenameDialog.value = false;
  tabToRename.value = null;
  newTabName.value = '';
  renameError.value = '';
}

function handleCloseOtherTabs(tabId: string) {
  if (!props.warehouseId) return;
  // Find the tab to keep
  const tab = currentWarehouseTabs.value.find((t) => t.id === tabId);
  if (!tab) return;

  // Show confirmation dialog
  tabToKeep.value = { id: tab.id, name: tab.name };
  showCloseOtherTabsDialog.value = true;
}

function cancelCloseOtherTabs() {
  showCloseOtherTabsDialog.value = false;
  tabToKeep.value = null;
}

function confirmCloseOtherTabs() {
  if (!tabToKeep.value || !props.warehouseId) return;

  // Get all tabs except the one to keep
  const tabsToClose = currentWarehouseTabs.value.filter((t) => t.id !== tabToKeep.value!.id);

  // Close all other tabs
  tabsToClose.forEach((tab) => {
    visualStore.removeSqlTab(props.warehouseId, tab.id);
  });

  // Set the kept tab as active
  visualStore.setActiveSqlTab(props.warehouseId, tabToKeep.value.id);
  const activeTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (activeTab) {
    sqlQuery.value = activeTab.content;
    activeTabIndex.value = 0; // Will be the only tab
  }

  // Close dialog
  showCloseOtherTabsDialog.value = false;
  tabToKeep.value = null;
}

function handleTabClick(tabId: string) {
  if (!props.warehouseId) return;
  // Save current tab's content before switching
  const currentTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (currentTab) {
    visualStore.updateSqlTabContent(props.warehouseId, currentTab.id, sqlQuery.value);
  }

  // Switch to new tab
  visualStore.setActiveSqlTab(props.warehouseId, tabId);
  const newTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (newTab) {
    sqlQuery.value = newTab.content;
    activeTabIndex.value = currentWarehouseTabs.value.findIndex((t) => t.id === tabId);
  }
}

// Watch sqlQuery changes to auto-save to active tab
watch(sqlQuery, (newValue) => {
  if (!props.warehouseId) return;
  const activeTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (activeTab) {
    visualStore.updateSqlTabContent(props.warehouseId, activeTab.id, newValue);
  }
});

async function executeQuery() {
  if (!sqlQuery.value.trim() || !props.warehouseId) return;

  isExecuting.value = true;
  error.value = null;
  queryResult.value = null;

  // Capture the name of the tab executing this query
  const activeTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (activeTab) {
    lastExecutedTabName.value = activeTab.name;
  }

  try {
    const result = await icebergDB.executeQuery(sqlQuery.value);
    queryResult.value = result;
  } catch (e) {
    let errorMessage =
      e instanceof Error ? e.message : 'An error occurred while executing the query';

    // Check for CORS-related errors
    if (
      errorMessage.includes('CORS') ||
      errorMessage.includes('Access-Control-Allow') ||
      errorMessage.includes('cross-origin') ||
      errorMessage.includes('not allowed by Access-Control-Allow-Headers')
    ) {
      errorMessage =
        `CORS Error: The catalog server at ${props.catalogUrl} is blocking the request.\n\n` +
        `This is usually caused by:\n` +
        `1. Missing CORS headers on the catalog server\n` +
        `2. The 'x-user-agent' header not being allowed by Access-Control-Allow-Headers\n` +
        `3. The catalog URL not allowing requests from this origin\n\n` +
        `Original error: ${errorMessage}\n\n` +
        `Please contact your administrator to configure CORS headers on the catalog server.`;
    }

    error.value = errorMessage;
    console.error('Query execution error:', e);
  } finally {
    isExecuting.value = false;
  }
}

function clearResults() {
  queryResult.value = null;
  error.value = null;
}

function downloadCSV() {
  csvDownload.downloadCSV(queryResult.value, {
    baseFilename: 'query_results',
  });
}

function formatCell(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Try to configure the catalog with retries
 * Returns true if successful, false otherwise
 */
async function configureCatalogWithRetry(): Promise<boolean> {
  if (!props.catalogUrl || !props.warehouseName) {
    return false;
  }

  const maxAttempts = 10; // 10 attempts
  const delayMs = 3000; // 3 seconds between attempts

  let accessToken = '';
  if (props.useFreshToken) {
    const userStore = useUserStore();
    accessToken = userStore.user.access_token;
  }

  if (!accessToken) {
    console.warn('No access token available for catalog configuration');
    return false;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await icebergDB.configureCatalog({
        catalogName: props.warehouseName,
        restUri: props.catalogUrl,
        accessToken: accessToken,
      });
      // Success!
      return true;
    } catch (catalogError) {
      const errorMessage =
        catalogError instanceof Error ? catalogError.message : String(catalogError);

      // Check for CORS errors first (don't retry these)
      if (
        errorMessage.includes('CORS') ||
        errorMessage.includes('Access-Control-Allow') ||
        errorMessage.includes('cross-origin') ||
        errorMessage.includes('not allowed by Access-Control-Allow-Headers')
      ) {
        warehouseError.value =
          `CORS Error: The catalog server is blocking requests from this origin.\n\n` +
          `The server at ${props.catalogUrl} needs to allow:\n` +
          `- Cross-origin requests from this domain\n` +
          `- The 'x-user-agent' header in Access-Control-Allow-Headers\n\n` +
          `Please contact your administrator to configure CORS on the catalog server.`;
        console.error('CORS configuration error:', catalogError);
        return false;
      }

      // Check if this is a "catalog does not exist" error
      if (errorMessage.includes('Catalog') && errorMessage.includes('does not exist')) {
        console.warn(
          `Catalog not ready yet (attempt ${attempt + 1}/${maxAttempts}). Retrying in ${delayMs / 1000}s...`,
        );

        // If this is not the last attempt, wait and retry
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        } else {
          // Last attempt failed
          warehouseError.value =
            'Warehouse catalog is not available yet. The warehouse may still be initializing. Please wait and refresh the page.';
          return false;
        }
      } else {
        // Some other error - don't retry
        warehouseError.value = `Failed to configure catalog: ${errorMessage}`;
        console.error('Catalog configuration error:', catalogError);
        return false;
      }
    }
  }

  return false;
}

async function initializeDuckDB() {
  // Don't initialize if already done
  if (hasInitialized.value) {
    return;
  }

  // Don't initialize if required props are missing
  if (!props.catalogUrl || !props.warehouseName) {
    return;
  }

  // Initialize DuckDB and configure Iceberg catalog
  try {
    await icebergDB.initialize();
    hasInitialized.value = true;

    // Try to configure catalog with retries
    isCheckingWarehouse.value = true;
    warehouseError.value = null;

    const success = await configureCatalogWithRetry();

    isCheckingWarehouse.value = false;

    if (!success) {
      // Error message already set by configureCatalogWithRetry
      console.warn('Failed to configure catalog after retries');
    }
  } catch (e) {
    isCheckingWarehouse.value = false;
    error.value = 'Failed to initialize DuckDB WASM';
    console.error('DuckDB initialization failed:', e);
  }
}

// Initialize on mount if props are already available
onMounted(() => {
  if (!props.warehouseId) return;

  // Initialize SQL tabs for this warehouse
  visualStore.initializeSqlTabs(props.warehouseId);

  // Load the active tab content
  const activeTab = visualStore.getActiveSqlTab(props.warehouseId);
  if (activeTab) {
    sqlQuery.value = activeTab.content;
    activeTabIndex.value = currentWarehouseTabs.value.findIndex((t) => t.id === activeTab.id);
  }

  initializeDuckDB();
});

// Watch for props to become available (in case they're loaded asynchronously)
watch(
  () => [props.catalogUrl, props.warehouseName],
  () => {
    initializeDuckDB();
  },
  { immediate: false },
);

onBeforeUnmount(async () => {
  // Cleanup DuckDB resources
  await icebergDB.cleanup();
});
</script>

<style scoped>
.font-monospace {
  font-family: 'Courier New', Courier, monospace;
}
</style>
