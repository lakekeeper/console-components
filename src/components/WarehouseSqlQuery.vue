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

                  <!-- Ready State Info -->
                  <v-alert v-else type="info" variant="tonal" class="mb-4">
                    <div class="text-body-2">
                      <strong>DuckDB WASM SQL</strong>
                      - Select a table from the left panel or query directly using the catalog.
                    </div>
                  </v-alert>

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
                    min-height="200px"
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
                      Query Results
                      <v-spacer />
                      <v-chip size="small">
                        {{ queryResult.rowCount }} row{{ queryResult.rowCount !== 1 ? 's' : '' }}
                      </v-chip>
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
                        background: tableResizeHover || isResizingTable ? '#2196F3' : 'transparent',
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
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, toRef } from 'vue';
import { useIcebergDuckDB } from '../composables/useIcebergDuckDB';
import type { QueryResult } from '../composables/useDuckDB';
import { useUserStore } from '../stores/user';
import { useStorageValidation } from '@/composables/useStorageValidation';
import WarehouseNavigationTree from './WarehouseNavigationTree.vue';
import SqlEditor from './SqlEditor.vue';

interface Props {
  warehouseId: string;
  warehouseName?: string;
  catalogUrl?: string;
  useFreshToken?: boolean;
  storageType?: string; // 's3', 'gcs', 'azure', etc.
}

const props = defineProps<Props>();

const icebergDB = useIcebergDuckDB();
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

async function executeQuery() {
  if (!sqlQuery.value.trim()) return;

  isExecuting.value = true;
  error.value = null;
  queryResult.value = null;

  try {
    const result = await icebergDB.executeQuery(sqlQuery.value);
    queryResult.value = result;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An error occurred while executing the query';
    console.error('Query execution error:', e);
  } finally {
    isExecuting.value = false;
  }
}

function clearResults() {
  queryResult.value = null;
  error.value = null;
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
