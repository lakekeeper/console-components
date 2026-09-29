import { describe, it, expect, vi } from 'vitest';
import {
  explainQueryFailure,
  friendlyQueryError,
  isWriteStatement,
  splitEngineError,
} from './queryError';

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
      expect(result.message).toContain('Azure Data Lake Storage (ADLS) is read-only in LoQE.');
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

describe('friendlyQueryError: credentials the catalog did not vend', () => {
  const RAW =
    'Invalid Configuration Error: No region was provided via the vended credentials, and no ' +
    'region could be found via environment variables. Please provide a default_region for the ' +
    'Iceberg Catalog when attaching.';

  it('blames the missing privilege, not the ATTACH options', () => {
    const out = friendlyQueryError(original, RAW) as Error;

    expect(out).not.toBe(original);
    expect(out.message).toContain('read_data');
    expect(out.message).toContain('no storage credentials');
    expect(out.cause).toBe(original);

    // `default_region` survives only inside the quoted engine line; the explanation
    // itself must not send anyone back to the ATTACH options.
    const { explanation } = splitEngineError(out.message);
    expect(explanation).not.toMatch(/default_region/i);
  });

  it('a region complaint that is not about vended credentials passes through', () => {
    const msg = 'Invalid Configuration Error: Unknown region "moon-1"';
    expect(friendlyQueryError(original, msg)).toBe(original);
  });
});

// Every replacement marks off whose words it replaced, so the UI can attribute
// them: read as Lakekeeper's, a DuckDB configuration complaint sends people to
// debug a catalog that is behaving fine.
describe('friendlyQueryError: attribution to the engine', () => {
  it.each([
    ['Binder Error: Catalog "wh" does not exist!', []],
    ['Not implemented Error: AzureFileSystem: RemoveFile is not implemented!', []],
    ['Full download failed for HTTP file: .../snap-1.avro: 404 (might be a CORS error)', []],
    [
      'Invalid Configuration Error: No region was provided via the vended credentials, and no region could be found.',
      [],
    ],
  ])('marks off the engine text and quotes the raw line: %s', (msg, attached) => {
    const out = friendlyQueryError(original, msg, attached as string[]) as Error;
    const { explanation, engineMessage } = splitEngineError(out.message);

    expect(engineMessage).toBe(msg.split('\n')[0]);
    // The explanation is ours and stands on its own — it never leans on the
    // engine line to make sense.
    expect(explanation.trim().length).toBeGreaterThan(0);
    expect(explanation).not.toContain(msg.split('\n')[0]);
  });

  // Anything we did not translate carries no marker, so the alert does not put
  // DuckDB's name on a verdict of ours.
  it('leaves an untranslated message unattributed', () => {
    const { explanation, engineMessage } = splitEngineError('Host unreachable: storage.example');

    expect(engineMessage).toBeNull();
    expect(explanation).toBe('Host unreachable: storage.example');
  });

  it('truncates a runaway engine message instead of pasting it whole', () => {
    const msg = `Binder Error: Catalog "wh" does not exist! ${'x'.repeat(2000)}`;
    const out = friendlyQueryError(original, msg) as Error;

    expect(out.message).toContain('…');
    expect(out.message.length).toBeLessThan(1700);
  });
});

describe('isWriteStatement', () => {
  it('recognises the statements that write', () => {
    expect(isWriteStatement("INSERT INTO t VALUES ('x')")).toBe('write');
    expect(isWriteStatement('  update t set a = 1')).toBe('write');
    expect(isWriteStatement('CREATE TABLE t (a INT)')).toBe('write');
    expect(isWriteStatement('MERGE INTO t USING s ON t.id = s.id')).toBe('write');
  });

  it('treats reads — and anything unknown — as reads', () => {
    expect(isWriteStatement('SELECT * FROM t')).toBe('read');
    expect(isWriteStatement(undefined)).toBe('read');
  });

  it('explains an unattached catalog instead of repeating the binder error', () => {
    const out = friendlyQueryError(
      new Error('x'),
      'Binder Error: Catalog "demo-sts-27" does not exist!',
    ) as Error;
    expect(out.message).toContain('"demo-sts-27" is attached');
    expect(out.message).toContain('expand');
  });

  it('names what is attached when anything is', () => {
    const out = friendlyQueryError(new Error('x'), 'Catalog "wh-b" does not exist!', [
      'wh-a',
      'onelake',
    ]) as Error;
    expect(out.message).toContain('Currently attached: "wh-a", "onelake"');
  });

  it('leaves a binder error alone when that catalog is attached', () => {
    const err = new Error('Binder Error: Catalog "wh-a" does not exist!');
    expect(friendlyQueryError(err, err.message, ['wh-a'])).toBe(err);
  });
});

// A 403 from the catalog on CREATE TABLE was reported as a bucket CORS problem:
// the message names a URL, the URL is Lakekeeper's own, and probing it proved
// only that Lakekeeper answers. The stated status outranks every heuristic.
describe('a status the catalog already stated', () => {
  const RAW_403 =
    'Invalid Configuration Error: Request to ' +
    "'http://localhost:8181/catalog/v1/01a0d6f5-82fb-7008-b1e7-93cadfe2e23d/namespaces/ns/tables' " +
    'returned a non-200 status code body: {"exception_type":"Invalid Configuration",' +
    '"exception_message":"Request to \'http://localhost:8181/catalog/v1/x/namespaces/ns/tables\' ' +
    'returned a non-200 status code (Forbidden_403), with reason: Forbidden, body: "}';

  const SQL = 'CREATE TABLE "demo-sts"."ns"."ice2222" (a string)';

  it('reads the 403 as a missing privilege, not a storage problem', () => {
    const out = friendlyQueryError(original, RAW_403, [], SQL) as Error;
    const { explanation } = splitEngineError(out.message);

    expect(explanation).toContain('403');
    expect(explanation).toContain('create_table');
    expect(explanation).not.toMatch(/CORS|bucket/i);
  });

  it('never probes a URL whose status is already known', async () => {
    // The probe is what produced the wrong answer: it reaches Lakekeeper, which
    // of course answers, and "reachable" then reads as "storage is fine".
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    try {
      const out = (await explainQueryFailure(original, RAW_403, SQL, [])) as Error;

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(splitEngineError(out.message).explanation).toContain('403');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps DuckDB’s own line alongside the verdict', () => {
    const out = friendlyQueryError(original, RAW_403, [], SQL) as Error;
    const { engineMessage } = splitEngineError(out.message);

    expect(engineMessage).toContain('Forbidden_403');
  });

  it('names the token, not a privilege, on 401', () => {
    const msg = RAW_403.replace(/Forbidden_403/, 'Unauthorized_401').replace(
      /4\d\d\)/,
      'Unauthorized_401)',
    );
    const out = friendlyQueryError(original, msg, [], SQL) as Error;

    expect(splitEngineError(out.message).explanation).toMatch(/401|token/i);
  });

  it('asks for the right privilege on a read', () => {
    const out = friendlyQueryError(original, RAW_403, [], 'SELECT * FROM "wh"."ns"."t"') as Error;

    expect(splitEngineError(out.message).explanation).toContain('read_data');
  });
});
