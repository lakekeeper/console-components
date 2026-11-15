/**
 * Numeric column profile: histogram, mean and standard deviation, computed so
 * that no column range overflows.
 *
 * The plain forms overflow at the edges of their types: `c - min` for an
 * INTEGER spanning its full range (`Overflow in subtraction of INT32`),
 * `stddev_samp(c)` for DOUBLEs near the largest finite value (`out of range`),
 * and `max - min` in JS for a full-range DOUBLE (Infinity). Values are
 * therefore cast to DOUBLE and divided by the larger magnitude of min and max,
 * so they all lie in [-1, 1], before any arithmetic. Mean and variance come
 * per bin from the histogram's own scan and are combined here, so the profile
 * costs no extra scan.
 */
import { num, sql, type Sql } from './loqe/sql';

export const HISTOGRAM_BINS = 24;

/** The divisor that brings every value into [-1, 1]. */
export function profileScale(min: number, max: number): number {
  return Math.max(Math.abs(min), Math.abs(max)) || 1;
}

/**
 * One scan over `source` (a subquery with the column as `c`): per bin, its
 * row count and the mean and population variance of its scaled values.
 * Callers ensure min < max, both finite.
 */
export function histogramQuery(source: Sql, min: number, max: number, bins = HISTOGRAM_BINS): Sql {
  const scale = profileScale(min, max);
  const lo = min / scale;
  const width = (max / scale - lo) / bins;
  // width_bucket isn't in this DuckDB build — bin with floor() + clamp.
  return sql`SELECT least(${num(bins - 1)}, greatest(0, floor((s - ${num(lo)}) / ${num(width)}))) AS b,
         count(*) AS cnt, avg(s) AS mean_s, var_pop(s) AS var_s
  FROM (SELECT c::DOUBLE / ${num(scale)} AS s FROM ${source} WHERE c IS NOT NULL)
  GROUP BY b ORDER BY b`;
}

export interface NumericProfile {
  bins: number[];
  mean: number | null;
  std: number | null;
}

/** Engine cells can arrive as numbers, bigints or quoted text. */
const toNumber = (v: unknown): number => Number(String(v ?? '').replace(/"/g, ''));

/**
 * Bin counts, mean and sample standard deviation (as `stddev_samp`) from the
 * rows of `histogramQuery`. Bins are merged with Chan's parallel formula,
 * which stays exact where summing squares would cancel.
 */
export function readHistogram(
  columns: string[],
  rows: unknown[][],
  min: number,
  max: number,
  bins = HISTOGRAM_BINS,
): NumericProfile {
  const scale = profileScale(min, max);
  const at = (name: string) => columns.indexOf(name);
  const [bIdx, cIdx, mIdx, vIdx] = [at('b'), at('cnt'), at('mean_s'), at('var_s')];
  const counts = new Array(bins).fill(0);
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (const r of rows) {
    let b = toNumber(r[bIdx]);
    if (!Number.isFinite(b) || b < 0) b = 0;
    if (b > bins - 1) b = bins - 1;
    const cnt = toNumber(r[cIdx]);
    if (!(cnt > 0)) continue;
    counts[b] += cnt;
    const binMean = toNumber(r[mIdx]);
    const binVar = toNumber(r[vIdx]) || 0;
    const total = n + cnt;
    const delta = binMean - mean;
    mean += (delta * cnt) / total;
    m2 += binVar * cnt + (delta * delta * n * cnt) / total;
    n = total;
  }
  return {
    bins: counts,
    mean: n > 0 ? mean * scale : null,
    std: n > 1 ? Math.sqrt(Math.max(0, m2) / (n - 1)) * scale : null,
  };
}

/**
 * Edge `index` of `binCount` equal bins over [min, max]. Interpolated rather
 * than `min + index * (max - min) / binCount`, which is Infinity for a
 * full-range DOUBLE.
 */
export function histogramBoundary(
  min: number,
  max: number,
  index: number,
  binCount: number,
): number {
  const fraction = index / binCount;
  return min * (1 - fraction) + max * fraction;
}
