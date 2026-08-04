<template>
  <v-dialog v-model="isActive" max-width="960">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon="mdi-link-variant"
        size="x-small"
        variant="text"
        title="Show attachments"></v-btn>
    </template>

    <v-card :title="`Attachments — ${name}`">
      <v-card-text>
        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-text-field
            v-model="valueFilter"
            label="Filter by value"
            placeholder="exact value (case-sensitive)"
            prepend-inner-icon="mdi-filter-variant"
            density="compact"
            clearable
            hide-details
            style="min-width: 220px"
            @update:model-value="reload"></v-text-field>
          <v-select
            v-model="targetTypeFilter"
            label="Target type"
            :items="TARGET_TYPES"
            density="compact"
            clearable
            hide-details
            style="min-width: 180px"
            @update:model-value="reload"></v-select>
          <v-select
            v-model="warehouseFilter"
            label="Warehouse"
            :items="warehouseOptions"
            item-title="title"
            item-value="value"
            density="compact"
            clearable
            hide-details
            style="min-width: 200px"
            @update:model-value="reload"></v-select>
        </div>

        <v-data-table
          :headers="headers"
          :items="attachments"
          :loading="loading"
          density="comfortable">
          <template #item.target="{ item }">
            <div class="d-flex align-center flex-nowrap ga-1" style="white-space: nowrap">
              <v-chip color="info" size="x-small" variant="tonal">{{ item.target.type }}</v-chip>

              <v-icon size="x-small" icon="mdi-database" class="ml-1"></v-icon>
              <span class="text-caption">{{ warehouseLabel(item.target) }}</span>

              <template v-if="item.target.type !== 'warehouse'">
                <span class="text-disabled">/</span>
                <span
                  class="text-caption"
                  :style="entityName(item.target) ? '' : 'font-family: monospace'">
                  {{ entityName(item.target) || entityId(item.target) }}
                </span>
                <v-chip
                  v-if="item.target.type === 'column'"
                  size="x-small"
                  variant="outlined"
                  prepend-icon="mdi-table-column"
                  :title="`field-id ${item.target['field-id']}`">
                  {{ columnName(item.target) || `field ${item.target['field-id']}` }}
                </v-chip>
                <v-btn
                  v-if="!entityName(item.target)"
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  title="Copy id"
                  @click="copy(entityId(item.target))"></v-btn>
              </template>

              <!-- Open icon → navigate to the object (its Tags tab). -->
              <v-btn
                icon="mdi-open-in-new"
                size="x-small"
                variant="text"
                :title="openTitle(item.target)"
                @click="openTarget(item.target)"></v-btn>
            </div>
          </template>
          <template #item.value="{ item }">
            <span v-if="item.value !== null && item.value !== undefined">{{ item.value }}</span>
            <span v-else class="text-disabled">—</span>
          </template>
          <template #item.created-at="{ item }">
            {{ new Date(item['created-at']).toLocaleString() }}
          </template>
          <template #no-data>
            <span class="text-disabled">No attachments.</span>
          </template>
        </v-data-table>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text="Close" @click="isActive = false"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import { Header, NamespaceResponse } from '../common/interfaces';
import { PageToken } from '../gen/iceberg/types.gen';
import { TagAttachment, TagAttachmentTarget, TagScope } from '../gen/management/types.gen';

// Namespace path segments in app routes are joined with the unit separator.
const NS_SEPARATOR = '\x1F';

// The reverse-lookup currently returns ids only. Once PR 1914 enriches the target
// with `warehouse-name` / `namespace` (path) / `name`, this component upgrades
// automatically: it renders names and builds exact entity deep links. Until then
// it falls back to ids + the warehouse link. These optional fields are read
// defensively so no type regen is required to start consuming them.
type EnrichedTarget = TagAttachmentTarget & {
  'warehouse-name'?: string;
  namespace?: string[];
  name?: string;
};

const props = defineProps<{ tagDefinitionId: string; name: string }>();

const functions = useFunctions();
const router = useRouter();
const isActive = ref(false);
const loading = ref(false);
const attachments = ref<TagAttachment[]>([]);
const valueFilter = ref<string>('');
const targetTypeFilter = ref<TagScope | null>(null);
const warehouseFilter = ref<string | null>(null);

const TARGET_TYPES: TagScope[] = [
  'warehouse',
  'namespace',
  'table',
  'view',
  'generic-table',
  'column',
];

// Warehouses for the filter dropdown (loaded once when the dialog opens).
const warehouses = ref<{ id: string; name: string }[]>([]);
const warehouseOptions = computed(() =>
  warehouses.value.map((w) => ({ title: w.name, value: w.id })),
);
async function loadWarehouses() {
  if (warehouses.value.length) return;
  try {
    const res = await functions.listWarehouses(false);
    warehouses.value = (res.warehouses ?? []).map((w: any) => ({ id: w.id, name: w.name }));
  } catch {
    // non-fatal: warehouse filter just stays empty
  }
}

