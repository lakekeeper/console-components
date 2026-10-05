// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { Field, Int32, Int64, List, Map_, Struct, Utf8, vectorFromArray } from 'apache-arrow';
import { createResultValueReader } from './resultValues';

const mapType = new Map_<Utf8, Int64>(
  new Field(
    'entries',
    new Struct([new Field('key', new Utf8(), false), new Field('value', new Int64(), true)]),
  ),
);

describe('nested Arrow query results', () => {
  it('makes StructRow safe for Vue and preserves strings and 64-bit integers', () => {
    const vector = vectorFromArray(
      [{ name: 'Příliš "žluťoučký"\n🦆', value: 9223372036854775807n }, null],
      new Struct([new Field('name', new Utf8()), new Field('value', new Int64())]),
    );
    const read = createResultValueReader(vector);
    const results = ref({ rows: [[read(0)], [read(1)]] });
    expect(JSON.parse(String(results.value.rows[0][0]))).toEqual({
      name: 'Příliš "žluťoučký"\n🦆',
      value: '9223372036854775807',
    });
    expect(results.value.rows[1][0]).toBeNull();
  });

  it('makes MapRow safe for Vue, including empty maps and nulls', () => {
    const vector = vectorFromArray(
      [
        new Map([
          ['min', -9223372036854775808n],
          ['missing', null],
        ]),
        new Map(),
        null,
      ],
      mapType,
    );
    const read = createResultValueReader(vector);
    const results = ref({ rows: [0, 1, 2].map((i) => [read(i)]) });
    expect(JSON.parse(String(results.value.rows[0][0]))).toEqual({
      min: '-9223372036854775808',
      missing: null,
    });
    expect(results.value.rows[1][0]).toBe('{}');
    expect(results.value.rows[2][0]).toBeNull();
  });

  it('produces valid JSON for nullable lists and empty lists', () => {
    const read = createResultValueReader(
      vectorFromArray([[1, null, -3], [], null], new List(new Field('item', new Int32(), true))),
    );
    expect([0, 1, 2].map(read)).toEqual(['[1,null,-3]', '[]', null]);
  });

  it('removes proxies recursively inside a list of structs', () => {
    const type = new List(new Field('item', new Struct([new Field('values', mapType)]), true));
    const read = createResultValueReader(
      vectorFromArray([[{ values: new Map([['max', 9223372036854775807n]]) }]], type),
    );
    const results = ref({ rows: [[read(0)]] });
    expect(JSON.parse(String(results.value.rows[0][0]))).toEqual([
      { values: { max: '9223372036854775807' } },
    ]);
  });
});
