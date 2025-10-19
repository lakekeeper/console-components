# DuckDB SQL Query Feature

## Overview

The console-components library now includes a SQL query interface powered by DuckDB WASM, allowing users to run SQL queries directly on Iceberg table data in the browser.

## Components

### TableSqlQuery

A Vue component that provides an interactive SQL query interface with:
- SQL text editor with syntax highlighting
- Query execution with loading states
- Results display in a data table
- Example queries for quick start
- Error handling and display

**Usage:**

```vue
<TableSqlQuery
  :warehouse-id="warehouseId"
  :namespace-id="namespaceId"
  :table-name="tableName"
/>
```

### Composables

#### useDuckDB

Low-level composable for DuckDB WASM initialization and query execution.

```typescript
import { useDuckDB } from '@lakekeeper/console-components';

const duckDB = useDuckDB();

// Initialize DuckDB
await duckDB.initialize();

// Execute a query
const result = await duckDB.executeQuery('SELECT * FROM my_table LIMIT 10');

// Cleanup
await duckDB.cleanup();
```

#### useIcebergDuckDB

Higher-level composable that integrates DuckDB with Iceberg tables.

```typescript
import { useIcebergDuckDB } from '@lakekeeper/console-components';

const icebergDB = useIcebergDuckDB();

// Register an Iceberg table
await icebergDB.registerIcebergTable({
  warehouseId: 'my-warehouse',
  namespaceId: 'my-namespace',
  tableName: 'my-table',
});

// Load Parquet files
await icebergDB.loadParquetFiles('my_table', [
  'https://example.com/data.parquet',
]);

// Execute queries
const result = await icebergDB.executeQuery('SELECT COUNT(*) FROM my_table');
```

## Setup in Consuming Applications

### 1. Install Dependencies

DuckDB WASM is already included as a dependency of `@lakekeeper/console-components`.

```bash
npm install @duckdb/duckdb-wasm
```

### 2. Copy WASM Files to Public Directory

DuckDB requires WASM files and web workers to be served from the same origin. Copy these files to your public directory:

```bash
# Create directory
mkdir -p public/duckdb

# Copy WASM and worker files
cp node_modules/@duckdb/duckdb-wasm/dist/*.wasm public/duckdb/
cp node_modules/@duckdb/duckdb-wasm/dist/*worker.js public/duckdb/
```

The following files should be copied:
- `duckdb-mvp.wasm` (~37MB)
- `duckdb-eh.wasm` (~32MB)
- `duckdb-coi.wasm` (~32MB)
- `duckdb-browser-mvp.worker.js`
- `duckdb-browser-eh.worker.js`
- `duckdb-browser-coi.worker.js`
- `duckdb-browser-coi.pthread.worker.js`

### 3. Add SQL Tab to Table View

In your table detail page, add a new tab for SQL queries:

```vue
<template>
  <v-tabs v-model="tab">
    <v-tab value="overview">Overview</v-tab>
    <v-tab value="sql">SQL</v-tab>
  </v-tabs>
  
  <v-tabs-window v-model="tab">
    <v-tabs-window-item value="sql">
      <TableSqlQuery
        v-if="tab === 'sql'"
        :warehouse-id="warehouseId"
        :namespace-id="namespaceId"
        :table-name="tableName"
      />
    </v-tabs-window-item>
  </v-tabs-window>
</template>
```

## Features

### Example Queries

The component includes pre-built example queries:
- `SELECT * FROM iceberg_table LIMIT 10` - View sample data
- `SELECT COUNT(*) FROM iceberg_table` - Count total rows
- `DESCRIBE iceberg_table` - Show table schema
- Aggregation and grouping examples

### Query Results

Query results are displayed in a scrollable table with:
- Column headers
- Row data with proper formatting
- NULL value handling
- Row count display

### Error Handling

SQL errors are displayed with full error messages to help debug queries.

## Architecture

### DuckDB WASM Initialization

The library uses DuckDB's bundle selection to choose the appropriate WASM variant based on browser capabilities:
- **MVP**: Minimum viable product, widest compatibility
- **EH**: Exception handling, better error messages
- **COI**: Cross-origin isolation, best performance (requires specific headers)

### Iceberg Integration

The current implementation provides a foundation for Iceberg table queries. To fully integrate with your Iceberg catalog:

1. Fetch table metadata from your Iceberg REST API
2. Parse metadata to extract Parquet file locations
3. Use `loadParquetFiles()` to register files with DuckDB
4. Execute SQL queries against the loaded data

Example:

```typescript
// Fetch Iceberg metadata
const metadata = await api.getTableMetadata(warehouseId, namespaceId, tableName);

// Extract Parquet file URLs from metadata
const parquetUrls = parseParquetLocations(metadata);

// Load into DuckDB
await icebergDB.loadParquetFiles('iceberg_table', parquetUrls);

// Query the data
const result = await icebergDB.executeQuery('SELECT * FROM iceberg_table LIMIT 100');
```

## Performance Considerations

- **WASM File Size**: The WASM files are large (~30-40MB each). Consider lazy loading the SQL tab.
- **Memory Usage**: DuckDB runs in-memory. Large queries may consume significant browser memory.
- **Data Loading**: Parquet files must be downloaded to the browser. Use LIMIT clauses for large tables.

## Browser Compatibility

DuckDB WASM requires:
- Modern browsers with WebAssembly support
- Web Workers support
- Sufficient memory for data processing

Tested browsers:
- Chrome 90+
- Firefox 89+
- Safari 14+
- Edge 90+

## Troubleshooting

### CORS Errors

If you see CORS errors when loading WASM files, ensure:
1. WASM files are in the `public/duckdb/` directory
2. Files are served from the same origin as your app
3. Your dev server properly serves static files

### Worker Loading Errors

Web Workers must be same-origin. The library uses relative paths (`/duckdb/...`) to ensure this.

### Memory Issues

For large datasets, consider:
- Using LIMIT clauses in queries
- Implementing pagination
- Filtering data before loading into DuckDB

## Future Enhancements

Potential improvements:
- Monaco Editor for better SQL editing experience
- Query history and saved queries
- Direct Iceberg metadata parsing
- Incremental data loading
- Export results to CSV/JSON
- Query performance metrics