// Fallback warehouse-id -> name cache, used only when the target has no warehouse-name.
const warehouseNames = reactive<Record<string, string>>({});

// tabular-id -> { namespace path segments, name }, resolved via searchTabular
// (one browse-search per warehouse) when the API doesn't already return names.
// Covers tables and views (and columns, via their table-id).
const tabularInfo = reactive<Record<string, { namespace: string[]; name: string }>>({});

// namespace-id -> path segments, resolved by walking the warehouse namespace tree
// (listNamespaces returns namespace-uuids alongside paths). Used to show a readable
// namespace path instead of a bare UUID for namespace targets.
const namespaceInfo = reactive<Record<string, string[]>>({});

// table-id -> { field-id -> column name }, resolved by loading the table schema.
// Used to show a column name instead of a bare field-id for column targets.
const columnNames = reactive<Record<string, Record<number, string>>>({});
function columnName(target: TagAttachmentTarget): string | undefined {
  if (target.type !== 'column') return undefined;
  return columnNames[target['table-id']]?.[target['field-id']];
}

// The tabular id a target resolves against (columns resolve against their table).
function tabularKey(target: TagAttachmentTarget): string {
  switch (target.type) {
    case 'table':
    case 'column':
      return target['table-id'];
    case 'view':
      return target['view-id'];
    case 'generic-table':
      return target['generic-table-id'];
    default:
      return '';
  }
}

const headers: readonly Header[] = Object.freeze([
  { title: 'Target', key: 'target', align: 'start', sortable: false },
  { title: 'Value', key: 'value', align: 'start' },
  { title: 'Applied', key: 'created-at', align: 'start' },
]);

function warehouseLabel(target: TagAttachmentTarget): string {
  const t = target as EnrichedTarget;
  const id = t['warehouse-id'];
  return t['warehouse-name'] ?? warehouseNames[id] ?? id;
}

function entityName(target: TagAttachmentTarget): string | undefined {
  if (target.type === 'namespace') {
    const segs = (target as EnrichedTarget).namespace ?? namespaceInfo[target['namespace-id']];
    return segs?.length ? segs.join('.') : undefined;
  }
  return (target as EnrichedTarget).name ?? tabularInfo[tabularKey(target)]?.name;
}

// The entity's own id for non-warehouse targets.
function entityId(target: TagAttachmentTarget): string {
  switch (target.type) {
    case 'namespace':
      return target['namespace-id'];
    case 'table':
    case 'column':
      return target['table-id'];
    case 'view':
      return target['view-id'];
    case 'generic-table':
      return target['generic-table-id'];
    default:
      return '';
  }
}

// Build the deep link to a target's Tags tab. Returns the warehouse Tags tab when
// the entity's namespace/name aren't available yet (only warehouse is id-routable).
function targetPath(target: TagAttachmentTarget): string {
  const t = target as EnrichedTarget;
  const wh = t['warehouse-id'];
  const base = `/warehouse/${wh}`;
  if (t.type === 'warehouse') return base;

  // Prefer enriched fields from the API; else the searchTabular-resolved info.
  const info = tabularInfo[tabularKey(target)];
  const nsSegs =
    t.type === 'namespace'
      ? (t.namespace ?? namespaceInfo[t['namespace-id']])
      : (t.namespace ?? info?.namespace);
  const name = t.name ?? info?.name;

  if (!nsSegs?.length) return base; // can't reach the entity without its namespace path
  const ns = `${base}/namespace/${nsSegs.join(NS_SEPARATOR)}`;
  if (t.type === 'namespace') return ns;
  if (!name) return ns;
  switch (t.type) {
    case 'table':
    case 'column':
      return `${ns}/table/${name}`;
    case 'view':
      return `${ns}/view/${name}`;
    case 'generic-table':
      return `${ns}/generic-table/${name}`;
    default:
      return ns;
  }
}

function openTitle(target: TagAttachmentTarget): string {
  return targetPath(target) === `/warehouse/${target['warehouse-id']}` &&
    target.type !== 'warehouse'
    ? 'Open warehouse (entity deep-link pending API name support)'
    : `Open ${target.type}`;
}

function openTarget(target: TagAttachmentTarget) {
  isActive.value = false;
  router.push({ path: targetPath(target), query: { tab: 'tags' } });
}

function copy(text: string) {
  functions.copyToClipboard(text);
}

async function resolveWarehouseNames() {
  const ids = Array.from(
    new Set(
      attachments.value
        .filter((a) => !(a.target as EnrichedTarget)['warehouse-name'])
        .map((a) => a.target['warehouse-id']),
    ),
  );
  await Promise.all(
    ids
      .filter((id) => !(id in warehouseNames))
      .map(async (id) => {
        try {
          const wh = await functions.getWarehouse(id, false);
          warehouseNames[id] = wh.name;
        } catch {
          // leave the id as the fallback label
        }
      }),
  );
}

