/**
 * Extract HTTP error code from various error shapes returned by the API client.
 */
export function getErrorCode(error: any): number {
  return (
    error?.error?.code ||
    error?.status ||
    error?.response?.status ||
    error?.statusCode ||
    error?.code ||
    0
  );
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
 * Check if an error represents a 501 Not Implemented response.
 *
 * The management API answers this for questions its configured backend cannot
 * answer at all — transitive membership under an assignment-managing authorizer,
 * for instance. Not a failure to report: the surface that asked is expected to
 * withdraw the offer instead.
 */
export function isNotImplementedError(error: any): boolean {
  return getErrorCode(error) === 501;
}

/**
 * Check if an error represents a 404 Not Found response.
 */
export function isNotFoundError(error: any): boolean {
  const code = getErrorCode(error);
  return code === 404 || error?.error?.type === 'WarehouseNotFound';
}

/**
 * True when the authorizer failed on its own side while deciding (500
 * `AuthorizationInternalError`). Retrying yields the same answer, and nothing
 * about it says the caller lacks a permission.
 */
export function isAuthorizationInternalError(error: any): boolean {
  return error?.error?.type === 'AuthorizationInternalError';
}

/**
 * What to say for an `AuthorizationInternalError`. The server's own text,
 * "Authorization failed due to an internal error", reads like a denial.
 */
export const AUTHORIZATION_INTERNAL_ERROR_MESSAGE =
  'The authorizer failed while checking this request. This is a server-side error, not a missing permission; the server log has the details.';

/**
 * The message to show for a failed request: the server's own, except where it
 * would mislead, and then the caller's fallback.
 */
export function errorMessage(error: any, fallback = ''): string {
  if (isAuthorizationInternalError(error)) return AUTHORIZATION_INTERNAL_ERROR_MESSAGE;
  if (typeof error === 'string') return error || fallback;
  return error?.error?.message || error?.message || fallback;
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
