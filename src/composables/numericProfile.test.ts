// @vitest-environment node
/**
 * The numeric profile queries, run on real DuckDB-WASM at the edges of each
 * type — where the plain `c - min` and `stddev_samp(c)` overflow.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join, num, sql, sqlText, type Sql } from './loqe/sql';
import { openTestDuckDB, type TestDuckDB } from './loqe/duckdbForTests';
import {
  HISTOGRAM_BINS,
  histogramBoundary,
  histogramQuery,
  profileScale,
  readHistogram,
} from './numericProfile';

let db: TestDuckDB;
beforeAll(async () => {
  db = await openTestDuckDB();
});
afterAll(() => db?.close());

const DOUBLE_MAX = Number.MAX_VALUE;

const run = (statement: Sql) => db.query(sqlText(statement));

/** Profile `values` (SQL literals) of `type` the way the profiler does. */
function profile(type: Sql, values: Sql[]) {
  const rows = join(values.map((v) => sql`(${v})`));
  run(sql`CREATE OR REPLACE TABLE t AS SELECT v::${type} AS c FROM (VALUES ${rows}) x(v)`);
  const [stats] = db
    .query(`SELECT min(c)::DOUBLE AS lo, max(c)::DOUBLE AS hi FROM t`)
    .toArray()
    .map((r) => r.toJSON());
  const min = Number(stats.lo);
  const max = Number(stats.hi);
  const result = db.query(sqlText(histogramQuery(sql`(SELECT c FROM t)`, min, max)));
  const columns = result.schema.fields.map((f) => f.name);
  const cells = result.toArray().map((r) => columns.map((c) => r[c]));
  return { min, max, ...readHistogram(columns, cells, min, max) };
}

/** DuckDB's own mean and std, where they do not overflow. */
function reference() {
  const [r] = db
    .query(`SELECT avg(c::DOUBLE) AS mean, stddev_samp(c::DOUBLE) AS std FROM t`)
    .toArray()
    .map((x) => x.toJSON());
  return { mean: Number(r.mean), std: r.std === null ? null : Number(r.std) };
}

/** Equal to DOUBLE precision — relative to the column's scale, as all arithmetic is. */
const closeTo = (actual: number | null, expected: number | null, scale = 1) => {
  if (expected === null) return expect(actual).toBeNull();
  expect(actual).not.toBeNull();
  const tolerance = Math.max(Math.abs(expected) * 1e-12, scale * 1e-15);
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
};

describe('the overflows this replaces', () => {
  it('plain `c - min` overflows a full-range INTEGER', () => {
    db.query(
      `CREATE OR REPLACE TABLE t AS SELECT * FROM (VALUES (2147483647), (-2147483648)) x(c)`,
    );
    expect(() => db.query(`SELECT c - (-2147483648) FROM t`)).toThrow(/Overflow/);
  });

  it('plain `stddev_samp(c)` overflows DOUBLEs near the largest finite value', () => {
    run(sql`CREATE OR REPLACE TABLE t AS
      SELECT * FROM (VALUES (${num(DOUBLE_MAX)}::DOUBLE), (0::DOUBLE), (${num(-DOUBLE_MAX)}::DOUBLE)) x(c)`);
    expect(() => db.query(`SELECT stddev_samp(c) FROM t`)).toThrow(/out of range/i);
  });
});

