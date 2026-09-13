// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
let fixtureDir: string;
let cacheDir: string;

beforeEach(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'duckdb-extension-cache-'));
  cacheDir = join(fixtureDir, 'duckdb-extensions');
  await mkdir(join(fixtureDir, 'scripts'));
  await copyFile(
    new URL('../../../scripts/download-duckdb-extensions.mjs', import.meta.url),
    join(fixtureDir, 'scripts/download-duckdb-extensions.mjs'),
  );
  await writeFile(
    join(fixtureDir, 'no-network.mjs'),
    'globalThis.fetch = async () => { throw new Error("Unexpected network request"); };',
  );
});

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

function runDownloader(skipDownload = false) {
  return run(
    process.execPath,
    [
      '--import',
      join(fixtureDir, 'no-network.mjs'),
      join(fixtureDir, 'scripts/download-duckdb-extensions.mjs'),
    ],
    {
      // The cache must resolve relative to the script, even from a different cwd.
      cwd: tmpdir(),
      env: { ...process.env, DUCKDB_EXTENSIONS_SKIP_DOWNLOAD: skipDownload ? '1' : '0' },
    },
  );
}

describe('DuckDB extension cache cleanup', () => {
  it('prunes stale versions from a warm cache and preserves configured and unrelated paths', async () => {
    const cachedFiles: string[] = [];
    for (const platform of ['wasm_eh', 'wasm_mvp']) {
      const platformDir = join(cacheDir, 'v1.5.5', platform);
      await mkdir(platformDir, { recursive: true });
      for (const extension of ['httpfs', 'iceberg', 'avro', 'parquet', 'json', 'azure_wasm']) {
        const path = join(platformDir, `${extension}.duckdb_extension.wasm`);
        await writeFile(path, wasm);
        cachedFiles.push(path);
      }
    }
    for (const version of ['v1.4.4', 'v1.5.4-dev1+local']) {
      const staleDir = join(cacheDir, version, 'wasm_eh');
      await mkdir(staleDir, { recursive: true });
      await writeFile(join(staleDir, 'iceberg.duckdb_extension.wasm'), wasm);
    }
    await mkdir(join(cacheDir, 'notes'));
    await writeFile(join(cacheDir, 'v1.4.3'), 'unrelated file');
    const outsideDir = join(fixtureDir, 'outside');
    await mkdir(outsideDir);
    await writeFile(join(outsideDir, 'keep.txt'), 'unrelated content');
    await symlink(outsideDir, join(cacheDir, 'v1.4.2'), 'dir');

    const firstRun = await runDownloader();
    expect(firstRun.stdout).toContain('all extensions already vendored');
    expect((await readdir(cacheDir)).sort()).toEqual(['notes', 'v1.4.2', 'v1.4.3', 'v1.5.5']);
    expect(await readFile(join(outsideDir, 'keep.txt'), 'utf8')).toBe('unrelated content');
    expect(await readFile(join(cacheDir, 'v1.4.3'), 'utf8')).toBe('unrelated file');
    for (const path of cachedFiles) {
      expect(await readFile(path)).toEqual(wasm);
    }

    const secondRun = await runDownloader();
    expect(secondRun.stdout).not.toContain('removed stale extension version');
    expect((await readdir(cacheDir)).sort()).toEqual(['notes', 'v1.4.2', 'v1.4.3', 'v1.5.5']);
  });

  it('prunes stale versions when downloads are explicitly skipped', async () => {
    await mkdir(join(cacheDir, 'v1.4.4'), { recursive: true });
    await mkdir(join(cacheDir, 'v1.5.5'));

    const result = await runDownloader(true);

    expect(result.stdout).toContain('skipping download');
    expect(await readdir(cacheDir)).toEqual(['v1.5.5']);
  });

  it('allows an absent cache when downloads are explicitly skipped', async () => {
    const result = await runDownloader(true);

    expect(result.stdout).toContain('skipping download');
    await expect(readdir(cacheDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
