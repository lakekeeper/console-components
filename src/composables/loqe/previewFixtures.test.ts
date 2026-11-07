// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { ref } from 'vue';
import type { Vector } from 'apache-arrow';
import { createResultValueReader } from './resultValues';
import { numericHistogramQuery } from '../numericProfile';

let db: Awaited<ReturnType<typeof duckdb.createDuckDB>>;
let connection: duckdb.DuckDBConnection;
const fixtureUrl = new URL('../../../examples/table-preview-fixtures/', import.meta.url);

beforeAll(async () => {
  // Load the vendored extensions without network access or writing to ~/.duckdb.
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      response?: ArrayBuffer;
      status = 0;
      extension = '';
      open(_method: string, url: string) {
        this.extension = url.split('/').at(-1) ?? '';
        if (
          !['json.duckdb_extension.wasm', 'parquet.duckdb_extension.wasm'].includes(this.extension)
        )
          throw new Error('Unexpected download');
      }
      send() {
        const bytes = readFileSync(
          new URL(`../../../duckdb-extensions/v1.5.5/wasm_eh/${this.extension}`, import.meta.url),
        );
        this.response = Uint8Array.from(bytes).buffer;
        this.status = 200;
      }
    },
  );
  const require = createRequire(import.meta.url);
  db = await duckdb.createDuckDB(
    {
      mvp: {
        mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'),
        mainWorker: '',
      },
      eh: {
        mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'),
        mainWorker: '',
      },
    },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate();
  await db.open({ allowUnsignedExtensions: true });
  connection = db.connect();
  connection.query('LOAD json');
  connection.query('LOAD parquet');
  connection.query(readFileSync(new URL('common.sql', fixtureUrl), 'utf8'));
  // Execute only local preparation; these tests never attach or modify a remote catalog.
  connection.query(
    readFileSync(new URL('v3.sql', fixtureUrl), 'utf8').split('-- Creation fails')[0],
  );
});

afterAll(() => {
  connection?.close();
  db?.reset();
  vi.unstubAllGlobals();
});

function values(column: string, table = 'table_preview_fixture') {
  const result = connection.query(`SELECT ${column} FROM ${table} ORDER BY id`);
  // The blocking binding bundles its own Arrow version; the vector API is compatible.
  const read = createResultValueReader(result.getChildAt(0) as unknown as Vector | null);
  return Array.from({ length: result.numRows }, (_, i) => read(i));
}

