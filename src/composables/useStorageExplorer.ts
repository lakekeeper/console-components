/**
 * useStorageExplorer — browser-side object listing for a table's storage,
 * using the vended credentials returned by loadTable / loadGenericTable.
 *
 * Supports S3 (incl. on-prem/path-style via aws4fetch SigV4), ADLS Gen2
 * (dfs List-Paths + SAS), and GCS (JSON API + OAuth bearer). Listing is
 * delimiter-based ("/") so it maps onto a lazy folder tree.
 *
 * Hard requirements (outside our control): the bucket/account must allow CORS
 * for the console origin, and the vended creds must grant list permission on
 * the prefix. When either is missing the adapters throw a StorageListError that
 * the UI surfaces verbatim.
 */
import { AwsClient } from 'aws4fetch';

export interface StorageEntry {
  /** Leaf display name (no trailing slash). */
  name: string;
  /** Absolute key/path within the bucket/filesystem (folders end with "/"). */
  path: string;
  isFolder: boolean;
  size?: number;
  lastModified?: string;
}

export interface StorageLoadResult {
  location: string;
  config?: Record<string, string>;
  'storage-credentials'?: Array<{ prefix?: string; config: Record<string, string> }>;
}

export class StorageListError extends Error {
  constructor(
    message: string,
    public kind: 'cors' | 'forbidden' | 'unsupported' | 'http' | 'config',
    public status?: number,
  ) {
    super(message);
    this.name = 'StorageListError';
  }
}

type Parsed =
  | { kind: 's3'; bucket: string; basePrefix: string }
  | { kind: 'adls'; account: string; filesystem: string; host: string; basePrefix: string }
  | { kind: 'gcs'; bucket: string; basePrefix: string }
  | { kind: 'unknown'; scheme: string; basePrefix: string };

const ensureSlash = (p: string) => (p && !p.endsWith('/') ? `${p}/` : p);

export function parseLocation(uri: string): Parsed {
  const idx = uri.indexOf('://');
  if (idx === -1) return { kind: 'unknown', scheme: '', basePrefix: '' };
  const scheme = uri.slice(0, idx).toLowerCase();
  const rest = uri.slice(idx + 3);

  if (scheme === 's3' || scheme === 's3a') {
    const slash = rest.indexOf('/');
    const bucket = slash === -1 ? rest : rest.slice(0, slash);
    const basePrefix = slash === -1 ? '' : rest.slice(slash + 1);
    return { kind: 's3', bucket, basePrefix: ensureSlash(basePrefix) };
  }
  if (scheme === 'abfss' || scheme === 'abfs' || scheme === 'wasbs' || scheme === 'wasb') {
    // {filesystem}@{account}.dfs.core.windows.net/{path}
    const at = rest.indexOf('@');
    const filesystem = at === -1 ? '' : rest.slice(0, at);
    const afterAt = at === -1 ? rest : rest.slice(at + 1);
    const slash = afterAt.indexOf('/');
    const host = slash === -1 ? afterAt : afterAt.slice(0, slash);
    const account = host.split('.')[0];
    const basePrefix = slash === -1 ? '' : afterAt.slice(slash + 1);
    return { kind: 'adls', account, filesystem, host, basePrefix: ensureSlash(basePrefix) };
  }
  if (scheme === 'gs' || scheme === 'gcs') {
    const slash = rest.indexOf('/');
    const bucket = slash === -1 ? rest : rest.slice(0, slash);
    const basePrefix = slash === -1 ? '' : rest.slice(slash + 1);
    return { kind: 'gcs', bucket, basePrefix: ensureSlash(basePrefix) };
  }
  return { kind: 'unknown', scheme, basePrefix: '' };
}

/** Merge `config` with the longest-prefix-matching storage credential. */
function resolveConfig(res: StorageLoadResult): Record<string, string> {
  const cfg: Record<string, string> = { ...(res.config || {}) };
  const creds = res['storage-credentials'] || [];
  const best = [...creds]
    .filter((c) => !c.prefix || res.location.startsWith(c.prefix))
    .sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0))[0];
  if (best?.config) Object.assign(cfg, best.config);
  return cfg;
}

const leafName = (path: string) => {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const i = trimmed.lastIndexOf('/');
  return i === -1 ? trimmed : trimmed.slice(i + 1);
};

// Bare network failures from fetch surface as TypeError — almost always CORS.
function asCors(e: unknown): never {
  throw new StorageListError(
    `${(e as Error)?.message || e}. This is almost always a CORS failure — the bucket/account ` +
      `does not allow this origin. Configure CORS on the storage, or list via the backend.`,
    'cors',
  );
}

