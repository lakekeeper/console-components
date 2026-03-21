/**
 * Extract HTTP error code from various error shapes returned by the API client.
 */
export function getErrorCode(error: any): number {
  return error?.error?.code || error?.status || error?.response?.status || 0;
}

/**
 * Check if an error is a client error (4xx).
 */
export function isClientError(error: any): boolean {
  const code = getErrorCode(error);
  return code >= 400 && code < 500;
}

/**
 * Check if an error represents a 403 Forbidden response.
 */
export function isForbiddenError(error: any): boolean {
  return getErrorCode(error) === 403;
}

/**
 * Check if an error represents a 404 Not Found response.
 */
export function isNotFoundError(error: any): boolean {
  const code = getErrorCode(error);
  return code === 404 || error?.error?.type === 'WarehouseNotFound';
}

/**
 * Log an error with appropriate severity based on the HTTP status code.
 * - 4xx errors are expected client errors (permissions, not found, etc.) → silent
 * - 5xx and unknown errors are unexpected server issues → console.error
 */
export function logError(context: string, error: any): void {
  if (isClientError(error)) {
    // 4xx errors are expected and handled by the UI — no console output
    return;
  }
  console.error(`${context}:`, error);
}
