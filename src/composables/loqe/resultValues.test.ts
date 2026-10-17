// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  makeData,
  makeVector,
  TimeUnit,
  Timestamp,
  vectorFromArray,
  Int32,
  Int64,
} from 'apache-arrow';
import { createResultValueReader } from './resultValues';

function timestamps(unit: TimeUnit, ticks: bigint[], timezone?: string) {
  return makeVector(
    makeData({ type: new Timestamp(unit, timezone), data: BigInt64Array.from(ticks) }),
  );
}

describe('query result timestamp formatting', () => {
  it.each([
    [TimeUnit.SECOND, 1788870645n, '2026-09-08T12:30:45'],
    [TimeUnit.MILLISECOND, 1788870645123n, '2026-09-08T12:30:45.123'],
    [TimeUnit.MICROSECOND, 1788870645123456n, '2026-09-08T12:30:45.123456'],
    [TimeUnit.NANOSECOND, 1788870645123456789n, '2026-09-08T12:30:45.123456789'],
  ])('preserves precision for unit %s without inventing a timezone', (unit, ticks, expected) => {
    expect(createResultValueReader(timestamps(unit, [ticks]))(0)).toBe(expected);
  });

  it.each(['UTC', 'Europe/Prague'])('displays timezone %s as UTC', (timezone) => {
    const read = createResultValueReader(
      timestamps(TimeUnit.MICROSECOND, [1788870645123456n], timezone),
    );
    expect(read(0)).toBe('2026-09-08T12:30:45.123456Z');
  });

  it.each([
    [TimeUnit.SECOND, '1969-12-31T23:59:59'],
    [TimeUnit.MILLISECOND, '1969-12-31T23:59:59.999'],
    [TimeUnit.MICROSECOND, '1969-12-31T23:59:59.999999'],
    [TimeUnit.NANOSECOND, '1969-12-31T23:59:59.999999999'],
  ])('handles negative ticks for unit %s', (unit, expected) => {
    expect(createResultValueReader(timestamps(unit, [-1n]))(0)).toBe(expected);
  });

  it('pads fractional seconds with zeros', () => {
    expect(createResultValueReader(timestamps(TimeUnit.NANOSECOND, [1n]))(0)).toBe(
      '1970-01-01T00:00:00.000000001',
    );
  });

  it('reads sliced, nullable, multiple record batches without using the wrong offset', () => {
    const first = makeVector(
      makeData({
        type: new Timestamp(TimeUnit.MICROSECOND),
        data: BigInt64Array.from([0n, 1n, 2n, 3n]),
        nullBitmap: Uint8Array.from([0b1101]),
        nullCount: 1,
      }),
    ).slice(1, 4);
    const second = timestamps(TimeUnit.MICROSECOND, [-1n, 0n]).slice(0, 1);
    const read = createResultValueReader(first.concat(second));
    expect([0, 1, 2, 3].map(read)).toEqual([
      null,
      '1970-01-01T00:00:00.000002',
      '1970-01-01T00:00:00.000003',
      '1969-12-31T23:59:59.999999',
    ]);
    expect(read(1)).toBe('1970-01-01T00:00:00.000002');
  });

  it('formats the full signed 64-bit nanosecond range', () => {
    const read = createResultValueReader(
      timestamps(TimeUnit.NANOSECOND, [-9223372036854775808n, 9223372036854775807n], 'UTC'),
    );
    expect(read(0)).toBe('1677-09-21T00:12:43.145224192Z');
    expect(read(1)).toBe('2262-04-11T23:47:16.854775807Z');
  });

  it('does not interpret ordinary numbers or bigint values as timestamps', () => {
    expect(createResultValueReader(vectorFromArray([1788870645, null], new Int32()))(0)).toBe(
      1788870645,
    );
    expect(createResultValueReader(vectorFromArray([1788870645, null], new Int32()))(1)).toBeNull();
    expect(createResultValueReader(vectorFromArray([9223372036854775807n], new Int64()))(0)).toBe(
      9223372036854775807n,
    );
    expect(createResultValueReader(null)(0)).toBeUndefined();
  });
});
