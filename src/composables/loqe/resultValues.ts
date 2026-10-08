import { DataType, TimeUnit, type Vector } from 'apache-arrow';

const TIMESTAMP_PRECISION = {
  [TimeUnit.SECOND]: 0,
  [TimeUnit.MILLISECOND]: 3,
  [TimeUnit.MICROSECOND]: 6,
  [TimeUnit.NANOSECOND]: 9,
};

/** Read timestamp ticks directly: Arrow's get() converts them to lossy JS milliseconds. */
export function createResultValueReader(vector: Vector | null): (index: number) => unknown {
  if (!vector) return () => undefined;
  const type = vector.type;
  if (
    DataType.isStruct(type) ||
    DataType.isMap(type) ||
    DataType.isList(type) ||
    DataType.isFixedSizeList(type)
  ) {
    // Arrow StructRow/MapRow proxies violate isExtensible invariants when Vue
    // tries to wrap them. Result grids already render these cells as JSON text.
    return (index) => {
      const value = vector.get(index);
      if (value == null) return null;
      return JSON.stringify(value, (_, nested) => {
        if (typeof nested === 'bigint') return nested.toString();
        if (typeof nested === 'number' && !Number.isFinite(nested)) return String(nested);
        if (ArrayBuffer.isView(nested)) return Array.from(nested as Uint8Array);
        return nested;
      });
    };
  }
  if (!DataType.isTimestamp(type)) return (index) => vector.get(index);

  const precision = TIMESTAMP_PRECISION[type.unit];
  const ticksPerSecond = 10n ** BigInt(precision);
  let chunkIndex = 0;
  let chunkStart = 0;

  return (index) => {
    if (index < chunkStart) {
      chunkIndex = 0;
      chunkStart = 0;
    }
    while (index >= chunkStart + vector.data[chunkIndex].length) {
      chunkStart += vector.data[chunkIndex++].length;
    }
    const chunk = vector.data[chunkIndex];
    const localIndex = index - chunkStart;
    if (!chunk.getValid(localIndex)) return null;

    // Sliced Data already has its values buffer sliced; offset applies only to validity.
    const ticks = (chunk.values as BigInt64Array)[localIndex];
    let seconds = ticks / ticksPerSecond;
    let fraction = ticks % ticksPerSecond;
    if (fraction < 0n) {
      seconds -= 1n;
      fraction += ticksPerSecond;
    }
    const date = new Date(Number(seconds) * 1000);
    if (!Number.isFinite(date.getTime())) return ticks.toString();
    const calendar = date.toISOString().slice(0, -5);
    const subsecond = precision ? `.${fraction.toString().padStart(precision, '0')}` : '';
    // A timezone-free timestamp is a wall clock value; adding Z would change its meaning.
    return `${calendar}${subsecond}${type.timezone ? 'Z' : ''}`;
  };
}
