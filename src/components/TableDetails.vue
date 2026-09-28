<template>
  <div class="tdx-page">
    <!-- How the table is doing, from the health tab's own checks, with the way
         through to them: a verdict is the one thing about a table people want
         without going looking for it. -->
    <TableHealth
      v-if="warehouseId && namespacePath && tableName"
      summary
      class="tdx-health"
      :warehouse-id="warehouseId"
      :namespace-id="namespacePath"
      :table-name="tableName"
      @open-tab="$emit('open-tab', $event)" />

    <!-- One table of facts across the top. Identity and layout were two blocks
         in two columns, which left a hole beside whichever was shorter; they
         answer the same question — what is this table — so they are one list,
         paired two-up where the window is wide enough. -->
    <!-- No heading: this is the first thing under a tab named "details", and a
         title there would say the tab's name back to the reader. -->
    <section class="tdx-section">
      <dl class="tdx-kv tdx-kv--pairs">
        <!-- Each pair is its own row, so the rule under it runs the whole way
             across instead of breaking at the gutter between label and value. -->
        <div v-for="row in factRows" :key="row.label" class="tdx-kv__row">
          <dt>{{ row.label }}</dt>
          <dd :title="row.title">
            <v-icon v-if="row.icon" :color="row.iconColor" size="16">{{ row.icon }}</v-icon>
            <template v-if="row.chips">
              <v-chip
                v-for="chip in row.chips"
                :key="chip.text"
                size="x-small"
                :color="chip.color"
                :prepend-icon="chip.icon"
                variant="tonal">
                {{ chip.text }}
              </v-chip>
            </template>
            <v-tooltip v-else-if="row.full" location="bottom" :text="row.full">
              <template #activator="{ props: tp }">
                <span
                  v-bind="tp"
                  :class="['tdx-kv__value', { 'font-mono': row.mono }]"
                  style="cursor: help">
                  {{ row.value }}
                </span>
              </template>
            </v-tooltip>
            <span v-else :class="['tdx-kv__value', { 'font-mono': row.mono }]">
              {{ row.value }}
            </span>
            <v-chip v-if="row.suffix" size="x-small" variant="tonal">{{ row.suffix }}</v-chip>
            <v-btn
              v-if="row.copy"
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              class="tdx-kv__copy"
              @click="copyToClipboard(String(row.full ?? row.value))"></v-btn>
          </dd>
        </div>
      </dl>
    </section>

    <!-- What is attached to the table, side by side: a short list of chips and
         a long list of key/values, each filling the rest of the tab. -->
    <div class="tdx-attached">
      <section v-if="tableId && warehouseId" class="tdx-section tdx-attached__tags">
        <div class="tdx-head">
          <v-icon icon="mdi-tag-multiple-outline" size="16" color="primary" class="mr-2"></v-icon>
          Tags
        </div>
        <EntityTagsChips scope="table" :warehouse-id="warehouseId" :entity-id="tableId" effective />
        <p class="tdx-note">
          Tags on individual columns live in the
          <a href="#" @click.prevent="$emit('open-tab', 'schema')">Schema</a>
          tab, on the field they describe.
        </p>
      </section>

      <section class="tdx-section tdx-attached__props">
        <div class="tdx-head">
          <v-icon icon="mdi-cog-outline" size="16" color="primary" class="mr-2"></v-icon>
          Properties
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ propertyItems.length }}</v-chip>
          <v-spacer></v-spacer>
          <v-text-field
            v-if="allPropertyItems.length > 8"
            v-model="propertySearch"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            placeholder="Find a property"
            prepend-inner-icon="mdi-magnify"
            class="tdx-head__search"></v-text-field>
          <v-switch
            v-if="systemPropCount > 0"
            v-model="hideSystemProps"
            color="primary"
            density="compact"
            hide-details
            class="tdx-head__switch ml-3"
            :label="`Hide system (${systemPropCount})`"></v-switch>
        </div>

        <div class="tdx-attached__table">
          <v-data-table-virtual
            v-if="propertyItems.length"
            :headers="propertyHeaders"
            :items="propertyItems"
            density="compact"
            fixed-header
            height="100%"
            style="height: 100%"
            item-value="key"
            hide-default-footer
            :items-per-page="-1">
            <template #item.key="{ item }">
              <span class="tdx-prop-key">{{ item.key }}</span>
            </template>
            <template #item.value="{ item }">
              <div class="d-flex align-start tdx-prop-value">
                <span class="font-mono text-wrap">{{ item.value }}</span>
                <v-btn
                  icon="mdi-content-copy"
                  size="x-small"
                  variant="text"
                  class="tdx-kv__copy ml-1"
                  @click="copyToClipboard(String(item.value))"></v-btn>
              </div>
            </template>
          </v-data-table-virtual>
          <div v-else class="text-medium-emphasis text-body-2 pt-2">
            {{ propertySearch ? 'No property matches that.' : 'No properties set' }}
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import EntityTagsChips from './EntityTagsChips.vue';
import TableHealth from './TableHealth.vue';
import type { LoadTableResult, PartitionField, SortField } from '../gen/iceberg/types.gen';

