<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-database-search</v-icon>
            SQL Query
            <v-spacer />
            <v-chip v-if="duckDB.isInitialized.value" color="success" size="small">
              <v-icon start>mdi-check-circle</v-icon>
              DuckDB Ready
            </v-chip>
            <v-chip v-else-if="duckDB.isInitializing.value" color="info" size="small">
              <v-icon start>mdi-loading mdi-spin</v-icon>
              Initializing...
            </v-chip>
          </v-card-title>

          <v-card-text>
            <!-- SQL Editor -->
            <v-textarea
              v-model="sqlQuery"
              label="SQL Query"
              placeholder="SELECT * FROM iceberg_table LIMIT 10;"
              rows="8"
              variant="outlined"
              auto-grow
              class="font-monospace"
              :disabled="isExecuting"
            />

            <!-- Quick Examples -->
            <v-expansion-panels v-model="examplesPanel" class="mb-4">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <v-icon class="mr-2">mdi-lightbulb-outline</v-icon>
                  Example Queries
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-list density="compact">
                    <v-list-item
                      v-for="(example, idx) in exampleQueries"
                      :key="idx"
                      @click="loadExample(example.query)"
                    >
                      <v-list-item-title>{{ example.title }}</v-list-item-title>
                      <v-list-item-subtitle class="font-monospace text-caption">
                        {{ example.query }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <!-- Action Buttons -->
            <div class="d-flex gap-2 mb-4">
              <v-btn
                color="primary"
                :loading="isExecuting"
                :disabled="!sqlQuery.trim() || isExecuting"
                @click="executeQuery"
              >
                <v-icon start>mdi-play</v-icon>
                Execute Query
              </v-btn>
              <v-btn
                variant="outlined"
                :disabled="!queryResult"
                @click="clearResults"
              >
                <v-icon start>mdi-close</v-icon>
                Clear
              </v-btn>
            </div>

            <!-- Error Display -->
            <v-alert
              v-if="error"
              type="error"
              closable
              @click:close="error = null"
              class="mb-4"
            >
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
                <div style="max-height: 500px; overflow: auto;">
                  <v-table density="compact" fixed-header>
                    <thead>
                      <tr>
                        <th
                          v-for="column in queryResult.columns"
                          :key="column"
                          class="text-left font-weight-bold"
                        >
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
              <div class="text-body-2 text-grey">
                Execute a query to see results here
              </div>
            </v-card>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useDuckDB, type QueryResult } from '../composables/useDuckDB';

interface Props {
  warehouseId?: string;
  namespaceId?: string;
  tableName?: string;
  tableMetadata?: any;
}

const props = defineProps<Props>();

const duckDB = useDuckDB();
const sqlQuery = ref('');
const queryResult = ref<QueryResult | null>(null);
const isExecuting = ref(false);
const error = ref<string | null>(null);
const examplesPanel = ref<number | undefined>(undefined);

const exampleQueries = [
  {
    title: 'Select all rows (limited)',
    query: 'SELECT * FROM iceberg_table LIMIT 10;',
  },
  {
    title: 'Count rows',
    query: 'SELECT COUNT(*) as total_rows FROM iceberg_table;',
  },
  {
    title: 'Show table schema',
    query: 'DESCRIBE iceberg_table;',
  },
  {
    title: 'Group by example',
    query: 'SELECT column_name, COUNT(*) as count FROM iceberg_table GROUP BY column_name LIMIT 10;',
  },
  {
    title: 'Aggregation example',
    query: 'SELECT MIN(column_name) as min_val, MAX(column_name) as max_val, AVG(column_name) as avg_val FROM iceberg_table;',
  },
];

async function executeQuery() {
  if (!sqlQuery.value.trim()) return;

  isExecuting.value = true;
  error.value = null;
  queryResult.value = null;

  try {
    const result = await duckDB.executeQuery(sqlQuery.value);
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
  // Initialize DuckDB when component is mounted
  try {
    await duckDB.initialize();
  } catch (e) {
    error.value = 'Failed to initialize DuckDB WASM';
    console.error('DuckDB initialization failed:', e);
  }
});

onBeforeUnmount(async () => {
  // Cleanup DuckDB resources
  await duckDB.cleanup();
});
</script>

<style scoped>
.font-monospace {
  font-family: 'Courier New', Courier, monospace;
}
</style>
