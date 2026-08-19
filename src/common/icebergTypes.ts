/**
 * Iceberg schema types, and a parser from the compact type syntax people write
 * (`struct<a:int,b:string>`) to the JSON the REST catalog expects.
 *
 * Creating a table through the catalog means building the schema ourselves,
 * where DuckDB's `CREATE TABLE` used to infer it. That is what unlocks nested
 * and v3-only types: DuckDB SQL cannot express `variant` or `geometry` at all.
 */

/** Primitives available in every format version. */
export const V2_PRIMITIVE_TYPES = [
  'boolean',
  'int',
  'long',
  'float',
  'double',
  'decimal(10,2)',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'string',
  'uuid',
  'fixed[16]',
  'binary',
];

/**
 * Primitives the spec introduced in v3. Offering them on a v2 table produces a
 * table the catalog refuses, so they appear only when v3 is selected.
 */
export const V3_PRIMITIVE_TYPES = [
  'timestamp_ns',
  'timestamptz_ns',
  'variant',
  'geometry',
  'geography',
  'unknown',
];

/**
 * Starters for the nested types, offered alongside the primitives.
 *
 * A container has no single canonical form to pick from a list, so these are
 * valid, complete expressions meant to be edited: choosing one and changing the
 * member names is easier to discover than knowing the syntax up front.
 */
export const CONTAINER_TYPE_TEMPLATES = [
  'struct<field:string>',
  'list<string>',
  'map<string,string>',
];

/** Bases accepted without parameters. */
const V2_BASES = new Set([
  'boolean',
  'int',
  'long',
  'float',
  'double',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'string',
  'uuid',
  'binary',
]);

const V3_BASES = new Set(V3_PRIMITIVE_TYPES);

export interface IcebergField {
  id: number;
  name: string;
  required: boolean;
  type: any;
  doc?: string;
}

interface Cursor {
  s: string;
  i: number;
}

/** Assigns the schema-unique field ids Iceberg requires. */
export interface IdAllocator {
  next: () => number;
}

export function createIdAllocator(start = 1): IdAllocator {
  let n = start;
  return { next: () => n++ };
}

function skipWs(c: Cursor) {
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++;
}

function expect(c: Cursor, ch: string) {
  skipWs(c);
  if (c.s[c.i] !== ch) {
    throw new Error(`Expected '${ch}' at position ${c.i}`);
  }
  c.i++;
}

function readIdent(c: Cursor): string {
  skipWs(c);
  const start = c.i;
  while (c.i < c.s.length && /[A-Za-z0-9_]/.test(c.s[c.i])) c.i++;
  if (c.i === start) throw new Error(`Expected a name at position ${start}`);
  return c.s.slice(start, c.i);
}

/**
 * Reads one primitive, including its parameters.
 *
 * Parameters are consumed here rather than by splitting on commas, because
 * `decimal(10,2)` contains one.
 */
function readPrimitive(c: Cursor, maxVersion: number): string {
  const base = readIdent(c).toLowerCase();

  if (base === 'decimal') {
    expect(c, '(');
    const precision = readIdent(c);
    expect(c, ',');
    const scale = readIdent(c);
    expect(c, ')');
    if (!/^\d+$/.test(precision) || !/^\d+$/.test(scale)) {
      throw new Error('decimal expects decimal(precision,scale), e.g. decimal(10,2)');
    }
    return `decimal(${precision},${scale})`;
  }

  if (base === 'fixed') {
    // Iceberg's JSON form is fixed[16]; SQL-style fixed(16) is accepted as a
    // convenience since that is what the old DuckDB-backed dialog showed.
    const open = c.s[c.i] === '(' ? '(' : '[';
    const close = open === '(' ? ')' : ']';
    expect(c, open);
    const length = readIdent(c);
    expect(c, close);
    if (!/^\d+$/.test(length)) throw new Error('fixed expects fixed[length], e.g. fixed[16]');
    return `fixed[${length}]`;
  }

  if (V2_BASES.has(base)) return base;

  if (V3_BASES.has(base)) {
    if (maxVersion < 3) {
      throw new Error(`'${base}' requires format version 3`);
    }
    return base;
  }

  throw new Error(`Unknown type '${base}'`);
}

/**
 * Nested members default to optional.
 *
 * Iceberg needs a required flag on every struct field, list element and map
 * value. The compact syntax has nowhere to put one, and optional is the
 * forgiving choice: a required nested field rejects rows that omit it.
 */
function parseType(c: Cursor, ids: IdAllocator, maxVersion: number): any {
  skipWs(c);
  const save = c.i;
  const ident = readIdent(c).toLowerCase();

  if (ident === 'struct') {
    expect(c, '<');
    const fields: IcebergField[] = [];
    for (;;) {
      const name = readIdent(c);
      expect(c, ':');
      const type = parseType(c, ids, maxVersion);
      fields.push({ id: ids.next(), name, required: false, type });
      skipWs(c);
      if (c.s[c.i] === ',') {
        c.i++;
        continue;
      }
      break;
    }
    expect(c, '>');
    if (!fields.length) throw new Error('struct needs at least one field');
    return { type: 'struct', fields };
  }

  if (ident === 'list') {
    expect(c, '<');
    const element = parseType(c, ids, maxVersion);
    expect(c, '>');
    return {
      type: 'list',
      'element-id': ids.next(),
      element,
      'element-required': false,
    };
  }

  if (ident === 'map') {
    expect(c, '<');
    const key = parseType(c, ids, maxVersion);
    expect(c, ',');
    const value = parseType(c, ids, maxVersion);
    expect(c, '>');
    return {
      type: 'map',
      'key-id': ids.next(),
      key,
      'value-id': ids.next(),
      value,
      'value-required': false,
    };
  }

  // Not a container — re-read from the start so parameters are consumed.
  c.i = save;
  return readPrimitive(c, maxVersion);
}