// Props
defineEmits<{
  /** Ask the host to show another of the table's tabs. */
  'open-tab': [tab: string];
}>();

const props = defineProps<{
  table: LoadTableResult;
  warehouseId?: string;
  /** Unit-separator namespace path, for the panes that load for themselves. */
  namespacePath?: string;
  tableName?: string;
  /** Whether the reader may commit — the properties block is offered empty to
      someone who can add one, and hidden from someone who cannot. */
  canEdit?: boolean;
}>();

// Governance tags: bind against the table UUID.
const tableId = computed(() => props.table.metadata?.['table-uuid'] || '');

// Composables
const functions = useFunctions();

// Methods

const copyToClipboard = (text: string) => {
  functions.copyToClipboard(text);
};

// Properties as data-table items
const propertyHeaders = [
  { title: 'Property', key: 'key', width: '300px' },
  { title: 'Value', key: 'value' },
];

// System/managed properties (e.g. Lakekeeper maintenance overrides) — hidden by
// default behind a toggle so user-set properties aren't buried.
const SYSTEM_PROP_PREFIXES = ['lakekeeper.'];
const isSystemProp = (key: string) => SYSTEM_PROP_PREFIXES.some((p) => key.startsWith(p));
const hideSystemProps = ref(true);

const allPropertyItems = computed(() => {
  const props_ = props.table.metadata.properties;
  if (!props_) return [];
  return Object.entries(props_).map(([key, value]) => ({ key, value, system: isSystemProp(key) }));
});
const systemPropCount = computed(() => allPropertyItems.value.filter((i) => i.system).length);
// A table can carry dozens of properties, and the one being looked for is
// usually known by name.
const propertySearch = ref('');
const propertyItems = computed(() => {
  const q = (propertySearch.value ?? '').trim().toLowerCase();
  return allPropertyItems.value.filter((i) => {
    if (hideSystemProps.value && i.system) return false;
    if (!q) return true;
    return `${i.key} ${i.value}`.toLowerCase().includes(q);
  });
});

const formatTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 7 * 86_400_000) {
    const mins = Math.round(abs / 60_000);
    const hours = Math.round(abs / 3_600_000);
    const days = Math.round(abs / 86_400_000);
    let label: string;
    if (abs < 60_000) label = 'just now';
    else if (mins < 60) label = `${mins} min`;
    else if (hours < 48) label = `${hours} h`;
    else label = `${days} d`;
    return diff > 0 ? `in ${label}` : `${label} ago`;
  }
  return date.toLocaleString();
};

const absoluteTimestamp = (timestampMs: number): string => {
  if (!timestampMs) return '';
  return new Date(timestampMs).toLocaleString();
};

const refsSummary = computed(() => {
  const refs = (props.table.metadata as any)?.refs;
  if (!refs || typeof refs !== 'object') return '';
  const entries = Object.entries(refs) as [string, any][];
  if (entries.length === 0) return '';
  const branches = entries.filter(([, v]) => v?.type === 'branch').length;
  const tags = entries.filter(([, v]) => v?.type === 'tag').length;
  const parts: string[] = [];
  if (branches > 0) parts.push(`${branches} branch${branches === 1 ? '' : 'es'}`);
  if (tags > 0) parts.push(`${tags} tag${tags === 1 ? '' : 's'}`);
  return parts.join(' · ');
});

// Build a map of field-id → field-name across all schemas for resolving source-ids
const fieldNameMap = computed(() => {
  const map: Record<number, string> = {};
  if (props.table.metadata.schemas) {
    for (const schema of props.table.metadata.schemas) {
      if (schema.fields) {
        for (const field of schema.fields) {
          map[field.id] = field.name;
        }
      }
    }
  }
  return map;
});

const resolveFieldName = (sourceId: number): string => {
  return fieldNameMap.value[sourceId] || `field-${sourceId}`;
};

const formatPartitionField = (field: PartitionField): string => {
  const name = resolveFieldName(field['source-id']);
  if (field.transform === 'identity') return name;
  return `${field.transform}(${name})`;
};

