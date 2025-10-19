import { ref, type Ref } from 'vue';
import { useDuckDB } from './useDuckDB';

export interface IcebergTableInfo {
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  metadataLocation?: string;
}

export function useIcebergDuckDB() {
  const duckDB = useDuckDB();
  const isLoadingTable = ref(false);
  const loadError = ref<string | null>(null);

  /**
   * Register an Iceberg table in DuckDB by loading Parquet files
   * This is a simplified version - in production you'd fetch actual metadata
   */
  async function registerIcebergTable(tableInfo: IcebergTableInfo): Promise<void> {
    isLoadingTable.value = true;
    loadError.value = null;

    try {
      // Initialize DuckDB if not already done
      if (!duckDB.isInitialized.value) {
        await duckDB.initialize();
      }

      // TODO: In a real implementation, you would:
      // 1. Fetch the Iceberg table metadata from the API
      // 2. Parse the metadata to get Parquet file locations
      // 3. Register each Parquet file with DuckDB
      // 4. Create a view that unions all the files
      
      // For now, we'll create a simple example table
      // Users can manually query their data by providing Parquet URLs
      
      const exampleQuery = `
        -- Example: Create a sample table for demonstration
        CREATE OR REPLACE TABLE iceberg_table AS 
        SELECT 1 as id, 'example' as name, 'This is a demo table' as description
        UNION ALL
        SELECT 2 as id, 'data' as name, 'Real data will be loaded from Parquet files' as description;
      `;
      
      await duckDB.executeQuery(exampleQuery);
      
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Failed to register Iceberg table';
      console.error('Failed to register Iceberg table:', e);
      throw e;
    } finally {
      isLoadingTable.value = false;
    }
  }

  /**
   * Load Parquet files from URLs (can be S3, HTTP, etc.)
   */
  async function loadParquetFiles(tableName: string, parquetUrls: string[]): Promise<void> {
    try {
      if (!duckDB.isInitialized.value) {
        await duckDB.initialize();
      }

      // Install httpfs extension for reading from HTTP/S3
      await duckDB.executeQuery(`INSTALL httpfs; LOAD httpfs;`);
      
      // Create table from Parquet files
      if (parquetUrls.length === 1) {
        await duckDB.executeQuery(
          `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${parquetUrls[0]}');`
        );
      } else {
        // Multiple Parquet files - use array syntax
        const urlsArray = parquetUrls.map(url => `'${url}'`).join(', ');
        await duckDB.executeQuery(
          `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet([${urlsArray}]);`
        );
      }
    } catch (e) {
      console.error('Failed to load Parquet files:', e);
      throw e;
    }
  }

  return {
    ...duckDB,
    isLoadingTable,
    loadError,
    registerIcebergTable,
    loadParquetFiles,
  };
}
