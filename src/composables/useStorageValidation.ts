import { computed, type Ref } from 'vue';

/**
 * Composable for validating storage types and catalog URLs for DuckDB WASM operations
 */
export function useStorageValidation(
  storageType: Ref<string | undefined>,
  catalogUrl: Ref<string>,
) {
  // List of supported storage types for DuckDB WASM
  const supportedStorageTypes = ['s3', 'gcs'];

  /**
   * Check if the storage type is supported by DuckDB WASM
   */
  const isStorageSupported = computed(() => {
    if (!storageType.value) {
      return {
        supported: true, // Allow operation while storage type is loading
        reason: null,
      };
    }

    const lowerStorageType = storageType.value.toLowerCase();
    if (!supportedStorageTypes.includes(lowerStorageType)) {
      return {
        supported: false,
        reason: `DuckDB WASM currently only supports ${supportedStorageTypes.join(' and ').toUpperCase()} storage. Your warehouse uses ${storageType.value}.`,
      };
    }

    return { supported: true, reason: null };
  });

  /**
   * Check if we should show HTTP security warning for cloud storage
   */
  const shouldShowHttpWarning = computed(() => {
    if (!storageType.value || !catalogUrl.value) return false;

    const lowerStorageType = storageType.value.toLowerCase();
    const isCloudStorage = supportedStorageTypes.includes(lowerStorageType);
    const isHttpCatalog = catalogUrl.value.startsWith('http://');

    return isCloudStorage && isHttpCatalog;
  });

  /**
   * Get the appropriate warning message for HTTP usage
   */
  const httpWarningMessage = computed(() => {
    const storageTypeUpper = supportedStorageTypes.map((type) => type.toUpperCase()).join('/');
    return `You are using cloud storage (${storageTypeUpper}) with an HTTP catalog URL. HTTPS is strongly recommended for security.`;
  });

  /**
   * Get the requirements text for DuckDB WASM
   */
  const requirementsText = computed(() => {
    const storageTypes = supportedStorageTypes.map((type) => type.toUpperCase()).join(' or ');
    return {
      storageRequirement: `Warehouse must use ${storageTypes} storage`,
      protocolRequirement: 'Catalog must use HTTPS protocol',
    };
  });

  /**
   * Check if we should show unsupported storage warning (only when storage type is known and unsupported)
   */
  const shouldShowUnsupportedWarning = computed(() => {
    if (!storageType.value) return false; // Don't show warning while loading
    
    const lowerStorageType = storageType.value.toLowerCase();
    return !supportedStorageTypes.includes(lowerStorageType);
  });

  /**
   * Check if an operation is available (combines storage and other checks)
   */
  const isOperationAvailable = computed(() => {
    return {
      available: isStorageSupported.value.supported,
      reason: isStorageSupported.value.reason,
    };
  });

  return {
    isStorageSupported,
    shouldShowHttpWarning,
    shouldShowUnsupportedWarning,
    httpWarningMessage,
    requirementsText,
    isOperationAvailable,
    supportedStorageTypes,
  };
}
