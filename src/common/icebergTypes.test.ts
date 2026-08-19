import { describe, it, expect } from 'vitest';
import {
  buildSchema,
  createIdAllocator,
  formatIcebergType,
  parseIcebergType,
  primitiveNode,
  unsupportedPrimitives,
  type SchemaField,
} from './icebergTypes';

const parse = (expr: string, version = 3) => parseIcebergType(expr, createIdAllocator(), version);

describe('parseIcebergType', () => {
  it('parses plain primitives', () => {
    expect(parse('string')).toBe('string');
    expect(parse('boolean')).toBe('boolean');
    expect(parse(' int ')).toBe('int');
  });

  it('keeps decimal parameters, whose comma must not split the expression', () => {
    expect(parse('decimal(10,2)')).toBe('decimal(10,2)');
    expect(parse('decimal(38, 9)')).toBe('decimal(38,9)');
  });

  it('normalises fixed to the JSON form and accepts the SQL one', () => {
    expect(parse('fixed[16]')).toBe('fixed[16]');
    expect(parse('fixed(16)')).toBe('fixed[16]');
  });

  it('gates v3 primitives on the format version', () => {
    expect(parse('variant', 3)).toBe('variant');
    expect(() => parse('variant', 2)).toThrow(/requires format version 3/);
    expect(() => parse('timestamp_ns', 2)).toThrow(/requires format version 3/);
  });

  it('rejects unknown types', () => {
    expect(() => parse('varchar')).toThrow(/Unknown type/);
  });

  it('parses a struct into fields with unique ids', () => {
    const t = parse('struct<a:int,b:string>');
    expect(t.type).toBe('struct');
    expect(t.fields.map((f: any) => [f.name, f.type])).toEqual([
      ['a', 'int'],
      ['b', 'string'],
    ]);
    expect(t.fields.every((f: any) => f.required === false)).toBe(true);
    expect(new Set(t.fields.map((f: any) => f.id)).size).toBe(2);
  });

  it('parses list and map', () => {
    expect(parse('list<int>')).toMatchObject({ type: 'list', element: 'int' });
    expect(parse('map<string,int>')).toMatchObject({
      type: 'map',
      key: 'string',
      value: 'int',
    });
  });

  it('nests containers, including a decimal inside a map', () => {
    const t = parse('map<string,list<struct<x:decimal(10,2)>>>');
    expect(t.value.element.fields[0].type).toBe('decimal(10,2)');
  });

  it('allocates ids unique across the whole expression', () => {
    const ids = createIdAllocator();
    const t = parseIcebergType('struct<a:list<int>,b:map<string,int>>', ids, 3);
    const seen: number[] = [];
    const walk = (n: any) => {
      if (!n || typeof n === 'string') return;
      if (n.type === 'struct') {
        n.fields.forEach((f: any) => {
          seen.push(f.id);
          walk(f.type);
        });
      }
      if (n.type === 'list') {
        seen.push(n['element-id']);
        walk(n.element);
      }
      if (n.type === 'map') {
        seen.push(n['key-id'], n['value-id']);
        walk(n.key);
        walk(n.value);
      }
    };
    walk(t);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('reports malformed input rather than guessing', () => {
    expect(() => parse('struct<a:int')).toThrow();
    expect(() => parse('list<>')).toThrow();
    expect(() => parse('map<string>')).toThrow();
    expect(() => parse('int extra')).toThrow(/Unexpected/);
    expect(() => parse('')).toThrow(/required/);
  });
});

describe('buildSchema (builder model)', () => {
  const field = (name: string, type: any, nullable = true, doc = ''): SchemaField => ({
    name,
    doc,
    nullable,
    type,
  });

  it('maps nullable to Iceberg required, inverted', () => {
    const schema = buildSchema([
      field('a', primitiveNode('int'), true),
      field('b', primitiveNode('string'), false),
    ]);
    expect(schema.fields.map((f: any) => [f.name, f.required])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('emits doc only when set', () => {
    const schema = buildSchema([
      field('a', primitiveNode('int'), true, ' counts '),
      field('b', primitiveNode('int'), true, '   '),
    ]);
    expect(schema.fields[0].doc).toBe('counts');
    expect(schema.fields[1]).not.toHaveProperty('doc');
  });

  it('assigns ids unique across every nesting level', () => {
    const schema = buildSchema([
      field('s', {
        kind: 'struct',
        fields: [field('inner', primitiveNode('int'))],
      }),
      field('l', { kind: 'list', element: primitiveNode('int'), elementNullable: true }),
      field('m', {
        kind: 'map',
        key: primitiveNode('string'),
        value: { kind: 'list', element: primitiveNode('int'), elementNullable: false },
        valueNullable: true,
      }),
    ]);
    const ids: number[] = [];
    const walk = (n: any) => {
      if (!n || typeof n === 'string') return;
      if (n.type === 'struct') {
        n.fields.forEach((f: any) => {
          ids.push(f.id);
          walk(f.type);
        });
      }
      if (n.type === 'list') {
        ids.push(n['element-id']);
        walk(n.element);
      }
      if (n.type === 'map') {
        ids.push(n['key-id'], n['value-id']);
        walk(n.key);
        walk(n.value);
      }
    };
    walk(schema);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries element-required and value-required from the nullable flags', () => {
    const schema = buildSchema([
      field('l', { kind: 'list', element: primitiveNode('int'), elementNullable: false }),
      field('m', {
        kind: 'map',
        key: primitiveNode('string'),
        value: primitiveNode('int'),
        valueNullable: false,
      }),
    ]);
    expect(schema.fields[0].type['element-required']).toBe(true);
    expect(schema.fields[1].type['value-required']).toBe(true);
  });
});

describe('unsupportedPrimitives', () => {
  it('finds v3 types nested at any depth', () => {
    const fields: SchemaField[] = [
      {
        name: 'm',
        doc: '',
        nullable: true,
        type: {
          kind: 'map',
          key: primitiveNode('string'),
          value: {
            kind: 'list',
            element: primitiveNode('variant'),
            elementNullable: true,
          },
          valueNullable: true,
        },
      },
    ];
    expect(unsupportedPrimitives(fields, 2)).toEqual(['variant']);
    expect(unsupportedPrimitives(fields, 3)).toEqual([]);
  });
});

describe('formatIcebergType', () => {
  it('round-trips the compact syntax', () => {
    const expr = 'map<string,list<struct<x:int,y:decimal(10,2)>>>';
    expect(formatIcebergType(parse(expr))).toBe(expr);
  });
});
