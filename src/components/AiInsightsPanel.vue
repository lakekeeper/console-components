<template>
  <v-container fluid class="ai-insights-panel pa-0">
    <v-row no-gutters class="fill-height">
      <!-- Left Panel: Input & Settings -->
      <v-col cols="12" md="4" class="border-e">
        <v-card flat class="fill-height d-flex flex-column">
          <v-card-title class="d-flex align-center justify-space-between">
            <span>
              <v-icon class="mr-2">mdi-brain</v-icon>
              AI Insights
            </span>
            <v-btn
              icon="mdi-cog"
              size="small"
              variant="text"
              @click="showSettings = !showSettings"></v-btn>
          </v-card-title>

          <v-divider></v-divider>

          <!-- Settings Panel -->
          <v-expand-transition>
            <v-card-text v-show="showSettings" class="pb-0">
              <div class="text-subtitle-2 mb-3">LLM Configuration</div>

              <v-select
                v-model="settings.mode"
                :items="llmModes"
                label="LLM Mode"
                variant="outlined"
                density="compact"
                hide-details
                class="mb-3"></v-select>

              <!-- Local WASM LLM Settings -->
              <template v-if="settings.mode === 'local-wasm'">
                <v-select
                  v-model="settings.localModel"
                  :items="webLLM.availableModels"
                  item-title="name"
                  item-value="id"
                  label="Select Model"
                  variant="outlined"
                  density="compact"
                  class="mb-3">
                  <template #item="{ props: itemProps, item }">
                    <v-list-item v-bind="itemProps">
                      <v-list-item-title>{{ item.raw.name }}</v-list-item-title>
                      <v-list-item-subtitle class="text-caption">
                        {{ item.raw.description }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </template>
                </v-select>

                <!-- Model Status -->
                <v-alert
                  v-if="!webLLM.isInitialized && !webLLM.isInitializing"
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mb-3">
                  <div class="text-caption">
                    Model downloads on first use.
                    <strong>Size varies by model (0.8GB - 5GB)</strong>
                    . Larger models may impact performance on low-memory devices.
                  </div>
                </v-alert>

                <!-- Loading Progress -->
                <v-alert
                  v-if="webLLM.isInitializing"
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mb-3">
                  <v-progress-linear indeterminate class="mb-2"></v-progress-linear>
                  <div class="text-caption">{{ webLLM.loadingProgress }}</div>
                </v-alert>

                <!-- Initialized Status -->
                <v-alert
                  v-if="webLLM.isInitialized"
                  type="success"
                  variant="tonal"
                  density="compact"
                  class="mb-3">
                  <div class="text-caption">
                    <v-icon size="small" class="mr-1">mdi-check-circle</v-icon>
                    Model loaded and ready
                  </div>
                </v-alert>
              </template>

              <!-- Remote API Settings -->
              <template v-if="settings.mode === 'remote'">
                <v-select
                  v-model="settings.provider"
                  :items="llmProviders"
                  label="Provider"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-3"></v-select>

                <v-text-field
                  v-model="settings.apiKey"
                  label="API Key"
                  type="password"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-3"
                  :hint="apiKeyHint"
                  persistent-hint></v-text-field>

                <v-text-field
                  v-model="settings.endpoint"
                  label="Endpoint URL"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-3"
                  placeholder="https://api.example.com/v1/generate"></v-text-field>

                <v-text-field
                  v-model="settings.model"
                  label="Model"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-3"
                  :placeholder="defaultModelPlaceholder"></v-text-field>
              </template>

              <v-divider class="my-3"></v-divider>
            </v-card-text>
          </v-expand-transition>

          <!-- System Prompt Editor -->
          <v-card-text class="flex-grow-0 pb-0">
            <v-expansion-panels v-model="showPromptEditor" variant="accordion">
              <v-expansion-panel value="prompt">
                <v-expansion-panel-title>
                  <div class="d-flex align-center">
                    <v-icon class="mr-2" size="small">mdi-file-document-edit</v-icon>
                    <span class="text-subtitle-2">System Prompt (Advanced)</span>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-alert
                    v-if="!customSystemPrompt"
                    type="info"
                    variant="tonal"
                    density="compact"
                    class="mb-3">
                    <div class="text-caption">
                      You're viewing the default prompt. Edit it to customize, or it will
                      auto-update with your table selection.
                    </div>
                  </v-alert>
                  <v-textarea
                    v-model="displayedSystemPrompt"
                    label="Edit system prompt"
                    rows="12"
                    variant="outlined"
                    density="compact"
                    hint="Tip: Use {{AVAILABLE_TABLES}} and {{EXAMPLE_TABLE}} placeholders - they'll be auto-replaced with current selection"
                    persistent-hint
                    class="mb-2"></v-textarea>
                  <div class="d-flex gap-2">
                    <v-btn
                      size="small"
                      variant="outlined"
                      prepend-icon="mdi-restore"
                      @click="resetSystemPrompt">
                      Reset to Default
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-chip
                      size="small"
                      :variant="customSystemPrompt ? 'tonal' : 'outlined'"
                      :color="customSystemPrompt ? 'primary' : 'default'">
                      {{ customSystemPrompt ? 'Custom' : 'Default' }} ({{
                        displayedSystemPrompt.length
                      }}
                      chars)
                    </v-chip>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card-text>

          <!-- Namespace Selection -->
          <v-card-text class="flex-grow-0 pb-0">
            <v-autocomplete
              v-model="selectedNamespace"
              :items="availableNamespaces"
              label="Select Namespace"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              :loading="loadingNamespaces"
              prepend-inner-icon="mdi-folder"
              @update:model-value="onNamespaceChange"></v-autocomplete>
          </v-card-text>

          <!-- Table Selection -->
          <v-card-text class="flex-grow-0">
            <v-autocomplete
              v-model="selectedTables"
              :items="filteredTables"
              label="Select Tables"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              multiple
              chips
              closable-chips
              :loading="loadingTables || loadingSchemas"
              :disabled="!selectedNamespace || filteredTables.length === 0"
              prepend-inner-icon="mdi-table">
              <template #prepend-item>
                <v-list-item title="All Tables" @click="toggleAllTables">
                  <template #prepend>
                    <v-checkbox-btn
                      :model-value="selectedTables.length === filteredTables.length"
                      :indeterminate="
                        selectedTables.length > 0 && selectedTables.length < filteredTables.length
                      "></v-checkbox-btn>
                  </template>
                </v-list-item>
                <v-divider class="mb-2"></v-divider>
              </template>
            </v-autocomplete>
          </v-card-text>

          <!-- Question Input -->
          <v-card-text class="flex-grow-1 d-flex flex-column">
            <v-textarea
              v-model="userQuestion"
              label="Ask a question about your data"
              variant="outlined"
              auto-grow
              rows="4"
              hide-details
              :disabled="!selectedNamespace || selectedTables.length === 0"
              placeholder="e.g., What are the top 10 products by revenue? Show me trends over time."
              class="mb-3"></v-textarea>

            <v-btn
              color="primary"
              size="large"
              block
              :loading="isGenerating"
              :disabled="!selectedNamespace || selectedTables.length === 0 || !userQuestion.trim()"
              @click="generateInsights">
              <v-icon start>mdi-sparkles</v-icon>
              Generate Insights
            </v-btn>

            <!-- Generation Status -->
            <v-alert
              v-if="generationStatus"
              :type="generationStatus.type"
              variant="tonal"
              density="compact"
              class="mt-3"
              closable
              @click:close="generationStatus = null">
              {{ generationStatus.message }}
            </v-alert>

            <!-- Example Questions -->
            <div v-if="!userQuestion && selectedTables.length > 0" class="mt-4">
              <div class="text-caption text-grey mb-2">Example questions:</div>
              <v-chip
                v-for="(example, idx) in exampleQuestions"
                :key="idx"
                size="small"
                variant="outlined"
                class="mr-2 mb-2"
                @click="userQuestion = example">
                {{ example }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Right Panel: A2UI Renderer -->
      <v-col cols="12" md="8">
        <v-card flat class="fill-height">
          <v-card-title v-if="a2uiResponse">
            <v-icon class="mr-2">mdi-chart-box</v-icon>
            Insights
            <v-spacer></v-spacer>
            <v-btn
              icon="mdi-file-pdf-box"
              size="small"
              variant="text"
              :disabled="isGenerating || isExportingPDF"
              :loading="isExportingPDF"
              @click="exportToPDF">
              <v-icon>mdi-file-pdf-box</v-icon>
              <v-tooltip activator="parent" location="bottom">Export as PDF</v-tooltip>
            </v-btn>
            <v-btn
              icon="mdi-refresh"
              size="small"
              variant="text"
              :disabled="isGenerating"
              @click="regenerateInsights"></v-btn>
            <v-btn icon="mdi-close" size="small" variant="text" @click="clearResults"></v-btn>
          </v-card-title>

          <v-divider v-if="a2uiResponse"></v-divider>

          <v-card-text class="fill-height overflow-y-auto">
            <!-- Empty State -->
            <div
              v-if="!a2uiResponse && !isGenerating"
              class="d-flex flex-column align-center justify-center fill-height text-center">
              <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-chart-areaspline</v-icon>
              <div class="text-h6 text-grey mb-2">No insights yet</div>
              <div class="text-body-2 text-grey">
                Select a table and ask a question to generate AI-powered insights
              </div>
            </div>

            <!-- Loading State -->
            <div
              v-else-if="isGenerating"
              class="d-flex flex-column align-center justify-center fill-height">
              <v-progress-circular
                indeterminate
                size="64"
                color="primary"
                class="mb-4"></v-progress-circular>
              <div class="text-h6 mb-2">{{ progressMessage || 'Generating insights...' }}</div>
              <div class="text-body-2 text-grey">Please wait while AI analyzes your data</div>
            </div>

            <!-- A2UI Components Renderer -->
            <div v-else-if="a2uiResponse" ref="a2uiContainerRef" class="a2ui-container">
              <A2UIRenderer :components="a2uiResponse.components" :context="rendererContext" />

              <!-- SQL Queries Section -->
              <v-expansion-panels
                v-if="generatedSqlQueries.length > 0"
                v-model="showSqlPanel"
                class="mt-4">
                <v-expansion-panel value="sql">
                  <v-expansion-panel-title>
                    <div class="d-flex align-center">
                      <v-icon class="mr-2">mdi-database-search</v-icon>
                      <span class="font-weight-medium">Generated SQL Queries</span>
                      <v-chip size="x-small" class="ml-2">{{ generatedSqlQueries.length }}</v-chip>
                    </div>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <div class="sql-queries-container">
                      <div v-for="(sql, idx) in generatedSqlQueries" :key="idx" class="mb-3">
                        <div class="d-flex align-center justify-space-between mb-2">
                          <div class="text-caption text-grey">Query {{ idx + 1 }}</div>
                          <v-btn
                            size="x-small"
                            variant="text"
                            prepend-icon="mdi-content-copy"
                            @click="copySqlToClipboard(sql)">
                            Copy
                          </v-btn>
                        </div>
                        <v-card variant="outlined" class="pa-3 sql-card">
                          <pre class="sql-code">{{ formatSql(sql) }}</pre>
                        </v-card>
                      </div>
                    </div>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  watch,
  nextTick,
  defineComponent,
  h,
  markRaw,
  inject,
  toRef,
  resolveComponent,
} from 'vue';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { useFunctions } from '@/plugins/functions';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import { useWebLLM } from '@/composables/useWebLLM';
import type { QueryResult } from '@/composables/useDuckDB';
import { useUserStore } from '@/stores/user';
import { useVisualStore } from '@/stores/visual';
import { useNotificationStore } from '@/stores/notifications';
import { useStorageValidation } from '@/composables/useStorageValidation';
import { Type } from '@/common/enums';

// Register Chart.js components
Chart.register(...registerables);

// Initialize functions API
const functions = useFunctions();
const userStore = useUserStore();
const visualStore = useVisualStore();
const notificationStore = useNotificationStore();
const webLLM = useWebLLM();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** A2UI Component Type Definition */
interface A2UIComponent {
  type: 'kpi' | 'table' | 'chart' | 'markdown' | 'sql' | 'container';
  props?: Record<string, any>;
  children?: A2UIComponent[];
}

/** A2UI Response from LLM */
interface A2UIResponse {
  components: A2UIComponent[];
}

/** LLM Settings */
interface LLMSettings {
  mode: 'local-wasm' | 'remote';
  provider: 'gemini' | 'claude' | 'openai' | 'custom';
  apiKey: string;
  endpoint: string;
  model: string;
  localModel: string; // WebLLM model ID
}

/** Generation Status Alert */
interface Status {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPS & EMITS
// ═══════════════════════════════════════════════════════════════════════════════

const props = defineProps<{
  /** Warehouse ID (required) */
  warehouseId: string;
  /** Warehouse name (required for DuckDB catalog setup) */
  warehouseName?: string;
  /** Catalog REST API URL */
  catalogUrl?: string;
  /** Project ID for multi-project support */
  projectId?: string;
  /** Storage type: 's3', 'gcs', 'azure', etc. */
  storageType?: string;
  /** Whether to use fresh authentication token */
  useFreshToken?: boolean;
  /** Optional: Pre-populated table list (overrides auto-fetch) */
  tables?: string[];
  /** Optional: Namespace to filter tables (e.g., 'schema1.schema2') */
  namespace?: string;
}>();

const emit = defineEmits<{
  (e: 'insights-generated', response: A2UIResponse): void;
  (e: 'error', error: Error): void;
}>();

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZE COMPOSABLES
// ═══════════════════════════════════════════════════════════════════════════════

const config = inject<any>('appConfig', { enabledAuthentication: false });
const icebergDB = useIcebergDuckDB(config.baseUrlPrefix);
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl || ''),
);

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROMPT_STORAGE_KEY = 'ai-insights-prompt';
const SYSTEM_PROMPT_STORAGE_KEY = 'ai-insights-system-prompt';
const SELECTED_NAMESPACE_STORAGE_KEY = 'ai-insights-selected-namespace';
const SELECTED_TABLES_STORAGE_KEY = 'ai-insights-selected-tables';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