// ---- S3 ---------------------------------------------------------------------
async function listS3(
  cfg: Record<string, string>,
  bucket: string,
  prefix: string,
): Promise<StorageEntry[]> {
  const accessKeyId = cfg['s3.access-key-id'];
  const secretAccessKey = cfg['s3.secret-access-key'];
  if (!accessKeyId || !secretAccessKey)
    throw new StorageListError('No S3 access key in vended credentials', 'config');
  const sessionToken = cfg['s3.session-token'];
  const region = cfg['s3.region'] || cfg['client.region'] || 'us-east-1';
  const endpoint = cfg['s3.endpoint'];
  const pathStyle = String(cfg['s3.path-style-access'] ?? 'true') === 'true';

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    service: 's3',
  });
  const base = endpoint ? endpoint.replace(/\/+$/, '') : `https://s3.${region}.amazonaws.com`;
  const root = pathStyle ? `${base}/${bucket}` : base.replace('://', `://${bucket}.`);
  const url = `${root}?list-type=2&delimiter=/&max-keys=1000&prefix=${encodeURIComponent(prefix)}`;

  let resp: Response;
  try {
    resp = await client.fetch(url, { method: 'GET' });
  } catch (e) {
    asCors(e);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new StorageListError(
      `S3 ${resp.status}: ${text.slice(0, 300)}`,
      resp.status === 403 ? 'forbidden' : 'http',
      resp.status,
    );
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const folders: StorageEntry[] = Array.from(doc.querySelectorAll('CommonPrefixes > Prefix'))
    .map((n) => n.textContent || '')
    .filter(Boolean)
    .map((p) => ({ name: leafName(p), path: p, isFolder: true }));
  const files: StorageEntry[] = Array.from(doc.querySelectorAll('Contents'))
    .map((c) => ({
      key: c.querySelector('Key')?.textContent || '',
      size: Number(c.querySelector('Size')?.textContent || 0),
      lastModified: c.querySelector('LastModified')?.textContent || undefined,
    }))
    .filter((f) => f.key && f.key !== prefix)
    .map((f) => ({
      name: leafName(f.key),
      path: f.key,
      isFolder: false,
      size: f.size,
      lastModified: f.lastModified,
    }));
  return [...folders, ...files];
}

// ---- ADLS Gen2 (dfs List Paths + SAS) --------------------------------------
async function listAdls(
  cfg: Record<string, string>,
  parsed: Extract<Parsed, { kind: 'adls' }>,
  prefix: string,
): Promise<StorageEntry[]> {
  // SAS token key looks like `adls.sas-token.<account>.dfs.core.windows.net`.
  const sasKey = Object.keys(cfg).find((k) => k.startsWith('adls.sas-token.'));
  const sas = sasKey ? cfg[sasKey] : undefined;
  if (!sas) throw new StorageListError('No ADLS SAS token in vended credentials', 'config');
  const host = parsed.host || `${parsed.account}.dfs.core.windows.net`;
  // `directory` is the path within the filesystem (no leading/trailing slash).
  const dir = prefix.replace(/^\/+|\/+$/g, '');
  const qs = new URLSearchParams({ resource: 'filesystem', recursive: 'false' });
  if (dir) qs.set('directory', dir);
  const url = `https://${host}/${parsed.filesystem}?${qs.toString()}&${sas.replace(/^\?/, '')}`;

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (e) {
    asCors(e);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new StorageListError(
      `ADLS ${resp.status}: ${text.slice(0, 300)}`,
      resp.status === 403 ? 'forbidden' : 'http',
      resp.status,
    );
  }
  const data = JSON.parse(text || '{}');
  const base = ensureSlash(dir);
  return (data.paths || [])
    .map((p: any) => {
      const full = p.name as string; // path from filesystem root
      const isFolder = String(p.isDirectory) === 'true';
      return {
        name: leafName(full),
        path: isFolder ? ensureSlash(full) : full,
        isFolder,
        size: p.contentLength != null ? Number(p.contentLength) : undefined,
        lastModified: p.lastModified || undefined,
      } as StorageEntry;
    })
    .filter((e: StorageEntry) => e.path !== base);
}

// ---- GCS (JSON API + bearer) ------------------------------------------------
async function listGcs(
  cfg: Record<string, string>,
  bucket: string,
  prefix: string,
): Promise<StorageEntry[]> {
  const token = cfg['gcs.oauth2.token'];
  if (!token) throw new StorageListError('No GCS OAuth token in vended credentials', 'config');
  const qs = new URLSearchParams({ delimiter: '/', maxResults: '1000', prefix });
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${qs.toString()}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    asCors(e);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new StorageListError(
      `GCS ${resp.status}: ${text.slice(0, 300)}`,
      resp.status === 403 ? 'forbidden' : 'http',
      resp.status,
    );
  }
  const data = JSON.parse(text || '{}');
  const folders: StorageEntry[] = (data.prefixes || []).map((p: string) => ({
    name: leafName(p),
    path: p,
    isFolder: true,
  }));
  const files: StorageEntry[] = (data.items || [])
    .filter((o: any) => o.name && o.name !== prefix)
    .map((o: any) => ({
      name: leafName(o.name),
      path: o.name,
      isFolder: false,
      size: o.size != null ? Number(o.size) : undefined,
      lastModified: o.updated || o.timeCreated || undefined,
    }));
  return [...folders, ...files];
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

