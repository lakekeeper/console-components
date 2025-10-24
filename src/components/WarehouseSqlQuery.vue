<template>
  <v-container fluid class="pa-0">
    <div style="display: flex; height: calc(100vh - 200px); position: relative">
      <!-- Left: Navigation Tree (only show if SQL is available) -->
      <div
        v-if="isSqlAvailable.available"
        :style="{
          width: leftWidth + 'px',
          minWidth: '200px',
          maxWidth: '800px',
          height: '100%',
          overflow: 'visible',
          borderRight: '1px solid #e0e0e0',
        }">
        <WarehouseNavigationTree :warehouse-id="warehouseId" @item-selected="handleTableSelected" />
      </div>

      <!-- Resizable Divider (only show if SQL is available) -->
      <div
        v-if="isSqlAvailable.available"
        @mousedown="startResize"
        style="
          width: 5px;
          cursor: col-resize;
          user-select: none;
          flex-shrink: 0;
          transition: background 0.2s;
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
                  <v-icon class="mr-2">mdi-database-search</v-icon>
                  SQL Browser Query
                  <v-spacer />
                  <v-chip v-if="icebergDB.isInitialized.value" color="success" size="small">
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
                  <!-- Warning when SQL is not available -->
                  <v-alert
                    v-if="!isSqlAvailable.available"
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
                        <li>Warehouse must use S3-compatible storage</li>
                        <li>Catalog must use HTTPS protocol</li>
                      </ul>
                    </div>
                  </v-alert>

                  <!-- Info Alert -->
                  <v-alert type="info" variant="tonal" class="mb-4" v-else>
                    <div class="text-body-2">
                      <strong>DuckDB WASM</strong>
                      - Run SQL queries on your Browser. Select a table from the left panel or query
                      directly using the catalog.
                    </div>
                  </v-alert>

                  <!-- SQL Editor -->
                  <v-textarea
                    ref="sqlTextarea"
                    @click="updateCursorPosition"
                    @keyup="updateCursorPosition"
                    v-model="sqlQuery"
                    label="SQL Query"
                    :placeholder="
                      selectedTable
                        ? `SELECT * FROM ${warehouseName}.${selectedTable.namespaceId}.${selectedTable.name} LIMIT 10;`
                        : 'SELECT * FROM catalog.namespace.table LIMIT 10;'
                    "
                    rows="8"
                    variant="outlined"
                    auto-grow
                    class="font-monospace"
                    :disabled="isExecuting || !isSqlAvailable.available" />

                  <!-- Action Buttons -->
                  <div class="d-flex gap-2 mb-4">
                    <v-btn
                      color="primary"
                      :loading="isExecuting"
                      :disabled="!sqlQuery.trim() || isExecuting || !isSqlAvailable.available"
                      clearable
                      @click="executeQuery">
                      <v-icon start>mdi-play</v-icon>
                      Execute Query
                    </v-btn>
                    <v-btn variant="outlined" :disabled="!queryResult" @click="clearResults">
                      <v-icon start>mdi-close</v-icon>
                      Clear
                    </v-btn>
                    <v-spacer />
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
                      <div style="max-height: 500px; overflow: auto">
                        <v-table density="compact" fixed-header>
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
                      </div>
                    </v-card-text>
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
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useIcebergDuckDB } from '../composables/useIcebergDuckDB';
import type { QueryResult } from '../composables/useDuckDB';
import { useUserStore } from '../stores/user';
import WarehouseNavigationTree from './WarehouseNavigationTree.vue';

interface Props {
  warehouseId: string;
  warehouseName?: string;
  catalogUrl?: string;
  useFreshToken?: boolean;
  storageType?: string; // 's3', 'gcs', 'azure', etc.
}

const props = defineProps<Props>();

const icebergDB = useIcebergDuckDB();
const sqlQuery = ref('');
const queryResult = ref<QueryResult | null>(null);
const isExecuting = ref(false);
const error = ref<string | null>(null);
const examplesPanel = ref<number | undefined>(undefined);
const selectedTable = ref<{ type: string; namespaceId: string; name: string } | null>(null);

// Resizable layout state
const leftWidth = ref(300); // Initial width in pixels
const dividerHover = ref(false);
const sqlTextarea = ref<any>(null);
const cursorPosition = ref(0);
const isResizing = ref(false);

