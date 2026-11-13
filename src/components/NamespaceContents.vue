<template>
  <!-- Everything a namespace holds, in one table. "All" reads like one level of
       the navigation tree; a chip narrows the same table to one type. Rows load
       as the reader scrolls, and rename, delete and the bulk actions work on
       every chip alike. -->
  <div class="nsc">
    <div class="nsc-bar">
      <!-- First on the line, beside what it reloads. Reload in place: changes made elsewhere (another tab, another user,
           an engine) otherwise only show after leaving and coming back. -->
      <v-btn
        icon="mdi-refresh"
        variant="text"
        size="small"
        title="Reload"
        aria-label="Reload"
        :class="{ 'nsc-reload': !atWarehouse }"
        :loading="loading"
        @click="load"></v-btn>
      <!-- A warehouse holds only namespaces, so there is nothing to narrow. -->
      <v-chip-group
        v-if="!atWarehouse"
        :model-value="chipModel"
        multiple
        selected-class="v-chip--selected text-primary"
        class="nsc-types"
        @update:model-value="setChips($event)">
        <v-chip
          v-for="t in visibleChips"
          :key="t.value"
          :value="t.value"
          :prepend-icon="t.icon"
          size="small"
          variant="outlined"
          filter>
          {{ t.label }}
        </v-chip>
      </v-chip-group>
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        label="Filter loaded results"
        prepend-inner-icon="mdi-filter"
        variant="underlined"
        density="compact"
        hide-details
        clearable
        class="nsc-search"></v-text-field>
      <!-- One "New" for whatever can be created here: the entries follow the
           chip and the reader's rights. Eager, so each dialog outlives the menu
           closing on the click that opened it. -->
      <v-menu v-if="createEntries" location="bottom end" eager>
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-plus"
            append-icon="mdi-menu-down">
            New
          </v-btn>
        </template>
        <v-list density="compact" min-width="220">
          <NamespaceAddDialog
            v-if="canCreate.namespace"
            :parent-path="namespacePath"
            @add-namespace="addNamespace">
            <template #activator="{ props: p }">
              <v-list-item v-bind="p" prepend-icon="mdi-folder-plus-outline" title="Namespace" />
            </template>
          </NamespaceAddDialog>
          <TableCreate
            v-if="canCreate.table"
            :warehouse-id="warehouseId"
            :namespace-id="dottedPath"
            @created="onTableCreated">
            <template #activator="{ props: p }">
              <v-list-item v-bind="p" prepend-icon="mdi-table-plus" title="Table" />
            </template>
          </TableCreate>
          <TableRegister
            v-if="canCreate.table"
            :warehouse-id="warehouseId"
            :namespace-id="dottedPath"
            @registered="onTableCreated">
            <template #activator="{ props: p }">
              <v-list-item
                v-bind="p"
                prepend-icon="mdi-table-arrow-down"
                title="Register table"
                subtitle="From an existing metadata file" />
            </template>
          </TableRegister>
          <DatasetCreate
            v-if="canCreate.dataset"
            :warehouse-id="warehouseId"
            :namespace-path="dottedPath"
            @created="afterChange">
            <template #activator="{ props: p }">
              <v-list-item v-bind="p" prepend-icon="mdi-file-plus-outline" title="Dataset" />
            </template>
          </DatasetCreate>
        </v-list>
      </v-menu>
    </div>

    <!-- Acts on the selection; only once a selected row is one that may go. -->
    <div v-if="selected.length" class="nsc-selection">
      <span class="text-body-2 font-weight-medium">{{ selected.length }} selected</span>
      <v-spacer></v-spacer>
      <slot name="bulk-actions" :selected="selected" :selected-iceberg="selectedIceberg"></slot>
      <v-btn
        v-if="selected.some((r) => canRestore(r))"
        size="small"
        variant="text"
        prepend-icon="mdi-restore"
        :loading="bulkRestoring"
        @click="restoreSelected">
        Restore ({{ selectedDeleted.length }})
      </v-btn>
      <v-btn
        v-if="selected.some((r) => canDrop(r))"
        size="small"
        variant="text"
        prepend-icon="mdi-delete-outline"
        @click="openBulkDelete">
        Delete ({{ selectedLive.length }})
      </v-btn>
      <v-btn size="small" variant="text" icon="mdi-close" @click="selected = []"></v-btn>
    </div>

    <div class="nsc-main">
      <div class="nsc-body">
        <v-alert v-if="allRefused" type="warning" variant="tonal" class="ma-4">
          {{ refusedText }}
        </v-alert>

        <template v-else>
          <!-- A list that failed for another reason than a refusal says so; in
             "All" a refused list is simply absent, since a mixed list never
             claims to be complete for one type. -->
          <v-alert
            v-for="f in failures"
            :key="f.kind"
            type="error"
            variant="tonal"
            density="compact"
            class="mx-4 mb-2 flex-0-0">
            {{ f.message }}
          </v-alert>

          <v-data-table-virtual
            ref="tableRef"
            v-model="selected"
            v-model:sort-by="sortBy"
            :row-props="rowProps"
            height="100%"
            :headers="headers"
            :items="visibleRows"
            :loading="loading"
            item-value="key"
            return-object
            :show-select="!atWarehouse"
            density="compact"
            fixed-header
            hover
            class="nsc-table">
            <template #item.name="{ item }">
              <td :class="{ 'nsc-name': item.kind !== 'deleted' }" @click="open(item)">
                <span class="d-flex align-center">
                  <v-icon v-if="rowBrandIcon(item)" size="small" class="mr-2">
                    <v-img :src="rowBrandIcon(item)!" width="18" height="18" />
                  </v-icon>
                  <v-icon v-else size="small" class="mr-2" :color="KIND_META[item.kind].color">
                    {{ KIND_META[item.kind].icon }}
                  </v-icon>
                  <span class="nsc-name__text">{{ item.name }}</span>
                </span>
              </td>
            </template>
            <template #item.type="{ item }">
              <span class="text-medium-emphasis">{{ typeLabel(item) }}</span>
            </template>
            <template #item.deletedAt="{ item }">
              <span :title="item.deletedAt">{{ relative(item.deletedAt) }}</span>
            </template>
            <template #item.expiresAt="{ item }">
              <span :title="item.expiresAt">{{ relative(item.expiresAt) }}</span>
            </template>
            <template #item.actions="{ item }">
              <!-- Restore needs `undrop` on the item itself; asked by id, since a
                 deleted item has no name lookup any more. -->
              <div v-if="item.kind === 'deleted'" class="d-flex justify-end align-center">
                <span v-if="rowErrors[item.key]" class="text-caption text-error mr-2">
                  {{ rowErrors[item.key] }}
                </span>
                <v-btn
                  v-if="canRestore(item)"
                  icon="mdi-restore"
                  variant="text"
                  color="primary"
                  size="small"
                  title="Restore"
                  :loading="restoring === item.key"
                  @click="restore(item)"></v-btn>
              </div>
              <div v-else class="d-flex justify-end align-center">
                <!-- The plain way in: a row click shows details, this goes there. -->
                <v-btn
                  variant="text"
                  size="small"
                  class="nsc-open"
                  :title="`Open ${typeLabel(item).toLowerCase()}`"
                  @click="open(item)">
                  Open
                </v-btn>
                <!-- Offered only once the answer is yes: a rename needs the right
                   on the item and the create right on this namespace. -->
                <v-btn
                  v-if="canRename(item)"
                  icon="mdi-rename-outline"
                  variant="text"
                  color="primary"
                  size="small"
                  title="Rename"
                  @click="openRename(item)"></v-btn>
                <DeleteDialog
                  v-if="canDrop(item)"
                  :type="deleteType(item)"
                  :name="item.name"
                  @delete-with-options="dropRow(item, $event)"
                  @delete-table-with-options="dropRow(item, $event)"
                  @delete-view-with-options="dropRow(item, $event)"></DeleteDialog>
              </div>
            </template>
            <template #no-data>
              <div v-if="loading"></div>
              <div v-else-if="search" class="text-medium-emphasis">
                Nothing loaded matches "{{ search }}".
              </div>
              <div v-else class="text-medium-emphasis">{{ emptyText }}</div>
            </template>
          </v-data-table-virtual>

          <!-- Read a page at a time as the reader scrolls; this line is the
             progress, and says when the list is not yet the whole answer. -->
          <div v-if="loadingMore || (hasMore && !loading)" class="nsc-more">
            <v-progress-linear
              v-if="loadingMore"
              indeterminate
              color="primary"
              class="nsc-more__bar"></v-progress-linear>
            <span class="text-caption text-medium-emphasis">
              {{
                loadingMore
                  ? `Loading more… ${rows.length} so far`
                  : `${rows.length} loaded — scroll to the end for more`
              }}
            </span>
          </div>
        </template>
      </div>

      <!-- Details of the clicked row, one request when it opens. Folds by width,
         so the table grows back rather than jumping. -->
      <DetailsSidePanel :open="!!detailRow" storage-key="lakekeeper.contents.detailsWidth">
        <ContentDetailsPanel
          v-if="shownDetail"
          ref="detailsRef"
          :warehouse-id="warehouseId"
          :namespace-path="namespacePath"
          :row="shownDetail"
          :type-label="typeLabel(shownDetail)"
          :icon="KIND_META[shownDetail.kind].icon"
          :icon-color="KIND_META[shownDetail.kind].color"
          :brand-icon="rowBrandIcon(shownDetail)"
          @close="detailRow = null"
          @open="open(shownDetail)" />
      </DetailsSidePanel>
    </div>

    <!-- Rename -->
    <v-dialog v-model="renameOpen" max-width="440" persistent>
      <v-card v-if="renameTarget">
        <v-card-title class="text-subtitle-1 d-flex align-center py-3">
          <v-icon color="primary" class="mr-2">mdi-rename-outline</v-icon>
          Rename {{ typeLabel(renameTarget).toLowerCase() }}
        </v-card-title>
        <v-card-text>
          <div v-if="renameChecking" class="d-flex align-center ga-2 text-medium-emphasis">
            <v-progress-circular indeterminate size="16" width="2"></v-progress-circular>
            Checking whether it can be renamed…
          </div>
          <template v-else-if="renameAllowedByLayout">
            <v-alert type="info" variant="tonal" density="compact" class="mb-4">
              Rename
              <strong>"{{ renameTarget.name }}"</strong>
              {{
                renameTarget.kind === 'namespace'
                  ? 'and keep it under the same parent.'
                  : 'within the same namespace.'
              }}
            </v-alert>
            <v-text-field
              v-model="renameValue"
              label="New name"
              density="compact"
              hide-details="auto"
              variant="outlined"
              :placeholder="renameTarget.name"
              autofocus
              @keyup.enter="renameValid && executeRename()"
              :rules="[
                (v: string) => !!v || 'Required',
                (v: string) => !/\s/.test(v) || 'No spaces allowed',
                (v: string) => v !== renameTarget?.name || 'Must be different from current name',
              ]"></v-text-field>
          </template>
          <v-alert v-else type="warning" variant="tonal" density="compact">
            {{
              renameRefusal ??
              'Renaming is not available because the warehouse uses a non-default storage layout. Locations are derived from the name, so renaming would break the storage path.'
            }}
          </v-alert>
          <v-alert v-if="renameError" type="error" variant="tonal" density="compact" class="mt-3">
            {{ renameError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="renameLoading" @click="renameOpen = false">
            {{ renameAllowedByLayout ? 'Cancel' : 'Close' }}
          </v-btn>
          <v-btn
            v-if="renameAllowedByLayout && !renameChecking"
            color="primary"
            variant="flat"
            :loading="renameLoading"
            :disabled="!renameValid"
            @click="executeRename">
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Bulk delete -->
    <v-dialog v-model="bulkOpen" max-width="600" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center py-3">
          <v-icon color="error" class="mr-2">mdi-delete-outline</v-icon>
          Delete {{ bulkCandidates.length }} {{ bulkCandidates.length === 1 ? 'item' : 'items' }}?
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
            This permanently removes the selected items and cannot be undone.
            {{ bulkForce ? '' : 'Delete-protected items will be skipped.' }}
          </v-alert>
          <v-alert v-if="bulkKept" type="info" variant="tonal" density="compact" class="mb-3">
            {{ bulkKept }} of the selected {{ bulkKept === 1 ? 'stays' : 'stay' }}: namespaces are
            deleted one at a time, and anything you are not allowed to delete is kept.
          </v-alert>
          <v-switch
            v-if="bulkCandidates.some((r) => r.kind === 'table' || r.kind === 'view')"
            v-model="bulkForce"
            color="info"
            density="compact"
            :label="
              bulkForce ? 'Force: bypass protection and soft-deletion' : 'Force off'
            "></v-switch>
          <v-switch
            v-if="bulkCandidates.some((r) => r.kind === 'table')"
            v-model="bulkPurge"
            color="info"
            density="compact"
            :label="bulkPurge ? 'Purge the tables\' data and metadata' : 'Purge off'"></v-switch>

          <v-list v-if="bulkResults.length" density="compact" class="mt-2" max-height="220">
            <v-list-item v-for="r in bulkResults" :key="r.name">
              <template #prepend>
                <v-icon :color="r.ok ? 'success' : 'error'" size="small">
                  {{ r.ok ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                </v-icon>
              </template>
              <v-list-item-title class="text-body-2">{{ r.name }}</v-list-item-title>
              <v-list-item-subtitle v-if="!r.ok" class="text-error">
                {{ r.reason }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="bulkDeleting" @click="bulkOpen = false">
            {{ bulkDone ? 'Close' : 'Cancel' }}
          </v-btn>
          <v-btn
            v-if="!bulkDone"
            color="error"
            variant="flat"
            :loading="bulkDeleting"
            :disabled="!bulkCandidates.length"
            @click="confirmBulkDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useRouter } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { useItemRights, type ItemTarget } from '@/composables/useItemRights';
import { isForbiddenError } from '@/common/errorUtils';
import { tagRefusal } from '@/composables/useTagRights';
import { formatIcon } from '@/common/formatIcons';
import { namespaceMoveRefusal } from '@/common/namespaceMove';
import {
  normalizeSelection,
  type ContentKind,
  type ContentSelection,
  type ContentType,
} from '@/common/namespaceContents';
import NamespaceAddDialog from './NamespaceAddDialog.vue';
import DatasetCreate from './DatasetCreate.vue';
import TableCreate from './TableCreate.vue';
import TableRegister from './TableRegister.vue';
import DeleteDialog from './DeleteDialog.vue';
import ContentDetailsPanel from './ContentDetailsPanel.vue';
import DetailsSidePanel from './DetailsSidePanel.vue';

type Kind = 'namespace' | 'table' | 'generic' | 'view' | 'dataset' | 'deleted';
type ListKey = 'namespaces' | 'tables' | 'views' | 'generic' | 'deleted';

type ContentRow = {
  key: string;
  kind: Kind;
  name: string;
  /** Table format; `iceberg` for Iceberg tables, the generic format otherwise. */
  format?: string;
  /** Full path of a child namespace. */
  path?: string[];
  /** Protection, as the list answered it; undefined where the list carries none
      (generic tables, datasets, deleted items) or the server left it out. */
  protected?: boolean;
  /** A generic table's or dataset's id, as the list gives it. */
  uuid?: string;
  /** A deleted item: its id, what it was, and when it went and goes for good. */
  id?: string;
  typ?: 'table' | 'view' | 'generic-table';
  deletedAt?: string;
  expiresAt?: string;
};

const props = defineProps<{
  warehouseId: string;
  /** Unit-separator namespace path, as in the route. Empty lists the
      warehouse's top-level namespaces — the same table, without the chips. */
  namespacePath: string;
  storageLayout?: string;
  /** The chosen types, several at once; empty is "All". The host keeps it in the URL. */
  selection: ContentSelection;
  /** The warehouse soft-deletes, so dropped items can be restored for a while. */
  softDeletion?: boolean;
}>();

const emit = defineEmits<{
  'update:selection': [selection: ContentSelection];
  /** A table was created or registered, for hosts that refresh more than this list. */
  tableCreated: [name: string];
}>();

const TYPE_CHIPS: Array<{ value: ContentType; label: string; icon: string }> = [
  { value: 'all', label: 'All', icon: 'mdi-format-list-bulleted' },
  { value: 'namespaces', label: 'Namespaces', icon: 'mdi-folder-outline' },
  { value: 'tables', label: 'Tables', icon: 'mdi-table' },
  { value: 'generic', label: 'Generic tables', icon: 'mdi-table-cog' },
  { value: 'views', label: 'Views', icon: 'mdi-view-grid-outline' },
  { value: 'datasets', label: 'Datasets', icon: 'mdi-file-multiple-outline' },
  { value: 'deleted', label: 'Deleted', icon: 'mdi-delete-clock-outline' },
];

const KIND_META: Record<Kind, { icon: string; color?: string; label: string }> = {
  namespace: { icon: 'mdi-folder', label: 'namespaces' },
  table: { icon: 'mdi-table', label: 'tables' },
  generic: { icon: 'mdi-alpha-g', label: 'generic tables' },
  view: { icon: 'mdi-view-grid-outline', label: 'views' },
  dataset: { icon: 'mdi-file-multiple-outline', color: 'amber-darken-2', label: 'datasets' },
  deleted: { icon: 'mdi-delete-clock-outline', label: 'deleted items' },
};

/** The list each type is read from, and the row kinds it keeps from it. The
 *  generic list carries two kinds, generic tables and datasets. */
const SOURCE: Record<ContentKind, { list: ListKey; kind: Kind }> = {
  namespaces: { list: 'namespaces', kind: 'namespace' },
  tables: { list: 'tables', kind: 'table' },
  views: { list: 'views', kind: 'view' },
  generic: { list: 'generic', kind: 'generic' },
  datasets: { list: 'generic', kind: 'dataset' },
  deleted: { list: 'deleted', kind: 'deleted' },
};
/** Tree order: each list is read to its end before the next starts, so a later
 *  page is always appended and nothing above it moves. */
const LIST_ORDER: ListKey[] = ['namespaces', 'tables', 'views', 'generic', 'deleted'];
const PAGE_SIZE = 100;
/** How close to the end of the list scrolling asks for the next page. */
const NEAR_END_PX = 300;

const router = useRouter();
const functions = useFunctions();
const visual = useVisualStore();
const rights = useItemRights();

const ACTIONS_HEADER = {
  title: 'Actions',
  key: 'actions',
  sortable: false,
  align: 'end' as const,
  width: '170px',
};
// Name A–Z unless the reader picks another column; reset per namespace.
const sortBy = ref<Array<{ key: string; order: 'asc' | 'desc' }>>([{ key: 'name', order: 'asc' }]);
// Sorting is the table's own, over what has loaded; with no sort the rows keep
// tree order. Type sorts by its label, so "Iceberg table" and "View" order as read.
const headers = computed(() =>
  isDeleted.value
    ? [
        { title: 'Name', key: 'name', sortable: true },
        { title: 'Type', key: 'type', sortable: true, width: '160px', value: typeLabel },
        { title: 'Deleted', key: 'deletedAt', sortable: true, width: '160px' },
        { title: 'Expires', key: 'expiresAt', sortable: true, width: '160px' },
        ACTIONS_HEADER,
      ]
    : [
        { title: 'Name', key: 'name', sortable: true },
        { title: 'Type', key: 'type', sortable: true, width: '200px', value: typeLabel },
        ACTIONS_HEADER,
      ],
);

const search = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const rows = ref<ContentRow[]>([]);
const selected = ref<ContentRow[]>([]);
/** The list being read, and where it continues. */
const cursor = reactive({ list: 0, token: '' });
const refused = reactive<Record<ListKey, boolean>>({
  namespaces: false,
  tables: false,
  views: false,
  generic: false,
  deleted: false,
});
const failures = ref<Array<{ kind: ListKey; message: string }>>([]);
const tableRef = ref<any>(null);
let loadToken = 0;

// The tree and some routes take dot-separated paths.
// eslint-disable-next-line no-control-regex
const dottedPath = computed(() => props.namespacePath.replace(/\x1F/g, '.'));
const namespaceSegments = computed(() => props.namespacePath.split('\x1F'));
const atWarehouse = computed(() => !props.namespacePath);
const namespaceTarget = computed<ItemTarget>(() =>
  atWarehouse.value
    ? { kind: 'warehouse', warehouseId: props.warehouseId, namespace: [] }
    : namespaceTargetOf(),
);
function namespaceTargetOf(): ItemTarget {
  return { kind: 'namespace', warehouseId: props.warehouseId, namespace: namespaceSegments.value };
}
// What "New" offers: the types the chip shows, and only once the answer is yes.
const canCreate = computed(() => ({
  namespace: shows('namespaces') && rights.can(namespaceTarget.value, 'create_namespace') === true,
  table:
    !atWarehouse.value &&
    shows('tables') &&
    rights.can(namespaceTarget.value, 'create_table') === true,
  dataset:
    !atWarehouse.value &&
    shows('datasets') &&
    rights.can(namespaceTarget.value, 'create_generic_table') === true,
}));
const createEntries = computed(() => Object.values(canCreate.value).some(Boolean));

const isAll = computed(() => props.selection.length === 0);
const isDeleted = computed(() => props.selection.length === 1 && props.selection[0] === 'deleted');
/** The lists to read, in tree order: all live ones for "All", else the chosen ones'. */
const lists = computed<ListKey[]>(() => {
  if (atWarehouse.value) return ['namespaces'];
  // "All" is everything here, deleted included — while there is any.
  if (isAll.value) return LIST_ORDER.filter((l) => l !== 'deleted' || showDeleted.value);
  const wanted = new Set(props.selection.map((k) => SOURCE[k].list));
  return LIST_ORDER.filter((l) => wanted.has(l));
});
/** Row kinds kept, or null for every kind the lists return. */
const keptKinds = computed<Set<Kind> | null>(() =>
  isAll.value ? null : new Set(props.selection.map((k) => SOURCE[k].kind)),
);
/** The chip group's model: "all" stands for the empty selection. */
const chipModel = computed<ContentType[]>(() => (isAll.value ? ['all'] : props.selection));
const selectionLabel = computed(() =>
  props.selection.length === 1
    ? TYPE_CHIPS.find((t) => t.value === props.selection[0])?.label.toLowerCase()
    : null,
);
const allRefused = computed(() => lists.value.every((l) => refused[l]));
const hasMore = computed(() => cursor.list < lists.value.length);
// A mixed selection: Restore acts on the deleted rows, Delete on the live ones.
const selectedDeleted = computed(() => selected.value.filter((r) => r.kind === 'deleted'));
const selectedLive = computed(() => selected.value.filter((r) => r.kind !== 'deleted'));
const selectedIceberg = computed(() => selected.value.filter((r) => r.kind === 'table'));

const refusedText = computed(() =>
  atWarehouse.value
    ? 'The namespaces of this warehouse are not visible to you.'
    : selectionLabel.value
      ? `The ${selectionLabel.value} in this namespace are not visible to you.`
      : 'The contents of this namespace are not visible to you.',
);
const emptyText = computed(() =>
  atWarehouse.value
    ? 'This warehouse has no namespaces yet.'
    : isAll.value
      ? 'This namespace is empty.'
      : selectionLabel.value
        ? `No ${selectionLabel.value} in this namespace.`
        : 'Nothing of these types in this namespace.',
);

const visibleRows = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase();
  return q ? rows.value.filter((r) => r.name.toLowerCase().includes(q)) : rows.value;
});

/** Whether the current chip shows a type, for its create action. */
function shows(t: ContentKind) {
  return isAll.value || props.selection.includes(t);
}

/**
 * Chips combine. "All" clears the rest; a type clears "All"; "Deleted" stands
 * alone (other columns, other actions), so picking it or leaving it replaces
 * the rest. Untick the last type and it is "All" again.
 */
function setChips(value: unknown) {
  const next = (Array.isArray(value) ? value : []) as ContentType[];
  const before = new Set<ContentType>(chipModel.value);
  const added = next.filter((v) => !before.has(v));
  const picked = added.includes('all') ? [] : next.filter((v) => v !== 'all');
  emit('update:selection', normalizeSelection(picked));
}

function rowBrandIcon(row: ContentRow): string | null {
  return row.kind === 'table' || row.kind === 'generic'
    ? formatIcon(row.format, visual.themeLight)
    : null;
}

function typeLabel(row: ContentRow): string {
  if (row.kind === 'namespace') return 'Namespace';
  if (row.kind === 'view') return 'View';
  if (row.kind === 'dataset') return 'Dataset';
  if (row.kind === 'deleted') {
    const what =
      row.typ === 'view' ? 'View' : row.typ === 'generic-table' ? 'Generic table' : 'Table';
    // On its own the Deleted chip has date columns; mixed in, the type says it.
    return isDeleted.value ? what : `${what} · deleted ${relative(row.deletedAt)}`;
  }
  if (row.kind === 'table') return 'Iceberg table';
  const format = row.format || 'generic';
  return `${format.charAt(0).toUpperCase()}${format.slice(1)} table`;
}

const byName = (a: ContentRow, b: ContentRow) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// ── Rights ────────────────────────────────────────────────────────────

function targetOf(row: ContentRow): ItemTarget {
  if (row.kind === 'namespace') {
    return { kind: 'namespace', warehouseId: props.warehouseId, namespace: row.path ?? [] };
  }
  return {
    kind: row.kind === 'view' ? 'view' : row.kind === 'table' ? 'table' : 'generic-table',
    warehouseId: props.warehouseId,
    namespace: namespaceSegments.value,
    name: row.name,
  };
}

const CREATE_RIGHT: Partial<Record<Kind, string>> = {
  table: 'create_table',
  view: 'create_view',
  generic: 'create_generic_table',
  dataset: 'create_generic_table',
};

function canDrop(row: ContentRow): boolean {
  if (row.kind === 'deleted') return false;
  return rights.can(targetOf(row), row.kind === 'namespace' ? 'delete' : 'drop') === true;
}

function canRename(row: ContentRow): boolean {
  // A namespace renames through `move_namespace` with its parent unchanged:
  // `move` on it, and room for the new name under the parent.
  if (row.kind === 'namespace') {
    return (
      rights.can(targetOf(row), 'move') === true &&
      rights.can(namespaceTarget.value, 'create_namespace') === true
    );
  }
  const create = CREATE_RIGHT[row.kind];
  if (!create) return false;
  return (
    rights.can(targetOf(row), 'rename') === true &&
    rights.can(namespaceTarget.value, create) === true
  );
}

function deleteType(row: ContentRow): string {
  if (row.kind === 'namespace') return 'namespace';
  if (row.kind === 'view') return 'view';
  if (row.kind === 'table') return 'table';
  return 'generic-table';
}

// ── Loading ───────────────────────────────────────────────────────────

const LIST_LABELS: Record<ListKey, string> = {
  namespaces: 'namespaces',
  tables: 'tables',
  views: 'views',
  generic: 'generic tables and datasets',
  deleted: 'deleted tables and views',
};

/** One page of one list, and the token it continues with ('' when it ended). */
async function readPage(
  list: ListKey,
  pageToken?: string,
): Promise<{ rows: ContentRow[]; next: string }> {
  try {
    if (list === 'deleted') {
      // The deleted list is keyed by the namespace's id, not its path.
      const nsId = await namespaceIdOnce();
      if (!nsId) return { rows: [], next: '' };
      const data = await functions.listDeletedTabulars(
        props.warehouseId,
        nsId,
        PAGE_SIZE,
        pageToken,
        false,
      );
      return {
        next: data['next-page-token'] || '',
        rows: (data.tabulars ?? []).map((t: any) => ({
          key: `deleted:${t.id}`,
          kind: 'deleted' as const,
          name: t.name,
          id: t.id,
          typ: t.typ,
          deletedAt: t['deleted-at'],
          expiresAt: t['expiration-date'],
        })),
      };
    }
    if (list === 'namespaces' || list === 'tables' || list === 'views') {
      // Protection rides along with the list, so the column costs no request.
      const data = await functions.listWithProtection(
        props.warehouseId,
        list,
        props.namespacePath,
        pageToken,
        PAGE_SIZE,
        false,
      );
      return {
        next: data.next,
        rows: data.items.map(({ path, protected: prot }) => {
          const name = path[path.length - 1];
          const flag = prot ?? undefined;
          if (list === 'namespaces') {
            return {
              key: `namespace:${path.join('\x1F')}`,
              kind: 'namespace' as const,
              name,
              path,
              protected: flag,
            };
          }
          if (list === 'tables') {
            return {
              key: `table:${name}`,
              kind: 'table' as const,
              name,
              format: 'iceberg',
              protected: flag,
            };
          }
          return { key: `view:${name}`, kind: 'view' as const, name, protected: flag };
        }),
      };
    }
    // Generic tables carry both: a `dataset` format is a dataset, any other
    // format is a generic table in that format.
    const data = await functions.listGenericTables(
      props.warehouseId,
      props.namespacePath,
      pageToken,
      false,
      PAGE_SIZE,
    );
    return {
      next: data['next-page-token'] || '',
      rows: (data.identifiers ?? []).map(
        (g: { name: string; format?: string | null; id?: string | null }) =>
          g.format === 'dataset'
            ? {
                key: `dataset:${g.name}`,
                kind: 'dataset' as const,
                name: g.name,
                uuid: g.id ?? undefined,
              }
            : {
                key: `generic:${g.name}`,
                kind: 'generic' as const,
                name: g.name,
                format: g.format || 'generic',
                uuid: g.id ?? undefined,
              },
      ),
    };
  } catch (error) {
    if (isForbiddenError(error)) {
      refused[list] = true;
    } else {
      failures.value.push({ kind: list, message: tagRefusal(error, `list ${LIST_LABELS[list]}`) });
    }
    return { rows: [], next: '' };
  }
}

/** Read the next page of the list in hand; move on once it has ended. */
/**
 * Read the next page of the list in hand and move the cursor on; returns the
 * page's new rows without showing them, so the caller decides when they appear.
 */
async function readNext(mine: number, have: ContentRow[]): Promise<ContentRow[] | null> {
  const list = lists.value[cursor.list];
  const page = await readPage(list, cursor.token || undefined);
  if (mine !== loadToken) return null;
  const keep = keptKinds.value;
  // Within a page: generic tables before datasets, each by name.
  const sorted = page.rows
    .filter((r) => !keep || keep.has(r.kind))
    .sort((a, b) => Number(a.kind === 'dataset') - Number(b.kind === 'dataset') || byName(a, b));
  if (page.next) {
    cursor.token = page.next;
  } else {
    cursor.list += 1;
    cursor.token = '';
  }
  const seen = new Set(have.map((r) => r.key));
  return sorted.filter((r) => !seen.has(r.key));
}

/**
 * The shortest a progress state stays on screen. A bar that flashes for a
 * frame reads as a hiccup — something stuck — rather than as loading; held a
 * moment, it reads as "fetching", and the rows that follow it as the answer.
 */
const MIN_PROGRESS_MS = 600;
const waitUntil = (start: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, MIN_PROGRESS_MS - (Date.now() - start))),
  );

/** Rows that just arrived, faded in so the table grows rather than jumps. */
const freshKeys = ref<Set<string>>(new Set());
function markFresh(added: ContentRow[]) {
  const keys = new Set(added.map((r) => r.key));
  freshKeys.value = keys;
  setTimeout(() => {
    if (freshKeys.value === keys) freshKeys.value = new Set();
  }, 700);
}
function rowProps({ item }: { item: ContentRow }) {
  const classes = [];
  if (freshKeys.value.has(item.key)) classes.push('nsc-row--fresh');
  if (item.kind === 'deleted') classes.push('nsc-row--deleted');
  if (detailRow.value?.key === item.key) classes.push('nsc-row--active');
  // The virtual table does not emit `click:row`; the row's own listener does.
  return {
    class: classes.join(' ') || undefined,
    onClick: (event: MouseEvent) => onRowClick(event, item),
  };
}

async function load() {
  detailsRef.value?.reload();
  const mine = ++loadToken;
  const started = Date.now();
  loading.value = true;
  rows.value = [];
  selected.value = [];
  failures.value = [];
  cursor.list = 0;
  cursor.token = '';
  for (const list of Object.keys(refused) as ListKey[]) refused[list] = false;
  // Fill the first screen: short lists end at once, so keep reading until a
  // page's worth is there or everything is. Shown together, once.
  const collected: ContentRow[] = [];
  while (hasMore.value && collected.length < PAGE_SIZE && mine === loadToken) {
    const added = await readNext(mine, collected);
    if (!added) return;
    collected.push(...added);
  }
  if (mine !== loadToken) return;
  await waitUntil(started);
  if (mine !== loadToken) return;
  rows.value = collected;
  markFresh(collected);
  loading.value = false;
  await nextTick();
  bindScroll();
  fillViewport();
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  const mine = loadToken;
  const started = Date.now();
  loadingMore.value = true;
  try {
    const added = await readNext(mine, rows.value);
    if (!added) return;
    // The bar finishes first, then the page arrives.
    await waitUntil(started);
    if (mine !== loadToken) return;
    rows.value = [...rows.value, ...added];
    markFresh(added);
  } finally {
    loadingMore.value = false;
  }
  await nextTick();
  fillViewport();
}

// ── Scroll loading ────────────────────────────────────────────────────

function scroller(): HTMLElement | null {
  const el = tableRef.value?.$el as HTMLElement | undefined;
  return el?.querySelector('.v-table__wrapper') ?? null;
}

function nearEnd(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END_PX;
}

function onScroll() {
  const el = scroller();
  if (el && nearEnd(el)) loadMore();
}

/** A list shorter than the window never scrolls, so read on until it does. */
function fillViewport() {
  const el = scroller();
  if (el && hasMore.value && nearEnd(el)) loadMore();
}

let boundScroller: HTMLElement | null = null;
function bindScroll() {
  const el = scroller();
  if (el === boundScroller) return;
  boundScroller?.removeEventListener('scroll', onScroll);
  boundScroller = el;
  boundScroller?.addEventListener('scroll', onScroll, { passive: true });
}
watch(tableRef, () => nextTick(bindScroll));
onBeforeUnmount(() => boundScroller?.removeEventListener('scroll', onScroll));

onMounted(load);
watch(
  () => [props.warehouseId, props.namespacePath, props.selection.join(',')],
  () => {
    search.value = '';
    load();
  },
);

// ── Changes ───────────────────────────────────────────────────────────

/** After a create, rename or delete: reload the list and the tree node. */
async function afterChange() {
  // The row it described may be renamed or gone; a stale card says nothing true.
  detailRow.value = null;
  if (atWarehouse.value) visual.refreshNavTree(props.warehouseId);
  else visual.refreshNavTree(props.warehouseId, dottedPath.value);
  await load();
}

async function onTableCreated(name: string) {
  emit('tableCreated', name);
  await afterChange();
}

async function addNamespace(ident: string[], properties: Record<string, string>) {
  try {
    await functions.createNamespace(props.warehouseId, ident, true, properties);
    await afterChange();
  } catch {
    /* reported by the wrapper */
  }
}

async function dropRow(row: ContentRow, options: any) {
  try {
    if (row.kind === 'namespace') {
      await functions.dropNamespace(
        props.warehouseId,
        (row.path ?? []).join('\x1F'),
        options,
        true,
      );
    } else if (row.kind === 'table') {
      await functions.dropTable(props.warehouseId, props.namespacePath, row.name, options, true);
    } else if (row.kind === 'view') {
      await functions.dropView(props.warehouseId, props.namespacePath, row.name, options, true);
    } else {
      await functions.dropGenericTable(props.warehouseId, props.namespacePath, row.name, true);
    }
    await afterChange();
  } catch {
    /* reported by the wrapper */
  }
}

// Rename
const renameOpen = ref(false);
const renameTarget = ref<ContentRow | null>(null);
const renameValue = ref('');
const renameLoading = ref(false);
const renameError = ref('');
// Iceberg tables and views take their location from the name; generic ones do not.
/** The new name can be sent: set, no spaces, different, and nothing refuses it. */
const renameValid = computed(
  () =>
    !!renameTarget.value &&
    !!renameValue.value &&
    !/\s/.test(renameValue.value) &&
    renameValue.value !== renameTarget.value.name &&
    renameAllowedByLayout.value &&
    !renameChecking.value &&
    !renameLoading.value,
);

// A namespace states its own reason (children, or a layout built from its name).
const renameRefusal = ref<string | null>(null);
const renameChecking = ref(false);
const renameNamespaceId = ref('');
const renameAllowedByLayout = computed(() => {
  const row = renameTarget.value;
  if (!row) return true;
  if (row.kind === 'namespace') return !renameRefusal.value;
  return (
    row.kind === 'generic' ||
    row.kind === 'dataset' ||
    !props.storageLayout ||
    props.storageLayout === 'default'
  );
});

function openRename(row: ContentRow) {
  renameTarget.value = row;
  renameValue.value = '';
  renameError.value = '';
  renameRefusal.value = null;
  renameOpen.value = true;
  if (row.kind === 'namespace') checkNamespaceRename(row);
}

/**
 * What decides a namespace rename, asked as the dialog opens: its id (the move
 * endpoint takes it), whether it has child namespaces (a subtree cannot move),
 * and whether the warehouse layout builds paths from the name.
 */
async function checkNamespaceRename(row: ContentRow) {
  const path = (row.path ?? []).join('\x1F');
  renameChecking.value = true;
  renameNamespaceId.value = '';
  try {
    const [meta, children, warehouse] = await Promise.all([
      functions.loadNamespaceMetadata(props.warehouseId, path, false),
      functions.listNamespaces(props.warehouseId, path, undefined, false, 1),
      functions.getWarehouse(props.warehouseId, false),
    ]);
    if (renameTarget.value !== row) return;
    renameNamespaceId.value = (meta as any)?.properties?.namespace_id || '';
    if ((children?.namespaces ?? []).length) {
      renameRefusal.value =
        'This namespace has child namespaces. Renaming goes through the move endpoint, which does not support moving a subtree, so it has to be empty of namespaces first.';
      return;
    }
    const layout = (warehouse as any)?.['storage-profile']?.['storage-layout'] ?? null;
    renameRefusal.value = namespaceMoveRefusal(layout, true, false);
  } catch (e) {
    if (renameTarget.value === row) renameRefusal.value = tagRefusal(e, 'check this namespace');
  } finally {
    if (renameTarget.value === row) renameChecking.value = false;
  }
}

async function executeRename() {
  const row = renameTarget.value;
  if (!row || !renameValue.value) return;
  renameLoading.value = true;
  renameError.value = '';
  try {
    // notify=false: a refusal is shown in the dialog, not as a snackbar.
    if (row.kind === 'namespace') {
      // Same parent, new leaf: a rename expressed as a move.
      const path = row.path ?? [row.name];
      await functions.moveNamespace(
        props.warehouseId,
        renameNamespaceId.value,
        [...path.slice(0, -1), renameValue.value],
        undefined,
        false,
      );
    } else if (row.kind === 'table') {
      await functions.renameTable(
        props.warehouseId,
        props.namespacePath,
        row.name,
        renameValue.value,
        false,
      );
    } else if (row.kind === 'view') {
      await functions.renameView(
        props.warehouseId,
        props.namespacePath,
        row.name,
        renameValue.value,
        false,
      );
    } else {
      await functions.renameGenericTable(
        props.warehouseId,
        props.namespacePath,
        row.name,
        props.namespacePath,
        renameValue.value,
        false,
      );
    }
    visual.setSnackbarMsg({
      function: 'renameContent',
      text: `Renamed to '${renameValue.value}'`,
      ttl: 3000,
      ts: Date.now(),
      type: 'success' as any,
    });
    renameOpen.value = false;
    await afterChange();
  } catch (e) {
    renameError.value = tagRefusal(e, `rename this ${typeLabel(row).toLowerCase()}`);
  } finally {
    renameLoading.value = false;
  }
}

// Bulk delete — tabular rows only; a namespace takes the per-row dialog, where
// recursion is a deliberate choice.
const bulkOpen = ref(false);
const bulkForce = ref(false);
const bulkPurge = ref(false);
const bulkDeleting = ref(false);
const bulkDone = ref(false);
const bulkResults = ref<Array<{ name: string; ok: boolean; reason?: string }>>([]);
const bulkCandidates = computed(() =>
  selected.value.filter(
    (r) =>
      r.kind !== 'namespace' && r.kind !== 'deleted' && rights.can(targetOf(r), 'drop') !== false,
  ),
);
const bulkKept = computed(() => selected.value.length - bulkCandidates.value.length);

function openBulkDelete() {
  bulkForce.value = false;
  bulkPurge.value = false;
  bulkDone.value = false;
  bulkResults.value = [];
  bulkOpen.value = true;
}

async function confirmBulkDelete() {
  bulkDeleting.value = true;
  bulkResults.value = [];
  const tabular = selected.value.filter((r) => r.kind !== 'namespace' && r.kind !== 'deleted');
  // Rows scrolled past may not have been asked yet.
  await rights.ensure(tabular.map(targetOf), ['drop']);
  const allowed = tabular.filter((r) => rights.can(targetOf(r), 'drop') !== false);
  for (const row of allowed) {
    try {
      if (row.kind === 'table') {
        await functions.dropTable(
          props.warehouseId,
          props.namespacePath,
          row.name,
          { purgeRequested: bulkPurge.value, force: bulkForce.value },
          false,
        );
      } else if (row.kind === 'view') {
        await functions.dropView(
          props.warehouseId,
          props.namespacePath,
          row.name,
          { force: bulkForce.value },
          false,
        );
      } else {
        await functions.dropGenericTable(props.warehouseId, props.namespacePath, row.name, false);
      }
      bulkResults.value.push({ name: row.name, ok: true });
    } catch (error: any) {
      functions.handleError(error, 'NamespaceContents.confirmBulkDelete', false);
      bulkResults.value.push({
        name: row.name,
        ok: false,
        reason: error?.error?.message || error?.message || 'Failed to delete',
      });
    }
  }
  bulkDeleting.value = false;
  bulkDone.value = true;
  const ok = bulkResults.value.filter((r) => r.ok).length;
  const failed = bulkResults.value.length - ok;
  const kept = selected.value.length - allowed.length;
  visual.setSnackbarMsg({
    function: 'bulkDeleteContents',
    text: `${ok} deleted${failed ? `, ${failed} failed` : ''}${kept ? `, ${kept} kept` : ''}.`,
    ttl: 5000,
    ts: Date.now(),
    type: (failed ? 'warning' : 'success') as any,
  });
  if (ok > 0) await afterChange();
}

// ── Deleted ───────────────────────────────────────────────────────────

let namespaceIdPromise: Promise<string> | null = null;
/** The namespace's id, read once per namespace (the deleted list needs it). */
function namespaceIdOnce(): Promise<string> {
  if (!namespaceIdPromise) {
    namespaceIdPromise = functions
      .loadNamespaceMetadata(props.warehouseId, props.namespacePath, false)
      .then((ns: any) => ns?.properties?.namespace_id || '')
      .catch((error: unknown) => {
        namespaceIdPromise = null;
        throw error;
      });
  }
  return namespaceIdPromise!;
}

// Shown when the warehouse soft-deletes, or when something deleted is still
// here anyway (soft deletion was turned off since): it can still be restored.
const hasLeftovers = ref(false);
async function probeLeftovers() {
  hasLeftovers.value = false;
  if (props.softDeletion || atWarehouse.value) return;
  try {
    const nsId = await namespaceIdOnce();
    if (!nsId) return;
    const data = await functions.listDeletedTabulars(props.warehouseId, nsId, 1, undefined, false);
    hasLeftovers.value = (data.tabulars ?? []).length > 0;
  } catch {
    /* not visible: no chip */
  }
}
const showDeleted = computed(() => !!props.softDeletion || hasLeftovers.value);
const visibleChips = computed(() =>
  TYPE_CHIPS.filter((t) => t.value !== 'deleted' || showDeleted.value || isDeleted.value),
);

function deletedTarget(row: ContentRow): ItemTarget {
  return { kind: row.typ ?? 'table', warehouseId: props.warehouseId, namespace: [], id: row.id };
}
function canRestore(row: ContentRow): boolean {
  return row.kind === 'deleted' && rights.can(deletedTarget(row), 'undrop') === true;
}

function relative(iso?: string): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

const rowErrors = ref<Record<string, string>>({});
const restoring = ref('');
async function restore(row: ContentRow) {
  const next = { ...rowErrors.value };
  delete next[row.key];
  rowErrors.value = next;
  restoring.value = row.key;
  try {
    await functions.undropTabular(props.warehouseId, row.id!, row.typ ?? 'table', true);
    await afterChange();
  } catch (error) {
    // Reported on the row it was tried on.
    rowErrors.value = { ...rowErrors.value, [row.key]: tagRefusal(error, 'restore it') };
  } finally {
    restoring.value = '';
  }
}

const bulkRestoring = ref(false);
async function restoreSelected() {
  bulkRestoring.value = true;
  const rows = selected.value.filter((r) => r.kind === 'deleted');
  await rights.ensure(rows.map(deletedTarget), ['undrop']);
  let ok = 0;
  const errors: Record<string, string> = {};
  for (const row of rows.filter((r) => canRestore(r))) {
    try {
      await functions.undropTabular(props.warehouseId, row.id!, row.typ ?? 'table', false);
      ok++;
    } catch (error) {
      errors[row.key] = tagRefusal(error, 'restore it');
    }
  }
  bulkRestoring.value = false;
  const failed = Object.keys(errors).length;
  const kept = rows.length - ok - failed;
  visual.setSnackbarMsg({
    function: 'bulkRestoreContents',
    text: `${ok} restored${failed ? `, ${failed} failed` : ''}${kept ? `, ${kept} kept (not allowed)` : ''}.`,
    ttl: 5000,
    ts: Date.now(),
    type: (failed ? 'warning' : 'success') as any,
  });
  if (ok > 0) await afterChange();
  rowErrors.value = errors;
}

watch(
  () => [props.warehouseId, props.namespacePath],
  () => {
    namespaceIdPromise = null;
    probeLeftovers();
  },
);
watch(() => props.softDeletion, probeLeftovers);
// Leftovers are found after the first read when soft deletion is off; "All"
// then has one more list to read, so read on now that it is known.
watch(showDeleted, (on) => {
  if (on && isAll.value) nextTick(fillViewport);
});
onMounted(probeLeftovers);

// ── Opening ───────────────────────────────────────────────────────────

/** The row whose details are open; null folds the panel. */
const detailRow = ref<ContentRow | null>(null);
/** What the panel shows: kept while it folds away, so it does not empty first. */
const shownDetail = ref<ContentRow | null>(null);
const detailsRef = ref<InstanceType<typeof ContentDetailsPanel> | null>(null);
watch(detailRow, (row) => {
  if (row) shownDetail.value = row;
});
watch(
  () => [props.warehouseId, props.namespacePath],
  () => {
    detailRow.value = null;
    shownDetail.value = null;
  },
);

/** A click on a row opens its details; the name, buttons and checkbox keep
 *  their own meaning. A second click on the same row closes them. */
function onRowClick(event: MouseEvent, item: ContentRow) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, a, input, .v-selection-control, .nsc-name, .v-overlay')) return;
  detailRow.value = detailRow.value?.key === item.key ? null : item;
}

