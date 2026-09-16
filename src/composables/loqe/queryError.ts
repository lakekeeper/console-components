import { diagnoseReachability, extractUrl } from '@/common/storageReachability';

/**
 * Translate DuckDB-WASM storage failures into actionable messages.
 *
 * DuckDB reports any failed httpfs download as a generic
 * `"Full download failed … : 404 (might be potentially a CORS error)"` — it
 * doesn't read the real status or the S3 error body. Two common causes look
 * identical at this layer:
 *   1. The storage bucket has no CORS configuration allowing browser access, so
 *      the cross-origin request is blocked outright.
 *   2. The vended S3 credentials expired and the browser reused a stale cached
 *      `loadTable` response (the catalog returns `304` on a metadata-only ETag,
 *      replaying the old creds).
 * We can't tell them apart from DuckDB's message, so surface both.
 *
 * Extracted from LoQEEngine so it can be unit-tested without importing the
 * DuckDB-WASM runtime. Pure: (err, msg) → friendly Error or the original err.
 */
export function friendlyQueryError(err: unknown, msg: string): unknown {
  if (/\bAzureFileSystem:[^\n]*\bnot implemented\b/i.test(msg)) {
    return new Error('Azure Data Lake Storage (ADLS) is read-only in LoQE.', { cause: err });
  }

  // DuckDB reports a *recognised* httpfs failure with a download/404/CORS message
  // naming the object it couldn't fetch.
  const looksLikeDownloadBlock =
    /full download failed|might be.*cors|\b404\b/i.test(msg) &&
    /(\.avro|snap-|manifest|metadata|\.json|\.parquet)/i.test(msg);
  // …but when the cross-origin fetch is *blocked* (e.g. a preflight 403 with no
  // `Access-Control-Allow-Origin`), the WASM worker doesn't surface the status at
  // all — it corrupts internally and throws an opaque symptom instead
  // (`items is null` / `Symbol.iterator` / `too much recursion` / `Aborted()` /
  // `Cannot read N bytes from memory buffer` — a truncated/empty response body).
  // The real 403 shows up only as a separate network line in the console. These
  // signatures don't occur for pure local-compute queries, so a query that
  // touches object storage and dies this way almost certainly hit a blocked fetch.
  const looksLikeAbortedFetch =
    /items is null|symbol\.iterator|too much recursion|\baborted\b|cannot read \d+ bytes from memory buffer/i.test(
      msg,
    );
  if (looksLikeDownloadBlock || looksLikeAbortedFetch) {
    return new Error(
      'Could not access the table’s data files in object storage. The browser request was ' +
        'blocked — usually either the storage bucket is missing a CORS configuration that allows ' +
        'browser access (Firefox preflights range/write requests and fails first here, while ' +
        'Chrome/Safari may not), or the vended storage credentials expired and a stale cached ' +
        'catalog response is being reused. Configure CORS on the bucket; if CORS is already set, ' +
        'reload the page (or re-open the table) to invalidate the cached catalog response and ' +
        'obtain freshly vended storage credentials.',
    );
  }
  return err;
}

/**
 * The same translation, but allowed to check before it accuses. DuckDB cannot
 * tell a blocked port from a missing CORS rule — neither can the browser — so
 * for failures that name a URL we establish reachability first and only fall
 * back to the CORS/credentials wording when the host actually answered.
 *
 * Async, hence separate from `friendlyQueryError`: callers that cannot await
 * (or have no URL) keep the synchronous behaviour.
 */
export async function explainQueryFailure(
  err: unknown,
  msg: string,
  sql?: string,
): Promise<unknown> {
  const url = extractUrl(msg);
  if (!url) return friendlyQueryError(err, msg);

  const verdict = await diagnoseReachability(url, { operation: isWriteStatement(sql) });
  // 'blocked' means the endpoint answered and the browser refused the response —
  // exactly the case the CORS/credentials text was written for.
  if (verdict.kind === 'blocked' || verdict.kind === 'unknown') {
    return friendlyQueryError(err, msg);
  }
  return new Error(verdict.message, { cause: err });
}

/**
 * Whether the statement writes. A failed write narrows the causes — the probe only
 * proves GET-shaped traffic gets through — so the verdict can be more specific
 * (lakekeeper/lakekeeper#2011, where INSERT failed while SELECT worked and the
 * message blamed CORS anyway).
 */
export function isWriteStatement(sql: string | undefined): 'read' | 'write' {
  return /^\s*(insert|update|delete|merge|create|drop|alter|copy|truncate)\b/i.test(sql || '')
    ? 'write'
    : 'read';
}
