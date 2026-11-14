<template>
  <div class="cdp">
    <div class="cdp-head">
      <v-icon v-if="brandIcon" size="small" class="mr-2">
        <v-img :src="brandIcon" width="18" height="18" />
      </v-icon>
      <v-icon v-else size="small" class="mr-2" :color="iconColor">{{ icon }}</v-icon>
      <div class="cdp-title">
        <div class="text-subtitle-2 text-truncate" :title="row.name">{{ row.name }}</div>
        <div class="text-caption text-medium-emphasis">{{ typeLabel }}</div>
      </div>
      <v-btn icon="mdi-close" variant="text" size="small" title="Close" @click="emit('close')" />
    </div>
    <v-divider />

    <div class="cdp-body">
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <div v-if="readError" class="text-body-2 text-medium-emphasis pa-4">{{ readError }}</div>
      <template v-else-if="!loading">
        <div v-for="g in groups" :key="g.name" class="cdp-group">
          <div v-if="g.name" class="text-overline text-medium-emphasis cdp-group__title">
            {{ g.name }}
          </div>
          <dl class="cdp-facts">
            <template v-for="f in g.facts" :key="f.label">
              <dt class="text-caption text-medium-emphasis">{{ f.label }}</dt>
              <dd :class="['text-body-2', { 'cdp-mono': f.mono }]" :title="f.title ?? f.value">
                <v-icon
                  v-if="f.icon || f.warn"
                  size="x-small"
                  class="mr-1"
                  :color="f.warn ? 'warning' : f.iconColor">
                  {{ f.warn ? 'mdi-alert-outline' : f.icon }}
                </v-icon>
                {{ f.value }}
                <div v-if="f.warn" class="text-caption text-warning">{{ f.warn }}</div>
                <v-btn
                  v-if="f.copy"
                  icon="mdi-content-copy"
                  variant="text"
                  size="x-small"
                  density="comfortable"
                  class="cdp-copy"
                  title="Copy"
                  @click="copy(f.value)" />
              </dd>
            </template>
          </dl>
        </div>
      </template>

      <!-- A view is its SQL: the start of it, enough to recognise it. -->
      <div v-if="!loading && !readError && sql.length" class="cdp-section">
        <div class="text-overline text-medium-emphasis mb-1">SQL</div>
        <div v-for="q in sql" :key="q.dialect" class="cdp-sql">
          <div class="d-flex align-center">
            <span class="text-caption text-medium-emphasis">{{ q.dialect }}</span>
            <v-spacer />
            <v-btn
              icon="mdi-content-copy"
              variant="text"
              size="x-small"
              density="comfortable"
              title="Copy SQL"
              @click="copy(q.sql)" />
          </div>
          <pre class="cdp-sql__text">{{ q.sql }}</pre>
        </div>
      </div>

      <!-- Direct tags only, read-only: changing them is the object's page. -->
      <div v-if="!loading && !readError && tagTarget" class="cdp-section">
        <EntityTagsChips
          :key="tagTarget.entityId"
          :scope="tagTarget.scope"
          :warehouse-id="warehouseId"
          :entity-id="tagTarget.entityId" />
      </div>

      <div v-if="!loading && !readError && propertyList.length" class="cdp-section">
        <div class="d-flex align-center mb-2">
          <span class="text-overline text-medium-emphasis">Properties</span>
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyList.length }}</v-chip>
        </div>
        <dl class="cdp-props">
          <template v-for="[k, v] in shownProperties" :key="k">
            <dt class="cdp-mono text-medium-emphasis" :title="k">{{ k }}</dt>
            <dd class="cdp-mono" :title="v">{{ v }}</dd>
          </template>
        </dl>
        <v-btn
          v-if="propertyList.length > PROPS_SHOWN"
          variant="text"
          size="small"
          class="mt-1 px-0"
          @click="allProperties = !allProperties">
          {{ allProperties ? 'Show fewer' : `Show all ${propertyList.length}` }}
        </v-btn>
      </div>
    </div>

    <template v-if="row.kind !== 'deleted'">
      <v-divider />
      <div class="cdp-foot">
        <v-btn variant="tonal" size="small" append-icon="mdi-arrow-right" @click="emit('open')">
          Open
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { useFunctions } from '@/plugins/functions';
import { isForbiddenError } from '@/common/errorUtils';
import { tagRefusal } from '@/composables/useTagRights';
import type { TagScope } from '@/gen/management/types.gen';
import EntityTagsChips from './EntityTagsChips.vue';

