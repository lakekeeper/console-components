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
