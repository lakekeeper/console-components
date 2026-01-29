import { ref } from 'vue';
import { useDuckDB } from './useDuckDB';

export interface IcebergCatalogConfig {
  catalogName: string;
  restUri: string;
  accessToken: string;
  projectId?: string;
}

export function useIcebergDuckDB(baseUrlPrefix: string) {
  const duckDB = useDuckDB(baseUrlPrefix);
  const isLoadingTable = ref(false);
  const loadError = ref<string | null>(null);
  const catalogConfigured = ref(false);

  const addProjectIdHeader = (headers: Record<string, string>, projectId?: string) => {
    if (projectId !== undefined) {
      headers['x-project-id'] = projectId;
    }
    return headers;
  };

  // Reusable CORS error message for object storage
  const createCorsErrorMessage = () =>
    `CORS Error: Cannot access object storage from the browser.\n\n` +
    `DuckDB tried to read Iceberg metadata files from object storage (S3/ADLS/GCS)\n` +
    `but the request was blocked by CORS policy.\n\n` +
    `The object storage bucket needs CORS configuration to allow:\n` +
    `1. Cross-origin requests from ${window.location.origin}\n` +
    `2. Required headers: authorization, content-type, range, x-user-agent\n` +
    `3. HTTP methods: GET, HEAD, OPTIONS\n` +
    `4. Expose headers: content-range, content-length, etag\n\n` +
    `Example S3 CORS configuration:\n` +
    `[\n` +
    `  {\n` +
    `    "AllowedOrigins": ["${window.location.origin}"],\n` +
    `    "AllowedMethods": ["GET", "HEAD"],\n` +
    `    "AllowedHeaders": ["*"],\n` +
    `    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],\n` +
    `    "MaxAgeSeconds": 3000\n` +
    `  }\n` +
    `]\n\n` +
    `Check your browser console for the blocked URL.\n\n` +
    `Please contact your administrator to configure CORS on your S3 bucket.`;

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
          headers: addProjectIdHeader(
            {
              Authorization: `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json',
              // This is the header that DuckDB sends and often causes CORS issues
              'x-user-agent': 'duckdb-wasm',
            },
            config.projectId,
          ),
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
          throw new Error(`${createCorsErrorMessage()}`);
        }

        // Re-throw other errors
        throw fetchError;
      }

      // Execute all setup commands in correct order FORCE INSTALL iceberg FROM core_nightly;
      const projectIdPrefix = config.projectId !== undefined ? config.projectId + '/' : '';
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
        ATTACH '${projectIdPrefix}${config.catalogName}' AS ${config.catalogName} (
          TYPE iceberg,
          SUPPORT_NESTED_NAMESPACES true,
          SUPPORT_STAGE_CREATE true,
          SECRET iceberg_secret,
          ENDPOINT '${config.restUri}'
        );
      `;

      const res = await duckDB.executeQuery(setupQuery);
      console.log('✅ [DuckDB Iceberg] Catalog configured successfully:', res);
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

  /**
   * Wrapper around executeQuery that detects S3 CORS errors
   */
  async function executeQuery(query: string) {
    try {
      return await duckDB.executeQuery(query);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if this is a CORS error that manifests as a DuckDB read/download error
      if (
        errorMsg.includes('Cannot read') ||
        errorMsg.includes('memory buffer') ||
        errorMsg.includes('Invalid Input Error') ||
        errorMsg.includes('HTTP Error') ||
        errorMsg.includes('Full download failed') ||
        errorMsg.includes('CORS error') ||
        errorMsg.toLowerCase().includes('cors')
      ) {
        // This error happens when DuckDB can't read metadata/data files from S3 due to CORS
        throw new Error(`${createCorsErrorMessage()}`);
      }

      // Re-throw other errors
      throw error;
    }
  }

  return {
    ...duckDB,
    executeQuery, // Override with CORS-aware version
    isLoadingTable,
    loadError,
    catalogConfigured,
    configureCatalog,
  };
}