describe('preview fixtures executed in DuckDB WASM', () => {
  it('contains eight samples and exact integer and decimal bounds', () => {
    expect(values('sample')).toEqual([
      'min',
      'max',
      'sample',
      'null',
      'utc',
      'prague_summer',
      'new_york_summer',
      'offset_0530',
    ]);
    expect(values('int_value').slice(0, 4)).toEqual([-2147483648, 2147483647, 0, null]);
    expect(values('long_value').slice(0, 4)).toEqual([
      -9223372036854775808n,
      9223372036854775807n,
      0n,
      null,
    ]);
    expect(values('decimal_value::VARCHAR').slice(0, 2)).toEqual([
      '-99999999999999999999999999999.999999999',
      '99999999999999999999999999999.999999999',
    ]);
  });

  it('stores finite floating-point extrema and profiles them without overflow', () => {
    expect(values('float_value').slice(0, 2)).toEqual([
      -Math.fround(3.4028234663852886e38),
      Math.fround(3.4028234663852886e38),
    ]);
    expect(values('double_value').slice(0, 2)).toEqual([-Number.MAX_VALUE, Number.MAX_VALUE]);
    for (const [column, limit] of [
      ['int_value', 2147483648],
      ['long_value', 9223372036854775808],
      ['float_value', Math.fround(3.4028234663852886e38)],
      ['double_value', Number.MAX_VALUE],
    ] as const) {
      const source = `(SELECT ${column} AS c FROM table_preview_fixture WHERE id <= 2)`;
      const rows = connection.query(numericHistogramQuery(source, -limit, limit, 24)).toArray();
      expect(rows.map((row) => [Number(row.b), Number(row.cnt)])).toEqual([
        [0, 1],
        [23, 1],
      ]);
    }
  });

  it('preserves microseconds and normalizes time-zone offsets to UTC', () => {
    expect(values('timestamp_value').slice(0, 4)).toEqual([
      '0001-01-01T00:00:00.000000',
      '9999-12-31T23:59:59.999999',
      '2026-09-08T12:30:45.123456',
      null,
    ]);
    expect(values('timestamptz_value')).toEqual([
      '0001-01-01T00:00:00.000000Z',
      '9999-12-31T23:59:59.999999Z',
      '2026-09-08T12:30:45.123456Z',
      null,
      '2026-09-08T12:30:45.123456Z',
      '2026-09-08T10:30:45.123456Z',
      '2026-09-08T16:30:45.123456Z',
      '2026-09-08T07:00:45.123456Z',
    ]);
  });

  it('renders nested extrema safely through Vue reactivity', () => {
    const reactive = ref({
      list: values('list_value'),
      map: values('map_value'),
      struct: values('struct_value'),
    });
    expect(JSON.parse(reactive.value.list[1] as string)).toEqual([-2147483648, null, 2147483647]);
    expect(JSON.parse(reactive.value.map[1] as string)).toEqual({
      min: '-9223372036854775808',
      max: '9223372036854775807',
      missing: null,
    });
    expect(JSON.parse(reactive.value.struct[1] as string)).toEqual({
      name: 'max',
      value: 2147483647,
    });
    expect(reactive.value.list[3]).toBeNull();
  });

  it('preserves all nine fractional digits for v3 timestamps', () => {
    expect(values('timestamp_ns_value', 'table_preview_fixture_v3').slice(0, 4)).toEqual([
      '1678-01-01T00:00:00.000000000',
      '2262-04-11T23:47:16.854775806',
      '2026-09-08T12:30:45.123456789',
      null,
    ]);
  });

  it('supports v3 variants with exact integers, mixed arrays, JSON null and SQL NULL', () => {
    expect(values('variant_value::JSON::VARCHAR', 'table_preview_fixture_v3').slice(0, 5)).toEqual([
      '{"int":-2147483648,"long":-9223372036854775808}',
      '{"int":2147483647,"long":9223372036854775807}',
      '["different shape",2,true,null,{"items":[1,2]}]',
      'null',
      'null',
    ]);
    expect(values('variant_value IS NULL', 'table_preview_fixture_v3').slice(0, 5)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('writes and reads both fixture datasets as Parquet in WASM without losing bounds', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lakekeeper-preview-parquet-'));
    try {
      for (const table of ['table_preview_fixture', 'table_preview_fixture_v3']) {
        const file = join(directory, `${table}.parquet`).replaceAll("'", "''");
        connection.query(`COPY ${table} TO '${file}' (FORMAT PARQUET)`);
        const columns = [
          'id',
          'int_value',
          'long_value',
          'float_value',
          'double_value',
          'decimal_value',
          'date_value',
          'time_value',
          'timestamp_value',
          'timestamptz_value',
          'uuid_value',
          'binary_value',
          'list_value',
          'map_value',
          'struct_value',
        ];
        if (table.endsWith('_v3')) columns.push('timestamp_ns_value', 'variant_value::JSON');
        const projection = columns.map((column, i) => `${column}::VARCHAR AS c${i}`).join(', ');
        const expected = connection
          .query(`SELECT ${projection} FROM ${table} ORDER BY id`)
          .toArray()
          .map((row) => row.toJSON());
        const actual = connection
          .query(`SELECT ${projection} FROM read_parquet('${file}') ORDER BY id`)
          .toArray()
          .map((row) => row.toJSON());
        expect(actual).toEqual(expected);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