/**
 * Parses one type expression. Throws with a human-readable reason, which the
 * dialog surfaces against the offending field.
 */
export function parseIcebergType(expr: string, ids: IdAllocator, maxVersion: number): any {
  const c: Cursor = { s: expr.trim(), i: 0 };
  if (!c.s) throw new Error('Type is required');
  const type = parseType(c, ids, maxVersion);
  skipWs(c);
  if (c.i < c.s.length) throw new Error(`Unexpected '${c.s.slice(c.i)}'`);
  return type;
}

/* ── Builder model ──────────────────────────────────────────────────────────
 *
 * What the schema editor manipulates. A tree rather than a type string, so
 * nested types are built by clicking and every member gets its own required
 * flag — which the compact syntax has nowhere to express.
 */

export type TypeNode =
  | { kind: 'primitive'; type: string }
  | { kind: 'struct'; fields: SchemaField[] }
  | { kind: 'list'; element: TypeNode; elementNullable: boolean }
  | { kind: 'map'; key: TypeNode; value: TypeNode; valueNullable: boolean };

export interface SchemaField {
  name: string;
  doc: string;
  nullable: boolean;
  type: TypeNode;
}

export function primitiveNode(type = 'string'): TypeNode {
  return { kind: 'primitive', type };
}

export function newSchemaField(): SchemaField {
  return { name: '', doc: '', nullable: true, type: primitiveNode() };
}

/**
 * A node of the requested kind, preserving nothing from the old one: switching
 * kind is a deliberate change, and carrying over a half-built subtree is more
 * confusing than starting clean.
 */
export function nodeForKind(kind: TypeNode['kind']): TypeNode {
  switch (kind) {
    case 'struct':
      return { kind: 'struct', fields: [newSchemaField()] };
    case 'list':
      return { kind: 'list', element: primitiveNode(), elementNullable: true };
    case 'map':
      // Map keys are required by the spec, so only the value carries a flag.
      return {
        kind: 'map',
        key: primitiveNode(),
        value: primitiveNode(),
        valueNullable: true,
      };
    default:
      return primitiveNode();
  }
}

/** Converts a builder node to the JSON the REST catalog expects. */
export function typeNodeToIceberg(node: TypeNode, ids: IdAllocator): any {
  switch (node.kind) {
    case 'struct':
      return {
        type: 'struct',
        fields: node.fields.map((f) => fieldToIceberg(f, ids)),
      };
    case 'list':
      return {
        type: 'list',
        'element-id': ids.next(),
        element: typeNodeToIceberg(node.element, ids),
        'element-required': !node.elementNullable,
      };
    case 'map':
      return {
        type: 'map',
        'key-id': ids.next(),
        key: typeNodeToIceberg(node.key, ids),
        'value-id': ids.next(),
        value: typeNodeToIceberg(node.value, ids),
        'value-required': !node.valueNullable,
      };
    default:
      return node.type;
  }
}

function fieldToIceberg(field: SchemaField, ids: IdAllocator): IcebergField {
  const out: IcebergField = {
    id: ids.next(),
    name: field.name.trim(),
    required: !field.nullable,
    type: typeNodeToIceberg(field.type, ids),
  };
  if (field.doc?.trim()) out.doc = field.doc.trim();
  return out;
}

/** The whole schema, with ids unique across every level. */
export function buildSchema(fields: SchemaField[]): Record<string, any> {
  const ids = createIdAllocator();
  return {
    type: 'struct',
    'schema-id': 0,
    fields: fields.map((f) => fieldToIceberg(f, ids)),
  };
}

/**
 * Which primitives a node tree uses that the given version does not allow.
 * Reported rather than silently rewritten, so lowering the version does not
 * quietly change a column's type.
 */
export function unsupportedPrimitives(fields: SchemaField[], version: number): string[] {
  if (version >= 3) return [];
  const found = new Set<string>();
  const walkNode = (n: TypeNode) => {
    if (n.kind === 'primitive') {
      if (V3_BASES.has(n.type)) found.add(n.type);
      return;
    }
    if (n.kind === 'struct') n.fields.forEach((f) => walkNode(f.type));
    if (n.kind === 'list') walkNode(n.element);
    if (n.kind === 'map') {
      walkNode(n.key);
      walkNode(n.value);
    }
  };
  fields.forEach((f) => walkNode(f.type));
  return [...found];
}

/** Compact one-line summary of a builder node, e.g. `map<string,list<int>>`. */
export function formatTypeNode(node: TypeNode): string {
  switch (node.kind) {
    case 'struct':
      return `struct<${node.fields
        .map((f) => `${f.name || '?'}:${formatTypeNode(f.type)}`)
        .join(',')}>`;
    case 'list':
      return `list<${formatTypeNode(node.element)}>`;
    case 'map':
      return `map<${formatTypeNode(node.key)},${formatTypeNode(node.value)}>`;
    default:
      return node.type;
  }
}

/** Renders a parsed type back to the compact syntax, for previews. */
export function formatIcebergType(type: any): string {
  if (typeof type === 'string') return type;
  if (type?.type === 'struct') {
    return `struct<${type.fields
      .map((f: IcebergField) => `${f.name}:${formatIcebergType(f.type)}`)
      .join(',')}>`;
  }
  if (type?.type === 'list') return `list<${formatIcebergType(type.element)}>`;
  if (type?.type === 'map') {
    return `map<${formatIcebergType(type.key)},${formatIcebergType(type.value)}>`;
  }
  return String(type);
}
