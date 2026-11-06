import { describe, expect, it } from 'vitest';
import {
  ident,
  join,
  keyword,
  lineComment,
  literal,
  num,
  splitStatements,
  sql,
  sqlText,
  tableIdent,
  userSql,
} from './sql';

describe('quoting', () => {
  it('quotes identifiers, doubling double quotes, and joins parts with dots', () => {
    expect(sqlText(ident('a'))).toBe('"a"');
    expect(sqlText(ident('we"ird;name'))).toBe('"we""ird;name"');
    expect(sqlText(ident('wh', 'a.b', 't'))).toBe('"wh"."a.b"."t"');
  });

  it('quotes string literals, doubling single quotes and nothing else', () => {
    expect(sqlText(literal("it's"))).toBe("'it''s'");
    expect(sqlText(literal('a\\b'))).toBe("'a\\b'");
  });

  it('writes finite numbers and refuses the rest', () => {
    expect(sqlText(num(-1.5))).toBe('-1.5');
    expect(sqlText(num(12345678901234567890n))).toBe('12345678901234567890');
    expect(() => num(NaN)).toThrow(RangeError);
    expect(() => num(Infinity)).toThrow(RangeError);
  });

  it('takes only plain words as keywords', () => {
    expect(sqlText(keyword('decimal(10, 2)'))).toBe('decimal(10, 2)');
    expect(sqlText(keyword('fixed[16]'))).toBe('fixed[16]');
    expect(() => keyword('long; DROP')).toThrow(SyntaxError);
    expect(() => keyword('a b')).toThrow(SyntaxError);
  });

  it('keeps a comment on one line', () => {
    expect(sqlText(lineComment('a\nb\r\nc\0'))).toBe('-- a b c \n');
  });

  it('refuses a NUL character, which would end the statement early', () => {
    expect(() => ident('a\0b')).toThrow(SyntaxError);
    expect(() => literal('a\0b')).toThrow(SyntaxError);
  });

  it('names a table in a nested namespace with one identifier for the namespace', () => {
    expect(sqlText(tableIdent('wh', 'a\x1Fb', 't'))).toBe('"wh"."a.b"."t"');
  });
});

describe('sql template', () => {
  it('composes fragments, nested ones included', () => {
    const where = join([sql`a = ${literal('x')}`, sql`b = ${num(2)}`], sql` AND `);
    expect(sqlText(sql`SELECT * FROM ${ident('t')} WHERE ${where}`)).toBe(
      `SELECT * FROM "t" WHERE a = 'x' AND b = 2`,
    );
  });

  it('keeps a name with quotes and semicolons inside one identifier', () => {
    const path = tableIdent('wh"; DROP', 'ns;x', `t"'--`);
    const query = sql`SELECT * FROM ${path} LIMIT 50`;
    expect(splitStatements(query).map((s) => sqlText(s.sql))).toEqual([sqlText(query)]);
  });

  it('accepts only Sql, by type and at runtime', () => {
    // @ts-expect-error a plain string is not Sql
    expect(() => sql`SELECT ${'1'}`).toThrow(TypeError);
    // @ts-expect-error a plain string is not Sql
    expect(() => sqlText('SELECT 1')).toThrow(TypeError);
  });

  it('refuses a fragment inside a string, a quoted identifier or a comment', () => {
    expect(() => sql`SELECT '${literal('x')}'`).toThrow(SyntaxError);
    expect(() => sql`SELECT "${ident('x')}"`).toThrow(SyntaxError);
    expect(() => sql`SELECT 1 -- ${ident('x')}`).toThrow(SyntaxError);
    expect(() => sql`SELECT /* ${ident('x')} */ 1`).toThrow(SyntaxError);
    // `-` before `-1` would start a comment.
    expect(() => sql`SELECT 1 -${num(-1)}`).toThrow(SyntaxError);
  });

  it('refuses a fragment that would run into the word before it', () => {
    // E'…' is a string with backslash escapes.
    expect(() => sql`SELECT E${literal('\\')}`).toThrow(SyntaxError);
  });
});

describe('splitStatements', () => {
  const split = (text: string) => splitStatements(userSql(text)).map((s) => sqlText(s.sql));

  it('trims statements and reports their offsets in the source', () => {
    const source = '  SELECT 1;\n\nSELECT 2 ;  ;\n  SELECT 3  ';
    const statements = splitStatements(userSql(source));
    expect(statements.map(({ sql, from, to }) => [sqlText(sql), from, to])).toEqual([
      ['SELECT 1', 2, 10],
      ['SELECT 2', 13, 21],
      ['SELECT 3', 29, 37],
    ]);
  });

  it('splits only on semicolons outside quotes and comments', () => {
    const statements = [
      `SELECT 'a;b', 'it''s;'`,
      `SELECT E'\\';'`,
      `SELECT 1 AS "x;""y"`,
      'SELECT 1 -- ;\n',
      'SELECT /* ; /* ; */ ; */ 1',
      'SELECT $$;$$, $t$;$$;$t$',
    ];
    expect(split(statements.join(';'))).toEqual(statements.map((s) => s.trim()));
  });

  it('keeps an unterminated quote or comment to the end', () => {
    expect(split(`SELECT 'a; SELECT 2`)).toEqual([`SELECT 'a; SELECT 2`]);
    expect(split('SELECT 1; -- a; b')).toEqual(['SELECT 1', '-- a; b']);
  });
});
