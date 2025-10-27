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

      // Log the exact configuration being used
      console.log('🔍 [DuckDB Iceberg] Configuration received:', {
        catalogName: config.catalogName,
        restUri: config.restUri,
        restUriLength: config.restUri.length,
        restUriChars: Array.from(config.restUri).map((c, i) => `${i}: '${c}' (${c.charCodeAt(0)})`),
      });

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
          SUPPORT_NESTED_NAMESPACES true,
          SUPPORT_STAGE_CREATE true,
          SECRET iceberg_secret,
          ENDPOINT '${config.restUri}'
        );
      `;

      console.log('📝 [DuckDB Iceberg] SQL Query to execute:');
      console.log(setupQuery);

      await duckDB.executeQuery(setupQuery);

      console.log('✅ [DuckDB Iceberg] Catalog configured successfully');
      catalogConfigured.value = true;
    } catch (e) {
      console.error('❌ [DuckDB Iceberg] Failed to configure catalog:', e);
      console.error('❌ [DuckDB Iceberg] Error details:', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        config: {
          catalogName: config.catalogName,
          restUri: config.restUri,
        },
      });
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
