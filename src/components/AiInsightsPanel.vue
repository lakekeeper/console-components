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

          <!-- Table Selection -->
          <v-card-text class="flex-grow-0">
            <v-autocomplete
              v-model="selectedTable"
              :items="availableTables"
              label="Select Iceberg Table"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              :loading="loadingTables"
              prepend-inner-icon="mdi-table"></v-autocomplete>
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
              :disabled="!selectedTable"
              placeholder="e.g., What are the top 10 products by revenue? Show me trends over time."
              class="mb-3"></v-textarea>

            <v-btn
              color="primary"
              size="large"
              block
              :loading="isGenerating"
              :disabled="!selectedTable || !userQuestion.trim()"
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
            <div v-if="!userQuestion && selectedTable" class="mt-4">
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
              <div class="text-h6 mb-2">Generating insights...</div>
              <div class="text-body-2 text-grey">Analyzing your data with AI</div>
            </div>

            <!-- A2UI Components Renderer -->
            <div v-else-if="a2uiResponse" class="a2ui-container">
              <A2UIRenderer :components="a2uiResponse.components" :context="rendererContext" />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineComponent, h, markRaw, inject, toRef } from 'vue';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { useFunctions } from '@/plugins/functions';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import type { QueryResult } from '@/composables/useDuckDB';
import { useUserStore } from '@/stores/user';
import { useVisualStore } from '@/stores/visual';
import { useStorageValidation } from '@/composables/useStorageValidation';

// Register Chart.js components
Chart.register(...registerables);

// Initialize functions API
const functions = useFunctions();
const userStore = useUserStore();
const visualStore = useVisualStore();

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
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

const showSettings = ref(false);
const selectedTable = ref<string | null>(null);
const hasInitialized = ref(false);
const warehouseError = ref<string | null>(null);
const isCheckingWarehouse = ref(false);
const userQuestion = ref('');
const isGenerating = ref(false);
const loadingTables = ref(false);
const a2uiResponse = ref<A2UIResponse | null>(null);
const generationStatus = ref<Status | null>(null);

const settings = ref<LLMSettings>({
  mode: 'remote',
  provider: 'openai',
  apiKey: '',
  endpoint: '',
  model: '',
});

const availableTables = ref<string[]>([]);

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

const rendererContext = computed(() => ({
  selectedTable: selectedTable.value,
  executeQuery: executeDuckDBQuery,
}));

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
 * LLM Composable
 * Abstracts LLM interaction - supports local WASM and remote APIs
 */
function useLLM() {
  /**
   * Generate A2UI JSON from user question using configured LLM
   */
  const generateA2UI = async (prompt: string): Promise<A2UIResponse> => {
    const systemPrompt = `You are a data analyst assistant. Your task is to analyze data questions and return ONLY valid A2UI JSON.

A2UI is a declarative component specification for rendering insights. You may use these component types:

1. "kpi" - Key Performance Indicator card
   props: { title: string, value: string|number, subtitle?: string, icon?: string, color?: string }

2. "table" - Data table
   props: { columns: string[], rows: any[][], title?: string }

3. "chart" - Chart visualization  
   props: { chartType: "bar"|"line"|"pie"|"doughnut", title?: string, labels: string[], datasets: Array<{label: string, data: number[], backgroundColor?: string[], borderColor?: string}> }

4. "markdown" - Rendered markdown text
   props: { content: string }

5. "sql" - SQL query to execute against DuckDB (table name: ${selectedTable.value})
   props: { query: string, then: A2UIComponent } - the "then" component renders using query results

6. "container" - Layout container
   props: { layout?: "grid"|"flex", gap?: number, children: A2UIComponent[] }

CRITICAL RULES:
- Return ONLY valid JSON matching A2UIResponse interface
- No explanations, no markdown code blocks, no conversational text
- SQL queries must reference the table: ${selectedTable.value}
- Charts must include valid data or reference SQL results
- Use descriptive titles and labels
- Provide actionable insights

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
        "query": "SELECT category, SUM(revenue) as total FROM ${selectedTable.value} GROUP BY category ORDER BY total DESC LIMIT 5",
        "then": {
          "type": "chart",
          "props": {
            "chartType": "bar",
            "title": "Top 5 Categories by Revenue",
            "labels": "{{results.column[0]}}",
            "datasets": [{
              "label": "Revenue",
              "data": "{{results.column[1]}}",
              "backgroundColor": ["#1976D2", "#388E3C", "#F57C00", "#7B1FA2", "#C2185B"]
            }]
          }
        }
      }
    }
  ]
}`;

    const fullPrompt = `${systemPrompt}\n\nUser Question: ${prompt}\n\nReturn A2UI JSON:`;

    if (settings.value.mode === 'local-wasm') {
      return await generateLocalWASM(fullPrompt);
    } else {
      return await generateRemote(fullPrompt);
    }
  };

  /**
   * Generate using local WASM LLM
   */
  const generateLocalWASM = async (prompt: string): Promise<A2UIResponse> => {
    // Check if window.localLLM exists
    const localLLM = (window as any).localLLM;
    if (!localLLM || typeof localLLM.generate !== 'function') {
      throw new Error(
        'Local WASM LLM not available. Ensure window.localLLM.generate() is initialized.',
      );
    }

    try {
      const response = await localLLM.generate(prompt);
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
        item[col] = row[idx];
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

    if (processed.props) {
      processed.props = { ...processed.props };

      // Process labels
      if (typeof processed.props.labels === 'string' && processed.props.labels.includes('{{')) {
        const match = processed.props.labels.match(/\{\{results\.column\[(\d+)\]\}\}/);
        if (match && results.columns[parseInt(match[1])]) {
          processed.props.labels = results.rows.map((row) => row[parseInt(match[1])]);
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
                data: results.rows.map((row) => row[parseInt(match[1])]),
              };
            }
          }
          return dataset;
        });
      }
    }

    return processed;
  };

  // Helper to resolve Vue components
  const resolveComponent = (name: string) => {
    // Return the component name as string, Vue will resolve it
    return name;
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
  if (!selectedTable.value || !userQuestion.value.trim()) return;

  isGenerating.value = true;
  generationStatus.value = null;
  a2uiResponse.value = null;

  try {
    const response = await generateA2UI(userQuestion.value);

    // Validate response
    if (!response.components || response.components.length === 0) {
      throw new Error('LLM returned empty response');
    }

    a2uiResponse.value = response;
    generationStatus.value = {
      type: 'success',
      message: 'Insights generated successfully',
    };

    emit('insights-generated', response);
  } catch (error) {
    console.error('Insight generation error:', error);
    generationStatus.value = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to generate insights',
    };
    emit('error', error instanceof Error ? error : new Error('Unknown error'));
  } finally {
    isGenerating.value = false;
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
      // Load tables after successful catalog configuration
      await loadAvailableTables();
    }
  } catch (e) {
    isCheckingWarehouse.value = false;
    warehouseError.value = 'Failed to initialize DuckDB WASM';
    console.error('DuckDB initialization failed:', e);
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

    // Get all namespaces in the warehouse
    const nsResponse = await functions.listNamespaces(
      props.warehouseId,
      undefined,
      undefined,
      false,
    );

    // For each namespace, fetch tables
    for (const namespace of nsResponse.namespaces) {
      const namespacePath = namespace.join('.');
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

// Watch for external table updates
watch(
  () => props.tables,
  (newTables) => {
    if (newTables && newTables.length > 0) {
      availableTables.value = newTables;
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