const formatSortField = (field: SortField): string => {
  const name = resolveFieldName(field['source-id']);
  const transform = field.transform === 'identity' ? name : `${field.transform}(${name})`;
  return `${transform} ${field.direction} ${field['null-order']}`;
};

// Active partition spec
const activePartitionSpec = computed(() => {
  const specs = props.table.metadata['partition-specs'];
  const defaultId = props.table.metadata['default-spec-id'];
  if (!specs) return null;
  return specs.find((s) => s['spec-id'] === defaultId) || specs[0] || null;
});

// Active sort order
const activeSortOrder = computed(() => {
  const orders = props.table.metadata['sort-orders'];
  const defaultId = props.table.metadata['default-sort-order-id'];
  if (!orders) return null;
  return orders.find((o) => o['order-id'] === defaultId) || orders[0] || null;
});

// Schema evolution — collect all schemas and diff fields
// Deletion protection lives behind its own endpoint, so it is loaded here
// rather than read off the table metadata.
const protectionState = ref<boolean | null>(null);
const protectionUpdatedAt = ref('');

// The host reloads with `Object.assign(table, …)`, so the table object's own
// identity never changes — `metadata` is what is replaced, and watching it is
// what makes a reload (or a protection toggle from the actions menu) re-read.
watch(
  () => [props.warehouseId, props.table.metadata] as const,
  async () => {
    const tableUuid = (props.table.metadata as any)?.['table-uuid'];
    if (!props.warehouseId || !tableUuid) {
      protectionState.value = null;
      return;
    }
    try {
      const prot = await functions.getTableProtection(props.warehouseId, tableUuid);
      protectionState.value = prot.protected;
      protectionUpdatedAt.value = prot.updated_at
        ? formatTimestamp(Date.parse(prot.updated_at))
        : '';
    } catch {
      // A reader without `get_protection` still gets every other tile; the
      // dash says "not known here", which is the truth.
      protectionState.value = null;
      protectionUpdatedAt.value = '';
    }
  },
  { immediate: true },
);

// Identity & location key/value rows
type FactRow = {
  label: string;
  value?: string | number;
  /** Values that are chips rather than text: partition and sort fields. */
  chips?: Array<{ text: string; color?: string; icon?: string }>;
  /** A trailing chip that qualifies the value, e.g. which spec it came from. */
  suffix?: string;
  mono?: boolean;
  copy?: boolean;
  icon?: string;
  iconColor?: string;
  title?: string;
  /** The whole value, when what is shown is an abbreviation of it. */
  full?: string;
};

// The middle goes, not the tail: two tables in one warehouse share a long
// prefix and differ at the end, so cutting the end is cutting the only part
// that identifies the row. The whole path is in the tooltip and on the
// clipboard button.
function shortenPath(value: string, max = 44): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) * 0.55);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const factRows = computed(() => {
  const m = props.table.metadata as any;
  const rows: FactRow[] = [];
  rows.push({
    label: 'Format',
    value: m['format-version'] ? `Iceberg v${m['format-version']}` : 'Iceberg',
    icon: 'mdi-tag-outline',
    iconColor: 'primary',
  });
  rows.push({ label: 'Table UUID', value: m['table-uuid'], mono: true, copy: true });
  if (m.location)
    rows.push({
      label: 'Data location',
      value: shortenPath(m.location),
      full: m.location,
      mono: true,
      copy: true,
    });
  if (props.table['metadata-location'])
    rows.push({
      label: 'Metadata location',
      value: shortenPath(props.table['metadata-location']),
      full: props.table['metadata-location'],
      mono: true,
      copy: true,
    });
  if (m['last-updated-ms'])
    rows.push({
      label: 'Last updated',
      value: absoluteTimestamp(m['last-updated-ms']),
    });
  if (m['current-snapshot-id'])
    rows.push({
      label: 'Current snapshot ID',
      value: String(m['current-snapshot-id']),
      mono: true,
      copy: true,
    });
  if (refsSummary.value) rows.push({ label: 'Refs', value: refsSummary.value });

  // Deletion protection is a property of the table, not of the menu that
  // toggles it, so it is read with the rest of what the table is.
  rows.push({
    label: 'Protection',
    // A chip, and amber when it is off: "this table can be dropped" is the
    // state worth noticing, and plain text next to a grey icon was not it.
    chips: [
      protectionState.value === null
        ? { text: 'unknown', icon: 'mdi-help-circle-outline' }
        : protectionState.value
          ? { text: 'On', color: 'info', icon: 'mdi-lock-outline' }
          : { text: 'Off', color: 'warning', icon: 'mdi-lock-open-variant-outline' },
    ],
    title:
      protectionState.value === null
        ? 'Deletion protection'
        : protectionState.value
          ? `Deletion protection is on${protectionUpdatedAt.value ? ` · set ${protectionUpdatedAt.value}` : ''} — drop and expiration are refused until it is turned off`
          : 'Deletion protection is off — this table can be dropped',
  });

  rows.push({
    label: 'Partitioning',
    value: activePartitionSpec.value?.fields.length ? undefined : 'Unpartitioned',
    chips: activePartitionSpec.value?.fields.length
      ? activePartitionSpec.value.fields.map((f) => ({
          text: formatPartitionField(f),
          color: 'primary',
        }))
      : undefined,
    suffix: activePartitionSpec.value ? `spec ${activePartitionSpec.value['spec-id']}` : undefined,
  });
  rows.push({
    label: 'Sort order',
    value: activeSortOrder.value?.fields.length ? undefined : 'Unsorted',
    chips: activeSortOrder.value?.fields.length
      ? activeSortOrder.value.fields.map((f) => ({ text: formatSortField(f), color: 'info' }))
      : undefined,
    suffix: activeSortOrder.value ? `order ${activeSortOrder.value['order-id']}` : undefined,
  });

  return rows;
});
</script>

