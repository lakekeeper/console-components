/**
 * Flattening for Arrow cell values, applied before they reach reactive state.
 *
 * Arrow represents a struct/map row as a JS `Proxy` whose handler does not
 * answer `isExtensible` consistently with its target. Vue's `reactive()` walks
 * into nested objects and calls that trap, which throws
 * `'isExtensible' on proxy: trap result does not reflect extensibility` and
 * takes down whatever was rendering the rows.
 *
 * Containers are therefore rendered as JSON text rather than kept as objects:
 * strings cannot be made reactive, and `CellValue` already shows a `{`/`[`
 * string as an expandable token — the same treatment VARIANT gets through
 * `CAST(… AS JSON)`.
 */
export function toPlainCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Primitives, including bigint, are already safe.
  if (typeof value !== 'object') return value;

  // Dates and binary are rendered by their own formatting, and neither is a
  // proxy — leave them as they are.
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value)) return value;

  return toJsonText(value);
}

function toJsonText(value: object): string {
  try {
    const plain = unwrap(value);
    // BigInt is not JSON-serialisable, and i64 columns are common in Iceberg
    // metadata, so it becomes text rather than throwing.
    return JSON.stringify(plain, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    // A shape we cannot serialise is still better shown than crashing.
    return String(value);
  }
}

function unwrap(value: any): unknown {
  if (typeof value?.toJSON === 'function') return value.toJSON();
  // Arrow vectors (list columns) expose toArray rather than toJSON.
  if (typeof value?.toArray === 'function') return Array.from(value.toArray());
  return value;
}

// ── Dates and times ───────────────────────────────────────────────────

/** Arrow's type ids, the same in every apache-arrow version. */
const ARROW_DATE = 8;
const ARROW_TIME = 9;
const ARROW_TIMESTAMP = 10;
/** Microseconds per Arrow time unit: second, millisecond, microsecond, nanosecond. */
const MICROS_PER_UNIT = [1_000_000, 1000, 1, 0.001];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** `.789123`, trailing zeros dropped, nothing for a whole second — as DuckDB prints it. */
const fraction = (micros: number) => (micros ? `.${pad(micros, 6).replace(/0+$/, '')}` : '');

/** Arrow hands a DATE over as milliseconds since 1970; DuckDB writes `2024-07-01`. */
function formatDate(value: unknown): unknown {
  const ms = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : value;
}

/**
 * Arrow hands a TIMESTAMP over as fractional milliseconds since 1970, in UTC.
 * Written out in UTC (a TIMESTAMP has no zone, and showing it in the viewer's
 * would move the wall-clock time), with `+00` where the column has a zone.
 */
function formatTimestamp(value: unknown, zoned: boolean): unknown {
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return value;
  const whole = Math.floor(ms);
  const micros = (whole - Math.floor(whole / 1000) * 1000) * 1000 + Math.round((ms - whole) * 1000);
  const d = new Date(whole);
  const text =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    fraction(micros);
  return zoned ? `${text}+00` : text;
}

/** Arrow hands a TIME over as a count of its unit since midnight. */
function formatTime(value: unknown, unit: number): unknown {
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return value;
  const micros = Math.round(n * (MICROS_PER_UNIT[unit] ?? 1));
  const secs = Math.floor(micros / 1_000_000);
  return (
    `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}` +
    fraction(micros % 1_000_000)
  );
}

/**
 * How to turn one column's values into what the result table shows, picked
 * once per column from its Arrow type. Dates and times otherwise reach the
 * table as bare numbers (1749427200000 for 2025-06-09).
 */
export function cellConverter(type: unknown): (value: unknown) => unknown {
  const t = type as { typeId?: number; unit?: number; timezone?: string | null } | undefined;
  const plain = (v: unknown) => (v === null || v === undefined ? v : toPlainCellValue(v));
  switch (t?.typeId) {
    case ARROW_DATE:
      return (v) => (v === null || v === undefined ? v : formatDate(v));
    case ARROW_TIMESTAMP:
      return (v) => (v === null || v === undefined ? v : formatTimestamp(v, !!t.timezone));
    case ARROW_TIME:
      return (v) => (v === null || v === undefined ? v : formatTime(v, t.unit ?? 2));
    default:
      return plain;
  }
}