/** The row as the Contents table holds it; only what the panel reads. */
export type DetailsRow = {
  key: string;
  kind: 'namespace' | 'table' | 'generic' | 'view' | 'dataset' | 'deleted';
  name: string;
  path?: string[];
  id?: string;
  typ?: 'table' | 'view' | 'generic-table';
  deletedAt?: string;
  expiresAt?: string;
  protected?: boolean;
  /** A generic table's id, from the list: its load response does not carry one. */
  uuid?: string;
};

/** Everything one open answers: the facts, the properties, and where tags live. */
type Details = {
  facts: Fact[];
  properties: Record<string, string>;
  tags?: { scope: TagScope; entityId: string };
  sql?: Array<{ dialect: string; sql: string }>;
};

type Fact = {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
  copy?: boolean;
  icon?: string;
  iconColor?: string;
  /** The section it belongs to; facts keep their order within one. */
  group?: string;
  /** Something to act on, said under the value. */
  warn?: string;
};

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
  row: DetailsRow;
  typeLabel: string;
  icon: string;
  iconColor?: string;
  brandIcon?: string | null;
}>();

const emit = defineEmits<{ close: []; open: [] }>();

const functions = useFunctions();

const loading = ref(false);
const readError = ref('');
const facts = ref<Fact[]>([]);
const properties = ref<Record<string, string>>({});
const tagTarget = ref<Details['tags'] | null>(null);
const sql = ref<NonNullable<Details['sql']>>([]);
/** Facts by section, in first-seen order; ungrouped ones lead without a title. */
const groups = computed(() => {
  const out: Array<{ name: string; facts: Fact[] }> = [];
  for (const f of facts.value) {
    const name = f.group ?? '';
    let g = out.find((x) => x.name === name);
    if (!g) out.push((g = { name, facts: [] }));
    g.facts.push(f);
  }
  return out;
});
const allProperties = ref(false);
/** Enough to read at a glance; the rest one click away. */
const PROPS_SHOWN = 10;
const propertyList = computed(() =>
  Object.entries(properties.value).sort(([a], [b]) => a.localeCompare(b)),
);
const shownProperties = computed(() =>
  allProperties.value ? propertyList.value : propertyList.value.slice(0, PROPS_SHOWN),
);

// One request per opened row, kept for the life of the list: going back to a
// row shows it again without asking the server twice.
const cache = new Map<string, Details>();
let ticket = 0;

watch(
  () => props.namespacePath,
  () => cache.clear(),
);

watch(() => props.row.key, load, { immediate: true });

function nsSegment(): string {
  return props.namespacePath;
}

