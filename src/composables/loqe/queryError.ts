import { diagnoseReachability, extractUrl } from '@/common/storageReachability';

/**
 * A query naming a catalog that is not ATTACHed.
 *
 * DuckDB answers this with `Binder Error: Catalog "x" does not exist!`, which is
 * true and useless: in LoQE a catalog is a warehouse, and warehouses attach
 * lazily — the first few on load, the rest when expanded in the tree. So the
 * reader has done nothing wrong and there is a concrete next step, which the
 * raw message does not mention.
 *
 * Returns the replacement message, or null when this is not that failure.
 */
function unattachedCatalog(msg: string, attached: string[]): string | null {
  const m =
    /Catalog\s+"([^"]+)"\s+does not exist/i.exec(msg) ??
    /Catalog with name\s+(\S+?)\s+does not exist/i.exec(msg);
  if (!m) return null;
  const name = m[1];
  // Already attached under this name: the binder is objecting to something else
  // (a schema or table further along the path), and blaming the attach would
  // send the reader to fix what is already right.
  if (attached.includes(name)) return null;

  const fix =
    `No catalog named "${name}" is attached, so the query cannot be bound. ` +
    'Warehouses attach when you expand them in the tree — expand it there, then run the query ' +
    'again.';
  if (attached.length === 0) return fix;
  const shown = attached.slice(0, 8);
  const more = attached.length - shown.length;
  return (
    `${fix} Currently attached: ${shown.map((c) => `"${c}"`).join(', ')}` +
    `${more > 0 ? ` and ${more} more` : ''}.`
  );
}

/**
 * Separates our explanation from the engine's own words, and marks the message as
 * one DuckDB produced so a reader is told which component is speaking.
 *
 * A marker rather than a sentence: the attribution belongs in the heading, where
 * it is read before the text it qualifies, and a paragraph buried under the
 * explanation was read last or not at all.
 */
export const ENGINE_NOTE = '\n\nDuckDB reported:\n';

/**
 * Splits an engine error into the part we wrote and the part DuckDB did.
 *
 * `engineMessage` is null for anything else — a reachability verdict, an attach
 * failure, a raw error that matched no rule — so a caller can attribute only what
 * actually came from the engine.
 */
export function splitEngineError(text: string): {
  explanation: string;
  engineMessage: string | null;
} {
  const at = text.indexOf(ENGINE_NOTE);
  if (at === -1) return { explanation: text, engineMessage: null };
  return {
    explanation: text.slice(0, at),
    engineMessage: text.slice(at + ENGINE_NOTE.length),
  };
}

/**
 * The privilege a statement needs from the catalog, as far as the verb tells us.
 * Vague on purpose where the verb is ambiguous — naming the wrong grant sends
 * someone to ask for something they already have.
 */
function privilegeFor(sql: string | undefined): string {
  if (/^\s*create\s+(or\s+replace\s+)?(table|view)\b/i.test(sql || ''))
    return '`create_table` (or `create_view`) on the namespace';
  // Before the write test below, which `create` matches: a namespace is not a
  // table, and `write_data` is not the grant that would have let this through.
  if (/^\s*create\s+schema\b/i.test(sql || ''))
    return '`create_namespace` on the warehouse (or on the parent namespace)';
  if (/^\s*(drop|alter|rename)\b/i.test(sql || '')) return '`drop` or `rename` on the object';
  if (isWriteStatement(sql) === 'write') return '`write_data` on the table';
  return '`read_data` on the table (or on a namespace or warehouse above it)';
}

/**
 * A request the engine made to the catalog, which the catalog refused.
 *
 * DuckDB's iceberg extension wraps the REST answer as an `Invalid Configuration
 * Error` naming the URL and the status — so the status is already established and
 * there is nothing to probe. Probing anyway is actively misleading: the URL is
 * Lakekeeper's own, and a catalog that answers reads as "storage is reachable",
 * which turned a plain 403 on CREATE TABLE into advice about bucket CORS rules.
 *
 * `Invalid Configuration` is also DuckDB's own framing, and the last thing this
 * is: nothing about the ATTACH would change the answer.
 */
function catalogRefusal(msg: string, sql?: string): string | null {
  if (!/returned a non-200 status code/i.test(msg)) return null;
  const status = Number(/[_(\s](\d{3})\)/.exec(msg)?.[1] ?? /\b(4\d\d|5\d\d)\b/.exec(msg)?.[1]);
  if (!status) return null;

  const at = extractUrl(msg);
  const where = at ? ` (${at})` : '';

  if (status === 401) {
    return (
      `The catalog rejected the query engine’s token${where}: 401 Unauthorized. The access ` +
      'token attached when the warehouse was attached has most likely expired — reload the page ' +
      'to obtain a fresh one, then run the query again.'
    );
  }
  if (status === 403) {
    return (
      `Lakekeeper refused this statement${where}: 403 Forbidden. The catalog answered the ` +
      'engine, so nothing is wrong with the connection or the storage — you are missing the ' +
      `privilege the statement needs, ${privilegeFor(sql)}. Ask an administrator to grant it.`
    );
  }
  if (status === 404) {
    return (
      `The catalog has no such object${where}: 404 Not Found. The warehouse, namespace or table ` +
      'named in the query does not exist — or it exists and you may not see it, which the ' +
      'catalog reports the same way.'
    );
  }
  if (status === 409) {
    return (
      `The catalog refused the change${where}: 409 Conflict. The object already exists, or a ` +
      'concurrent commit landed first — re-read the table and try again.'
    );
  }
  return (
    `The catalog answered ${status}${where}, so the statement did not run. This is Lakekeeper’s ` +
    'answer, not a storage or browser problem.'
  );
}

