/**
 * Where a browser would reach this warehouse's object storage.
 *
 * Derived from the storage profile alone — no catalog call, no credentials. The
 * URL names an object that is not expected to exist: the probe asks whether a
 * response comes back at all, never what it says, so a 403 or 404 is a perfectly
 * good answer (see `browserStorageReachability`).
 *
 * This is deliberately separate from `useStorageExplorer`, which builds URLs from
 * the *vended credential* config returned by `loadTable`. That is the richer
 * source, but it exists only once a table has been opened. Warehouse validation
 * runs before any table exists — sometimes before the warehouse itself does — so
 * the profile is all there is.
 */

/**
 * The object the probe asks for. Named rather than random so it is legible in a
 * bucket's access log: an operator reading `GET /…/lakekeeper-browser-probe 404`
 * should be able to tell it was a diagnostic, not a broken client retrying.
 */
export const PROBE_KEY = 'lakekeeper-browser-probe';

export interface ProbeTarget {
  url: string;
  /** The storage type the URL came from, so callers can word messages for it. */
  type: string;
  /**
   * The request header that forces a CORS preflight on this service, chosen to
   * be one the real client already sends — a bucket with an explicit
   * `AllowedHeaders` list (rather than `*`) then still passes, instead of
   * failing on a header invented by the probe.
   */
  preflightHeader: string;
}

function trimSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Bucket as the first label of the endpoint host — the addressing AWS uses by
 * default, and the only one STACKIT supports (its wildcard certificate covers a
 * single label, which is why bucket names there may not contain a dot).
 */
function virtualHostUrl(base: string, bucket: string, key: string): string | null {
  try {
    const u = new URL(base);
    u.hostname = `${bucket}.${u.hostname}`;
    return `${u.origin}/${key}`;
  } catch {
    return null;
  }
}

function s3StyleUrl(
  profile: Record<string, any>,
  base: string,
  /**
   * Path-style is used only when the profile asks for it. Unset means "let the
   * provider decide", and both providers that reach this code — AWS and
   * STACKIT — decide virtual-host; a deployment that needs path-style (MinIO,
   * Ceph) sets the flag explicitly.
   */
  forcePathStyle = false,
): string | null {
  const bucket = String(profile.bucket ?? '');
  if (!bucket) return null;
  const pathStyle = forcePathStyle || profile['path-style-access'] === true;
  if (pathStyle) return `${trimSlashes(base)}/${bucket}/${PROBE_KEY}`;
  return virtualHostUrl(base, bucket, PROBE_KEY);
}

/**
 * The URL to probe, or null when the browser never talks to this storage
 * directly — in which case the check has nothing to say and must report itself
 * skipped rather than guess.
 */
export function storageProbeUrl(
  profile: Record<string, any> | null | undefined,
): ProbeTarget | null {
  const type = String(profile?.type ?? '').toLowerCase();
  if (!profile || !type) return null;

  if (type === 's3') {
    const endpoint = profile.endpoint ? trimSlashes(String(profile.endpoint)) : '';
    const region = String(profile.region ?? '');
    if (!endpoint && !region) return null;
    const base = endpoint || `https://s3.${region}.amazonaws.com`;
    const url = s3StyleUrl(profile, base);
    // SigV4 signs every request with this header, so any bucket that works with
    // a real client already allows it.
    return url ? { url, type, preflightHeader: 'x-amz-content-sha256' } : null;
  }

  if (type === 'stackit') {
    const endpoint = profile.endpoint ? trimSlashes(String(profile.endpoint)) : '';
    const region = String(profile.region ?? '');
    if (!endpoint && !region) return null;
    // STACKIT is S3 on the wire (StorageGRID); the endpoint follows the region
    // unless a per-customer one was set.
    const base = endpoint || `https://object.storage.${region}.onstackit.cloud`;
    const url = s3StyleUrl(profile, base);
    return url ? { url, type, preflightHeader: 'x-amz-content-sha256' } : null;
  }

  if (type === 'gcs') {
    const bucket = String(profile.bucket ?? '');
    if (!bucket) return null;
    return {
      url: `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${PROBE_KEY}`,
      type,
      preflightHeader: 'x-goog-encryption-algorithm',
    };
  }

  if (type === 'adls') {
    const account = String(profile['account-name'] ?? '');
    const filesystem = String(profile.filesystem ?? '');
    if (!account || !filesystem) return null;
    // The Blob endpoint, not DFS: the browser reads ADLS through the azure_wasm
    // extension, which talks to the Blob service — and Azure keeps a separate
    // CORS rule set per service, so probing DFS would test a rule that is not
    // the one in play.
    const host = String(profile.host ?? '').replace(/^dfs\./, 'blob.') || 'blob.core.windows.net';
    return {
      url: `https://${account}.${host}/${filesystem}/${PROBE_KEY}`,
      type,
      preflightHeader: 'x-ms-version',
    };
  }

  // onelake and anything added later: not reachable from the browser by a route
  // this code knows, so there is no honest probe to run.
  return null;
}