describe('histogramQuery + readHistogram', () => {
  it('profiles a full-range INTEGER', () => {
    const p = profile(sql`INTEGER`, [num(2147483647), num(-2147483648), num(0), num(1)]);
    expect(p.bins[0]).toBe(1);
    expect(p.bins[HISTOGRAM_BINS - 1]).toBe(1);
    expect(p.bins.reduce((a, b) => a + b, 0)).toBe(4);
    const ref = reference();
    const scale = profileScale(p.min, p.max);
    closeTo(p.mean, ref.mean, scale);
    closeTo(p.std, ref.std, scale);
  });

  it('profiles a full-range BIGINT', () => {
    const p = profile(sql`BIGINT`, [
      num(9223372036854775807n),
      num(-9223372036854775808n),
      num(42),
    ]);
    expect(p.bins.reduce((a, b) => a + b, 0)).toBe(3);
    const ref = reference();
    const scale = profileScale(p.min, p.max);
    closeTo(p.mean, ref.mean, scale);
    closeTo(p.std, ref.std, scale);
  });

  it('profiles DOUBLEs at ± the largest finite value', () => {
    const p = profile(sql`DOUBLE`, [num(DOUBLE_MAX), num(0), num(-DOUBLE_MAX)]);
    expect(p.bins[0]).toBe(1);
    expect(p.bins[HISTOGRAM_BINS - 1]).toBe(1);
    // Scaled to {1, 0, -1}: mean 0, sample std exactly the scale.
    expect(p.mean).toBe(0);
    expect(p.std).toBe(DOUBLE_MAX);
  });

  it('profiles DECIMAL(38,9) at its precision limits', () => {
    const p = profile(sql`DECIMAL(38,9)`, [
      sql`99999999999999999999999999999.999999999`,
      sql`-99999999999999999999999999999.999999999`,
      num(0),
    ]);
    expect(p.bins.reduce((a, b) => a + b, 0)).toBe(3);
    const ref = reference();
    const scale = profileScale(p.min, p.max);
    closeTo(p.mean, ref.mean, scale);
    closeTo(p.std, ref.std, scale);
  });

  it('matches stddev_samp on ordinary data, NULLs ignored', () => {
    const values = Array.from({ length: 500 }, (_, i) => num(Math.sin(i) * 1000 + i));
    const p = profile(sql`DOUBLE`, [...values, sql`NULL`]);
    expect(p.bins.reduce((a, b) => a + b, 0)).toBe(500);
    const ref = reference();
    const scale = profileScale(p.min, p.max);
    closeTo(p.mean, ref.mean, scale);
    closeTo(p.std, ref.std, scale);
  });

  it('reads counts that arrive as quoted text', () => {
    const p = readHistogram(
      ['b', 'cnt', 'mean_s', 'var_s'],
      [
        ['"0"', '"2"', 0.25, 0],
        ['"99"', 1n, 1, null],
      ],
      0,
      1,
      4,
    );
    expect(p.bins).toEqual([2, 0, 0, 1]);
    closeTo(p.mean, 0.5);
    // Values 0.25, 0.25, 1: sample variance ((0.25² · 2) + 0.5²) / 2.
    closeTo(p.std, Math.sqrt(0.1875));
  });

  it('has no mean or std without rows, and no std for one row', () => {
    expect(readHistogram(['b', 'cnt', 'mean_s', 'var_s'], [], 0, 1)).toMatchObject({
      mean: null,
      std: null,
    });
    expect(readHistogram(['b', 'cnt', 'mean_s', 'var_s'], [[0, 1, 0.5, 0]], 0, 2)).toMatchObject({
      mean: 1,
      std: null,
    });
  });
});

describe('histogramBoundary', () => {
  it('stays finite across a full-range DOUBLE, where max - min is Infinity', () => {
    expect(DOUBLE_MAX - -DOUBLE_MAX).toBe(Infinity);
    const edges = Array.from({ length: 25 }, (_, i) =>
      histogramBoundary(-DOUBLE_MAX, DOUBLE_MAX, i, 24),
    );
    expect(edges.every(Number.isFinite)).toBe(true);
    expect(edges[0]).toBe(-DOUBLE_MAX);
    expect(edges[24]).toBe(DOUBLE_MAX);
    expect(edges[12]).toBe(0);
  });

  it('gives exact edges on an ordinary range', () => {
    expect(histogramBoundary(0, 24, 6, 24)).toBe(6);
    expect(histogramBoundary(-10, 10, 1, 4)).toBe(-5);
  });
});

describe('profileScale', () => {
  it('is the larger magnitude, and 1 for an all-zero column', () => {
    expect(profileScale(-5, 3)).toBe(5);
    expect(profileScale(0, 0)).toBe(1);
  });
});
