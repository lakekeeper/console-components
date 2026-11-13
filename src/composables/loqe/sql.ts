/**
 * SQL text for DuckDB, built so that a name or a value always arrives quoted.
 *
 * Every LoQE entry point that runs SQL takes an `Sql`, and an `Sql` comes only from
 * this module: the `sql` tagged template, whose interpolations must themselves be
 * `Sql`, the quoting helpers (`ident`, `literal`, `num`, `keyword`), and `userSql`
 * for text the user typed. The tag also refuses an interpolation that would land
 * inside a string, a quoted identifier or a comment of the surrounding text.
 */

class Sql {
  readonly #text: string;

  constructor(text: string) {
    // DuckDB-WASM ends a statement at a NUL character.
    if (text.includes('\0')) throw new SyntaxError('SQL text must not contain a NUL character');
    this.#text = text;
    // Frozen: also keeps Vue from wrapping it in a proxy, which has no `#text`.
    Object.freeze(this);
  }

  static is(value: unknown): value is Sql {
    return typeof value === 'object' && value !== null && #text in value;
  }

  toString(): string {
    return this.#text;
  }
}

export type { Sql };

/** The text to send to DuckDB. Throws for anything that was not built by this module. */
export function sqlText(statement: Sql): string {
  if (!Sql.is(statement)) {
    throw new TypeError('Expected SQL built with the `sql` template or `userSql`');
  }
  return statement.toString();
}

// ── Lexing ────────────────────────────────────────────────────────────

/** A character that continues a word (identifier, keyword, number or `$1` parameter). */
function isWordChar(c: string | undefined): boolean {
  return c !== undefined && (/[\w$]/.test(c) || c >= '\u0080');
}

