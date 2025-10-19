import { ref } from 'vue';
import { useDuckDB } from './useDuckDB';

export interface IcebergTableInfo {
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  metadataLocation?: string;
}

export interface IcebergCatalogConfig {
  catalogName: string;
  restUri: string;
  accessToken: string;
  warehouseId?: string;
}

export function useIcebergDuckDB() {
  const duckDB = useDuckDB();
  const isLoadingTable = ref(false);
  const loadError = ref<string | null>(null);
  const catalogConfigured = ref(false);

  /**
   * Configure Iceberg REST catalog in DuckDB
   * Based on: https://duckdb.org/docs/stable/core_extensions/iceberg/iceberg_rest_catalogs
   */
  async function configureCatalog(config: IcebergCatalogConfig): Promise<void> {
    try {
      // Initialize DuckDB if not already done
      if (!duckDB.isInitialized.value) {
        await duckDB.initialize();
      }

      // Install and load the Iceberg extension and httpfs
      await duckDB.executeQuery(`INSTALL iceberg; LOAD iceberg;`);
      await duckDB.executeQuery(`INSTALL httpfs; LOAD httpfs;`);

      // Create Iceberg secret with OAuth token
      await duckDB.executeQuery(`
        CREATE OR REPLACE SECRET iceberg_secret (
          TYPE iceberg,
          TOKEN '${config.accessToken}'
        );
      `);

      // Attach the Iceberg catalog
      const attachQuery = `
        LOAD httpfs;
        ATTACH '${config.restUri}' AS ${config.catalogName} (
          TYPE iceberg,
          SECRET iceberg_secret
        );
      `;

      await duckDB.executeQuery(attachQuery);

      catalogConfigured.value = true;
      console.log(`Iceberg catalog '${config.catalogName}' configured successfully`);
    } catch (e) {
      console.error('Failed to configure Iceberg catalog:', e);
      throw e;
    }
  }

  /**
   * Register an Iceberg table in DuckDB
   * After catalog is configured, tables can be queried directly
   */
  async function registerIcebergTable(tableInfo: IcebergTableInfo): Promise<void> {
    isLoadingTable.value = true;
    loadError.value = null;

    try {
      // Ensure catalog is configured
      if (!catalogConfigured.value) {
        throw new Error('Iceberg catalog not configured. Call configureCatalog() first.');
      }

      // Tables can now be queried directly using: catalog.namespace.table
      // No additional registration needed
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Failed to register Iceberg table';
      console.error('Failed to register Iceberg table:', e);
      throw e;
    } finally {
      isLoadingTable.value = false;
    }
  }

  /**
   * Load Parquet files from URLs (fallback for non-catalog access)
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
          `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${parquetUrls[0]}');`,
        );
      } else {
        // Multiple Parquet files - use array syntax
        const urlsArray = parquetUrls.map((url) => `'${url}'`).join(', ');
        await duckDB.executeQuery(
          `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet([${urlsArray}]);`,
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
    catalogConfigured,
    configureCatalog,
    registerIcebergTable,
    loadParquetFiles,
  };
}
