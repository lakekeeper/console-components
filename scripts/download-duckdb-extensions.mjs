/**
 * download-duckdb-extensions.mjs
 *
 * Vendors the DuckDB WASM extensions LoQE needs into `duckdb-extensions/`, which
 * vite.config copies into `public/duckdb/extensions/` and ships in `dist`. At
 * runtime LoQEEngine points DuckDB's extension repository at our own origin, so
 * the app installs extensions offline (air-gapped) instead of from
 * extensions.duckdb.org.
 *
 * This runs at build time (prebuild/predev) — the build is NOT air-gapped, only
 * the deployed app is. Downloaded files are cached in `duckdb-extensions/` and
 * git-ignored; the download is skipped when they already exist, so offline
 * rebuilds work once the cache is warm.
 *
 * VERSION LOCK: the extension version MUST match the DuckDB core reported by the
 * pinned `@duckdb/duckdb-wasm`. Update EXTENSION_VERSIONS when bumping that dep,
 * or INSTALL will 404 / hit an ABI mismatch. Current pin: DuckDB 1.4.x → v1.4.3.
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'duckdb-extensions');
const BASE_URL = 'https://extensions.duckdb.org';

// DuckDB extension repository coordinates. Keep in sync with @duckdb/duckdb-wasm.
const EXTENSION_VERSIONS = ['v1.4.3'];
const PLATFORMS = ['wasm_eh', 'wasm_mvp'];
const EXTENSIONS = ['httpfs', 'iceberg', 'avro', 'parquet', 'json'];

// WASM magic bytes: `\0asm`. Guards against saving a 404 HTML page as a binary.
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 4).equals(WASM_MAGIC)) {
    throw new Error(`Not a WASM binary (bad magic bytes) from ${url} — got ${buf.length} bytes`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  if (process.env.DUCKDB_EXTENSIONS_SKIP_DOWNLOAD === '1') {
    console.log('[duckdb-ext] DUCKDB_EXTENSIONS_SKIP_DOWNLOAD=1 — skipping download');
    return;
  }

  const jobs = [];
  for (const version of EXTENSION_VERSIONS) {
    for (const platform of PLATFORMS) {
      for (const ext of EXTENSIONS) {
        const rel = `${version}/${platform}/${ext}.duckdb_extension.wasm`;
        const dest = resolve(OUT_DIR, rel);
        if (existsSync(dest) && statSync(dest).size > 0) continue; // cached
        jobs.push({ url: `${BASE_URL}/${rel}`, dest, rel });
      }
    }
  }

  if (jobs.length === 0) {
    console.log('[duckdb-ext] all extensions already vendored — nothing to download');
    return;
  }

  console.log(`[duckdb-ext] downloading ${jobs.length} extension(s) from ${BASE_URL} …`);
  const results = await Promise.allSettled(
    jobs.map((j) => download(j.url, j.dest).then((size) => ({ ...j, size }))),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  for (const r of results) {
    if (r.status === 'fulfilled')
      console.log(`[duckdb-ext]   ✓ ${r.value.rel} (${r.value.size} B)`);
  }
  if (failed.length > 0) {
    for (const f of failed) console.error(`[duckdb-ext]   ✗ ${f.reason?.message ?? f.reason}`);
    throw new Error(
      `[duckdb-ext] ${failed.length} extension download(s) failed. ` +
        `LoQE would not work air-gapped. Set DUCKDB_EXTENSIONS_SKIP_DOWNLOAD=1 only if ` +
        `duckdb-extensions/ is already populated.`,
    );
  }
  console.log('[duckdb-ext] done.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