const DOLLAR_DELIMITER = /\$(?:[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$/y;

/** Index after the quote that closes the quoted text opening at `start`, or -1. */
function closeQuoted(text: string, start: number, quote: string, backslash: boolean): number {
  for (let j = start + 1; j < text.length; j++) {
    if (backslash && text[j] === '\\') j++;
    else if (text[j] === quote) {
      if (text[j + 1] !== quote) return j + 1;
      j++;
    }
  }
  return -1;
}

/** Index after the `*\/` that closes the (possibly nested) block comment at `start`, or -1. */
function closeBlockComment(text: string, start: number): number {
  let depth = 0;
  for (let j = start; j < text.length - 1; j++) {
    if (text[j] === '/' && text[j + 1] === '*') {
      depth++;
      j++;
    } else if (text[j] === '*' && text[j + 1] === '/') {
      depth--;
      j++;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

/**
 * Walk `text` with DuckDB's rules for strings (`'…'`, `E'…'` with backslash
 * escapes), quoted identifiers, `--` and nested `/* *\/` comments, and
 * dollar-quoted strings. Calls `code(i)` for every offset that is outside all of
 * them, and returns whether the text ends outside them.
 */
function scan(text: string, code: (i: number) => void): boolean {
  let i = 0;
  while (i < text.length) {
    code(i);
    const c = text[i];
    let end = i + 1;
    if (c === "'") {
      const escapes = /[Ee]/.test(text[i - 1] ?? '') && !isWordChar(text[i - 2]);
      end = closeQuoted(text, i, "'", escapes);
    } else if (c === '"') {
      end = closeQuoted(text, i, '"', false);
    } else if (c === '-' && text[i + 1] === '-') {
      end = i + 2;
      while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end++;
      if (end === text.length) end = -1;
    } else if (c === '/' && text[i + 1] === '*') {
      end = closeBlockComment(text, i);
    } else if (c === '$' && !isWordChar(text[i - 1])) {
      DOLLAR_DELIMITER.lastIndex = i;
      const delimiter = DOLLAR_DELIMITER.exec(text)?.[0];
      if (delimiter) {
        const close = text.indexOf(delimiter, i + delimiter.length);
        end = close === -1 ? -1 : close + delimiter.length;
      }
    }
    if (end === -1) return false;
    i = end;
  }
  return true;
}

/**
 * `statics[0] + fragments[0] + statics[1] + …` as one `Sql`. Each fragment must
 * start and end outside any string, quoted identifier or comment of the result,
 * and must not run into a word next to it (`E` + `'…'` is a string with
 * backslash escapes).
 */
function compose(statics: readonly string[], fragments: readonly Sql[]): Sql {
  let text = statics[0];
  const bounds: number[] = [];
  fragments.forEach((fragment, i) => {
    bounds.push(text.length);
    text += sqlText(fragment);
    bounds.push(text.length);
    text += statics[i + 1];
  });
  if (bounds.length === 0) return new Sql(text);

  const code = new Set<number>();
  const endsInCode = scan(text, (i) => code.add(i));
  for (const at of bounds) {
    const inCode = at === text.length ? endsInCode : code.has(at);
    if (!inCode) {
      throw new SyntaxError(
        `SQL fragment inside a string, quoted identifier or comment at offset ${at}`,
      );
    }
    if (isWordChar(text[at - 1]) && /['"$]/.test(text[at] ?? '')) {
      throw new SyntaxError(`SQL fragment runs into the word before it at offset ${at}`);
    }
  }
  return new Sql(text);
}

// ── Builders ──────────────────────────────────────────────────────────

/**
 * Tagged template for SQL: `` sql`SELECT * FROM ${ident(a, b)} WHERE x = ${literal(v)}` ``.
 * Every interpolation must be an `Sql` — a plain string does not type-check and
 * throws at runtime.
 */
export function sql(strings: TemplateStringsArray, ...values: Sql[]): Sql {
  return compose(strings, values);
}

/** `parts` joined by `separator`, by default `, `. */
export function join(parts: readonly Sql[], separator: Sql = sql`, `): Sql {
  const fragments = parts.flatMap((part, i) => (i > 0 ? [separator, part] : [part]));
  return compose(new Array<string>(fragments.length + 1).fill(''), fragments);
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new TypeError(`${what} must be a string`);
  return value;
}

/** `"a"."b"`: each part quoted as an identifier, joined by `.`. */
export function ident(...parts: string[]): Sql {
  if (parts.length === 0) throw new TypeError('ident needs at least one part');
  return new Sql(
    parts.map((p) => `"${requireString(p, 'An identifier').replace(/"/g, '""')}"`).join('.'),
  );
}

/** `'it''s'`: a string literal. */
export function literal(value: string): Sql {
  return new Sql(`'${requireString(value, 'A literal').replace(/'/g, "''")}'`);
}

/** A number literal. Throws for NaN and infinities. */
export function num(value: number | bigint): Sql {
  if (typeof value === 'bigint') return new Sql(value.toString());
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`Not a finite number: ${String(value)}`);
  }
  return new Sql(String(value));
}

const KEYWORD = /^[A-Za-z_][A-Za-z0-9_]*(?:\(\d+(?:,\s*\d+)*\)|\[\d+\])?$/;

/** Whether `word` can be written as a `keyword`. */
export function isKeyword(word: string): boolean {
  return KEYWORD.test(word);
}

/**
 * A bare word such as a keyword or a type name, with numeric arguments if it has
 * any, as Iceberg writes them: `long`, `decimal(10, 2)`, `fixed[16]`, `bucket[8]`.
 */
export function keyword(word: string): Sql {
  if (!isKeyword(requireString(word, 'A keyword'))) {
    throw new SyntaxError(`Not a plain word: ${JSON.stringify(word)}`);
  }
  return new Sql(word);
}

/** A `--` comment holding `text` on one line, ending with the line break. */
export function lineComment(text: string): Sql {
  return new Sql(`-- ${requireString(text, 'A comment').replace(/[\r\n\0]+/g, ' ')}\n`);
}

/**
 * A table or view as LoQE names it: `"warehouse"."ns1.ns2"."table"`. The
 * namespace levels arrive separated by `\x1F`, as in catalog API paths, and form
 * one identifier joined by `.`, the schema name DuckDB's Iceberg extension uses.
 */
export function tableIdent(warehouse: string, namespaceId: string, name: string): Sql {
  return ident(warehouse, namespaceId.split('\x1F').join('.'), name);
}

/**
 * Text the user typed into the SQL editor, or a whole statement the user chose
 * to run. Never pass text built from catalog data — names, properties, metadata:
 * build that with `sql` and `ident`/`literal` instead.
 */
export function userSql(text: string): Sql {
  return new Sql(requireString(text, 'SQL text'));
}

// ── Statements ────────────────────────────────────────────────────────

export type Statement = {
  sql: Sql;
  /** Offset of the trimmed statement in the source text. */
  from: number;
  to: number;
};

/**
 * Split SQL text into statements on each `;` that is outside strings, quoted
 * identifiers, comments and dollar-quoted strings. Statements are trimmed; empty
 * ones are skipped.
 */
export function splitStatements(text: Sql): Statement[] {
  const source = sqlText(text);
  const cuts: number[] = [];
  scan(source, (i) => {
    if (source[i] === ';') cuts.push(i);
  });
  cuts.push(source.length);

  const statements: Statement[] = [];
  let start = 0;
  for (const cut of cuts) {
    const part = source.slice(start, cut);
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      const from = start + (part.length - part.trimStart().length);
      statements.push({ sql: new Sql(trimmed), from, to: from + trimmed.length });
    }
    start = cut + 1;
  }
  return statements;
}

/**
 * The statement holding `cursor` in `text`. Between two statements the one
 * before the cursor counts, as in other SQL editors; before the first, the first.
 */
export function statementAt(text: Sql, cursor: number): Statement | undefined {
  const statements = splitStatements(text);
  return statements.findLast((s) => s.from <= cursor) ?? statements[0];
}
