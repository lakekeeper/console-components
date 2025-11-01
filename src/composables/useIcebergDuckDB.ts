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

      // FIRST: Test the catalog URL directly with fetch to catch CORS errors
      // This will fail fast before DuckDB tries to connect
      // We need to test with the SAME headers that DuckDB will use, including x-user-agent
      const testUrl = `${config.restUri}/v1/config?warehouse=${config.catalogName}`;

      //cors
      try {
        await fetch(testUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
            // This is the header that DuckDB sends and often causes CORS issues
            'x-user-agent': 'duckdb-wasm',
          },
        });
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.error('❌ [DuckDB Iceberg] Catalog connectivity test failed:', errorMsg);

        // Check if this is a CORS error
        if (
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('NetworkError') ||
          errorMsg.includes('CORS') ||
          errorMsg.toLowerCase().includes('network')
        ) {
          throw new Error(
            `CORS Error: Cannot connect to the catalog server at ${config.restUri}\n\n` +
              `The server is blocking requests from ${window.location.origin}.\n\n` +
              `The catalog server needs to:\n` +
              `1. Allow cross-origin requests by setting Access-Control-Allow-Origin header\n` +
              `2. Include 'authorization' and 'content-type' in Access-Control-Allow-Headers\n` +
              `3. Allow the 'x-user-agent' header that DuckDB sends\n\n` +
              `Please contact your administrator to configure CORS headers on the catalog server.\n\n` +
              `Technical details:\n` +
              `- Test URL: ${testUrl}\n` +
              `- Origin: ${window.location.origin}\n` +
              `- Error: ${errorMsg}`,
          );
        }

        // Re-throw other errors
        throw fetchError;
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
          SUPPORT_NESTED_NAMESPACES true,
          SUPPORT_STAGE_CREATE true,
          SECRET iceberg_secret,
          ENDPOINT '${config.restUri}'
        );
      `;

      await duckDB.executeQuery(setupQuery);

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
