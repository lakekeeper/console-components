export function numericProfileScale(min: number, max: number): number {
  return Math.max(Math.abs(min), Math.abs(max)) || 1;
}

/** Cast before arithmetic and normalize to avoid integer and DOUBLE overflow. */
export function numericSummaryQuery(source: string, scale: number): string {
  return `SELECT avg(c::DOUBLE / ${scale}) * ${scale} AS mean_v,
                 stddev_samp(c::DOUBLE / ${scale}) * ${scale} AS stddev_v
          FROM ${source}`;
}

export function numericHistogramQuery(
  source: string,
  min: number,
  max: number,
  binCount: number,
): string {
  const scale = numericProfileScale(min, max);
  const scaledMin = min / scale;
  const width = (max / scale - scaledMin) / binCount;
  return `SELECT least(${binCount - 1}, greatest(0,
                 floor((c::DOUBLE / ${scale} - (${scaledMin})) / ${width}))) AS b,
                 count(*) AS cnt
          FROM ${source} WHERE c IS NOT NULL GROUP BY b ORDER BY b`;
}

/** Convex interpolation avoids max - min overflowing for full-range DOUBLEs. */
export function histogramBoundary(
  min: number,
  max: number,
  index: number,
  binCount: number,
): number {
  const fraction = index / binCount;
  return min * (1 - fraction) + max * fraction;
}
