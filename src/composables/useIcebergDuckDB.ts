import { ref } from 'vue';
import { useDuckDB } from './useDuckDB';

export interface IcebergCatalogConfig {
  catalogName: string;
  restUri: string;
  accessToken: string;
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

      // Execute all setup commands in correct order
      const setupQuery = `
        SET builtin_httpfs = false;
        INSTALL httpfs;
        LOAD httpfs;
        INSTALL iceberg;
        LOAD iceberg;
        CREATE OR REPLACE SECRET iceberg_secret (
          TYPE iceberg,
          TOKEN '${config.accessToken}'
        );
        ATTACH '${config.catalogName}' AS ${config.catalogName} (
          TYPE iceberg,
          SECRET iceberg_secret,
          ENDPOINT '${config.restUri}'
        );
      `;

      console.log('DEBUG: Original restUri:', config.restUri);
      console.log('DEBUG: catalogName:', config.catalogName);
      console.log('DEBUG: Full setup query:', setupQuery);

      const results = await duckDB.executeQuery(setupQuery);
      console.log('Iceberg catalog setup results:', results);

      catalogConfigured.value = true;
      console.log(`Iceberg catalog '${config.catalogName}' configured successfully`);
    } catch (e) {
      console.error('Failed to configure Iceberg catalog:', e);
      throw e;
    }
  }

  return {
    ...duckDB,
    isLoadingTable,
    loadError,
    catalogConfigured,
    configureCatalog,
  };
}
