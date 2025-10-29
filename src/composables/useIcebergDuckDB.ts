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

      console.log('✅ [DuckDB Iceberg] Catalog ATTACH command completed');

      // Verify the catalog is actually accessible by running a test query
      // This will trigger an actual HTTP request to the catalog server
      console.log('🔍 [DuckDB Iceberg] Verifying catalog accessibility...');

      // Set up console.error interception to catch CORS errors
      let corsErrorDetected = false;
      const originalConsoleError = console.error;
      const errorInterceptor = (...args: any[]) => {
        const errorString = args.join(' ');
        if (
          errorString.includes('CORS') ||
          errorString.includes('Access-Control-Allow') ||
          errorString.includes('cross-origin') ||
          errorString.includes('not allowed by Access-Control-Allow-Headers') ||
          errorString.includes('blocked by CORS policy')
        ) {
          corsErrorDetected = true;
        }
        originalConsoleError.apply(console, args);
      };
      console.error = errorInterceptor;

      try {
        // Try to query the catalog config - this will definitely make an HTTP call
        const testQuery = `SHOW DATABASES`;
        await duckDB.executeQuery(testQuery);

        // Wait a bit for async CORS errors to appear in console
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Restore original console.error
        console.error = originalConsoleError;

        if (corsErrorDetected) {
          throw new Error('CORS policy: Request blocked by CORS policy');
        }

        console.log('✅ [DuckDB Iceberg] Catalog verification successful - connection is working');
      } catch (verifyError) {
        // Restore original console.error
        console.error = originalConsoleError;

        const errorMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
        console.error('❌ [DuckDB Iceberg] Catalog verification failed:', errorMsg);

        // Check if this is a CORS error (it will appear in the error message or console)
        if (
          corsErrorDetected ||
          errorMsg.includes('CORS') ||
          errorMsg.includes('Access-Control-Allow') ||
          errorMsg.includes('cross-origin') ||
          errorMsg.includes('XMLHttpRequest') ||
          errorMsg.includes('not allowed by Access-Control-Allow-Headers') ||
          errorMsg.includes('blocked by CORS policy')
        ) {
          throw new Error(
            `CORS Error: The catalog server at ${config.restUri} is blocking requests.\n\n` +
              `The server needs to:\n` +
              `1. Allow cross-origin requests from ${window.location.origin}\n` +
              `2. Include 'x-user-agent' in Access-Control-Allow-Headers\n` +
              `3. Include appropriate Access-Control-Allow-Origin headers\n\n` +
              `Please contact your administrator to configure CORS headers on the catalog server.\n\n` +
              `Technical details: The catalog server must respond to preflight OPTIONS requests with appropriate CORS headers.`,
          );
        }
        // Re-throw other errors
        throw new Error(`Failed to verify catalog connection: ${errorMsg}`);
      }

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
