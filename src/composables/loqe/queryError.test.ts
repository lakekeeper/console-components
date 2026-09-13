import { describe, it, expect } from 'vitest';
import { friendlyQueryError } from './queryError';

// friendlyQueryError explains unsupported ADLS operations and turns DuckDB-WASM's
// opaque storage-read failures into an actionable "Configure CORS" message across
// browsers. Unrelated errors must pass through unchanged.

const FRIENDLY = /Configure CORS/;
const original = new Error('original duckdb error');

describe('friendlyQueryError', () => {
  it.each(['DirectoryExists', 'CreateDirectory', 'RemoveFile'])(
    'explains ADLS is read-only when AzureFileSystem does not implement %s',
    (operation) => {
      const err = new Error(
        `Not implemented Error: AzureFileSystem: ${operation} is not implemented!`,
      );
      const result = friendlyQueryError(err, err.message) as Error;

      expect(result).not.toBe(err);
      expect(result.message).toBe('Azure Data Lake Storage (ADLS) is read-only in LoQE.');
      expect(result.cause).toBe(err);
    },
  );

  it('preserves a non-Error Azure worker failure as the cause', () => {
    const err = {
      message: 'Not implemented Error: AzureFileSystem: DirectoryExists is not implemented!',
      type: 'NotImplementedException',
    };

    expect((friendlyQueryError(err, err.message) as Error).cause).toBe(err);
  });

  it.each([
    'Not implemented Error: LocalFileSystem: DirectoryExists is not implemented!',
    'IO Error: AzureFileSystem: OpenFile failed: HTTP 403 Forbidden',
    'Not implemented Error: this SQL operation is not implemented!',
  ])('passes through errors unrelated to unsupported Azure operations: %s', (msg) => {
    const err = new Error(msg);

    expect(friendlyQueryError(err, msg)).toBe(err);
  });

  it('chromium: download-block naming a data file → friendly CORS message', () => {
    const msg =
      'Full download failed for HTTP file: .../data/snap-123.avro: 404 (might be potentially a CORS error)';
    const r = friendlyQueryError(original, msg) as Error;
    expect(r).not.toBe(original); // a NEW, friendly error
    expect(r.message).toMatch(FRIENDLY);
  });

  it('firefox: "Cannot read N bytes from memory buffer" → friendly (regression: the firefox CORS bug)', () => {
    const msg = 'Invalid Input Error: Cannot read 4 bytes from memory buffer';
    expect((friendlyQueryError(original, msg) as Error).message).toMatch(FRIENDLY);
  });

  it.each([
    'items is null',
    'x is undefined reading Symbol.iterator',
    'InternalError: too much recursion',
    'Aborted(). Build with -sASSERTIONS for more info.',
    'Cannot read 262144 bytes from memory buffer',
  ])('blocked-fetch symptom %#  → friendly', (msg) => {
    expect((friendlyQueryError(original, msg) as Error).message).toMatch(FRIENDLY);
  });

  it('a 404 NOT on a storage data file → passes through (not every 404 is CORS)', () => {
    const msg = 'Catalog Error: 404 Not Found for /management/v1/whoami';
    expect(friendlyQueryError(original, msg)).toBe(original);
  });

  it('an unrelated SQL/parse error → passes through unchanged', () => {
    const msg = 'Parser Error: syntax error at or near "SELCT"';
    expect(friendlyQueryError(original, msg)).toBe(original);
  });

  it('a genuine "table does not exist" → passes through (not a storage-access failure)', () => {
    const msg = 'Catalog Error: Table with name demo_tbl does not exist!';
    expect(friendlyQueryError(original, msg)).toBe(original);
  });
});
