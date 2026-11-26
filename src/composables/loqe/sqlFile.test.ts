import { describe, expect, it } from 'vitest';
import {
  isSqlFile,
  runFileName,
  runHeader,
  runToSql,
  runsFileName,
  runsToSql,
  slugify,
  sqlFromFile,
  stamp,
  tabFileName,
  tabNameFromFile,
  tabToSql,
} from './sqlFile';

// Local time, so the stamps below hold in any time zone.
const at = new Date(2026, 10, 15, 16, 2, 41).getTime();
const run = {
  sql: '  SELECT 42 AS answer;\n',
  executedAt: at,
  durationMs: 38.6,
  rowCount: 1,
  name: 'the answer',
};

describe('header', () => {
  it('stamps local time to the minute', () => {
    expect(stamp(at)).toBe('2026-11-15 16:02');
  });

  it('writes name and run lines for a named run', () => {
    expect(runToSql(run)).toBe(
      '-- name: the answer\n' +
        '-- run: 2026-11-15 16:02 · 1 row · 39 ms · succeeded\n' +
        'SELECT 42 AS answer;\n',
    );
  });

  it('leaves out the name line for an unnamed run, and the rows for a failed one', () => {
    expect(runHeader({ ...run, name: undefined, error: 'boom', durationMs: 1500 })).toEqual([
      '-- run: 2026-11-15 16:02 · 1.5 s · failed',
    ]);
  });

  it('pluralises rows', () => {
    expect(runHeader({ ...run, rowCount: 1200 })[1]).toContain('1200 rows');
  });

  it('keeps a name with line breaks on one comment line', () => {
    expect(runHeader({ ...run, name: 'a\nDROP TABLE x' })[0]).toBe('-- name: a DROP TABLE x');
    expect(tabToSql('x\r\ny', 'SELECT 1')).toBe('-- name: x y\nSELECT 1\n');
  });

  it('writes a tab with only its name', () => {
    expect(tabToSql('Query 1', 'SELECT 1;')).toBe('-- name: Query 1\nSELECT 1;\n');
  });
});

describe('several runs', () => {
  it('puts them oldest first, a blank line between', () => {
    const later = { ...run, name: 'later', sql: 'SELECT 2;', executedAt: at + 60_000 };
    expect(runsToSql([later, run])).toBe(runToSql(run) + '\n' + runToSql(later));
  });

  it('ends every run with a delimiter, so the file stays a valid script', () => {
    const a = { ...run, name: 'a', sql: 'SELECT 1', executedAt: at };
    const b = { ...run, name: 'b', sql: 'SELECT 2 -- two', executedAt: at + 60_000 };
    const file = runsToSql([a, b]);
    // On its own line, so the trailing comment of b cannot hide it.
    expect(file).toContain('SELECT 1\n;\n');
    expect(file).toContain('SELECT 2 -- two\n;\n');
  });

  it('leaves already terminated runs alone', () => {
    const later = { ...run, name: 'later', sql: 'SELECT 2;', executedAt: at + 60_000 };
    expect(runsToSql([run, later])).not.toContain('\n;\n');
  });
});

describe('file names', () => {
  it('slugifies', () => {
    expect(slugify('  Über Revenue / Q3 (draft)! ')).toBe('uber-revenue-q3-draft');
    expect(slugify('***')).toBe('');
    expect(slugify('a'.repeat(100))).toHaveLength(80);
  });

  it('names a tab file, falling back to query.sql', () => {
    expect(tabFileName('The Answer')).toBe('the-answer.sql');
    expect(tabFileName('???')).toBe('query.sql');
  });

  it('names a run file with its date and time', () => {
    expect(runFileName(run)).toBe('the-answer-2026-11-15-1602.sql');
    expect(runFileName({ executedAt: at })).toBe('query-2026-11-15-1602.sql');
  });

  it('names a selection after its one run, or after now', () => {
    expect(runsFileName([run])).toBe('the-answer-2026-11-15-1602.sql');
    expect(runsFileName([run, run], at)).toBe('loqe-runs-2026-11-15-1602.sql');
  });
});

describe('import', () => {
  it('accepts .sql and plain text, nothing else', () => {
    expect(isSqlFile({ name: 'q.SQL', type: '' })).toBe(true);
    expect(isSqlFile({ name: 'notes', type: 'text/plain' })).toBe(true);
    expect(isSqlFile({ name: 'q', type: 'application/sql' })).toBe(true);
    expect(isSqlFile({ name: 'pic.png', type: 'image/png' })).toBe(false);
    expect(isSqlFile({ name: 'q', type: 'text/x-sql' })).toBe(true);
    expect(isSqlFile({ name: 'q', type: 'application/x-sql' })).toBe(true);
    // Text, but not a query: rejected unless named .sql.
    expect(isSqlFile({ name: 'data.csv', type: 'text/csv' })).toBe(false);
    expect(isSqlFile({ name: 'page.html', type: 'text/html' })).toBe(false);
    expect(isSqlFile({ name: 'feed.xml', type: 'text/xml' })).toBe(false);
    expect(isSqlFile({ name: 'data.parquet', type: '' })).toBe(false);
  });

  it('names the tab after the file, without extension or folders', () => {
    expect(tabNameFromFile('the-answer.sql')).toBe('the-answer');
    expect(tabNameFromFile('dir/sub\\notes.TXT')).toBe('notes');
    expect(tabNameFromFile('.sql')).toBe('Imported query');
  });

  it('reads back the same SQL that was exported', () => {
    expect(sqlFromFile(runToSql(run))).toBe(run.sql.trim());
    expect(sqlFromFile(tabToSql('Query 1', 'SELECT 1;\nSELECT 2;'))).toBe('SELECT 1;\nSELECT 2;');
  });

  it('strips only the leading header and a BOM, keeping other comments', () => {
    const text = '\uFEFF-- name: a\r\n-- run: x\r\n-- my note\r\nSELECT 1;\r\n';
    expect(sqlFromFile(text)).toBe('-- my note\nSELECT 1;');
    expect(sqlFromFile('-- my note\nSELECT 1;\n')).toBe('-- my note\nSELECT 1;\n');
  });

  it('keeps the later headers of a combined file', () => {
    const later = { ...run, sql: 'SELECT 2;', executedAt: at + 60_000 };
    const back = sqlFromFile(runsToSql([run, later]));
    expect(back.startsWith('SELECT 42 AS answer;\n\n-- name: the answer')).toBe(true);
  });
});
