import { computed, type Ref } from 'vue';

/**
 * Composable for validating storage type  const shouldShowUnsupportedWarning = computed(() => {
    // Only show warning if we have a storage type AND it's not supported
    if (!storageType.value) return false;
    
    const lowerStorageType = storageType.value.toLowerCase();
    return !supportedStorageTypes.includes(lowerStorageType);
  });og URLs for DuckDB WASM operations
 */
export function useStorageValidation(
  storageType: Ref<string | undefined>,
  catalogUrl: Ref<string>,
) {
  // List of supported storage types for DuckDB WASM
  const supportedStorageTypes = ['s3']; //, 'gcs'

  // List of supported protocols for DuckDB WASM
  const supportedProtocols = ['https:', 'http:'];

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

    // Check if protocol is not in the supported list
    let isUnsupportedProtocol = false;
    try {
      const url = new URL(catalogUrl.value);
      isUnsupportedProtocol = !supportedProtocols.includes(url.protocol);
    } catch {
      // If URL is invalid, don't show warning (will be caught elsewhere)
      return false;
    }

    return isCloudStorage && isUnsupportedProtocol;
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
    const protocols = supportedProtocols.map((p) => p.replace(':', '').toUpperCase()).join(' or ');
    return {
      storageRequirement: `Warehouse must use ${storageTypes} storage`,
      protocolRequirement: `Catalog must use ${protocols} protocol`,
    };
  });

  /**
   * Get individual requirement texts (flattened for easier template usage)
   */
  const storageRequirement = computed(() => {
    const storageTypes = supportedStorageTypes.map((type) => type.toUpperCase()).join(' or ');
    return `Warehouse must use ${storageTypes} storage`;
  });

  const protocolRequirement = computed(() => {
    const protocols = supportedProtocols.map((p) => p.replace(':', '').toUpperCase()).join(' or ');
    return `Catalog must use ${protocols} protocol`;
  });

  const unsupportedStorageReason = computed(() => {
    if (!storageType.value) return null;
    const lowerStorageType = storageType.value.toLowerCase();
    if (!supportedStorageTypes.includes(lowerStorageType)) {
      return `DuckDB WASM currently only supports ${supportedStorageTypes.join(' and ').toUpperCase()} storage. Your warehouse uses ${storageType.value}.`;
    }
    return null;
  });

  /**
   * Check if we should show unsupported storage warning (only when storage type is known and unsupported)
   */
  const shouldShowUnsupportedWarning = computed(() => {
    const result = !storageType.value
      ? false
      : !supportedStorageTypes.includes(storageType.value.toLowerCase());

    return result;
  });

  /**
   * Check if an operation is available (combines storage and other checks)
   */
  const isOperationAvailable = computed(() => {
    // First check if storage is supported
    if (!isStorageSupported.value.supported) {
      return {
        available: false,
        reason: isStorageSupported.value.reason,
      };
    }

    // Then check for HTTP security issue
    if (shouldShowHttpWarning.value) {
      return {
        available: false,
        reason: httpWarningMessage.value,
      };
    }

    return { available: true, reason: null };
  });

  return {
    isStorageSupported,
    shouldShowHttpWarning,
    shouldShowUnsupportedWarning,
    httpWarningMessage,
    requirementsText,
    storageRequirement,
    protocolRequirement,
    unsupportedStorageReason,
    isOperationAvailable,
    supportedStorageTypes,
    supportedProtocols,
  };
}
