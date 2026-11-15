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

/** `2024-07-01 12:34:56` in UTC, with a four-digit year and `(BC)` before year 1, as DuckDB writes it. */
function utcClock(d: Date): string {
  const year = d.getUTCFullYear();
  const date =
    `${pad(year > 0 ? year : 1 - year, 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return year > 0 ? date : `${date} (BC)`;
}

/**
 * Fallback for a TIMESTAMP whose raw ticks cannot be read: Arrow's `get()`
 * hands it over as fractional milliseconds since 1970, which keeps the
 * microsecond only near the present. Written out in UTC (a TIMESTAMP has no
 * zone, and showing it in the viewer's would move the wall-clock time), with
 * `+00` where the column has a zone.
 */
function formatTimestamp(value: unknown, zoned: boolean): unknown {
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return value;
  const whole = Math.floor(ms);
  const micros = (whole - Math.floor(whole / 1000) * 1000) * 1000 + Math.round((ms - whole) * 1000);
  const text = utcClock(new Date(whole)) + fraction(micros);
  return zoned ? `${text}+00` : text;
}

/** Ticks per second and fraction digits per Arrow time unit: s, ms, µs, ns. */
const TICKS_PER_SECOND = [1n, 1_000n, 1_000_000n, 1_000_000_000n];
const FRACTION_DIGITS = [0, 3, 6, 9];

/**
 * A TIMESTAMP from its raw tick count, exact at every unit: nanoseconds keep
 * all nine digits, and the year 9999 keeps its microseconds — both of which
 * the float milliseconds from Arrow's `get()` lose.
 */
export function formatTimestampTicks(ticks: bigint, unit: number, zoned: boolean): string {
  const perSecond = TICKS_PER_SECOND[unit] ?? 1_000_000n;
  let seconds = ticks / perSecond;
  let sub = ticks % perSecond;
  // BigInt division truncates toward zero; a time before 1970 borrows a second.
  if (sub < 0n) {
    seconds -= 1n;
    sub += perSecond;
  }
  const d = new Date(Number(seconds) * 1000);
  if (!Number.isFinite(d.getTime())) return ticks.toString();
  const digits = FRACTION_DIGITS[unit] ?? 6;
  const frac = sub ? `.${sub.toString().padStart(digits, '0').replace(/0+$/, '')}` : '';
  const text = utcClock(d) + frac;
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

/** The parts of an Arrow vector a reader needs, so tests can hand in real or stand-in vectors. */
interface ArrowChunk {
  length: number;
  values: unknown;
  getValid(index: number): boolean;
}
export interface ArrowColumn {
  get(index: number): unknown;
  data?: readonly ArrowChunk[];
}

/**
 * A timestamp's raw tick count at `index`: `null` for NULL, `undefined` when
 * the vector does not keep its ticks as a BigInt64Array (then the caller falls
 * back to `get()`). A sliced chunk's values are already sliced; only its
 * validity bitmap carries the offset, which `getValid` applies.
 */
function rawTicks(column: ArrowColumn, index: number): bigint | null | undefined {
  let local = index;
  for (const chunk of column.data ?? []) {
    if (local < chunk.length) {
      if (!chunk.getValid(local)) return null;
      return chunk.values instanceof BigInt64Array ? chunk.values[local] : undefined;
    }
    local -= chunk.length;
  }
  return undefined;
}

/**
 * Like `cellConverter`, but reads the cell from its column, so a TIMESTAMP is
 * formatted from its exact ticks rather than from `get()`'s lossy milliseconds.
 */
export function cellReader(
  type: unknown,
): (column: ArrowColumn | null | undefined, index: number) => unknown {
  const convert = cellConverter(type);
  const t = type as { typeId?: number; unit?: number; timezone?: string | null } | undefined;
  if (t?.typeId !== ARROW_TIMESTAMP) return (column, index) => convert(column?.get(index));
  const unit = t.unit ?? 2;
  const zoned = !!t.timezone;
  return (column, index) => {
    if (!column) return undefined;
    const ticks = rawTicks(column, index);
    if (ticks === null) return null;
    if (ticks === undefined) return convert(column.get(index));
    return formatTimestampTicks(ticks, unit, zoned);
  };
}