// Check if SQL querying is available based on storage and protocol
const isSqlAvailable = computed(() => {
  if (!props.catalogUrl) {
    return { available: false, reason: 'No catalog URL provided' };
  }

  // Check if catalog URL starts with http:// (not https://)
  if (props.catalogUrl.startsWith('http://')) {
    // Allow HTTP only for localhost
    // const isLocalUrl =
    //   props.catalogUrl.includes('://localhost') ||
    //   props.catalogUrl.includes('://127.0.0.1') ||
    //   props.catalogUrl.includes('://0.0.0.0');

    // if (!isLocalUrl) {
    //   console.warn('HTTP protocol not allowed for remote catalog:', props.catalogUrl);
    //   return {
    //     available: false,
    //     reason: 'DuckDB WASM requires HTTPS for remote catalogs. HTTP is only supported for localhost development.',
    //   };
    // }
    return {
      available: false,
      reason:
        'DuckDB WASM requires HTTPS for remote catalogs. HTTP is only supported for localhost development.',
    };
  }

  let url;
  try {
    url = new URL(props.catalogUrl);
  } catch (e) {
    console.error('Invalid catalog URL:', props.catalogUrl, e);
    return { available: false, reason: 'Invalid catalog URL format' };
  }

  console.log('SQL Availability Check:', {
    catalogUrl: props.catalogUrl,
    protocol: url.protocol,
    hostname: url.hostname,
    storageType: props.storageType,
  });

  // Check if storage type is supported (currently only S3)
  if (props.storageType && props.storageType.toLowerCase() !== 's3') {
    console.warn('Unsupported storage type:', props.storageType);
    return {
      available: false,
      reason: `DuckDB WASM currently only supports S3 storage. Your warehouse uses ${props.storageType}.`,
    };
  }

  console.log('SQL queries are available');
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

const exampleQueries = computed(() => {
  if (selectedTable.value && props.warehouseName) {
    const fullName = `${props.warehouseName}.${selectedTable.value.namespaceId}.${selectedTable.value.name}`;
    return [
      {
        title: 'Select all rows (limited)',
        query: `SELECT * FROM ${fullName} LIMIT 10;`,
      },
      {
        title: 'Count rows',
        query: `SELECT COUNT(*) as total_rows FROM ${fullName};`,
      },
      {
        title: 'Show table schema',
        query: `DESCRIBE ${fullName};`,
      },
    ];
  }
  return [
    {
      title: 'Show all tables',
      query: 'SHOW TABLES;',
    },
    {
      title: 'List catalogs',
      query: 'SELECT * FROM information_schema.schemata;',
    },
  ];
});

function updateCursorPosition(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  if (target) {
    cursorPosition.value = target.selectionStart || 0;
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

      // Focus and set cursor position in the textarea
      setTimeout(() => {
        if (sqlTextarea.value && sqlTextarea.value.$el) {
          const textarea = sqlTextarea.value.$el.querySelector('textarea');
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(cursorPosition.value, cursorPosition.value);
          }
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

function loadExample(query: string) {
  sqlQuery.value = query;
  examplesPanel.value = undefined; // Close the panel
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

onMounted(async () => {
  // Initialize DuckDB and configure Iceberg catalog
  try {
    await icebergDB.initialize();

    // Configure catalog if URL is provided
    if (props.catalogUrl && props.warehouseName) {
      let accessToken = '';

      if (props.useFreshToken) {
        // Get current token from user store (automatically refreshed by auth system)
        const userStore = useUserStore();
        accessToken = userStore.user.access_token;
        console.log('Using current access token for Iceberg catalog');
      }

      if (accessToken) {
        await icebergDB.configureCatalog({
          catalogName: props.warehouseName,
          restUri: props.catalogUrl,
          accessToken: accessToken,
        });

        console.log('Iceberg catalog configured successfully');
      } else {
        console.warn('No access token available for catalog configuration');
      }
    } else {
      console.warn('Catalog not configured - catalogUrl or warehouseName missing');
      console.log('You can still run queries on manually loaded tables');
    }
  } catch (e) {
    error.value = 'Failed to initialize DuckDB WASM';
    console.error('DuckDB initialization failed:', e);
  }
});

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
