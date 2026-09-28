import { ref, shallowRef } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useStorageExplorer, parseLocation } from '@/composables/useStorageExplorer';
import type { StorageLoadResult } from '@/composables/useStorageExplorer';

/**
 * Per-column facts read from the table's own manifests.
 *
 * Iceberg records these when the data is written — one entry per data file,
 * keyed by field id — so they cover every leaf of the schema, nested fields
 * included, and they describe the whole table rather than a sample of it.
 * Reading them costs a few kilobytes of Avro; profiling the same columns with
 * a query costs a scan of the data.
 *
 * What is NOT here, deliberately: distinct counts, means, percentiles and top
 * values. None of those are in the manifests, and inventing them from a
 * partial scan is what made the old statistics view misleading.
 */
export type ManifestColumnStats = {
  fieldId: number;
  /**
   * Values present for this field across all data files. For a field inside a
   * list or a map this counts *elements*, not rows — so a null fraction has to
   * be taken against this number, never against the table's record count.
   */
  valueCount: number | null;
  nullCount: number | null;
  /** Float/double only. */
  nanCount: number | null;
  /** Bytes this column occupies across the table's data files. */
  sizeBytes: number | null;
};

export type ManifestStats = {
  /** Rows in the table, from the same manifest entries. */
  recordCount: number;
  dataFileCount: number;
  columns: Map<number, ManifestColumnStats>;
};

type Loqe = {
  initialize: () => Promise<void>;
  query: (sql: string) => Promise<{ rows: any[][] }>;
  engine: { getDB: () => any | null };
};

/**
 * Reads one row per field id out of the current snapshot's manifests.
 *
 * The Avro is fetched here rather than by DuckDB. DuckDB's Iceberg extension
 * keeps the catalog's vended credentials to itself — a `read_avro('s3://…')`
 * next to it gets "No credentials are provided", a 403 — and remote-signing
 * warehouses have no credentials for it to hold in the first place. The files
 * tab already signs these requests; this borrows that path and hands DuckDB
 * the bytes, which also means the manifests are read the same way on S3, ADLS
 * and GCS.
 */