// Resolve table/view names + namespace paths via searchTabular, querying by the
// entity's own id and matching it exactly in the results. searchTabular returns
// tabular-id + namespace-name + tabular-name (same call the nav-tree search uses).
async function resolveTabulars() {
  const targets = attachments.value
    .map((a) => a.target)
    .filter((t) => ['table', 'view', 'column'].includes(t.type) && !(t as EnrichedTarget).name);
  // De-duplicate by the tabular id we need to resolve.
  const seen = new Set<string>();
  const jobs = targets.filter((t) => {
    const id = tabularKey(t);
    if (!id || seen.has(id) || tabularInfo[id]) return false;
    seen.add(id);
    return true;
  });
  await Promise.all(
    jobs.map(async (t) => {
      const id = tabularKey(t);
      try {
        const res = await functions.searchTabular(t['warehouse-id'], { search: id }, false);
        const match = (res.tabulars ?? []).find((r) => r['tabular-id'].id === id);
        if (match) {
          tabularInfo[id] = { namespace: match['namespace-name'], name: match['tabular-name'] };
        }
      } catch {
        // fall back to id + warehouse link
      }
    }),
  );
}

// Resolve namespace-id -> path by walking the warehouse namespace tree, matching the
// UUIDs the list endpoint returns. Stops per warehouse once all needed ids are found.
async function resolveNamespaces() {
  const byWh = new Map<string, Set<string>>();
  for (const a of attachments.value) {
    const t = a.target as EnrichedTarget;
    if (t.type !== 'namespace' || t.namespace) continue;
    const id = t['namespace-id'];
    if (namespaceInfo[id]) continue;
    let set = byWh.get(t['warehouse-id']);
    if (!set) {
      set = new Set();
      byWh.set(t['warehouse-id'], set);
    }
    set.add(id);
  }

  await Promise.all(
    [...byWh.entries()].map(async ([wh, needed]) => {
      const queue: (string | undefined)[] = [undefined];
      let guard = 0;
      while (queue.length && needed.size && guard < 300) {
        const parent = queue.shift();
        guard++;
        let pageToken: PageToken | undefined = undefined;
        do {
          let res: NamespaceResponse;
          try {
            res = await functions.listNamespaces(wh, parent, pageToken, false);
          } catch {
            break;
          }
          const names = (res.namespaces ?? []) as string[][];
          const map = (res.namespaceMap ?? {}) as Record<string, string>;
          for (const segs of names) {
            const uuid = map[segs.join('.')];
            if (uuid && needed.has(uuid)) {
              namespaceInfo[uuid] = segs;
              needed.delete(uuid);
            }
            queue.push(segs.join(NS_SEPARATOR));
          }
          pageToken = res['next-page-token'] as PageToken | undefined;
        } while (pageToken && needed.size);
      }
    }),
  );
}

// Resolve field-id -> column name by loading the schema of each table that has a
// column target. Runs after resolveTabulars, which provides the table's namespace/name.
async function resolveColumns() {
  const jobs = new Map<string, TagAttachmentTarget>();
  for (const a of attachments.value) {
    const t = a.target;
    if (t.type !== 'column') continue;
    const tableId = t['table-id'];
    if (columnNames[tableId] || !tabularInfo[tableId]) continue;
    if (!jobs.has(tableId)) jobs.set(tableId, t);
  }
  await Promise.all(
    [...jobs.entries()].map(async ([tableId, t]) => {
      const info = tabularInfo[tableId];
      try {
        const table: any = await functions.loadTableCustomized(
          t['warehouse-id'],
          info.namespace.join('.'),
          info.name,
          false,
        );
        const map: Record<number, string> = {};
        for (const schema of table?.metadata?.schemas ?? []) {
          for (const field of schema.fields ?? []) map[field.id] = field.name;
        }
        columnNames[tableId] = map;
      } catch {
        // leave the field-id as the fallback
      }
    }),
  );
}

async function reload() {
  loading.value = true;
  try {
    const res = await functions.listTagAttachments(
      props.tagDefinitionId,
      {
        value: valueFilter.value || undefined,
        targetType: targetTypeFilter.value || undefined,
        warehouseId: warehouseFilter.value || undefined,
        pageSize: 1000,
      },
      false,
    );
    attachments.value = res.attachments ?? [];
    await Promise.all([resolveWarehouseNames(), resolveTabulars(), resolveNamespaces()]);
    await resolveColumns();
  } catch {
    // handled by functions.handleError
  } finally {
    loading.value = false;
  }
}

watch(isActive, (open) => {
  if (open) {
    loadWarehouses();
    reload();
  }
});
</script>
