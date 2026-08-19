import { describe, it, expect } from 'vitest';
import { reactive } from 'vue';
import { toPlainCellValue } from './arrowValue';

/**
 * Stand-in for Arrow's StructRow: a proxy whose `isExtensible` trap disagrees
 * with its target, which is exactly what makes Vue's `reactive()` throw.
 */
function arrowLikeStructRow(data: Record<string, unknown>) {
  return new Proxy(
    { ...data, toJSON: () => ({ ...data }) },
    {
      isExtensible: () => false,
      get: (t, k) => (t as any)[k],
    },
  );
}

describe('toPlainCellValue', () => {
  it('passes primitives through untouched', () => {
    expect(toPlainCellValue('abc')).toBe('abc');
    expect(toPlainCellValue(42)).toBe(42);
    expect(toPlainCellValue(true)).toBe(true);
    expect(toPlainCellValue(null)).toBe(null);
    expect(toPlainCellValue(undefined)).toBe(undefined);
    expect(toPlainCellValue(10n)).toBe(10n);
  });

  it('leaves dates and binary alone, since both format themselves', () => {
    const d = new Date('2020-01-01T00:00:00Z');
    expect(toPlainCellValue(d)).toBe(d);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toPlainCellValue(bytes)).toBe(bytes);
  });

  it('renders a struct row as JSON text', () => {
    const row = arrowLikeStructRow({ street: 'Main', zip: '12345' });
    expect(toPlainCellValue(row)).toBe('{"street":"Main","zip":"12345"}');
  });

  it('renders a list vector as JSON text', () => {
    const vector = { toArray: () => [1, 2, 3] };
    expect(toPlainCellValue(vector)).toBe('[1,2,3]');
  });

  it('stringifies bigints inside containers rather than throwing', () => {
    const row = arrowLikeStructRow({ id: 9223372036854775807n });
    expect(toPlainCellValue(row)).toBe('{"id":"9223372036854775807"}');
  });

  it('falls back to String() for shapes it cannot serialise', () => {
    const cyclic: any = { toJSON: () => cyclic.self };
    cyclic.self = cyclic;
    expect(typeof toPlainCellValue(cyclic)).toBe('string');
  });

  it('produces values Vue can make reactive — the actual regression', () => {
    const row = arrowLikeStructRow({ street: 'Main' });
    // Guard the premise: the raw Arrow value is what breaks reactive().
    expect(() => reactive({ rows: [[row]] }).rows.map((r) => r[0])).toThrow(/isExtensible/);
    // Flattened, the same value is safe.
    const flattened = toPlainCellValue(row);
    expect(() => reactive({ rows: [[flattened]] }).rows.map((r) => r[0])).not.toThrow();
  });
});