export function useTableManifestStats(loqe: Loqe) {
  const functions = useFunctions();
  const explorer = useStorageExplorer();

  const loading = ref(false);
  const error = ref<string | null>(null);
  const stats = shallowRef<ManifestStats | null>(null);

  /**
   * The table's metadata arrives asynchronously, so a page can start a second
   * read while the first is still in flight. Two things follow: the buffers of
   * a run are named after it — fixed names meant the older run's cleanup
   * deleted the file the newer one was about to query — and a run that has been
   * overtaken stops rather than publishing its answer over the newer one.
   */
  let runToken = 0;

  function reset() {
    stats.value = null;
    error.value = null;
  }

  function sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * The manifest list belongs to a snapshot, so the snapshot the table is
   * currently at decides which files are counted.
   */
  function manifestListUri(metadata: any): string | null {
    const currentId = metadata?.['current-snapshot-id'];
    if (currentId === undefined || currentId === null) return null;
    const snapshot = (metadata.snapshots ?? []).find(
      (s: any) => String(s['snapshot-id']) === String(currentId),
    );
    return snapshot?.['manifest-list'] ?? null;
  }

  /** `s3://bucket/a/b.avro` → `a/b.avro`: the explorer addresses objects by key. */
  function objectKey(uri: string): string {
    const idx = uri.indexOf('://');
    if (idx === -1) return uri;
    const rest = uri.slice(idx + 3);
    const slash = rest.indexOf('/');
    return slash === -1 ? '' : rest.slice(slash + 1);
  }

  async function registerAvro(
    db: any,
    res: StorageLoadResult,
    uri: string,
    name: string,
  ): Promise<string> {
    const bytes = await explorer.getObject(res, objectKey(uri));
    await db.registerFileBuffer(name, bytes);
    return name;
  }

  /**
   * What this manifest actually carries. `DESCRIBE` is the only way to ask:
   * an Avro file's schema is its own, and DuckDB binds the struct members it
   * finds rather than a fixed Iceberg shape.
   */
  async function describeManifest(
    name: string,
  ): Promise<{ top: Set<string>; dataFile: Set<string> }> {
    const described = await loqe.query(`DESCRIBE SELECT * FROM read_avro(${sqlString(name)})`);
    const top = new Set<string>();
    let dataFileType = '';
    for (const row of described.rows) {
      const column = String(row[0] ?? '');
      top.add(column);
      if (column === 'data_file') dataFileType = String(row[1] ?? '');
    }
    return { top, dataFile: structMembers(dataFileType) };
  }

  async function load(params: {
    warehouseId: string;
    namespaceId: string;
    tableName: string;
  }): Promise<void> {
    const token = ++runToken;
    loading.value = true;
    error.value = null;
    const registered: string[] = [];
    let db: any = null;
    try {
      // Loaded again rather than taken from the caller: this needs the vended
      // credentials that come with the response, which the metadata alone does
      // not carry. `false` keeps the error quiet — an unreadable manifest is
      // reported in place, not as a snackbar over the page.
      const table: any = await functions.loadTableCustomized(
        params.warehouseId,
        params.namespaceId,
        params.tableName,
        false,
      );
      const res: StorageLoadResult = {
        location: table?.metadata?.location || '',
        config: table?.config,
        'storage-credentials': table?.['storage-credentials'],
      };
      const listUri = manifestListUri(table?.metadata);
      if (!listUri || !res.location) {
        reset();
        return;
      }
      if (parseLocation(res.location).kind === 'unknown') {
        throw new Error(`Storage scheme of ${res.location} is not supported here`);
      }

      await loqe.initialize();
      db = loqe.engine.getDB();
      if (!db) throw new Error('The local query engine is not available');

      const listName = `lk_${token}_manifest_list.avro`;
      registered.push(await registerAvro(db, res, listUri, listName));

      const listResult = await loqe.query(
        `SELECT manifest_path FROM read_avro(${sqlString(listName)})`,
      );
      const manifestUris = listResult.rows
        .map((r) => String(r[0] ?? ''))
        .filter((p) => p.length > 0);
      if (!manifestUris.length) {
        stats.value = { recordCount: 0, dataFileCount: 0, columns: new Map() };
        return;
      }

      // Fetched in parallel: they are kilobytes each, and a table with a few
      // hundred manifests would otherwise pay a round trip per file in series.
      const names = await Promise.all(
        manifestUris.map((uri, i) => registerAvro(db, res, uri, `lk_${token}_manifest_${i}.avro`)),
      );
      registered.push(...names);

      // Read one manifest at a time, and ask each one what it contains first.
      // Which metrics a manifest carries is up to the writer and the format
      // version: a v1 manifest has no `content` column, and a writer with
      // `write.metadata.metrics.default=none` records bounds but no counts.
      // Reading them as one file list and naming a column blindly is what
      // produced "Could not find key value_counts in struct".
      const columns = new Map<number, ManifestColumnStats>();
      let recordCount = 0;
      let dataFileCount = 0;

      for (const name of names) {
        if (token !== runToken) return;
        let shape: { top: Set<string>; dataFile: Set<string> };
        try {
          shape = await describeManifest(name);
        } catch (e) {
          // One unreadable manifest is a gap in the counts, not a failed read.
          console.debug('[manifest stats] skipping', name, e);
          continue;
        }
        if (!shape.dataFile.size) continue;

        // status 2 is DELETED — those entries describe files that are no longer
        // part of the table. content 0 is a data file; 1 and 2 are position and
        // equality deletes, whose counts would otherwise be added to the columns
        // they delete from. A v1 manifest has neither column and needs no filter:
        // it cannot hold delete files at all.
        const where: string[] = [];
        if (shape.top.has('status')) where.push('status <> 2');
        if (shape.dataFile.has('content')) where.push('coalesce(data_file.content, 0) = 0');
        const live = `
          SELECT data_file
          FROM read_avro(${sqlString(name)})
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        `;

        if (shape.dataFile.has('record_count')) {
          const totals = await loqe.query(`
            SELECT coalesce(sum(data_file.record_count), 0), count(*) FROM (${live})
          `);
          recordCount += Number(totals.rows[0]?.[0] ?? 0);
          dataFileCount += Number(totals.rows[0]?.[1] ?? 0);
        } else {
          const totals = await loqe.query(`SELECT count(*) FROM (${live})`);
          dataFileCount += Number(totals.rows[0]?.[0] ?? 0);
        }

        // One row per (metric, field id), so a manifest missing a metric simply
        // contributes no rows for it rather than failing the whole read.
        const metrics: Array<[keyof ManifestColumnStats, string]> = [
          ['valueCount', 'value_counts'],
          ['nullCount', 'null_value_counts'],
          ['nanCount', 'nan_value_counts'],
          ['sizeBytes', 'column_sizes'],
        ];
        const parts = metrics
          .filter(([, avroField]) => shape.dataFile.has(avroField))
          .map(
            ([metric, avroField]) => `
              SELECT ${sqlString(metric)} AS metric, e.key AS field_id, sum(e.value) AS total
              FROM live, unnest(map_entries(live.data_file.${avroField})) AS t(e)
              GROUP BY 1, 2
            `,
          );
        if (!parts.length) continue;

        const perColumn = await loqe.query(`
          WITH live AS (${live})
          ${parts.join(' UNION ALL ')}
        `);

        for (const row of perColumn.rows) {
          const metric = String(row[0]) as keyof ManifestColumnStats;
          const fieldId = Number(row[1]);
          const total = toCount(row[2]);
          if (!Number.isFinite(fieldId) || total === null) continue;
          const entry = columns.get(fieldId) ?? {
            fieldId,
            valueCount: null,
            nullCount: null,
            nanCount: null,
            sizeBytes: null,
          };
          // Summed across manifests: each one describes a different set of files.
          (entry[metric] as number | null) = (entry[metric] as number | null) ?? 0;
          (entry[metric] as number) = (entry[metric] as number) + total;
          columns.set(fieldId, entry);
        }
      }

      if (token !== runToken) return;
      stats.value = { recordCount, dataFileCount, columns };
    } catch (e) {
      if (token !== runToken) return;
      stats.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      // The buffers are the manifests themselves; leaving them registered would
      // also leave a stale answer behind after the next commit.
      if (db) {
        await Promise.all(
          registered.map((name) => Promise.resolve(db.dropFile?.(name)).catch(() => {})),
        );
      }
      if (token === runToken) loading.value = false;
    }
  }

  return { loading, error, stats, load, reset };
}

/**
 * Member names of a `STRUCT(a INTEGER, b MAP(INTEGER, BIGINT), …)` type string,
 * top level only — nested parentheses belong to a member's own type.
 */
function structMembers(type: string): Set<string> {
  const out = new Set<string>();
  const open = type.indexOf('(');
  if (!type.toUpperCase().startsWith('STRUCT') || open === -1) return out;
  const body = type.slice(open + 1, type.lastIndexOf(')'));
  let depth = 0;
  let current = '';
  const take = () => {
    const name = current.trim().split(/\s+/)[0];
    if (name) out.add(name.replace(/^"|"$/g, ''));
    current = '';
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) take();
    else current += ch;
  }
  take();
  return out;
}

/** Counts arrive as BigInt from DuckDB; absent is null, not zero. */
function toCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