<style scoped>
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}

.schema-json {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
  border-radius: 6px;
  padding: 4px 8px;
}

.text-wrap {
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}

/* The tab: a fact list across the top, then tags and properties filling what
   is left. The properties table is the scroller, never the column around it. */
.tdx-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  min-height: 0;
  padding: 16px;
}
.tdx-health {
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-bottom: 8px;
  margin-bottom: -8px;
}

/* The same two columns as the fact list above, on the same gutter: tags start
   where the left-hand facts start, properties where the right-hand ones do.
   Two different splits on one screen read as a page that does not line up. */
.tdx-attached {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  flex: 1 1 auto;
  min-height: 0;
}
@media (min-width: 1264px) {
  .tdx-attached {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
  }
}
.tdx-attached__tags {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
.tdx-attached__props {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.tdx-attached__table {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
/* Stacked below the pair width: the tab scrolls as one and the table takes a
   fixed slice rather than fighting for the leftovers. */
@media (max-width: 1263px) {
  .tdx-page {
    overflow-y: auto;
  }
  .tdx-attached {
    flex: 0 0 auto;
  }
  .tdx-attached__tags {
    overflow: visible;
  }
  .tdx-attached__table {
    height: 320px;
    flex: 0 0 auto;
  }
}

.tdx-note {
  margin: 12px 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.tdx-note a {
  color: rgb(var(--v-theme-primary));
}

.tdx-head__search {
  flex: 0 1 220px;
  max-width: 220px;
}
.tdx-prop-key {
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.tdx-prop-value {
  padding: 4px 0;
}
.tdx-prop-value .tdx-kv__copy {
  flex: 0 0 auto;
}

/* A section is an icon, a name and a hairline — the outlined card and its
   filled title band cost ~56px of chrome per section and said nothing the
   heading did not. */
.tdx-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-height: 32px;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
/* The heading's own words are uppercase; the controls sharing its line are not
   headings and keep their own casing. */
.tdx-head :deep(.v-btn),
.tdx-head :deep(.v-chip),
.tdx-head :deep(.v-label),
.tdx-head :deep(.v-field) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
.tdx-head__switch {
  flex: 0 0 auto;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}

.tdx-section {
  margin-bottom: 0;
  min-width: 0;
}

/* Label/value pairs. On a wide window two pairs share a row: a full-width list
   of short values is mostly empty space. The pair — not the label and the value
   separately — carries the rule, so each row reads as one line across, and the
   labels keep one width in both columns so the two sides line up. */
.tdx-kv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
}
@media (min-width: 1264px) {
  .tdx-kv--pairs {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
  }
}
.tdx-kv__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-height: 34px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.tdx-kv dt {
  flex: 0 0 136px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding-top: 2px;
}
.tdx-kv dd {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.tdx-kv__value {
  min-width: 0;
}
/* The copy button appears on the row it copies, so twelve of them do not sit
   in a column of their own down the page. */
.tdx-kv__copy {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tdx-kv dd:hover .tdx-kv__copy,
.tdx-kv__copy:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .tdx-kv__copy {
    opacity: 1;
  }
}

/* Ten rows and then the table scrolls, header pinned: a page size of 25 or 50
   otherwise pushes the rest of the page — and the pager, the only control that
   matters there — below the fold. `max-height` on the wrapper rather than the
   `height` prop, so a table of three rows is three rows tall. */
.snapshot-table :deep(.v-table__wrapper) {
  max-height: calc(10 * 36px + 40px);
}
</style>
