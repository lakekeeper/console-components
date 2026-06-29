/**
 * Translate DuckDB-WASM's opaque download error into an actionable message.
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
        'catalog response is being reused. Configure CORS on the bucket.',
    );
  }
  return err;
}