function open(row: ContentRow) {
  if (row.kind === 'deleted') return;
  const base = `/warehouse/${props.warehouseId}/namespace`;
  const ns = props.namespacePath;
  const name = encodeURIComponent(row.name);
  if (row.kind === 'namespace') {
    router.push(`${base}/${(row.path ?? [row.name]).join('\x1F')}`);
  } else if (row.kind === 'view') {
    router.push(`${base}/${ns}/view/${name}`);
  } else if (row.kind === 'dataset' || row.kind === 'generic') {
    router.push(`${base}/${ns}/generic-table/${name}`);
  } else {
    router.push(`${base}/${ns}/table/${name}`);
  }
}

defineExpose({ reload: load });
</script>

<style scoped>
/* The host's tab window is bounded; this fills it and the table scrolls inside,
   so the chips never scroll away. */
.nsc {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.nsc-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-wrap: wrap;
  flex: none;
}

/* Centred over the selection column's checkboxes below it: the bar's padding
   puts it 14px to the right of them otherwise. */
.nsc-reload {
  margin-left: -14px;
}

.nsc-types {
  flex: 0 1 auto;
  min-width: 0;
}

.nsc-search {
  max-width: 260px;
  min-width: 160px;
}

.nsc-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px;
  flex: none;
  background: rgba(var(--v-theme-primary), 0.12);
}