// ---- GetObject (download bytes) --------------------------------------------
async function getObjectBytes(res: StorageLoadResult, absPath: string): Promise<Uint8Array> {
  const parsed = parseLocation(res.location);
  const cfg = resolveConfig(res);
  let resp: Response;
  if (parsed.kind === 's3') {
    const accessKeyId = cfg['s3.access-key-id'];
    const secretAccessKey = cfg['s3.secret-access-key'];
    if (!accessKeyId || !secretAccessKey)
      throw new StorageListError('No S3 access key in vended credentials', 'config');
    const sessionToken = cfg['s3.session-token'];
    const region = cfg['s3.region'] || cfg['client.region'] || 'us-east-1';
    const endpoint = cfg['s3.endpoint'];
    const pathStyle = String(cfg['s3.path-style-access'] ?? 'true') === 'true';
    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region,
      service: 's3',
    });
    const base = endpoint ? endpoint.replace(/\/+$/, '') : `https://s3.${region}.amazonaws.com`;
    const root = pathStyle
      ? `${base}/${parsed.bucket}`
      : base.replace('://', `://${parsed.bucket}.`);
    const url = `${root}/${encodeKey(absPath)}`;
    try {
      resp = await client.fetch(url, { method: 'GET' });
    } catch (e) {
      asCors(e);
    }
  } else if (parsed.kind === 'adls') {
    const sasKey = Object.keys(cfg).find((k) => k.startsWith('adls.sas-token.'));
    const sas = sasKey ? cfg[sasKey] : undefined;
    if (!sas) throw new StorageListError('No ADLS SAS token in vended credentials', 'config');
    const host = parsed.host || `${parsed.account}.dfs.core.windows.net`;
    const url = `https://${host}/${parsed.filesystem}/${encodeKey(absPath)}?${sas.replace(/^\?/, '')}`;
    try {
      resp = await fetch(url, { method: 'GET' });
    } catch (e) {
      asCors(e);
    }
  } else if (parsed.kind === 'gcs') {
    const token = cfg['gcs.oauth2.token'];
    if (!token) throw new StorageListError('No GCS OAuth token in vended credentials', 'config');
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(absPath)}?alt=media`;
    try {
      resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      asCors(e);
    }
  } else {
    throw new StorageListError(`Scheme "${parsed.scheme}" not supported`, 'unsupported');
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new StorageListError(
      `Download ${resp.status}: ${t.slice(0, 200)}`,
      resp.status === 403 ? 'forbidden' : 'http',
      resp.status,
    );
  }
  return new Uint8Array(await resp.arrayBuffer());
}

export function useStorageExplorer() {
  /** List the immediate children of `absPrefix` (an absolute key within the bucket/filesystem). */
  async function listPrefix(res: StorageLoadResult, absPrefix: string): Promise<StorageEntry[]> {
    const parsed = parseLocation(res.location);
    const cfg = resolveConfig(res);
    if (parsed.kind === 's3') return listS3(cfg, parsed.bucket, absPrefix);
    if (parsed.kind === 'adls') return listAdls(cfg, parsed, absPrefix);
    if (parsed.kind === 'gcs') return listGcs(cfg, parsed.bucket, absPrefix);
    throw new StorageListError(
      `Storage scheme "${parsed.scheme}" is not supported for browsing`,
      'unsupported',
    );
  }

  /** The absolute prefix at which to root the tree (from the table location). */
  function rootPrefix(location: string): string {
    return parseLocation(location).basePrefix;
  }

  /** Reconstruct a full URI for an absolute key (for copy/display). */
  function toUri(location: string, absPath: string): string {
    const idx = location.indexOf('://');
    const scheme = location.slice(0, idx);
    const parsed = parseLocation(location);
    if (parsed.kind === 's3' || parsed.kind === 'gcs')
      return `${scheme}://${parsed.bucket}/${absPath}`;
    if (parsed.kind === 'adls') return `${scheme}://${parsed.filesystem}@${parsed.host}/${absPath}`;
    return `${scheme}://${absPath}`;
  }

  /** Download an object's bytes (signed, per cloud). */
  async function getObject(res: StorageLoadResult, absPath: string): Promise<Uint8Array> {
    return getObjectBytes(res, absPath);
  }

  return { listPrefix, getObject, rootPrefix, toUri, parseLocation };
}
