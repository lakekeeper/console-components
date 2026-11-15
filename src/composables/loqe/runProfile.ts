/**
 * What DuckDB's profiler says about one run, cut down to what the run details
 * show: a summary kept with the history entry, and the operator tree (the plan
 * as it actually ran) kept beside it in IndexedDB.
 *
 * The source is DuckDB's JSON profile (`PRAGMA enable_profiling='json'`). Its
 * `total_bytes_read` / `total_bytes_written` are left out on purpose: they count
 * DuckDB's own database file only, so a parquet read of megabytes reports a few
 * kilobytes and a COPY to parquet reports nothing.
 */

/** The run as a whole. Times in milliseconds, sizes in bytes. */
export interface LoQERunStats {
  /** Rows the scans read, before any filter. */
  rowsScanned: number;
  /** Files the scans opened (parquet, Iceberg data files, …). */
  filesRead: number;
  /** Most memory the buffer manager held at once. */
  peakMemoryBytes: number;
  /** Most written to the temp directory when memory ran out. */
  spilledBytes: number;
  latencyMs: number;
  cpuMs: number;
}

/** One operator of the plan as it ran. */
export interface LoQEPlanNode {
  name: string;
  /** Rows this operator passed on. */
  rows: number;
  /** Rows this operator read from storage (scans only). */
  scanned: number;
  timeMs: number;
  /** DuckDB's `extra_info`: filters, projections, files, groups, … */
  info: Record<string, string | string[]>;
  children: LoQEPlanNode[];
}

export interface LoQERunProfile {
  stats: LoQERunStats;
  plan: LoQEPlanNode | null;
  /** The statement DuckDB profiled, to tell this run's profile from a stale one. */
  queryName: string;
}

/** Long lists (an Iceberg scan names every data file) are cut to this many. */
const MAX_LIST = 20;
const MAX_TEXT = 500;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function trimInfo(raw: unknown): Record<string, string | string[]> {
  const info: Record<string, string | string[]> = {};
  if (!raw || typeof raw !== 'object') return info;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const items = value.map((v) => String(v).slice(0, MAX_TEXT));
      info[key] =
        items.length > MAX_LIST
          ? [...items.slice(0, MAX_LIST), `… ${items.length - MAX_LIST} more`]
          : items;
    } else if (value !== null && value !== undefined && value !== '') {
      info[key] = String(value).slice(0, MAX_TEXT);
    }
  }
  return info;
}

function toNode(raw: any): LoQEPlanNode {
  return {
    name: String(raw?.operator_name ?? raw?.operator_type ?? '?').trim(),
    rows: num(raw?.operator_cardinality),
    scanned: num(raw?.operator_rows_scanned),
    timeMs: num(raw?.operator_timing) * 1000,
    info: trimInfo(raw?.extra_info),
    children: Array.isArray(raw?.children) ? raw.children.map(toNode) : [],
  };
}

function filesIn(node: LoQEPlanNode): number {
  const own = num(node.info['Total Files Read']);
  return node.children.reduce((n, c) => n + filesIn(c), own);
}

/**
 * The first complete JSON object in the text. A profile file can carry bytes
 * after the profile (a longer earlier one's tail), and `JSON.parse` rejects
 * the whole text for them.
 */
export function firstJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return text;
}

/** Parse DuckDB's JSON profile; null when it is not one. */
export function parseRunProfile(json: string): LoQERunProfile | null {
  let root: any;
  try {
    root = JSON.parse(firstJsonObject(json));
  } catch {
    return null;
  }
  if (!root || typeof root !== 'object') return null;

  const children: LoQEPlanNode[] = Array.isArray(root.children) ? root.children.map(toNode) : [];
  // The root is the query itself; its one child is the plan's top operator.
  const plan =
    children.length === 1
      ? children[0]
      : children.length
        ? { name: 'QUERY', rows: 0, scanned: 0, timeMs: 0, info: {}, children }
        : null;

  return {
    queryName: String(root.query_name ?? ''),
    plan,
    stats: {
      rowsScanned: num(root.cumulative_rows_scanned),
      filesRead: plan ? filesIn(plan) : 0,
      peakMemoryBytes: num(root.system_peak_buffer_memory),
      spilledBytes: num(root.system_peak_temp_dir_size),
      latencyMs: num(root.latency) * 1000,
      cpuMs: num(root.cpu_time) * 1000,
    },
  };
}