function when(ms?: number): Fact['value'] {
  if (!ms) return '—';
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

function exact(ms?: number): string | undefined {
  return ms ? format(new Date(ms), 'yyyy-MM-dd HH:mm:ss') : undefined;
}

function bytes(n?: string | number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function count(n?: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '—';
}

function protection(flag?: boolean): Fact {
  if (flag === undefined) return { label: 'Protection', value: '—' };
  return flag
    ? {
        label: 'Protection',
        value: 'Protected',
        icon: 'mdi-lock',
        iconColor: 'amber-darken-2',
      }
    : { label: 'Protection', value: 'Not protected', icon: 'mdi-lock-open-variant-outline' };
}

/** Below this average, with enough files to matter, reads pay for small files. */
const SMALL_FILE_BYTES = 32 * 1024 * 1024;
const SMALL_FILE_MIN_FILES = 20;

async function tableFacts(): Promise<Details> {
  const res = await functions.loadTable(props.warehouseId, nsSegment(), props.row.name, false);
  const m: any = res.metadata;
  const p: Record<string, string> = m.properties ?? {};
  const snaps: any[] = m.snapshots ?? [];
  const current = snaps.find((s) => s['snapshot-id'] === m['current-snapshot-id']);
  const sum: Record<string, string> = current?.summary ?? {};
  const schemas: any[] = m.schemas ?? [];
  const schema = schemas.find((s: any) => s['schema-id'] === m['current-schema-id']);
  const specs: any[] = m['partition-specs'] ?? [];
  const spec = specs.find((s: any) => s['spec-id'] === m['default-spec-id']);
  const parts: string[] = (spec?.fields ?? []).map((f: any) =>
    f.transform && f.transform !== 'identity' ? `${f.transform}(${f.name})` : f.name,
  );
  const fieldName = (id: number) => schema?.fields?.find((f: any) => f.id === id)?.name ?? `#${id}`;
  const order = (m['sort-orders'] ?? []).find(
    (o: any) => o['order-id'] === m['default-sort-order-id'],
  );
  const sorted: string[] = (order?.fields ?? []).map((f: any) =>
    `${fieldName(f['source-id'])} ${f.direction ?? ''}`.trim(),
  );
  const refs = Object.entries((m.refs ?? {}) as Record<string, { type: string }>);
  const branches = refs.filter(([, r]) => r.type === 'branch').map(([n]) => n);
  const refTags = refs.filter(([, r]) => r.type === 'tag').map(([n]) => n);
  const oldest = snaps.reduce<number | undefined>(
    (min, s) => (min === undefined || s['timestamp-ms'] < min ? s['timestamp-ms'] : min),
    undefined,
  );

  const facts: Fact[] = [
    { label: 'Format', value: `Iceberg v${m['format-version']}` },
    { label: 'UUID', value: m['table-uuid'], mono: true, copy: true },
    { label: 'Location', value: m.location ?? '—', mono: true, copy: !!m.location },
    ...(res['metadata-location']
      ? [
          {
            label: 'Metadata file',
            value: fileName(res['metadata-location']),
            title: res['metadata-location'],
            mono: true,
            copy: true,
          },
        ]
      : []),
    {
      label: 'Last updated',
      value: when(m['last-updated-ms']),
      title: exact(m['last-updated-ms']),
    },
    protection(props.row.protected),
  ];

  // Data: what is there now, and whether reads pay for how it is laid out.
  if (current) {
    const files = Number(sum['total-data-files']);
    const size = Number(sum['total-files-size']);
    const avg = files > 0 ? size / files : NaN;
    const delFiles = Number(sum['total-delete-files'] ?? 0);
    const posDel = Number(sum['total-position-deletes'] ?? 0);
    const eqDel = Number(sum['total-equality-deletes'] ?? 0);
    facts.push(
      { group: 'Data', label: 'Records', value: count(sum['total-records']) },
      { group: 'Data', label: 'Data files', value: count(files) },
      { group: 'Data', label: 'Size', value: bytes(size) },
      {
        group: 'Data',
        label: 'Avg file size',
        value: bytes(avg),
        warn:
          files >= SMALL_FILE_MIN_FILES && avg < SMALL_FILE_BYTES
            ? 'Many small files — compaction would speed up reads'
            : undefined,
      },
      {
        group: 'Data',
        label: 'Delete files',
        value: delFiles
          ? `${count(delFiles)} (${count(posDel)} position, ${count(eqDel)} equality deletes)`
          : 'None',
        warn: delFiles ? 'Reads merge deletes — compaction would rewrite them away' : undefined,
      },
    );
  } else {
    facts.push({ group: 'Data', label: 'Data', value: 'No data yet' });
  }

  // Last change: the commit that made the current snapshot.
  if (current) {
    const added = [
      sum['added-records'] && `+${count(sum['added-records'])} rows`,
      sum['added-data-files'] && `+${count(sum['added-data-files'])} files`,
    ].filter(Boolean);
    const removed = [
      sum['deleted-records'] && `−${count(sum['deleted-records'])} rows`,
      sum['deleted-data-files'] && `−${count(sum['deleted-data-files'])} files`,
    ].filter(Boolean);
    const engine = [sum['engine-name'], sum['engine-version']].filter(Boolean).join(' ');
    facts.push(
      {
        group: 'Last change',
        label: 'Operation',
        value: `${sum.operation ?? 'commit'}, ${when(current['timestamp-ms'])}`,
        title: exact(current['timestamp-ms']),
      },
      ...(added.length ? [{ group: 'Last change', label: 'Added', value: added.join(', ') }] : []),
      ...(removed.length
        ? [{ group: 'Last change', label: 'Removed', value: removed.join(', ') }]
        : []),
      ...(engine ? [{ group: 'Last change', label: 'Written by', value: engine }] : []),
      ...(sum['app-id']
        ? [{ group: 'Last change', label: 'App ID', value: sum['app-id'], mono: true }]
        : []),
      // No snapshot id: it is 64-bit and JSON.parse rounds it, so it would be wrong.
    );
  }

  // History: how much is kept, which is what snapshot expiry trims.
  facts.push(
    { group: 'History', label: 'Snapshots', value: count(snaps.length) },
    ...(oldest
      ? [{ group: 'History', label: 'Oldest snapshot', value: when(oldest), title: exact(oldest) }]
      : []),
    {
      group: 'History',
      label: 'Metadata versions',
      value: count((m['metadata-log'] ?? []).length + 1),
    },
    ...(m['last-sequence-number'] !== undefined
      ? [{ group: 'History', label: 'Sequence number', value: count(m['last-sequence-number']) }]
      : []),
  );

  // Structure: shape, layout and how it is written.
  const writeFormat = (p['write.format.default'] ?? 'parquet').toLowerCase();
  const codec = p[`write.${writeFormat}.compression-codec`];
  const stats = (m.statistics ?? []).length;
  const partStats = (m['partition-statistics'] ?? []).length;
  facts.push(
    {
      group: 'Structure',
      label: 'Columns',
      value: `${count(schema?.fields?.length)}${schemas.length > 1 ? ` · schema v${schemas.length}` : ''}`,
    },
    {
      group: 'Structure',
      label: 'Partitioned by',
      value:
        (parts.length ? parts.join(', ') : 'Not partitioned') +
        (specs.length > 1 ? ` · ${specs.length} specs` : ''),
    },
    {
      group: 'Structure',
      label: 'Sorted by',
      value: sorted.length ? sorted.join(', ') : 'Unsorted',
    },
    {
      group: 'Structure',
      label: 'Branches',
      value: branches.length ? branches.sort().join(', ') : '—',
    },
    ...(refTags.length
      ? [{ group: 'Structure', label: 'Snapshot tags', value: refTags.sort().join(', ') }]
      : []),
    {
      group: 'Structure',
      label: 'Write format',
      value: codec ? `${writeFormat}, ${codec}` : writeFormat,
    },
    {
      group: 'Structure',
      label: 'Statistics',
      value:
        stats || partStats
          ? [stats && `${stats} column`, partStats && `${partStats} partition`]
              .filter(Boolean)
              .join(', ')
          : 'None',
    },
    ...(m['next-row-id'] !== undefined
      ? [
          {
            group: 'Structure',
            label: 'Row lineage',
            value: `next row id ${count(m['next-row-id'])}`,
          },
        ]
      : []),
  );

  return {
    facts,
    properties: p,
    tags: m['table-uuid'] ? { scope: 'table', entityId: m['table-uuid'] } : undefined,
  };
}

/** The last path segment: a metadata file's name says its version. */
function fileName(path: string): string {
  return path.split('/').pop() || path;
}

async function viewFacts(): Promise<Details> {
  const res = await functions.loadView(props.warehouseId, nsSegment(), props.row.name, false);
  const m: any = res.metadata;
  const versions: any[] = m.versions ?? [];
  const current = versions.find((v) => v['version-id'] === m['current-version-id']);
  const schema = (m.schemas ?? []).find((s: any) => s['schema-id'] === current?.['schema-id']);
  const dialects = [
    ...new Set<string>((current?.representations ?? []).map((r: any) => r.dialect)),
  ];
  const defaultNs: string[] = current?.['default-namespace'] ?? [];
  const engine = [current?.summary?.['engine-name'], current?.summary?.['engine-version']]
    .filter(Boolean)
    .join(' ');
  const facts: Fact[] = [
    { label: 'UUID', value: m['view-uuid'], mono: true, copy: true },
    { label: 'Location', value: m.location ?? '—', mono: true, copy: !!m.location },
    {
      label: 'Last updated',
      value: when(current?.['timestamp-ms']),
      title: exact(current?.['timestamp-ms']),
    },
    protection(props.row.protected),
    { group: 'Definition', label: 'Columns', value: count(schema?.fields?.length) },
    {
      group: 'Definition',
      label: 'Dialects',
      value: dialects.length ? dialects.join(', ') : '—',
    },
    ...(defaultNs.length
      ? [{ group: 'Definition', label: 'Default namespace', value: defaultNs.join('.') }]
      : []),
    ...(engine ? [{ group: 'Definition', label: 'Created by', value: engine }] : []),
    {
      group: 'History',
      label: 'Versions',
      value: count(versions.length),
    },
    ...(current
      ? [
          {
            group: 'History',
            label: 'Current version',
            value: `v${current['version-id']}`,
          },
        ]
      : []),
  ];
  return {
    facts,
    properties: m.properties ?? {},
    sql: (current?.representations ?? [])
      .filter((r: any) => r.type === 'sql' && r.sql)
      .map((r: any) => ({ dialect: r.dialect ?? 'sql', sql: r.sql as string })),
    tags: m['view-uuid'] ? { scope: 'view', entityId: m['view-uuid'] } : undefined,
  };
}

async function genericFacts(): Promise<Details> {
  const res = await functions.loadGenericTable(
    props.warehouseId,
    nsSegment(),
    props.row.name,
    false,
  );
  const t = res.table;
  const out: Fact[] = [
    { label: 'Format', value: t.format },
    {
      label: 'Location',
      value: t['base-location'] || '—',
      mono: true,
      copy: !!t['base-location'],
    },
  ];
  if (props.row.uuid)
    out.splice(1, 0, { label: 'UUID', value: props.row.uuid, mono: true, copy: true });
  if (t.doc) out.push({ label: 'Description', value: t.doc });
  out.push(protection(t.protected));
  return {
    facts: out,
    properties: t.properties ?? {},
    tags: props.row.uuid ? { scope: 'generic-table', entityId: props.row.uuid } : undefined,
  };
}

async function namespaceFacts(): Promise<Details> {
  const path = (props.row.path ?? [props.row.name]).join('\x1F');
  const res: any = await functions.loadNamespaceMetadata(props.warehouseId, path, false);
  const propsMap: Record<string, string> = res.properties ?? {};
  const out: Fact[] = [];
  if (res['namespace-uuid']) {
    out.push({ label: 'UUID', value: res['namespace-uuid'], mono: true, copy: true });
  }
  if (propsMap.location) {
    out.push({ label: 'Location', value: propsMap.location, mono: true, copy: true });
  }
  out.push(protection(props.row.protected));
  return {
    facts: out,
    properties: propsMap,
    tags: res['namespace-uuid']
      ? { scope: 'namespace', entityId: res['namespace-uuid'] }
      : undefined,
  };
}

function deletedFacts(): Fact[] {
  const r = props.row;
  const typ = r.typ === 'generic-table' ? 'Generic table' : r.typ === 'view' ? 'View' : 'Table';
  const at = (iso?: string) =>
    iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : '—';
  return [
    { label: 'Was a', value: typ },
    { label: 'ID', value: r.id ?? '—', mono: true, copy: !!r.id },
    { label: 'Deleted', value: at(r.deletedAt), title: r.deletedAt },
    { label: 'Expires', value: at(r.expiresAt), title: r.expiresAt },
  ];
}

async function load() {
  const row = props.row;
  const mine = ++ticket;
  readError.value = '';
  allProperties.value = false;
  const hit = cache.get(row.key);
  if (hit) {
    show(hit);
    loading.value = false;
    return;
  }
  if (row.kind === 'deleted') {
    // An earlier row's request may still own the bar; this one needs none.
    loading.value = false;
    show({ facts: deletedFacts(), properties: {} });
    return;
  }
  loading.value = true;
  show({ facts: [], properties: {} });
  try {
    const result =
      row.kind === 'table'
        ? await tableFacts()
        : row.kind === 'view'
          ? await viewFacts()
          : row.kind === 'namespace'
            ? await namespaceFacts()
            : await genericFacts();
    if (mine !== ticket) return;
    cache.set(row.key, result);
    show(result);
  } catch (error) {
    if (mine !== ticket) return;
    const what = props.typeLabel.toLowerCase();
    readError.value = isForbiddenError(error)
      ? `The details of this ${what} are not visible to you.`
      : tagRefusal(error, `read this ${what}`);
  } finally {
    if (mine === ticket) loading.value = false;
  }
}

function show(d: Details) {
  facts.value = d.facts;
  properties.value = d.properties;
  tagTarget.value = d.tags ?? null;
  sql.value = d.sql ?? [];
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

defineExpose({ reload: () => (cache.delete(props.row.key), load()) });
</script>

<style scoped>
.cdp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.cdp-head {
  display: flex;
  align-items: center;
  padding: 8px 8px 8px 16px;
  flex: none;
}

.cdp-title {
  flex: 1 1 auto;
  min-width: 0;
}

.cdp-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.cdp-facts {
  display: grid;
  /* One label width for every section, so values line up down the panel. */
  grid-template-columns: 128px minmax(0, 1fr);
  column-gap: 16px;
  row-gap: 10px;
  padding: 16px;
  margin: 0;
}

.cdp-facts dt {
  line-height: 20px;
}

.cdp-facts dd {
  margin: 0;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.cdp-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}

.cdp-section {
  padding: 4px 16px 16px;
}

.cdp-props {
  display: grid;
  grid-template-columns: minmax(0, 40%) minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 4px;
  margin: 0;
}

.cdp-props dt,
.cdp-props dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cdp-group__title {
  padding: 8px 16px 0;
  line-height: 1.6;
}

.cdp-group + .cdp-group {
  border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.cdp-sql + .cdp-sql {
  margin-top: 8px;
}

.cdp-sql__text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.cdp-copy {
  opacity: 0.6;
  margin-left: 2px;
}

.cdp-foot {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  flex: none;
}
</style>
