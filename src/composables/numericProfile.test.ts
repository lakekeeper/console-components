// @vitest-environment node
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import {
  histogramBoundary,
  numericHistogramQuery,
  numericProfileScale,
  numericSummaryQuery,
} from './numericProfile';

let db: Awaited<ReturnType<typeof duckdb.createDuckDB>>;
let connection: duckdb.DuckDBConnection;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  db = await duckdb.createDuckDB(
    {
      mvp: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm') },
      eh: { mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm') },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  connection = db.connect();
});

afterAll(() => {
  connection?.close();
  db?.reset();
});

describe('numeric column profiling in DuckDB WASM', () => {
  it.each([
    ['INTEGER', '-2147483648', '2147483647'],
    ['BIGINT', '-9223372036854775808', '9223372036854775807'],
    [
      'DECIMAL(38,9)',
      '-99999999999999999999999999999.999999999',
      '99999999999999999999999999999.999999999',
    ],
    ['FLOAT', '-3.4028234663852886e38', '3.4028234663852886e38'],
    ['DOUBLE', '-1.7976931348623157e308', '1.7976931348623157e308'],
  ])('bins the full finite %s range without overflow', (type, min, max) => {
    const source = `(SELECT * FROM (VALUES ((${min})::${type}), (0::${type}), ((${max})::${type}), (NULL::${type})) t(c))`;
    const rows = connection
      .query(numericHistogramQuery(source, Number(min), Number(max), 24))
      .toArray();
    expect(rows.map((row) => [Number(row.b), Number(row.cnt)])).toEqual([
      [0, 1],
      [12, 1],
      [23, 1],
    ]);
  });

  it('avoids STDDEV_SAMP throwing on valid DOUBLE extrema', () => {
    const limit = Number.MAX_VALUE;
    const source = `(SELECT * FROM (VALUES (-${limit}::DOUBLE), (${limit}::DOUBLE)) t(c))`;
    const row = connection
      .query(numericSummaryQuery(source, numericProfileScale(-limit, limit)))
      .get(0);
    expect(row?.mean_v).toBe(0);
    // The mathematical sample deviation exceeds the representable DOUBLE range.
    expect(row?.stddev_v).toBe(Infinity);
  });

  it('preserves ordinary averages and sample deviations', () => {
    const source = '(SELECT * FROM (VALUES (1), (2), (3), (NULL)) t(c))';
    const row = connection.query(numericSummaryQuery(source, numericProfileScale(1, 3))).get(0);
    expect(row?.mean_v).toBeCloseTo(2);
    expect(row?.stddev_v).toBeCloseTo(1);
  });

  it('handles zero-only and all-null summaries', () => {
    expect(numericProfileScale(0, 0)).toBe(1);
    const zero = connection.query(numericSummaryQuery('(SELECT 0 AS c)', 1)).get(0);
    expect(zero?.mean_v).toBe(0);
    expect(zero?.stddev_v).toBeNull();
    const empty = connection.query(numericSummaryQuery('(SELECT NULL::INTEGER AS c)', 1)).get(0);
    expect(empty?.mean_v).toBeNull();
    expect(empty?.stddev_v).toBeNull();
  });

  it('produces finite chart boundaries for opposite DOUBLE extrema', () => {
    const min = -Number.MAX_VALUE;
    const max = Number.MAX_VALUE;
    expect(histogramBoundary(min, max, 0, 24)).toBe(min);
    expect(histogramBoundary(min, max, 12, 24)).toBe(0);
    expect(histogramBoundary(min, max, 24, 24)).toBe(max);
    expect(
      Array.from({ length: 25 }, (_, i) => histogramBoundary(min, max, i, 24)).every(
        Number.isFinite,
      ),
    ).toBe(true);
  });
});