const showSettings = ref(false);
const showPromptEditor = ref(false);
const showSqlPanel = ref<string[]>([]);
const selectedNamespace = ref<string | null>(null);
const selectedTables = ref<string[]>([]);
const availableNamespaces = ref<string[]>([]);
const hasInitialized = ref(false);
const isRestoringFromStorage = ref(false);
const warehouseError = ref<string | null>(null);
const isCheckingWarehouse = ref(false);
const userQuestion = ref('');
const isGenerating = ref(false);
const loadingTables = ref(false);
const loadingNamespaces = ref(false);
const a2uiResponse = ref<A2UIResponse | null>(null);
const generationStatus = ref<Status | null>(null);
const generatedSqlQueries = ref<string[]>([]);
const customSystemPrompt = ref<string>('');
const isExportingPDF = ref(false);
const a2uiContainerRef = ref<HTMLElement | null>(null);
const progressMessage = ref<string>('');

const settings = ref<LLMSettings>({
  mode: 'local-wasm',
  provider: 'openai',
  apiKey: '',
  endpoint: '',
  model: '',
  localModel: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', // Default: Best balance for SQL tasks
});

const availableTables = ref<string[]>([]);
const tableSchemas = ref<Record<string, Array<{ column: string; type: string }>>>({});
const loadingSchemas = ref(false);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPUTED
// ═══════════════════════════════════════════════════════════════════════════════

const llmModes = [
  { title: 'Local WASM LLM', value: 'local-wasm' },
  { title: 'Remote API', value: 'remote' },
];

const llmProviders = [
  { title: 'OpenAI', value: 'openai' },
  { title: 'Google Gemini', value: 'gemini' },
  { title: 'Anthropic Claude', value: 'claude' },
  { title: 'Custom', value: 'custom' },
];

const apiKeyHint = computed(() => {
  if (settings.value.mode !== 'remote') return '';
  return 'Your API key is stored in-memory only and never logged';
});

const defaultModelPlaceholder = computed(() => {
  const modelMap: Record<string, string> = {
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash-exp',
    claude: 'claude-3-5-sonnet-20241022',
    custom: 'custom-model',
  };
  return modelMap[settings.value.provider] || '';
});

const exampleQuestions = computed(() => [
  'Show top 10 by value',
  'Analyze trends over time',
  'Calculate key metrics',
  'Find anomalies',
]);

// Computed property for effective system prompt display
const displayedSystemPrompt = computed({
  get: () => {
    // If custom prompt exists, use it; otherwise show current default
    return customSystemPrompt.value || buildDefaultSystemPrompt();
  },
  set: (value: string) => {
    customSystemPrompt.value = value;
    saveSystemPromptToLocalStorage();
  },
});

const rendererContext = computed(() => ({
  selectedTables: selectedTables.value,
  executeQuery: executeDuckDBQuery,
}));

// Filter tables based on selected namespace
const filteredTables = computed(() => {
  if (!selectedNamespace.value) {
    return availableTables.value;
  }

  // Filter tables that belong to the selected namespace
  return availableTables.value.filter((table) => {
    const parts = table.split('.');
    if (parts.length < 3) return false; // catalog.namespace.table format expected

    const tableNamespace = parts.slice(1, -1).join('.'); // Extract namespace part
    return tableNamespace === selectedNamespace.value;
  });
});

