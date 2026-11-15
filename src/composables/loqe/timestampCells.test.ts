// @vitest-environment node
/**
 * Timestamp cells end to end: real DuckDB-WASM result → cellReader, as the
 * engine's row loop reads them. Arrow's get() turns ticks into float
 * milliseconds, which drops nanoseconds and, far from 1970, microseconds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeData, makeVector, TimestampMicrosecond, TimestampNanosecond } from 'apache-arrow';
import { cellReader, formatTimestampTicks } from './arrowValue';
import { openTestDuckDB, type TestDuckDB } from './duckdbForTests';

let db: TestDuckDB;
beforeAll(async () => {
  db = await openTestDuckDB();
});
afterAll(() => db?.close());

/** Every cell of a DuckDB result, read the way LoQEEngine reads rows. */
function readRows(text: string): unknown[][] {
  const table = db.query(text);
  const readCell = table.schema.fields.map((f) => cellReader(f.type));
  const rows: unknown[][] = [];
  for (const batch of table.batches) {
    for (let r = 0; r < batch.numRows; r++) {
      rows.push(readCell.map((read, j) => read(batch.getChildAt(j), r)));
    }
  }
  return rows;
}

describe('timestamp cells from DuckDB', () => {
  it('keeps all nine digits of a TIMESTAMP_NS', () => {
    expect(readRows(`SELECT TIMESTAMP_NS '2026-09-08 12:30:45.123456789'`)).toEqual([
      ['2026-09-08 12:30:45.123456789'],
    ]);
  });

  it('keeps nanosecond bounds DuckDB can write', () => {
    expect(
      readRows(`SELECT * FROM (VALUES
        (TIMESTAMP_NS '1678-01-01 00:00:00'),
        (TIMESTAMP_NS '2262-04-11 23:47:16.854775806')) t(v)`),
    ).toEqual([['1678-01-01 00:00:00'], ['2262-04-11 23:47:16.854775806']]);
  });

  it('keeps microseconds at the ends of the calendar', () => {
    // get() rounds the first to 10000-01-01 00:00:00.
    expect(
      readRows(`SELECT * FROM (VALUES
        (TIMESTAMP '9999-12-31 23:59:59.999999'),
        (TIMESTAMP '0001-01-01 00:00:00.000001'),
        (TIMESTAMP '1969-12-31 23:59:59.5')) t(v)`),
    ).toEqual([
      ['9999-12-31 23:59:59.999999'],
      ['0001-01-01 00:00:00.000001'],
      ['1969-12-31 23:59:59.5'],
    ]);
  });

  it('writes a TIMESTAMPTZ as its instant in UTC', () => {
    expect(
      readRows(`SELECT * FROM (VALUES
        (TIMESTAMPTZ '2026-09-08 12:30:45.123456+02'),
        (TIMESTAMPTZ '2026-09-08 12:30:45.123456-04'),
        (TIMESTAMPTZ '2026-09-08 12:30:45.123456+05:30')) t(v)`),
    ).toEqual([
      ['2026-09-08 10:30:45.123456+00'],
      ['2026-09-08 16:30:45.123456+00'],
      ['2026-09-08 07:00:45.123456+00'],
    ]);
  });

  it('passes NULL through and leaves other columns to cellConverter', () => {
    expect(
      readRows(`SELECT * FROM (VALUES
        (NULL::TIMESTAMP_NS, DATE '2024-07-01', 42, {'a': 1})) t(ts, d, i, s)`),
    ).toEqual([[null, '2024-07-01', 42, '{"a":1}']]);
  });

  it('matches DuckDB’s own text for each unit', () => {
    const [[s, ms, us, ns]] = readRows(`SELECT
      TIMESTAMP_S '2024-07-01 12:34:56', TIMESTAMP_MS '2024-07-01 12:34:56.789',
      TIMESTAMP '2024-07-01 12:34:56.789123', TIMESTAMP_NS '2024-07-01 12:34:56.789123456'`);
    const [[sT, msT, usT, nsT]] = db
      .query(
        `SELECT TIMESTAMP_S '2024-07-01 12:34:56'::VARCHAR, TIMESTAMP_MS '2024-07-01 12:34:56.789'::VARCHAR,
         TIMESTAMP '2024-07-01 12:34:56.789123'::VARCHAR, TIMESTAMP_NS '2024-07-01 12:34:56.789123456'::VARCHAR`,
      )
      .toArray()
      .map((r) => Object.values(r.toJSON()));
    expect([s, ms, us, ns]).toEqual([sT, msT, usT, nsT]);
  });
});

describe('cellReader on hand-built vectors', () => {
  const ticks = new BigInt64Array([0n, 1_788_870_645_123_456_789n, -1n]);
  const nullBitmap = new Uint8Array([0b101]); // second value NULL

  it('reads a sliced chunk at the right offset', () => {
    const data = makeData({ type: new TimestampNanosecond(), length: 3, data: ticks, nullBitmap });
    const sliced = makeVector(data).slice(1);
    const read = cellReader(sliced.type);
    expect(read(sliced, 0)).toBeNull();
    expect(read(sliced, 1)).toBe('1969-12-31 23:59:59.999999999');
  });

  it('walks across chunks', () => {
    const type = new TimestampMicrosecond();
    const a = makeData({ type, length: 1, data: new BigInt64Array([0n]) });
    const b = makeData({ type, length: 1, data: new BigInt64Array([1_000_001n]) });
    const vector = makeVector([a, b]);
    const read = cellReader(vector.type);
    expect(read(vector, 1)).toBe('1970-01-01 00:00:01.000001');
  });

  it('falls back to get() when ticks are not a BigInt64Array', () => {
    const read = cellReader({ typeId: 10, unit: 2, timezone: null });
    const column = { get: () => 1719837296000, data: [] };
    expect(read(column, 0)).toBe('2024-07-01 12:34:56');
    expect(read(null, 0)).toBeUndefined();
  });
});

describe('formatTimestampTicks', () => {
  it('writes a year before 1 the way DuckDB does', () => {
    // 0044-03-15 (BC): the Ides of March, in seconds since 1970.
    const seconds = BigInt(Date.UTC(-43, 2, 15) / 1000);
    expect(formatTimestampTicks(seconds, 0, false)).toBe('0044-03-15 00:00:00 (BC)');
  });

  it('gives the raw ticks for a time JS dates cannot hold', () => {
    expect(formatTimestampTicks(9_000_000_000_000_000n, 0, false)).toBe('9000000000000000');
  });
});