.nsc-main {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.nsc-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nsc-table :deep(tbody tr) {
  cursor: pointer;
}
.nsc-table :deep(tr.nsc-row--active td) {
  background: rgba(var(--v-theme-primary), 0.1);
}

.nsc-table {
  flex: 1 1 auto;
  min-height: 0;
}

/* Rows that just arrived fade in, so a page joins the table rather than
   appearing in a frame. */
.nsc-table :deep(tr.nsc-row--fresh) {
  animation: nsc-fade-in 320ms ease-out both;
}

/* Deleted rows sit among the live ones, dimmed: there, but on their way out. */
.nsc-table :deep(tr.nsc-row--deleted td) {
  opacity: 0.6;
}
.nsc-table :deep(tr.nsc-row--deleted td:last-child) {
  opacity: 1;
}

@keyframes nsc-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nsc-table :deep(tr.nsc-row--fresh) {
    animation: none;
  }
}

.nsc-open {
  min-width: 0;
  padding: 0 8px;
  margin-right: 4px;
}

/* The name reads as a link: it opens the item, while the rest of the row
   opens its details. */
.nsc-name {
  cursor: pointer;
}
.nsc-name:hover .nsc-name__text {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
}

.nsc-more {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 16px;
  flex: none;
}

.nsc-more__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
</style>