// Check if insights are available based on DuckDB and catalog status
const isInsightsAvailable = computed(() => {
  if (!props.warehouseName) {
    return { available: false, reason: 'Loading warehouse information...' };
  }

  if (isCheckingWarehouse.value) {
    return { available: false, reason: 'Initializing DuckDB and catalog...' };
  }

  if (warehouseError.value) {
    return { available: false, reason: warehouseError.value };
  }

  if (!props.catalogUrl) {
    return { available: false, reason: 'No catalog URL provided' };
  }

  if (!storageValidation.isOperationAvailable.value.available) {
    return {
      available: false,
      reason: storageValidation.isOperationAvailable.value.reason,
    };
  }

  return { available: true, reason: null };
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSABLES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DuckDB Query Composable
 * Executes SQL queries against DuckDB WASM and returns structured results
 */
function useDuckDBQuery() {
  const execute = async (sql: string): Promise<QueryResult> => {
    if (!icebergDB.isInitialized.value || !icebergDB.catalogConfigured.value) {
      throw new Error('DuckDB is not initialized or catalog not configured');
    }

    try {
      const result = await icebergDB.executeQuery(sql);
      return result;
    } catch (error) {
      console.error('DuckDB query error:', error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return { execute };
}

/**
 * Fetch table schemas using DuckDB DESCRIBE
 */
async function fetchTableSchemas(tables: string[]) {
  if (!icebergDB.isInitialized.value || !icebergDB.catalogConfigured.value) {
    console.warn('[AiInsightsPanel] Cannot fetch schemas - DuckDB not initialized');
    return;
  }

  loadingSchemas.value = true;
  const schemas: Record<string, Array<{ column: string; type: string }>> = {
    ...tableSchemas.value,
  };

  // Only fetch schemas for tables we don't already have
  const tablesToFetch = tables.filter((table) => !schemas[table] || schemas[table].length === 0);

  if (tablesToFetch.length === 0) {
    console.log('[AiInsightsPanel] All schemas already loaded');
    loadingSchemas.value = false;
    return;
  }

  console.log(`[AiInsightsPanel] Fetching schemas for ${tablesToFetch.length} tables...`);
  for (const table of tablesToFetch) {
    try {
      const result = await icebergDB.executeQuery(`DESCRIBE ${table}`);

      // Extract column info from DESCRIBE result
      const columns = result.rows.map((row) => ({
        column: String(row[0] || ''),
        type: String(row[1] || ''),
      }));

      schemas[table] = columns;
      console.log(`[AiInsightsPanel] Fetched schema for ${table}:`, columns.length, 'columns');
    } catch (error) {
      console.error(`[AiInsightsPanel] Failed to fetch schema for ${table}:`, error);
      // Continue with other tables even if one fails
    }
  }

  tableSchemas.value = schemas;
  loadingSchemas.value = false;
}

/**
 * Build default system prompt
 */
function buildDefaultSystemPrompt(): string {
  const tablesToUse = selectedTables.value.length > 0 ? selectedTables.value : filteredTables.value;

  // Build table list with schemas
  let tableList = '';
  let exampleColumns = ['column1', 'column2'];

  if (tablesToUse.length > 0) {
    tableList = tablesToUse
      .map((table) => {
        const schema = tableSchemas.value[table];
        if (schema && schema.length > 0) {
          const columns = schema.map((col) => `${col.column} (${col.type})`).join(', ');
          return `  - ${table}\n    Columns: ${columns}`;
        } else {
          return `  - ${table}\n    Columns: (schema not loaded - use DESCRIBE ${table} to see columns)`;
        }
      })
      .join('\n');

    // Get example columns from first table for the example query
    const firstTableSchema = tableSchemas.value[tablesToUse[0]];
    if (firstTableSchema && firstTableSchema.length >= 2) {
      exampleColumns = [firstTableSchema[0].column, firstTableSchema[1].column];
    }
  } else {
    tableList = 'No tables available';
  }

  const exampleTable = tablesToUse.length > 0 ? tablesToUse[0] : 'schema.table_name';

  return `You are a data analyst assistant. Your task is to analyze data questions and return ONLY valid A2UI JSON.

A2UI is a declarative component specification for rendering insights. You may use these component types:

1. "kpi" - Key Performance Indicator card
   props: { title: string, value: string|number, subtitle?: string, icon?: string, color?: string }

2. "table" - Data table
   props: { columns: string[], rows: any[][], title?: string }

3. "chart" - Chart visualization  
   props: { chartType: "bar"|"line"|"pie"|"doughnut", title?: string, labels: string[], datasets: Array<{label: string, data: number[], backgroundColor?: string[], borderColor?: string}> }

4. "markdown" - Rendered markdown text
   props: { content: string }

5. "sql" - SQL query to execute against DuckDB
   props: { query: string, then: A2UIComponent } - the "then" component renders using query results

6. "container" - Layout container
   props: { layout?: "grid"|"flex", gap?: number, children: A2UIComponent[] }

AVAILABLE TABLES (USE ONLY THESE EXACT NAMES):
${tableList}

⚠️ CRITICAL COLUMN RULES - READ CAREFULLY:
1. NEVER invent or guess column names - this is the #1 cause of query failures
2. ONLY use columns explicitly listed above for each table
3. If a column doesn't exist in the schema, DO NOT use it - DO NOT assume it exists
4. When aggregating, use actual numeric columns from the schema
5. Before writing SELECT, verify EVERY column exists in the table's schema above
6. Example: If you need to sum values, look for columns with type INTEGER, DECIMAL, DOUBLE, etc.
7. If you cannot find appropriate columns for a query, explain the limitation in a markdown component
8. Double-check: Every column in your SQL must appear in the "Columns:" list for that table
9. COMMON MISTAKES TO AVOID:
   - ❌ Using c_current_addr_sk when only c_customer_sk exists
   - ❌ Using column names from other databases/examples
   - ❌ Assuming columns exist based on naming patterns
   - ✅ ONLY use columns from the "Columns:" list above
10. Validation will REJECT queries with non-existent columns

⚠️ SQL SYNTAX RULES (DuckDB):
1. CAST syntax: Use CAST(column_name AS type) - NEVER use CAST(id AS column_name AS type)
2. Valid types for CAST: INTEGER, BIGINT, VARCHAR, DOUBLE, DATE, TIMESTAMP
3. Column references: Use actual column names from the schema, not placeholders like "id"
4. Correct example: CAST(cs_sold_date_sk AS INTEGER)
5. WRONG example: CAST(id AS cs_sold_date_sk AS INTEGER) ❌ - This will cause "syntax error at or near AS"
6. WRONG example: CAST(id AS cs_sold_date_sk) ❌ - Don't use column name as the type
7. Always verify SQL syntax before including it in the response
8. Use standard SQL operators: +, -, *, /, %, =, <, >, <=, >=, !=
9. When you need to convert a column type, use: CAST(actual_column_name AS target_type)
10. Example: To get an integer from cs_sold_date_sk, use: CAST(cs_sold_date_sk AS INTEGER)

⚠️ TABLE NAME RULES - ABSOLUTELY CRITICAL:
1. NEVER abbreviate table names (e.g., "sales" when table is "catalog_sales")
2. NEVER invent table names (e.g., "demo.tpcds.sales" does NOT exist)
3. Copy table names EXACTLY character-by-character from the AVAILABLE TABLES list above
4. Examples of WRONG table references:
   - ❌ demo.tpcds.sales (doesn't exist - use demo.tpcds.catalog_sales or demo.tpcds.store_sales)
   - ❌ tpcds.sales (missing catalog prefix)
   - ❌ customer (missing catalog and namespace)
5. Before writing any FROM or JOIN, look at AVAILABLE TABLES list and copy the EXACT name
6. If you're unsure about a table name, DO NOT guess - explain the limitation in markdown instead

CRITICAL RULES:
- Return ONLY valid JSON matching A2UIResponse interface
- No explanations, no markdown code blocks, no conversational text
- VALIDATE EVERY COLUMN: Before using ANY column in SQL, verify it exists in the schema above
- IMPORTANT: You MUST use ONLY the exact table names and column names listed in "AVAILABLE TABLES" above
- DO NOT invent column names - use only the columns shown in the table schemas
- DO NOT assume table names - use only the tables provided with their full names
- Use the FULL table names exactly as shown (they already include namespace/catalog)
- All column names are case-sensitive - use them exactly as shown
- If the data doesn't support the question, explain this in a markdown component instead of making up columns
- Charts must include valid data or reference SQL results
- Use descriptive titles and labels
- Provide actionable insights
- You can JOIN multiple tables if relevant to the question

Example response structure:
{
  "components": [
    {
      "type": "markdown",
      "props": { "content": "## Analysis Summary\\n\\nKey findings from the data..." }
    },
    {
      "type": "sql",
      "props": {
        "query": "SELECT ${exampleColumns[0]}, COUNT(*) as total FROM ${exampleTable} GROUP BY ${exampleColumns[0]} ORDER BY total DESC LIMIT 10",
        "then": {
          "type": "chart",
          "props": {
            "chartType": "bar",
            "title": "Top 10 Results",
            "labels": "{{results.column[0]}}",
            "datasets": [{
              "label": "Total",
              "data": "{{results.column[1]}}",
              "backgroundColor": ["#1976D2", "#388E3C", "#F57C00", "#7B1FA2", "#C2185B"]
            }]
          }
        }
      }
    }
  ]
}`;
}

/**
 * LLM Composable
 * Abstracts LLM interaction - supports local WASM and remote APIs
 */
function useLLM() {
  /**
   * Generate A2UI JSON from user question using configured LLM
   */
  const generateA2UI = async (prompt: string): Promise<A2UIResponse> => {
    // Get current table context
    const tablesToUse =
      selectedTables.value.length > 0 ? selectedTables.value : filteredTables.value;

    // Build table list WITH SCHEMAS (not just names)
    let tableList = '';
    if (tablesToUse.length > 0) {
      tableList = tablesToUse
        .map((table) => {
          const schema = tableSchemas.value[table];
          if (schema && schema.length > 0) {
            const columns = schema.map((col) => `${col.column} (${col.type})`).join(', ');
            return `  - ${table}\n    Columns: ${columns}`;
          } else {
            return `  - ${table}\n    Columns: (schema not available)`;
          }
        })
        .join('\n');
    } else {
      tableList = 'No tables available';
    }

    const exampleTable = tablesToUse.length > 0 ? tablesToUse[0] : 'schema.table_name';

    // Build base prompt (custom or default)
    let systemPrompt = customSystemPrompt.value.trim()
      ? customSystemPrompt.value
      : buildDefaultSystemPrompt();

    // Always inject current table list (replaces placeholders or appends)
    if (systemPrompt.includes('{{AVAILABLE_TABLES}}')) {
      systemPrompt = systemPrompt.replace(/\{\{AVAILABLE_TABLES\}\}/g, tableList);
    } else if (customSystemPrompt.value.trim()) {
      // For custom prompts without placeholder, append current table list
      systemPrompt = `${systemPrompt}\n\nAVAILABLE TABLES (USE ONLY THESE EXACT NAMES):\n${tableList}`;
    }

    // Replace example table placeholder
    if (systemPrompt.includes('{{EXAMPLE_TABLE}}')) {
      systemPrompt = systemPrompt.replace(/\{\{EXAMPLE_TABLE\}\}/g, exampleTable);
    }

    const fullPrompt = `${systemPrompt}\n\nUser Question: ${prompt}\n\nReturn A2UI JSON:`;

    // Debug logging
    console.log('[AiInsightsPanel] Tables with schemas being sent to LLM:', tablesToUse);
    console.log('[AiInsightsPanel] Table schemas:', tableSchemas.value);
    console.log(
      '[AiInsightsPanel] Full prompt preview (first 500 chars):',
      fullPrompt.substring(0, 500),
    );

    if (settings.value.mode === 'local-wasm') {
      return await generateLocalWASM(fullPrompt);
    } else {
      return await generateRemote(fullPrompt);
    }
  };

  /**
   * Generate using local WASM LLM (WebLLM)
   */
  const generateLocalWASM = async (prompt: string): Promise<A2UIResponse> => {
    try {
      // Initialize WebLLM if not already initialized
      if (!webLLM.isInitialized.value) {
        progressMessage.value = 'Initializing local AI model...';
        await webLLM.initialize({
          modelId: settings.value.localModel,
          onProgress: (progress) => {
            console.log('[WebLLM Progress]', progress.text);
            // Update UI with detailed progress
            progressMessage.value = `Loading AI model: ${progress.text}`;
          },
        });
      }

      // Generate response
      progressMessage.value = 'Generating insights with AI...';
      const response = await webLLM.generate(prompt, {
        temperature: 0.3,
        maxTokens: 2048,
      });

      return parseA2UIResponse(response);
    } catch (error) {
      throw new Error(
        `Local LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  /**
   * Generate using remote API
   */
  const generateRemote = async (prompt: string): Promise<A2UIResponse> => {
    const { provider, apiKey, endpoint, model } = settings.value;

    if (!apiKey && provider !== 'custom') {
      throw new Error('API key is required for remote LLM');
    }

    // Build request based on provider
    const requestConfig = buildRemoteRequest(provider, apiKey, endpoint, model, prompt);

    try {
      const response = await fetch(requestConfig.url, {
        method: 'POST',
        headers: requestConfig.headers,
        body: JSON.stringify(requestConfig.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const textResponse = extractTextFromResponse(provider, data);
      return parseA2UIResponse(textResponse);
    } catch (error) {
      throw new Error(
        `Remote LLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  /**
   * Build request configuration for different providers
   */
  const buildRemoteRequest = (
    provider: string,
    apiKey: string,
    endpoint: string,
    model: string,
    prompt: string,
  ): { url: string; headers: Record<string, string>; body: any } => {
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      gemini: 'gemini-2.0-flash-exp',
      claude: 'claude-3-5-sonnet-20241022',
    };

    const modelToUse = model || defaultModels[provider] || 'gpt-4o';

    switch (provider) {
      case 'openai':
        return {
          url: endpoint || 'https://api.openai.com/v1/chat/completions',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: {
            model: modelToUse,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
          },
        };

      case 'gemini':
        return {
          url:
            endpoint ||
            `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          },
        };

      case 'claude':
        return {
          url: endpoint || 'https://api.anthropic.com/v1/messages',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: {
            model: modelToUse,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.3,
          },
        };

      case 'custom':
        return {
          url: endpoint,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: {
            model: modelToUse,
            prompt: prompt,
          },
        };

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  };

  /**
   * Extract text response from different provider response formats
   */
  const extractTextFromResponse = (provider: string, data: any): string => {
    switch (provider) {
      case 'openai':
        return data.choices?.[0]?.message?.content || '';
      case 'gemini':
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      case 'claude':
        return data.content?.[0]?.text || '';
      case 'custom':
        // Try common patterns
        return data.text || data.response || data.content || data.output || '';
      default:
        return '';
    }
  };

  /**
   * Parse and validate A2UI response
   */
  const parseA2UIResponse = (text: string): A2UIResponse => {
    // Clean response - remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.components || !Array.isArray(parsed.components)) {
        throw new Error('Invalid A2UI response: missing or invalid "components" array');
      }

      return parsed as A2UIResponse;
    } catch (error) {
      console.error('Failed to parse A2UI response:', text);
      throw new Error(
        `Invalid JSON response: ${error instanceof Error ? error.message : 'Parse error'}`,
      );
    }
  };

  return { generateA2UI };
}

/**
 * A2UI Renderer Composable
 * Dynamically renders A2UI components as Vue components
 */
function useA2UIRenderer() {
  const renderComponent = (component: A2UIComponent, context: any): any => {
    switch (component.type) {
      case 'kpi':
        return renderKPI(component);
      case 'table':
        return renderTable(component);
      case 'chart':
        return renderChart(component);
      case 'markdown':
        return renderMarkdown(component);
      case 'sql':
        return renderSQL(component, context);
      case 'container':
        return renderContainer(component, context);
      default:
        console.warn(`Unknown A2UI component type: ${component.type}`);
        return null;
    }
  };

  const renderKPI = (component: A2UIComponent) => {
    const { title, value, subtitle, icon, color } = component.props || {};
    return h(
      'div',
      { class: 'mb-4' },
      h(
        resolveComponent('v-card'),
        {
          variant: 'outlined',
          class: 'pa-4',
        },
        {
          default: () => [
            h('div', { class: 'd-flex align-center justify-space-between mb-2' }, [
              h('div', { class: 'text-subtitle-2 text-grey' }, title),
              icon
                ? h(resolveComponent('v-icon'), { color: color || 'primary' }, () => icon)
                : null,
            ]),
            h(
              'div',
              { class: 'text-h4 font-weight-bold', style: { color: color || '#1976D2' } },
              value,
            ),
            subtitle ? h('div', { class: 'text-caption text-grey mt-1' }, subtitle) : null,
          ],
        },
      ),
    );
  };

  const renderTable = (component: A2UIComponent) => {
    const { columns, rows, title } = component.props || {};
    const headers = (columns || []).map((col: string) => ({
      title: col,
      key: col,
      sortable: true,
    }));
    const items = (rows || []).map((row: any[]) => {
      const item: Record<string, any> = {};
      (columns || []).forEach((col: string, idx: number) => {
        // Convert BigInt to Number for proper rendering and sorting
        // Also handles json-bigint string representations
        const value = row[idx];
        if (typeof value === 'bigint') {
          item[col] = Number(value);
        } else if (typeof value === 'string' && /^\d+$/.test(value)) {
          // Handle json-bigint storeAsString: true format
          const num = Number(value);
          if (!isNaN(num) && num.toString() === value) {
            item[col] = num;
          } else {
            item[col] = value;
          }
        } else {
          item[col] = value;
        }
      });
      return item;
    });

    return h(
      'div',
      { class: 'mb-4' },
      h(
        resolveComponent('v-card'),
        { variant: 'outlined' },
        {
          default: () => [
            title
              ? h(
                  resolveComponent('v-card-title'),
                  {},
                  {
                    default: () => title,
                  },
                )
              : null,
            h(resolveComponent('v-data-table'), {
              headers,
              items,
              density: 'compact',
              'items-per-page': 10,
            }),
          ],
        },
      ),
    );
  };

  const renderChart = (component: A2UIComponent) => {
    const { chartType, title, labels, datasets } = component.props || {};

    // Create a unique ID for this chart
    const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;

    // Define component that will mount the chart
    const ChartComponent = defineComponent({
      name: 'ChartRenderer',
      setup() {
        const canvasRef = ref<HTMLCanvasElement | null>(null);
        let chartInstance: Chart | null = null;

        onMounted(() => {
          if (canvasRef.value) {
            const config: ChartConfiguration = {
              type: chartType || 'bar',
              data: {
                labels: labels || [],
                datasets: datasets || [],
              },
              options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    display: true,
                    position: 'bottom',
                  },
                  title: {
                    display: !!title,
                    text: title || '',
                  },
                },
              },
            };

            chartInstance = new Chart(canvasRef.value, config);
          }
        });

        return () =>
          h(
            'div',
            { class: 'mb-4' },
            h(
              resolveComponent('v-card'),
              { variant: 'outlined', class: 'pa-4' },
              {
                default: () =>
                  h('div', { style: 'position: relative; height: 300px;' }, [
                    h('canvas', { ref: canvasRef, id: chartId }),
                  ]),
              },
            ),
          );
      },
    });

    return h(ChartComponent);
  };

  const renderMarkdown = (component: A2UIComponent) => {
    const { content } = component.props || {};

    // Simple markdown rendering (in production, use a proper markdown library)
    const renderSimpleMarkdown = (text: string) => {
      if (!text) return '';

      return text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    };

    return h(
      'div',
      { class: 'mb-4' },
      h(
        resolveComponent('v-card'),
        { variant: 'outlined', class: 'pa-4' },
        {
          default: () =>
            h('div', {
              class: 'markdown-content',
              innerHTML: renderSimpleMarkdown(content || ''),
            }),
        },
      ),
    );
  };

  const renderSQL = (component: A2UIComponent, context: any) => {
    const { query, then: thenComponent } = component.props || {};

    const SQLComponent = defineComponent({
      name: 'SQLRenderer',
      setup() {
        const loading = ref(true);
        const error = ref<string | null>(null);
        const results = ref<QueryResult | null>(null);

        onMounted(async () => {
          try {
            results.value = await context.executeQuery(query);
            loading.value = false;
          } catch (err) {
            error.value = err instanceof Error ? err.message : 'Query execution failed';
            loading.value = false;
          }
        });

        return () => {
          if (loading.value) {
            return h(
              resolveComponent('v-card'),
              { variant: 'outlined', class: 'pa-4 mb-4' },
              {
                default: () =>
                  h('div', { class: 'd-flex align-center' }, [
                    h(resolveComponent('v-progress-circular'), {
                      indeterminate: true,
                      size: 24,
                      class: 'mr-2',
                    }),
                    'Executing query...',
                  ]),
              },
            );
          }

          if (error.value) {
            return h(
              resolveComponent('v-alert'),
              { type: 'error', variant: 'tonal', class: 'mb-4' },
              {
                default: () => `Query error: ${error.value}`,
              },
            );
          }

          if (results.value && thenComponent) {
            // Process template variables in thenComponent
            const processedComponent = processTemplateVariables(thenComponent, results.value);
            return renderComponent(processedComponent, context);
          }

          return null;
        };
      },
    });

    return h(SQLComponent);
  };

  const renderContainer = (component: A2UIComponent, context: any) => {
    const { layout, gap, children } = component.props || {};
    const childComponents = (children || []).map((child: A2UIComponent) =>
      renderComponent(child, context),
    );

    const containerClass =
      layout === 'grid' ? 'd-grid gap-4' : 'd-flex flex-column' + (gap ? ` gap-${gap}` : '');

    return h('div', { class: containerClass }, childComponents);
  };

  /**
   * Process template variables like {{results.column[0]}}
   */
  const processTemplateVariables = (
    component: A2UIComponent,
    results: QueryResult,
  ): A2UIComponent => {
    const processed = { ...component };

    // Helper to convert values (handles BigInt, numbers, strings)
    // Uses Number() for BigInt (similar to json-bigint's storeAsString: false behavior)
    const convertValue = (val: any): any => {
      if (typeof val === 'bigint') {
        // Convert BigInt to number - safe for chart values < Number.MAX_SAFE_INTEGER
        return Number(val);
      }
      // Also handle string representations of numbers from json-bigint
      if (typeof val === 'string' && /^\d+$/.test(val)) {
        const num = Number(val);
        if (!isNaN(num)) return num;
      }
      return val;
    };

    if (processed.props) {
      processed.props = { ...processed.props };

      // Process labels
      if (typeof processed.props.labels === 'string' && processed.props.labels.includes('{{')) {
        const match = processed.props.labels.match(/\{\{results\.column\[(\d+)\]\}\}/);
        if (match && results.columns[parseInt(match[1])]) {
          processed.props.labels = results.rows.map((row) => convertValue(row[parseInt(match[1])]));
        }
      }

      // Process datasets
      if (Array.isArray(processed.props.datasets)) {
        processed.props.datasets = processed.props.datasets.map((dataset: any) => {
          if (typeof dataset.data === 'string' && dataset.data.includes('{{')) {
            const match = dataset.data.match(/\{\{results\.column\[(\d+)\]\}\}/);
            if (match && results.columns[parseInt(match[1])]) {
              return {
                ...dataset,
                data: results.rows.map((row) => convertValue(row[parseInt(match[1])])),
              };
            }
          }
          return dataset;
        });
      }
    }

    return processed;
  };

  return { renderComponent };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A2UI RENDERER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const A2UIRenderer = defineComponent({
  name: 'A2UIRenderer',
  props: {
    components: {
      type: Array as () => A2UIComponent[],
      required: true,
    },
    context: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const { renderComponent } = useA2UIRenderer();

    return () =>
      h(
        'div',
        { class: 'a2ui-renderer' },
        props.components.map((comp) => renderComponent(comp, props.context)),
      );
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// METHODS
// ═══════════════════════════════════════════════════════════════════════════════

const { execute: executeDuckDBQuery } = useDuckDBQuery();
const { generateA2UI } = useLLM();

/**
 * Generate insights from user question
 */
async function generateInsights() {
  if (!selectedNamespace.value || selectedTables.value.length === 0 || !userQuestion.value.trim())
    return;

  isGenerating.value = true;
  generationStatus.value = null;
  a2uiResponse.value = null;
  generatedSqlQueries.value = [];
  progressMessage.value = 'Preparing request...';

  try {
    // Step 1: Verify schemas are loaded
    progressMessage.value = 'Verifying table schemas...';
    const schemasLoaded = selectedTables.value.every((table) => {
      const schema = tableSchemas.value[table];
      const loaded = schema && schema.length > 0;
      if (!loaded) {
        console.warn(`[AiInsightsPanel] Schema not loaded for ${table}`);
      }
      return loaded;
    });

    if (!schemasLoaded) {
      const missingCount = selectedTables.value.filter(
        (table) => !tableSchemas.value[table] || tableSchemas.value[table].length === 0,
      ).length;
      progressMessage.value = `Loading schemas for ${missingCount} table${missingCount > 1 ? 's' : ''}...`;
      console.log('[AiInsightsPanel] Fetching missing schemas...');
      await fetchTableSchemas(selectedTables.value);
      console.log('[AiInsightsPanel] Schemas loaded:', tableSchemas.value);
    } else {
      console.log('[AiInsightsPanel] All schemas already loaded');
    }

    // Step 2: Building prompt
    progressMessage.value = 'Building analysis prompt...';
    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay for UI update

    // Step 3: Sending to LLM
    if (settings.value.mode === 'local-wasm') {
      progressMessage.value = 'Running local LLM inference...';
    } else {
      progressMessage.value = `Sending request to ${settings.value.provider}...`;
    }

    const response = await generateA2UI(userQuestion.value);

    // Step 4: Processing response
    progressMessage.value = 'Processing AI response...';
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Validate response
    if (!response.components || response.components.length === 0) {
      throw new Error('LLM returned empty response');
    }

    // Step 5: Extract SQL queries
    progressMessage.value = 'Extracting SQL queries...';
    extractSqlQueries(response.components);

    // Step 5.5: Validate SQL references correct tables and columns
    progressMessage.value = 'Validating SQL queries...';
    const tableValidationError = validateSqlTables(generatedSqlQueries.value);
    if (tableValidationError) {
      throw new Error(`SQL table validation failed: ${tableValidationError}`);
    }

    const columnValidationError = validateSqlColumns(generatedSqlQueries.value);
    if (columnValidationError) {
      throw new Error(`SQL column validation failed: ${columnValidationError}`);
    }

    // Step 6: Rendering results
    progressMessage.value = 'Rendering insights...';
    await new Promise((resolve) => setTimeout(resolve, 100));

    a2uiResponse.value = response;
    generationStatus.value = {
      type: 'success',
      message: 'Insights generated successfully',
    };

    // Add to notification panel
    const namespaceInfo = selectedNamespace.value ? ` [${selectedNamespace.value}]` : '';
    const tablesInfo =
      selectedTables.value.length > 0 ? ` (${selectedTables.value.length} tables)` : '';
    notificationStore.addNotification({
      function: 'AI Insights',
      stack: selectedTables.value,
      text: `Generated insights${namespaceInfo}${tablesInfo}: "${userQuestion.value}"`,
      type: Type.SUCCESS,
    });

    emit('insights-generated', response);
  } catch (error) {
    console.error('Insight generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate insights';

    generationStatus.value = {
      type: 'error',
      message: errorMessage,
    };

    // Add error to notification panel
    const namespaceInfo = selectedNamespace.value ? ` [${selectedNamespace.value}]` : '';
    notificationStore.addNotification({
      function: 'AI Insights',
      stack: selectedTables.value,
      text: `Failed to generate insights${namespaceInfo}: ${errorMessage}`,
      type: Type.ERROR,
    });

    emit('error', error instanceof Error ? error : new Error('Unknown error'));
  } finally {
    isGenerating.value = false;
    progressMessage.value = '';
  }
}

/**
 * Regenerate insights with same question
 */
function regenerateInsights() {
  generateInsights();
}

/**
 * Clear results and reset state
 */
function clearResults() {
  a2uiResponse.value = null;
  generationStatus.value = null;
}

/**
 * Configure catalog with retry logic (matches WarehouseSqlQuery pattern)
 */
async function configureCatalogWithRetry(): Promise<boolean> {
  if (!props.catalogUrl || !props.warehouseName) {
    return false;
  }

  const maxAttempts = 10;
  const delayMs = 3000;

  const accessToken = config.enabledAuthentication ? userStore.user?.access_token || '' : '';

  if (!accessToken && config.enabledAuthentication) {
    warehouseError.value = 'No access token available. Please ensure you are logged in.';
    return false;
  }

  const projectId = props.projectId || visualStore.projectSelected?.['project-id'] || 'default';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await icebergDB.configureCatalog({
        catalogName: props.warehouseName,
        restUri: props.catalogUrl,
        accessToken: accessToken,
        projectId: projectId,
      });
      return true;
    } catch (catalogError) {
      const errorMessage =
        catalogError instanceof Error ? catalogError.message : String(catalogError);

      if (
        errorMessage.includes('CORS') ||
        errorMessage.includes('Access-Control-Allow') ||
        errorMessage.includes('cross-origin')
      ) {
        warehouseError.value = errorMessage;
        return false;
      }

      if (errorMessage.includes('Catalog') && errorMessage.includes('does not exist')) {
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        } else {
          warehouseError.value = 'Warehouse catalog is not available yet. Please wait and refresh.';
          return false;
        }
      } else {
        warehouseError.value = `Failed to configure catalog: ${errorMessage}`;
        return false;
      }
    }
  }

  return false;
}

/**
 * Initialize DuckDB and configure Iceberg catalog
 */
async function initializeDuckDB() {
  if (hasInitialized.value) {
    return;
  }

  if (!props.catalogUrl || !props.warehouseName) {
    return;
  }

  try {
    await icebergDB.initialize();
    hasInitialized.value = true;

    isCheckingWarehouse.value = true;
    warehouseError.value = null;

    const success = await configureCatalogWithRetry();

    isCheckingWarehouse.value = false;

    if (success) {
      // Prevent handlers from running during restoration
      isRestoringFromStorage.value = true;

      // Load namespaces first
      await loadAvailableNamespaces();

      // Restore persisted namespace selection BEFORE loading tables
      const persistedNamespace = localStorage.getItem(SELECTED_NAMESPACE_STORAGE_KEY);
      if (persistedNamespace && availableNamespaces.value.includes(persistedNamespace)) {
        selectedNamespace.value = persistedNamespace;
      }

      // Now load tables (which may use selectedNamespace.value)
      await loadAvailableTables();

      // Restore persisted table selection if it exists in available tables
      const persistedTables = localStorage.getItem(SELECTED_TABLES_STORAGE_KEY);
      if (persistedTables) {
        try {
          const parsedTables = JSON.parse(persistedTables);
          // Only restore tables that are still available
          selectedTables.value = parsedTables.filter((t: string) =>
            availableTables.value.includes(t),
          );
        } catch (error) {
          console.warn('Failed to restore persisted tables:', error);
        }
      }

      // Re-enable watchers after restoration is complete
      await nextTick(); // Ensure Vue has processed the updates
      isRestoringFromStorage.value = false;
    }
  } catch (e) {
    isCheckingWarehouse.value = false;
    warehouseError.value = 'Failed to initialize DuckDB WASM';
    console.error('DuckDB initialization failed:', e);
  }
}

/**
 * Load available namespaces from catalog
 */
async function loadAvailableNamespaces() {
  if (!props.warehouseId) return;

  loadingNamespaces.value = true;
  try {
    const nsResponse = await functions.listNamespaces(
      props.warehouseId,
      undefined,
      undefined,
      false,
    );

    availableNamespaces.value = nsResponse.namespaces.map((ns) => ns.join('.'));

    // Only auto-select if not restoring from storage and props specify a namespace
    if (
      !isRestoringFromStorage.value &&
      props.namespace &&
      availableNamespaces.value.includes(props.namespace)
    ) {
      selectedNamespace.value = props.namespace;
    } else if (
      !isRestoringFromStorage.value &&
      availableNamespaces.value.length === 1 &&
      !localStorage.getItem(SELECTED_NAMESPACE_STORAGE_KEY)
    ) {
      // Auto-select if only one namespace and no saved preference
      selectedNamespace.value = availableNamespaces.value[0];
    }
  } catch (error) {
    console.error('Failed to load namespaces:', error);
    availableNamespaces.value = [];
  } finally {
    loadingNamespaces.value = false;
  }
}

/**
 * Handle namespace selection change
 */
function onNamespaceChange() {
  // Don't handle changes during restoration from localStorage
  if (isRestoringFromStorage.value) {
    return;
  }

  // Clear selected tables when namespace changes
  selectedTables.value = [];
  // Reload tables for new namespace
  if (selectedNamespace.value) {
    loadTablesForNamespace(selectedNamespace.value);
  }
}

/**
 * Toggle select all tables
 */
function toggleAllTables() {
  if (selectedTables.value.length === filteredTables.value.length) {
    selectedTables.value = [];
  } else {
    selectedTables.value = [...filteredTables.value];
  }
}

/**
 * Handle table selection change - fetch schemas
 */
watch(
  selectedTables,
  async (newTables) => {
    if (
      newTables.length > 0 &&
      icebergDB.isInitialized.value &&
      icebergDB.catalogConfigured.value
    ) {
      await fetchTableSchemas(newTables);
    }
  },
  { deep: true },
);

/**
 * Extract SQL queries from A2UI components recursively
 */
function extractSqlQueries(components: A2UIComponent[]) {
  const queries: string[] = [];

  function traverse(comp: A2UIComponent) {
    if (comp.type === 'sql' && comp.props?.query) {
      queries.push(comp.props.query);
      // Also check the 'then' component
      if (comp.props.then) {
        traverse(comp.props.then);
      }
    }
    if (comp.type === 'container' && comp.props?.children) {
      comp.props.children.forEach(traverse);
    }
  }

  components.forEach(traverse);
  generatedSqlQueries.value = queries;
}

/**
 * Validate that SQL queries only reference columns that exist in the schemas
 * Returns error message if validation fails, null if OK
 */
function validateSqlColumns(queries: string[]): string | null {
  const schemas = tableSchemas.value;

  // SQL keywords to exclude from column validation
  const sqlKeywords = new Set([
    'SELECT',
    'FROM',
    'WHERE',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'FULL',
    'ON',
    'AND',
    'OR',
    'NOT',
    'IN',
    'AS',
    'GROUP',
    'BY',
    'ORDER',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'DISTINCT',
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'CAST',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
    'NULL',
    'IS',
    'BETWEEN',
    'LIKE',
    'ASC',
    'DESC',
    'INTEGER',
    'BIGINT',
    'VARCHAR',
    'DOUBLE',
    'DATE',
    'TIMESTAMP',
    'BOOL',
    'BOOLEAN',
    'TRUE',
    'FALSE',
  ]);

  for (const query of queries) {
    // Extract potential column names from the query
    // Look for identifiers that aren't SQL keywords
    const words = query.split(/[\s,()=<>!+\-*\/]+/);
    const potentialColumns = words.filter((word) => {
      if (!word || word.length === 0) return false;
      const upper = word.toUpperCase();
      // Skip SQL keywords, numbers, and string literals
      if (sqlKeywords.has(upper)) return false;
      if (/^\d+$/.test(word)) return false; // Skip numbers
      if (word.startsWith("'") || word.startsWith('"')) return false; // Skip strings
      // Skip table references (contains dots for qualified names)
      if (word.split('.').length > 2) return false;
      // Keep only simple identifiers that look like column names
      return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word);
    });

    // Build a set of all valid column names from all loaded schemas
    const validColumns = new Set<string>();
    for (const tableName in schemas) {
      const tableSchema = schemas[tableName];
      if (tableSchema) {
        tableSchema.forEach((col) => validColumns.add(col.column));
      }
    }

    // Check each potential column against valid columns
    for (const col of potentialColumns) {
      const colLower = col.toLowerCase();
      const colUpper = col.toUpperCase();

      // Check if this column exists in any of the schemas (case-insensitive)
      const foundInSchema = Array.from(validColumns).some(
        (validCol) => validCol.toLowerCase() === colLower,
      );

      if (!foundInSchema) {
        // This might be a column name that doesn't exist
        // Double-check it's not an alias or partial calculation
        if (col.length > 2 && !col.includes('_total') && !col.includes('_count')) {
          return `Query references column "${col}" which doesn't exist in the loaded table schemas. Available columns: ${Array.from(validColumns).slice(0, 10).join(', ')}...`;
        }
      }
    }
  }

  return null;
}

/**
 * Validate that SQL queries only reference tables from the selected list
 * Returns error message if validation fails, null if OK
 */
function validateSqlTables(queries: string[]): string | null {
  const validTables = selectedTables.value.length > 0 ? selectedTables.value : filteredTables.value;

  // Create a set of valid table names for quick lookup
  const validTableSet = new Set(validTables);

  // Also create a set of just the table names (last part after dots) for partial matching
  const validTableNames = new Set(validTables.map((t) => t.split('.').pop()!));

  for (const query of queries) {
    // Extract table references from SQL (FROM and JOIN clauses)
    // Match patterns like "FROM table_name" or "JOIN table_name"
    const fromJoinPattern = /(?:FROM|JOIN)\s+([a-zA-Z0-9_.]+)/gi;
    let match;

    while ((match = fromJoinPattern.exec(query)) !== null) {
      const referencedTable = match[1];

      // Check if this exact table name exists in our valid list
      if (!validTableSet.has(referencedTable)) {
        // Check if it's a partial name (like "sales" instead of "demo.tpcds.catalog_sales")
        const tableName = referencedTable.split('.').pop()!;

        if (!validTableNames.has(tableName)) {
          return `Query references unknown table "${referencedTable}". Available tables: ${validTables.join(', ')}`;
        } else {
          // Table name exists but missing catalog/namespace prefix
          const fullTableName = validTables.find((t) => t.endsWith(`.${tableName}`));
          return `Query uses incomplete table name "${referencedTable}". Use full name: ${fullTableName}`;
        }
      }
    }
  }

  return null; // All validations passed
}

/**
 * Copy SQL to clipboard
 */
async function copySqlToClipboard(sql: string) {
  try {
    await navigator.clipboard.writeText(sql);
    generationStatus.value = {
      type: 'success',
      message: 'SQL copied to clipboard',
    };
    setTimeout(() => {
      if (generationStatus.value?.message === 'SQL copied to clipboard') {
        generationStatus.value = null;
      }
    }, 2000);
  } catch (error) {
    console.error('Failed to copy SQL:', error);
    generationStatus.value = {
      type: 'error',
      message: 'Failed to copy SQL to clipboard',
    };
  }
}

/**
 * Format SQL for better readability
 */
function formatSql(sql: string): string {
  if (!sql) return '';

  // Basic SQL formatting with indentation
  let formatted = sql
    // Add newlines before major keywords
    .replace(
      /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|UNION)\b/gi,
      '\n$1',
    )
    // Add newlines after commas in SELECT
    .replace(/,\s*(?=\w)/g, ',\n  ')
    // Clean up extra whitespace
    .replace(/\n\s*\n/g, '\n')
    .trim();

  // Add indentation
  const lines = formatted.split('\n');
  let indent = 0;
  const formattedLines = lines.map((line) => {
    const trimmed = line.trim();

    // Decrease indent before these keywords
    if (/^(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT)/i.test(trimmed)) {
      indent = 0;
    }

    const indented = '  '.repeat(indent) + trimmed;

    // Increase indent after SELECT, JOIN
    if (/^(SELECT)/i.test(trimmed)) {
      indent = 1;
    }

    return indented;
  });

  return formattedLines.join('\n');
}

/**
 * Save prompt to localStorage
 */
function savePromptToLocalStorage() {
  try {
    localStorage.setItem(PROMPT_STORAGE_KEY, userQuestion.value);
  } catch (error) {
    console.warn('Failed to save prompt to localStorage:', error);
  }
}

/**
 * Load prompt from localStorage
 */
function loadPromptFromLocalStorage() {
  try {
    const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (saved) {
      userQuestion.value = saved;
    }
  } catch (error) {
    console.warn('Failed to load prompt from localStorage:', error);
  }
}

/**
 * Save system prompt to localStorage
 */
function saveSystemPromptToLocalStorage() {
  try {
    localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, customSystemPrompt.value);
  } catch (error) {
    console.warn('Failed to save system prompt to localStorage:', error);
  }
}

/**
 * Save selected namespace to localStorage
 */
function saveSelectedNamespaceToLocalStorage() {
  try {
    if (selectedNamespace.value) {
      localStorage.setItem(SELECTED_NAMESPACE_STORAGE_KEY, selectedNamespace.value);
    } else {
      localStorage.removeItem(SELECTED_NAMESPACE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to save selected namespace to localStorage:', error);
  }
}

/**
 * Load selected namespace from localStorage
 */
function loadSelectedNamespaceFromLocalStorage() {
  try {
    const saved = localStorage.getItem(SELECTED_NAMESPACE_STORAGE_KEY);
    if (saved) {
      selectedNamespace.value = saved;
    }
  } catch (error) {
    console.warn('Failed to load selected namespace from localStorage:', error);
  }
}

/**
 * Save selected tables to localStorage
 */
function saveSelectedTablesToLocalStorage() {
  try {
    if (selectedTables.value.length > 0) {
      localStorage.setItem(SELECTED_TABLES_STORAGE_KEY, JSON.stringify(selectedTables.value));
    } else {
      localStorage.removeItem(SELECTED_TABLES_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to save selected tables to localStorage:', error);
  }
}

/**
 * Load selected tables from localStorage
 */
function loadSelectedTablesFromLocalStorage() {
  try {
    const saved = localStorage.getItem(SELECTED_TABLES_STORAGE_KEY);
    if (saved) {
      selectedTables.value = JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load selected tables from localStorage:', error);
  }
}

/**
 * Load system prompt from localStorage
 */
function loadSystemPromptFromLocalStorage() {
  try {
    const saved = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
    if (saved) {
      customSystemPrompt.value = saved;
    }
  } catch (error) {
    console.warn('Failed to load system prompt from localStorage:', error);
  }
}

/**
 * Reset system prompt to default
 */
function resetSystemPrompt() {
  customSystemPrompt.value = '';
  localStorage.removeItem(SYSTEM_PROMPT_STORAGE_KEY);
  generationStatus.value = {
    type: 'info',
    message: 'System prompt reset to default (will auto-update with table selection)',
  };
  setTimeout(() => {
    if (generationStatus.value?.message.includes('reset')) {
      generationStatus.value = null;
    }
  }, 3000);
}

/**
 * Export A2UI results as PDF
 */
async function exportToPDF() {
  if (!a2uiContainerRef.value || !a2uiResponse.value) return;

  isExportingPDF.value = true;
  generationStatus.value = {
    type: 'info',
    message: 'Generating PDF...',
  };

  try {
    // Dynamically import jsPDF to avoid bundling if not used
    const { jsPDF } = await import('jspdf');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `ai-insights-${selectedNamespace.value || 'report'}-${timestamp}.pdf`;

    // Create new PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Use html() method which preserves text as selectable text (not images)
    await pdf.html(a2uiContainerRef.value, {
      callback: function (doc) {
        doc.save(filename);
      },
      margin: [10, 10, 10, 10],
      autoPaging: 'text',
      html2canvas: {
        scale: 0.265, // Scale to fit A4 width (~210mm)
        useCORS: true,
        logging: false,
      },
      width: 190, // A4 width minus margins
      windowWidth: 800, // Source width for scaling
    });

    generationStatus.value = {
      type: 'success',
      message: 'PDF exported successfully',
    };
  } catch (error) {
    console.error('PDF export error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a missing dependency issue
    if (errorMessage.includes('Cannot find module') || errorMessage.includes('jspdf')) {
      generationStatus.value = {
        type: 'error',
        message: 'PDF export requires jsPDF. Run: npm install jspdf',
      };
    } else {
      generationStatus.value = {
        type: 'error',
        message: `Failed to export PDF: ${errorMessage}`,
      };
    }
  } finally {
    isExportingPDF.value = false;
    // Clear status after 5 seconds
    setTimeout(() => {
      if (generationStatus.value?.message.includes('PDF')) {
        generationStatus.value = null;
      }
    }, 5000);
  }
}

/**
 * Load tables for a specific namespace
 */
async function loadTablesForNamespace(namespace: string) {
  if (!props.warehouseId || !props.warehouseName) return;

  loadingTables.value = true;
  try {
    const tablesResponse = await functions.listTables(
      props.warehouseId,
      namespace,
      undefined,
      false,
    );

    const namespaceTables: string[] = [];
    if (tablesResponse.identifiers && tablesResponse.identifiers.length > 0) {
      tablesResponse.identifiers.forEach((table) => {
        const fullTableName = `${props.warehouseName}.${namespace}.${table.name}`;
        namespaceTables.push(fullTableName);
      });
    }

    // Update or append to available tables
    const existingTables = availableTables.value.filter((t) => {
      const parts = t.split('.');
      const tableNs = parts.slice(1, -1).join('.');
      return tableNs !== namespace;
    });

    availableTables.value = [...existingTables, ...namespaceTables].sort();
  } catch (error) {
    console.error(`Failed to load tables for namespace ${namespace}:`, error);
  } finally {
    loadingTables.value = false;
  }
}

/**
 * Load available tables from Iceberg catalog or props
 */
async function loadAvailableTables() {
  // Priority 1: Use explicitly provided tables
  if (props.tables && props.tables.length > 0) {
    availableTables.value = props.tables;
    return;
  }

  // Priority 2: Fetch from Iceberg catalog
  if (!props.warehouseId || !props.warehouseName) return;

  loadingTables.value = true;
  try {
    const allTables: string[] = [];

    // Determine which namespaces to query
    let namespacesToQuery: string[] = [];

    if (props.namespace) {
      // Query only specified namespace
      namespacesToQuery = [props.namespace];
    } else if (selectedNamespace.value) {
      // Query only selected namespace
      namespacesToQuery = [selectedNamespace.value];
    } else {
      // Query all namespaces
      const nsResponse = await functions.listNamespaces(
        props.warehouseId,
        undefined,
        undefined,
        false,
      );
      namespacesToQuery = nsResponse.namespaces.map((ns) => ns.join('.'));
    }

    // For each namespace, fetch tables
    for (const namespacePath of namespacesToQuery) {
      try {
        const tablesResponse = await functions.listTables(
          props.warehouseId,
          namespacePath,
          undefined,
          false,
        );

        // Build fully qualified table names: catalog.namespace.tablename
        if (tablesResponse.identifiers && tablesResponse.identifiers.length > 0) {
          tablesResponse.identifiers.forEach((table) => {
            const fullTableName = `${props.warehouseName}.${namespacePath}.${table.name}`;
            allTables.push(fullTableName);
          });
        }
      } catch (error) {
        console.warn(`Failed to load tables for namespace ${namespacePath}:`, error);
      }
    }

    availableTables.value = allTables.sort();
  } catch (error) {
    console.error('Failed to load tables from Iceberg catalog:', error);
    availableTables.value = [];
  } finally {
    loadingTables.value = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

onMounted(() => {
  loadPromptFromLocalStorage();
  loadSystemPromptFromLocalStorage();
  initializeDuckDB();
});

// Watch for catalog URL or warehouse name changes and reinitialize
watch(
  () => [props.catalogUrl, props.warehouseName],
  () => {
    hasInitialized.value = false;
    initializeDuckDB();
  },
);

// Watch for token refresh and reconfigure catalog
watch(
  () => userStore.user?.access_token,
  async (newToken, oldToken) => {
    // Only reconfigure if token actually changed and catalog was already initialized
    if (newToken && oldToken && newToken !== oldToken && hasInitialized.value) {
      console.log('[AiInsightsPanel] Access token refreshed, reconfiguring catalog...');

      // Reconfigure catalog with new token
      const success = await configureCatalogWithRetry();

      if (success) {
        console.log('[AiInsightsPanel] Catalog reconfigured with new token');
      } else {
        console.error('[AiInsightsPanel] Failed to reconfigure catalog with new token');
        generationStatus.value = {
          type: 'warning',
          message: 'Token refreshed - please reload if queries fail',
        };
      }
    }
  },
);

// Watch for local model changes - dispose old model when switching
watch(
  () => settings.value.localModel,
  async (newModel, oldModel) => {
    if (newModel !== oldModel && webLLM.isInitialized.value) {
      console.log('[AiInsightsPanel] Local model changed, disposing old model...');
      await webLLM.dispose();
      console.log(
        '[AiInsightsPanel] Old model disposed. New model will initialize on next generation.',
      );
    }
  },
);

// Watch for user question changes and persist to localStorage
watch(userQuestion, (newQuestion) => {
  savePromptToLocalStorage();
});

// Watch for selected namespace changes and persist to localStorage
watch(selectedNamespace, (newNamespace) => {
  // Don't save during initial restoration to prevent conflicts
  if (!isRestoringFromStorage.value) {
    saveSelectedNamespaceToLocalStorage();
  }
});

// Watch for selected tables changes and persist to localStorage
watch(
  selectedTables,
  (newTables) => {
    // Don't save during initial restoration to prevent conflicts
    if (!isRestoringFromStorage.value) {
      saveSelectedTablesToLocalStorage();
    }
  },
  { deep: true },
);

// Watch for external table updates
watch(
  () => props.tables,
  (newTables) => {
    if (newTables && newTables.length > 0) {
      availableTables.value = newTables;
    }
  },
);

// Watch for namespace prop changes
watch(
  () => props.namespace,
  (newNamespace) => {
    if (newNamespace && availableNamespaces.value.includes(newNamespace)) {
      selectedNamespace.value = newNamespace;
      loadTablesForNamespace(newNamespace);
    }
  },
);
</script>

<style scoped>
.ai-insights-panel {
  height: 100%;
  min-height: 600px;
}

.fill-height {
  height: 100%;
}

.border-e {
  border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.a2ui-container {
  padding: 16px;
}

.a2ui-renderer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.markdown-content {
  line-height: 1.6;
}

.markdown-content h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.markdown-content h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.markdown-content h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.sql-code {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #2c3e50;
}

.v-theme--dark .sql-code {
  color: #ecf0f1;
}

.sql-queries-container {
  max-height: 500px;
  overflow-y: auto;
}

.sql-card {
  max-height: 400px;
  overflow: auto;
}

/* Dark mode support */
.v-theme--dark .border-e {
  border-right-color: rgba(255, 255, 255, 0.12);
}

/* Responsive */
@media (max-width: 960px) {
  .border-e {
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  }

  .v-theme--dark .border-e {
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }
}
</style>