/**
 * Every message below replaces text DuckDB produced. Saying so matters: LoQE runs
 * DuckDB-WASM in the browser, so a failed scan is reported in DuckDB's words about
 * DuckDB's own configuration — and read as a catalog fault it sends people to
 * inspect Lakekeeper for a problem that is not there. The raw line is kept so the
 * text is still searchable against DuckDB's issue tracker.
 */
function engineError(explanation: string, raw: string, err: unknown): Error {
  // Generous, because this line is the one a reader takes to a search engine or
  // an issue tracker: DuckDB nests the catalog's own JSON answer inside its
  // message, and the status lands past where a tighter cap would cut.
  const first = raw.split('\n')[0].trim();
  const quoted = first.length > 800 ? `${first.slice(0, 800)}…` : first;
  return new Error(`${explanation}${ENGINE_NOTE}${quoted}`, { cause: err });
}

/**
 * A table whose storage credentials the catalog declined to vend.
 *
 * Lakekeeper only returns `storage-credentials` from `loadTable` to a caller with
 * data access; without them the iceberg extension has neither keys nor a region,
 * and complains about the half it checks first — the region. Taken at face value
 * that reads as a missing `DEFAULT_REGION` on the ATTACH, which is a dead end: no
 * ATTACH option would have helped, and the real answer is a missing privilege.
 */
function noVendedCredentials(msg: string): string | null {
  if (!/no region was provided via the vended credentials/i.test(msg)) return null;
  return (
    'The catalog returned no storage credentials for this table, so its data files cannot be ' +
    'read. This normally means you lack the `read_data` privilege on the table (or on a ' +
    'namespace or warehouse above it) — ask an administrator to grant it. If you do have it, ' +
    'the warehouse may have vended credentials (STS) disabled.'
  );
}

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
export function friendlyQueryError(
  err: unknown,
  msg: string,
  /**
   * Catalogs currently ATTACHed, so an unbound name can be answered with what is
   * actually available. Omitted by callers that don't know; the message then
   * just names the fix.
   */
  attached: string[] = [],
  /** The statement that failed, where the caller knows it — it narrows which
   *  privilege a refusal is about. */
  sql?: string,
): unknown {
  // First: anything the catalog itself already answered. Its status is a fact,
  // and every heuristic below is a guess — a guess must never outrank it.
  const refused = catalogRefusal(msg, sql);
  if (refused) return engineError(refused, msg, err);

  const unattached = unattachedCatalog(msg, attached);
  if (unattached) return engineError(unattached, msg, err);

  const unvended = noVendedCredentials(msg);
  if (unvended) return engineError(unvended, msg, err);

  if (/\bAzureFileSystem:[^\n]*\bnot implemented\b/i.test(msg)) {
    return engineError('Azure Data Lake Storage (ADLS) is read-only in LoQE.', msg, err);
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
    return engineError(
      'Could not access the table’s data files in object storage. The browser request was ' +
        'blocked — usually either the storage bucket is missing a CORS configuration that allows ' +
        'browser access (Firefox preflights range/write requests and fails first here, while ' +
        'Chrome/Safari may not), or the vended storage credentials expired and a stale cached ' +
        'catalog response is being reused. Configure CORS on the bucket; if CORS is already set, ' +
        'reload the page (or re-open the table) to invalidate the cached catalog response and ' +
        'obtain freshly vended storage credentials.',
      msg,
      err,
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
  attached: string[] = [],
): Promise<unknown> {
  // A refusal the catalog stated in full needs no probe, and must not have one:
  // the URL in the message is Lakekeeper's, so a reachable probe would report
  // that storage is fine and bury the 403 that actually stopped the statement.
  const refused = catalogRefusal(msg, sql);
  if (refused) return engineError(refused, msg, err);

  const url = extractUrl(msg);
  if (!url) return friendlyQueryError(err, msg, attached, sql);

  const verdict = await diagnoseReachability(url, { operation: isWriteStatement(sql) });
  // 'blocked' means the endpoint answered and the browser refused the response —
  // exactly the case the CORS/credentials text was written for.
  if (verdict.kind === 'blocked' || verdict.kind === 'unknown') {
    return friendlyQueryError(err, msg, attached, sql);
  }
  // Through `engineError` like every other translation: the verdict is ours, and
  // the reader still wants the line the engine actually produced.
  return engineError(verdict.message, msg, err);
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
