/**
 * Queries as `.sql` files: what LoQE writes when a run, a tab or a selection of
 * runs is downloaded, and what it reads back when a file is opened or dropped.
 *
 * A file starts with a header of SQL comments, so it runs as-is in DuckDB and
 * other engines:
 *
 * ```sql
 * -- name: the answer
 * -- run: 2026-11-15 16:02 · 1 row · 39 ms · succeeded
 * SELECT 42 AS answer;
 * ```
 */
import type { LoQEHistoryEntry } from './types';

/** What a run's header needs; a history entry has it all. */
export type SqlFileRun = Pick<
  LoQEHistoryEntry,
  'sql' | 'executedAt' | 'durationMs' | 'rowCount' | 'error' | 'name'
>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time to the minute: `2026-11-15 16:02`. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** The same moment for a file name: `2026-11-15-1602`. */
function fileStamp(ms: number): string {
  return stamp(ms).replace(' ', '-').replace(':', '');
}

/**
 * A name on one comment line. A line break in it would end the comment and
 * turn the rest of the name into SQL that runs.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** `-- name: …` and `-- run: …`; the name only when the run has one. */
export function runHeader(run: SqlFileRun): string[] {
  const lines: string[] = [];
  const name = oneLine(run.name ?? '');
  if (name) lines.push(`-- name: ${name}`);
  const parts = [stamp(run.executedAt)];
  if (!run.error) parts.push(`${run.rowCount} row${run.rowCount === 1 ? '' : 's'}`);
  parts.push(duration(run.durationMs), run.error ? 'failed' : 'succeeded');
  lines.push(`-- run: ${parts.join(' · ')}`);
  return lines;
}

function block(header: string[], sql: string): string {
  return [...header, sql.trim()].join('\n') + '\n';
}

/** One run as a file: its header, then its SQL. */
export function runToSql(run: SqlFileRun): string {
  return block(runHeader(run), run.sql);
}

/** An editor tab as a file: the tab's name, then its SQL. */
export function tabToSql(name: string, sql: string): string {
  const n = oneLine(name);
  return block(n ? [`-- name: ${n}`] : [], sql);
}

/**
 * A run's SQL ending in a statement delimiter. Unterminated SQL gets `;` on a
 * line of its own, so a trailing `--` comment cannot swallow it.
 */
function terminated(sql: string): string {
  const body = sql.trim();
  return !body || body.endsWith(';') ? body : `${body}\n;`;
}

/**
 * Several runs in one file, oldest first, each with its own header, a blank
 * line between. Every run ends in `;`, so the file stays a valid script.
 */
export function runsToSql(runs: SqlFileRun[]): string {
  return [...runs]
    .sort((a, b) => a.executedAt - b.executedAt)
    .map((run) => runToSql({ ...run, sql: terminated(run.sql) }))
    .join('\n');
}

/** Lowercase words joined by `-`, safe as a file name on every system; empty if nothing is left. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** `the-answer.sql`, or `query.sql` for a name with nothing usable in it. */
export function tabFileName(name: string): string {
  return `${slugify(name) || 'query'}.sql`;
}

/** `the-answer-2026-11-15-1602.sql`; `query-…` for a run without a name. */
export function runFileName(run: Pick<SqlFileRun, 'name' | 'executedAt'>): string {
  return `${slugify(run.name ?? '') || 'query'}-${fileStamp(run.executedAt)}.sql`;
}

/** The file for a selection: a single run keeps its own name, more are `loqe-runs-<now>.sql`. */
export function runsFileName(runs: SqlFileRun[], now = Date.now()): string {
  return runs.length === 1 ? runFileName(runs[0]) : `loqe-runs-${fileStamp(now)}.sql`;
}

/** Whether a picked or dropped file can be opened as a query: `.sql`, or plain text. */
export function isSqlFile(file: { name: string; type: string }): boolean {
  if (/\.sql$/i.test(file.name)) return true;
  // Plain text and the SQL types only: CSV, HTML or XML are text too, but not a query.
  return /^(text\/(plain|sql|x-sql)|application\/(x-)?sql)$/i.test(file.type);
}

/** The tab name for a file: its name without folders and without `.sql` / `.txt`. */
export function tabNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.(sql|txt)$/i, '').trim() || 'Imported query';
}

const HEADER_LINE = /^--\s*(name|run):.*$/;

/**
 * A file's SQL without the header LoQE wrote at its top, so a file exported and
 * opened again holds the same SQL, and exporting it again does not stack a
 * second header. Only the leading `-- name:` / `-- run:` lines go; any other
 * comment, and the headers of later runs in a combined file, stay.
 */
export function sqlFromFile(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length && HEADER_LINE.test(lines[i].trim())) i++;
  if (i === 0) return text.replace(/^\uFEFF/, '');
  return lines.slice(i).join('\n').replace(/\s+$/, '');
}

/** Save text as a file through the browser's download, with no dependency. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/sql;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Firefox and Safari read the URL after click returns; let them.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
