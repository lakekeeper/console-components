<template>
  <v-sheet class="d-flex flex-column" color="transparent" style="height: 100%; overflow: hidden">
    <!-- One row: what to browse, then the two actions on it. The pane needs no
         title, and search only applies to a picked warehouse, so it opens on
         demand instead of sitting there disabled. -->
    <v-sheet color="transparent" class="px-3 pt-2 pb-2 flex-shrink-0">
      <div class="d-flex align-center">
        <WarehousePicker
          v-model="selectedWarehouseId"
          :warehouses="warehouseChoices"
          :loading="isLoading"
          all-label="All warehouses"
          clearable
          class="flex-grow-1 tree-picker"
          style="min-width: 0" />
        <!-- A disabled button gets no hover events, so the tooltip hangs off a wrapper. -->
        <span class="d-inline-flex">
          <v-btn
            icon="mdi-magnify"
            size="x-small"
            variant="text"
            :active="searchOpen"
            :disabled="!selectedWarehouseId"
            @click="toggleSearch"></v-btn>
          <v-tooltip activator="parent" location="bottom">
            {{
              selectedWarehouseId ? 'Search tables & views' : 'Pick a warehouse first to search it'
            }}
          </v-tooltip>
        </span>
        <v-btn
          icon="mdi-refresh"
          size="x-small"
          variant="text"
          :loading="isLoading"
          title="Refresh"
          @click="refreshTree"></v-btn>
      </div>
      <v-text-field
        v-if="searchOpen && selectedWarehouseId"
        v-model="searchQuery"
        density="compact"
        variant="outlined"
        placeholder="Search tables & views…"
        hide-details
        clearable
        autofocus
        class="filter-field mt-2"
        :loading="isSearching"
        @keyup.enter="performSearch"
        @keydown.esc="closeSearch"
        @click:clear="clearSearch">
        <template #prepend-inner>
          <v-icon size="x-small">mdi-magnify</v-icon>
        </template>
        <template #append-inner>
          <v-btn
            icon="mdi-arrow-right"
            size="x-small"
            variant="text"
            :disabled="!searchQuery || isSearching"
            @click="performSearch"
            title="Search warehouse (fuzzy)"></v-btn>
        </template>
      </v-text-field>
    </v-sheet>

    <v-divider class="border-opacity-25" />

    <!-- Search Results -->
    <v-sheet
      v-if="hasSearched"
      color="transparent"
      class="flex-shrink-0"
      style="max-height: 240px; overflow-y: auto">
      <div v-if="isSearching" class="text-center py-3">
        <v-progress-circular color="primary" indeterminate size="48" />
        <div class="text-caption mt-1">Searching…</div>
      </div>
      <div v-else-if="searchResults.length === 0" class="text-center py-3">
        <v-icon class="text-medium-emphasis">mdi-table-search</v-icon>
        <div class="text-caption mt-1 text-medium-emphasis">No results found</div>
      </div>
      <div v-else>
        <div class="d-flex align-center px-3 pt-2">
          <span class="text-caption text-medium-emphasis flex-grow-1">
            {{ searchResults.length }} result(s)
          </span>
          <v-checkbox
            v-model="visualStore.dismissSearchOnClick"
            density="compact"
            hide-details
            class="flex-grow-0 mr-1"
            style="transform: scale(0.7); transform-origin: right center"
            title="Auto-close search results after clicking a result">
            <template #label>
              <span class="text-caption" style="font-size: 0.65rem !important; white-space: nowrap">
                Auto-close
              </span>
            </template>
          </v-checkbox>
          <v-btn
            icon="mdi-close"
            size="x-small"
            variant="text"
            @click="dismissSearch"
            title="Dismiss search results"></v-btn>
        </div>
        <v-list density="compact" class="pa-2 pt-0 search-results-list" bg-color="transparent">
          <v-list-item
            v-for="result in searchResults"
            :key="result.id"
            density="compact"
            class="search-result-item"
            @click="handleSearchResultClick(result)">
            <template #prepend>
              <v-icon size="small" :color="result.type === 'table' ? 'blue' : 'green'">
                {{ result.type === 'table' ? 'mdi-table' : 'mdi-eye-outline' }}
              </v-icon>
            </template>
            <v-list-item-title style="font-size: 0.8125rem">
              {{ result.name }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ result.namespace }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                v-if="result.distance !== null && result.distance !== undefined"
                size="x-small"
                :color="
                  result.distance <= 0.2 ? 'success' : result.distance <= 0.5 ? 'warning' : 'error'
                "
                variant="flat">
                {{ Math.round((1 - result.distance) * 100) }}%
              </v-chip>
              <v-btn
                icon="mdi-arrow-right-bold-box-outline"
                size="x-small"
                variant="text"
                @click.stop="insertSearchResult(result)"
                title="Insert into SQL editor"></v-btn>
              <v-menu location="bottom end">
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    icon="mdi-dots-vertical"
                    size="x-small"
                    variant="text"
                    @click.stop
                    title="More actions"></v-btn>
                </template>
                <v-list density="compact" class="pa-1" min-width="160">
                  <v-list-item
                    density="compact"
                    @click="handlePreviewSearchResult(result)"
                    prepend-icon="mdi-eye-outline">
                    <v-list-item-title class="text-caption">Preview data</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="handleShowDDLSearchResult(result)"
                    prepend-icon="mdi-code-tags">
                    <v-list-item-title class="text-caption">SQL templates</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="handleCopyPathSearchResult(result)"
                    prepend-icon="mdi-content-copy">
                    <v-list-item-title class="text-caption">Copy path</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </template>
          </v-list-item>
        </v-list>
      </div>
      <v-divider class="border-opacity-25" />
    </v-sheet>

    <!-- Pinned: what you keep coming back to, one click from anywhere in the tree. -->
    <!-- Tinted and closed off by a full divider so it does not read as the top
         of the tree; the header stays put while the list scrolls. -->
    <v-sheet v-if="pinnedObjects.length" class="flex-shrink-0 pinned-section">
      <!-- Folding keeps the count in view, so pins are not forgotten the way a
           hidden section would be. Remembered across reloads. -->
      <div
        class="pinned-header text-caption text-medium-emphasis px-3 py-1 d-flex align-center"
        role="button"
        :aria-expanded="!visualStore.loqePinnedCollapsed"
        @click="visualStore.loqePinnedCollapsed = !visualStore.loqePinnedCollapsed">
        <v-icon size="x-small" class="mr-1">mdi-pin-outline</v-icon>
        Pinned
        <span class="ml-1">({{ pinnedObjects.length }})</span>
        <v-spacer />
        <v-icon size="x-small">
          {{ visualStore.loqePinnedCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
        </v-icon>
      </div>
      <v-list
        v-show="!visualStore.loqePinnedCollapsed"
        density="compact"
        bg-color="transparent"
        class="py-0 px-2"
        style="max-height: 180px; overflow-y: auto">
        <v-list-item
          v-for="pin in pinnedObjects"
          :key="pinKey(pin)"
          density="compact"
          class="pinned-item"
          @click="revealObject(pin)"
          @dblclick.stop="isInsertable(pin) && insertPin(pin)">
          <template #prepend>
            <!-- A warehouse pin wears the same provider mark as its tree row. -->
            <template v-if="pin.type === 'warehouse'">
              <v-icon v-if="pinIcons.get(pin.warehouseId)?.src" size="x-small" class="mr-2">
                <v-img
                  :src="pinIcons.get(pin.warehouseId)?.src"
                  width="16"
                  :height="pinIcons.get(pin.warehouseId)?.height ? 12 : 16" />
              </v-icon>
              <v-icon
                v-else
                size="x-small"
                class="mr-2"
                :color="pinIcons.get(pin.warehouseId)?.color">
                {{ pinIcons.get(pin.warehouseId)?.icon }}
              </v-icon>
            </template>
            <v-icon v-else size="x-small" class="mr-2">{{ PIN_ICONS[pin.type] }}</v-icon>
          </template>
          <v-list-item-title style="font-size: 0.8125rem">
            {{ pin.type === 'namespace' ? pin.namespaceId : pin.name }}
          </v-list-item-title>
          <v-list-item-subtitle v-if="pin.type !== 'warehouse'" class="text-caption">
            {{
              pin.type === 'namespace'
                ? pinWarehouseName(pin)
                : `${pinWarehouseName(pin)} · ${pin.namespaceId}`
            }}
          </v-list-item-subtitle>
          <template #append>
            <v-btn
              v-if="isInsertable(pin)"
              icon="mdi-arrow-right-bold-box-outline"
              size="x-small"
              variant="text"
              title="Insert path into query"
              @click.stop="insertPin(pin)"
              @dblclick.stop></v-btn>
            <v-btn
              icon="mdi-pin-off-outline"
              size="x-small"
              variant="text"
              title="Unpin"
              @click.stop="unpin(pin)"
              @dblclick.stop></v-btn>
          </template>
        </v-list-item>
      </v-list>
    </v-sheet>
    <v-divider v-if="pinnedObjects.length" />

    <!-- Loading state -->
    <div v-if="isLoading && treeItems.length === 0" class="text-center py-4">
      <v-progress-circular indeterminate size="48" color="primary" />
      <div class="text-caption mt-2 text-medium-emphasis">Loading warehouses…</div>
    </div>

    <!-- Empty state -->
    <v-empty-state
      v-else-if="!isLoading && treeItems.length === 0"
      icon="mdi-database-off-outline"
      title="No warehouses found"></v-empty-state>

    <!-- Tree -->
    <v-sheet
      v-else
      color="transparent"
      class="flex-grow-1 tree-scroller"
      style="overflow-y: auto; overflow-x: auto">
      <v-treeview
        v-model:opened="openedItems"
        :items="visibleTreeItems"
        item-value="id"
        density="compact"
        open-on-click
        indent-lines="default"
        expand-icon="mdi-chevron-right"
        collapse-icon="mdi-chevron-down"
        class="tree-view pa-2"
        style="background-color: transparent !important; --v-treeview-indent-line-opacity: 0.2">
        <template v-slot:prepend="{ item }">
          <!-- Warehouse: cloud provider icon -->
          <template v-if="item.type === 'warehouse'">
            <v-icon v-if="warehouseIcon(item).src" size="small">
              <v-img
                :src="warehouseIcon(item).src"
                width="18"
                :height="warehouseIcon(item).height ?? 18" />
            </v-icon>
            <v-icon v-else size="small" :color="warehouseIcon(item).color">
              {{ warehouseIcon(item).icon }}
            </v-icon>
          </template>
          <!-- Not an error state: the catalog side of this warehouse browses
               fine, only its data files are unreachable from the browser — hence
               a database mark rather than an alert. The tooltip hangs off a
               wrapper, not the icon: `v-icon` reads its default slot as the glyph
               name, so a component sitting in there is fragile.
               The lead line names the symbol; a reader who does not already know
               what "vended credentials" are cannot start with that sentence. -->
          <span
            v-if="item.type === 'warehouse' && item.stsOff"
            class="ml-1 d-inline-flex align-center">
            <v-icon icon="mdi-database-off-outline" size="x-small" color="warning" />
            <v-tooltip activator="parent" location="right" max-width="360">
              <div class="font-weight-medium mb-1">Data not readable in the browser</div>
              {{ item.vendingReason }}
            </v-tooltip>
          </span>
          <v-icon size="x-small" v-else-if="item.type === 'namespace'">mdi-folder-outline</v-icon>
          <v-icon size="x-small" v-else-if="item.type === 'table'">mdi-table</v-icon>
          <v-icon size="x-small" v-else-if="item.type === 'view'">mdi-eye-outline</v-icon>
          <v-icon
            v-else-if="item.type === 'field' && item.fieldType"
            :icon="getTypeIcon(item.fieldType)"
            :color="getTypeColor(item.fieldType)"
            size="x-small" />
          <v-icon
            v-else-if="item.type === 'status' && item.statusKind === 'error'"
            size="x-small"
            color="error">
            mdi-alert-circle-outline
          </v-icon>
          <v-icon
            v-else-if="item.type === 'status' && item.statusKind === 'forbidden'"
            size="x-small"
            color="warning">
            mdi-lock-outline
          </v-icon>
          <v-icon v-else-if="item.type === 'load-more'" size="small" class="text-medium-emphasis">
            mdi-dots-horizontal
          </v-icon>
        </template>

        <template v-slot:title="{ item }">
          <div
            class="tree-item-container"
            :class="{
              'tree-item-active': item.id === lastFocusedNodeId,
              'tree-leaf-row':
                item.type === 'table' ||
                item.type === 'view' ||
                item.type === 'field' ||
                item.type === 'status',
            }"
            :data-node-id="item.id"
            @dblclick.stop="handleRowDblClick(item)">
            <span
              v-if="item.type === 'load-more'"
              class="tree-item-title"
              style="
                cursor: pointer;
                font-style: italic;
                color: rgba(var(--v-theme-on-surface), 0.6);
              "
              @click.stop="handleLoadMore(item)">
              {{ item.name }}
            </span>
            <span
              v-else-if="item.type === 'status'"
              class="tree-item-title tree-item-status"
              :class="{ 'text-error': item.statusKind === 'error' }">
              {{ item.name }}
              <a
                v-if="item.statusKind !== 'empty'"
                class="tree-item-retry"
                href="#"
                @click.prevent.stop="retryLoad(item)">
                Retry
              </a>
            </span>
            <!-- Only columns get a tooltip: their type is not on the row. A name
                 tooltip would just repeat the label. -->
            <span
              v-else
              class="tree-item-title"
              :class="{ 'tree-item-title--warehouse': item.type === 'warehouse' }"
              :title="item.type === 'field' ? fieldTooltip(item) : undefined">
              {{ item.name }}
              <v-icon
                v-if="item.isIdentifier"
                icon="mdi-key-variant"
                size="12"
                color="amber-darken-2"
                class="ml-1"></v-icon>
              <span v-if="item.partitionTransform" class="tree-item-badge">
                {{
                  item.partitionTransform === 'identity'
                    ? 'partition'
                    : `partition · ${item.partitionTransform}`
                }}
              </span>
              <span v-if="item.required && !item.isIdentifier" class="tree-item-badge">
                not null
              </span>
              <!-- Capped and cut short: the tree sizes to its widest row, so one
                   long doc would push every row into horizontal scroll. -->
              <span v-if="item.fieldDoc" class="tree-item-doc">{{ item.fieldDoc }}</span>
            </span>

            <!-- Sticky to the pane's right edge: the tree scrolls sideways for long
                 names, and the actions would otherwise sit past the widest row. -->
            <span class="tree-item-actions" @dblclick.stop>
              <!-- Warehouses and namespaces have no menu; pinning is their one action. -->
              <v-btn
                v-if="item.type === 'warehouse' || item.type === 'namespace'"
                :icon="isPinned(item) ? 'mdi-pin-off-outline' : 'mdi-pin-outline'"
                size="x-small"
                variant="text"
                class="tree-item-insert-btn"
                :title="isPinned(item) ? 'Unpin' : 'Pin'"
                @click.stop="togglePin(item)"></v-btn>
              <!-- Insert button for tables/views -->
              <v-btn
                v-if="item.type === 'table' || item.type === 'view'"
                icon="mdi-arrow-right-bold-box-outline"
                size="x-small"
                variant="text"
                class="tree-item-insert-btn"
                @click.stop="handleInsertPath(item)"
                title="Insert path into query"></v-btn>

              <!-- Kebab menu for tables/views -->
              <v-menu v-if="item.type === 'table' || item.type === 'view'" location="bottom end">
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    icon="mdi-dots-vertical"
                    size="x-small"
                    variant="text"
                    class="tree-item-insert-btn"
                    @click.stop
                    title="More actions"></v-btn>
                </template>
                <v-list density="compact" class="pa-1" min-width="160">
                  <v-list-item
                    density="compact"
                    @click="handlePreview(item)"
                    prepend-icon="mdi-eye-outline">
                    <v-list-item-title class="text-caption">Preview data</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="handleShowDDL(item)"
                    prepend-icon="mdi-code-tags">
                    <v-list-item-title class="text-caption">SQL templates</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="handleSelectAll(item)"
                    prepend-icon="mdi-format-list-checks">
                    <v-list-item-title class="text-caption">Select all columns</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="handleCopyPath(item)"
                    prepend-icon="mdi-content-copy">
                    <v-list-item-title class="text-caption">Copy path</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    density="compact"
                    @click="togglePin(item)"
                    :prepend-icon="isPinned(item) ? 'mdi-pin-off-outline' : 'mdi-pin-outline'">
                    <v-list-item-title class="text-caption">
                      {{ isPinned(item) ? 'Unpin' : 'Pin' }}
                    </v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>

              <!-- Insert button for fields -->
              <v-btn
                v-if="item.type === 'field'"
                icon="mdi-arrow-right-bold-box-outline"
                size="x-small"
                variant="text"
                class="tree-item-insert-btn"
                @click.stop="handleInsertField(item)"
                title="Insert field name"></v-btn>
            </span>
          </div>
        </template>
      </v-treeview>
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { stsDisabled, loqeVendingReason } from '@/common/vendedCredentials';
import { useVisualStore } from '@/stores/visual';
// import { useUserStore } from '@/stores/user';
import { Type } from '@/common/enums';
import { logError, isForbiddenError } from '@/common/errorUtils';
import type { AttachedCatalog } from '../composables/loqe/types';
import type { SearchTabular } from '@/gen/management/types.gen';
import cfIcon from '@/assets/cf.svg';
import oneLakeIcon from '@/assets/onelake.png';
import stackitLightIcon from '@/assets/stackit-mark.svg';
import stackitDarkIcon from '@/assets/stackit-mark-dark.svg';
import aliyunIcon from '@/assets/aliyun.svg';
import { isAliyunOssEndpoint } from '@/common/storageIcon';
import { formatIcebergType } from '@/common/icebergTypes';
import WarehousePicker from './WarehousePicker.vue';

// ── Props / Emits ─────────────────────────────────────────────────────

const props = defineProps<{
  /** List of currently attached catalogs in LoQE */
  attachedCatalogs: AttachedCatalog[];
}>();

const emit = defineEmits<{
  /** User clicked a table/view/field to insert into the SQL editor */
  (
    e: 'item-selected',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId?: string;
      name: string;
    },
  ): void;
  /** User expanded a warehouse that is not yet attached — request auto-attach */
  (
    e: 'attach-warehouse',
    warehouse: { warehouseId: string; warehouseName: string; catalogUrl: string },
  ): void;
  /** User clicked the eye icon to preview table/view data */
  (
    e: 'preview-table',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId: string;
      name: string;
    },
  ): void;
  /** User clicked Show DDL */
  (
    e: 'show-ddl',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId: string;
      name: string;
    },
  ): void;
  /** User asked for a SELECT naming every top-level column */
  (
    e: 'insert-select',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId: string;
      name: string;
      columns: string[];
    },
  ): void;
  /** User clicked Copy path */
  (
    e: 'copy-path',
    item: {
      type: string;
      warehouseId: string;
      warehouseName: string;
      namespaceId: string;
      name: string;
    },
  ): void;
}>();

// ── Dependencies ──────────────────────────────────────────────────────

const functions = useFunctions();
const visualStore = useVisualStore();
// The STACKIT mark is ink-on-transparent, so it needs the light/dark pair.
const stackitIcon = computed(() => (visualStore.themeLight ? stackitLightIcon : stackitDarkIcon));

// const appConfig = inject<any>('appConfig', {});

// ── Types ─────────────────────────────────────────────────────────────

interface TreeItem {
  id: string;
  name: string;
  type: 'warehouse' | 'namespace' | 'table' | 'view' | 'field' | 'load-more' | 'status';
  children?: TreeItem[];
  warehouseId: string;
  warehouseName?: string;
  namespaceId?: string;
  loaded?: boolean;
  fieldType?: string;
  /** The field's Iceberg `doc`, when the schema has one. */
  fieldDoc?: string;
  /** Field is `required` in the schema (NOT NULL). */
  required?: boolean;
  /** Field is one of the schema's `identifier-field-ids` (its row key). */
  isIdentifier?: boolean;
  /** Transform of the default partition spec on this field (`identity`, `day`, …). */
  partitionTransform?: string;
  /**
   * Status rows stand in for children that could not be shown: a failed or
   * forbidden load, or an empty container. `retryOf` is the node to reload.
   */
  statusKind?: 'error' | 'forbidden' | 'empty';
  retryOf?: string;
  /** Dotted path from the top-level column, for nested fields. */
  fieldPath?: string;
  parentType?: 'table' | 'view';
  parentName?: string;
  /** Storage profile type — only set on warehouse nodes. */
  storageType?: 's3' | 'adls' | 'gcs' | 'onelake' | 'stackit';
  /**
   * Warehouse nodes only: STS is off, so DuckDB cannot read this warehouse at
   * all. The node is left unattached and says why, instead of failing later as
   * an opaque download error.
   */
  stsOff?: boolean;
  /** Why it cannot be queried, when `stsOff` is true. */
  vendingReason?: string | null;
  storageFlavor?: string;
  storageEndpoint?: string;
  /** Which resource types still have pages to load (only on load-more nodes). */
  loadMoreTypes?: ('namespace' | 'table' | 'view')[];
}

// ── State ─────────────────────────────────────────────────────────────

/** Max items per API page for tree loads — keeps DOM light. */
const TREE_PAGE_SIZE = 100;

const treeItems = ref<TreeItem[]>([]);
const openedItems = ref<string[]>([]);
const isLoading = ref(false);

// Pagination tokens keyed by parent node id
const pageTokens = ref<Record<string, { namespaces?: string; tables?: string; views?: string }>>(
  {},
);

// Search state
const searchQuery = ref('');
const selectedWarehouseId = ref<string | null>(null);
const isSearching = ref(false);
const hasSearched = ref(false);
const lastFocusedNodeId = ref<string | null>(null);
const searchResults = ref<
  {
    id: string;
    name: string;
    namespace: string;
    type: string;
    distance: number | null;
    warehouseId: string;
    warehouseName: string;
    namespaceId: string;
  }[]
>([]);

// Warehouse options for search picker
// Includes the warehouses still behind "Load more": the selector picks what to
// search, and a warehouse that exists but has not been paged into the tree yet
// is still a valid thing to search.
const warehouseChoices = computed(() =>
  [...treeItems.value, ...pendingWarehouses.value]
    .filter((item) => item.type === 'warehouse')
    .map((item) => ({ id: item.warehouseId, name: item.name })),
);

/**
 * Picking a warehouse attaches it.
 *
 * The pick is the whole tree, so the warehouse it names should be queryable
 * without a second gesture — otherwise the editor answers a perfectly reasonable
 * query with "catalog does not exist" about the one warehouse on screen. Skipped
 * when the warehouse vends nothing: the ATTACH would fail and the error would
 * blame the bucket.
 */
watch(selectedWarehouseId, (id) => {
  if (!id) return;
  ensureWarehouseRendered(id);
  const picked = treeItems.value.find(
    (item) => item.type === 'warehouse' && item.warehouseId === id,
  );
  if (!picked || picked.stsOff || isWarehouseAttached(id)) return;
  emit('attach-warehouse', {
    warehouseId: id,
    warehouseName: picked.warehouseName || picked.name,
    catalogUrl: getCatalogUrl(),
  });
});

/**
 * What the tree shows: every warehouse, or the picked one alone.
 *
 * The pick reaches into `pendingWarehouses` too — warehouses fetched but not yet
 * rendered. That is the point of filtering rather than scrolling: picking the
 * fortieth warehouse shows it now, instead of paging through the thirty-nine
 * ahead of it.
 *
 * Nodes are passed through by reference, never cloned: expanding one mutates
 * `item.children` in place, and a copy would load its namespaces into an object
 * the tree has already thrown away.
 */
const visibleTreeItems = computed(() => {
  const id = selectedWarehouseId.value;
  if (!id) return treeItems.value;
  const picked = treeItems.value.find(
    (item) => item.type === 'warehouse' && item.warehouseId === id,
  );
  return picked ? [picked] : [];
});

/**
 * Page the list until `warehouseId` is rendered, so the node can be opened.
 *
 * Showing a warehouse straight out of `pendingWarehouses` was half a pick: the
 * node appeared, but every lookup that makes it work — the `openedItems`
 * watcher, the expand-to-attach path, search's expand-to-path — searches
 * `treeItems` alone, so it could not be expanded and loaded no namespaces.
 * Paging it in instead keeps one source of truth, and the "Load more" count
 * follows because `appendWarehousePage` is what moves it.
 */
function ensureWarehouseRendered(warehouseId: string) {
  const nodeId = `wh-${warehouseId}`;
  while (pendingWarehouses.value.length > 0 && !findItemById(treeItems.value, nodeId)) {
    appendWarehousePage();
  }
}

// Cached warehouse metadata (warehouseId → name)
const warehouseNames = new Map<string, string>();

// ── Helpers ───────────────────────────────────────────────────────────

function namespacePathToApiFormat(nsPath: string): string {
  return nsPath.split('.').join('\x1F');
}

function isWarehouseAttached(warehouseId: string): boolean {
  const whName = warehouseNames.get(warehouseId);
  if (!whName) return false;
  return props.attachedCatalogs.some((c) => c.catalogName === whName);
}

function getCatalogUrl(): string {
  return functions.icebergCatalogUrlSuffixed();
}

// ── Search ────────────────────────────────────────────────────────────

async function performSearch() {
  if (!searchQuery.value?.trim() || !selectedWarehouseId.value) return;

  isSearching.value = true;
  hasSearched.value = true;

  try {
    const response = await functions.searchTabular(selectedWarehouseId.value, {
      search: searchQuery.value.trim(),
    });

    const whName = warehouseNames.get(selectedWarehouseId.value) || '';

    searchResults.value = (response.tabulars || []).map((result: SearchTabular) => ({
      id: result['tabular-id'].id,
      name: result['tabular-name'],
      namespace: result['namespace-name'].join('.'),
      type: result['tabular-id'].type,
      distance: result.distance ?? null,
      warehouseId: selectedWarehouseId.value!,
      warehouseName: whName,
      namespaceId: result['namespace-name'].join('.'),
    }));
  } catch (error: any) {
    logError('[LoQE Tree] Search failed', error);
    searchResults.value = [];
    visualStore.setSnackbarMsg({
      function: 'searchTabular',
      text: error?.error?.message || error?.message || 'Search failed',
      ttl: 3000,
      ts: Date.now(),
      type: Type.ERROR,
    });
  } finally {
    isSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = '';
  hasSearched.value = false;
  searchResults.value = [];
}

const searchOpen = ref(false);

function toggleSearch() {
  if (searchOpen.value) closeSearch();
  else searchOpen.value = true;
}

function closeSearch() {
  searchOpen.value = false;
  clearSearch();
}

// Search is scoped to the picked warehouse; without one there is nothing to search.
watch(selectedWarehouseId, (id) => {
  if (!id) closeSearch();
});

function dismissSearch() {
  hasSearched.value = false;
  searchResults.value = [];
}

async function expandTreeToPath(warehouseId: string, namespacePath: string) {
  const whNodeId = `wh-${warehouseId}`;
  const whNode = findItemById(treeItems.value, whNodeId);
  if (!whNode) return;

  if (!whNode.loaded) {
    await loadNamespacesForWarehouse(whNode);
  }
  if (!openedItems.value.includes(whNodeId)) {
    openedItems.value = [...openedItems.value, whNodeId];
  }

  const segments = namespacePath.split('.');
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath = i === 0 ? segments[0] : `${currentPath}.${segments[i]}`;
    const nsNodeId = `ns-${warehouseId}-${currentPath}`;
    const nsNode = findItemById(treeItems.value, nsNodeId);
    if (!nsNode) break;

    if (!nsNode.loaded) {
      await loadChildrenForNamespace(nsNode);
    }
    if (!openedItems.value.includes(nsNodeId)) {
      openedItems.value = [...openedItems.value, nsNodeId];
    }
  }
}

async function handleSearchResultClick(result: (typeof searchResults.value)[0]) {
  await revealObject(result);
  // Auto-dismiss search results if the option is enabled
  if (visualStore.dismissSearchOnClick) {
    dismissSearch();
  }
}

/** Open the tree down to a table or view, expand it, and scroll it into view. */
async function revealObject(target: {
  warehouseId: string;
  namespaceId: string;
  name: string;
  type: string;
}) {
  // Both clicks of a double-click land here; parallel runs would race on the
  // same lazy loads and fetch everything twice.
  if (revealing) return;
  revealing = true;
  try {
    await revealObjectNow(target);
  } finally {
    revealing = false;
  }
}

let revealing = false;

async function revealObjectNow(target: {
  warehouseId: string;
  namespaceId: string;
  name: string;
  type: string;
}) {
  // A pin can outlive its warehouse (deleted, or no longer visible to you).
  if (!warehouseChoices.value.some((wh) => wh.id === target.warehouseId)) {
    visualStore.setSnackbarMsg({
      function: 'revealObject',
      text: 'That warehouse is no longer available. Unpin it to remove it from the list.',
      ttl: 4000,
      ts: Date.now(),
      type: Type.WARNING,
    });
    return;
  }
  // A pin may name a warehouse still behind "Load more".
  ensureWarehouseRendered(target.warehouseId);
  if (target.type === 'warehouse') {
    // A warehouse pin is a shortcut for the picker: the tree narrows to it.
    selectedWarehouseId.value = target.warehouseId;
    await expandTreeToPath(target.warehouseId, '');
    return;
  }
  if (target.type === 'namespace') {
    // Opening the path opens the node itself too; there are no fields to load.
    await expandTreeToPath(target.warehouseId, target.namespaceId);
    const nodeId = `ns-${target.warehouseId}-${target.namespaceId}`;
    await nextTick();
    await nextTick();
    document
      .querySelector(`[data-node-id="${nodeId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const result = target;
  // Collapse previously focused search result table/view
  if (lastFocusedNodeId.value && openedItems.value.includes(lastFocusedNodeId.value)) {
    openedItems.value = openedItems.value.filter((id) => id !== lastFocusedNodeId.value);
  }

  // Expand tree to the result's namespace
  await expandTreeToPath(result.warehouseId, result.namespaceId);

  // Expand the table/view node itself to show its fields
  const prefix = result.type === 'table' ? 'table' : 'view';
  const itemNodeId = `${prefix}-${result.warehouseId}-${result.namespaceId}-${result.name}`;
  const itemNode = findItemById(treeItems.value, itemNodeId);
  if (itemNode && !itemNode.loaded) {
    await loadFieldsForTableOrView(itemNode);
  }
  if (!openedItems.value.includes(itemNodeId)) {
    openedItems.value = [...openedItems.value, itemNodeId];
  }
  lastFocusedNodeId.value = itemNodeId;

  // Scroll the node into view after DOM settles
  await nextTick();
  await nextTick();
  const el = document.querySelector(`[data-node-id="${itemNodeId}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function insertSearchResult(result: (typeof searchResults.value)[0]) {
  emit('item-selected', {
    type: result.type,
    warehouseId: result.warehouseId,
    warehouseName: result.warehouseName,
    namespaceId: result.namespaceId,
    name: result.name,
  });
}

function handlePreviewSearchResult(result: (typeof searchResults.value)[0]) {
  emit('preview-table', {
    type: result.type,
    warehouseId: result.warehouseId,
    warehouseName: result.warehouseName,
    namespaceId: result.namespaceId,
    name: result.name,
  });
}

function handleShowDDLSearchResult(result: (typeof searchResults.value)[0]) {
  emit('show-ddl', {
    type: result.type,
    warehouseId: result.warehouseId,
    warehouseName: result.warehouseName,
    namespaceId: result.namespaceId,
    name: result.name,
  });
}

function handleCopyPathSearchResult(result: (typeof searchResults.value)[0]) {
  emit('copy-path', {
    type: result.type,
    warehouseId: result.warehouseId,
    warehouseName: result.warehouseName,
    namespaceId: result.namespaceId,
    name: result.name,
  });
}

// ── Load warehouses ───────────────────────────────────────────────────

/** Root-level "Load more": the warehouse list endpoint returns everything. */
const WAREHOUSE_LOAD_MORE_ID = 'load-more-warehouses';

/**
 * How many warehouses are attached without being asked for. Every attach is a
 * REST config call plus a credential vend, so eagerly attaching a project's
 * whole list stalls the engine for minutes at a few hundred warehouses.
 * The rest attach on expand, which is already wired in loadNamespacesForWarehouse.
 */
const AUTO_ATTACH_LIMIT = 10;

/** Warehouse nodes fetched but not yet rendered. */
const pendingWarehouses = ref<TreeItem[]>([]);

function warehouseLoadMoreNode(): TreeItem {
  return {
    id: WAREHOUSE_LOAD_MORE_ID,
    name: `Load more… (${pendingWarehouses.value.length} remaining)`,
    type: 'load-more' as any,
    warehouseId: '',
    loaded: true,
  } as TreeItem;
}

function appendWarehousePage() {
  const next = pendingWarehouses.value.splice(0, TREE_PAGE_SIZE);
  const rendered = treeItems.value.filter((item) => item.id !== WAREHOUSE_LOAD_MORE_ID);
  treeItems.value = [
    ...rendered,
    ...next,
    ...(pendingWarehouses.value.length > 0 ? [warehouseLoadMoreNode()] : []),
  ];
}

async function loadWarehouses() {
  isLoading.value = true;
  try {
    const response = await functions.listWarehouses(false);
    if (response?.warehouses) {
      const allNodes: TreeItem[] = response.warehouses.map((wh: any) => {
        warehouseNames.set(wh['warehouse-id'] || wh.id, wh.name);
        const sp = wh['storage-profile'];
        return {
          id: `wh-${wh['warehouse-id'] || wh.id}`,
          name: wh.name,
          type: 'warehouse' as const,
          warehouseId: wh['warehouse-id'] || wh.id,
          warehouseName: wh.name,
          children: [],
          loaded: false,
          storageType: sp?.type,
          storageFlavor: sp?.flavor,
          storageEndpoint: sp?.endpoint,
          stsOff: stsDisabled(sp),
          vendingReason: loqeVendingReason(sp),
        };
      });

      pendingWarehouses.value = allNodes.slice(TREE_PAGE_SIZE);
      treeItems.value = [
        ...allNodes.slice(0, TREE_PAGE_SIZE),
        ...(pendingWarehouses.value.length > 0 ? [warehouseLoadMoreNode()] : []),
      ];

      // Auto-attach the first few so a small instance is queryable without
      // clicking; beyond that, attaching happens when a warehouse is expanded.
      const catalogUrl = getCatalogUrl();
      for (const item of allNodes.slice(0, AUTO_ATTACH_LIMIT)) {
        // Attaching a warehouse that vends nothing buys a failed ATTACH and an
        // error blaming the bucket; the node carries the real reason instead.
        if (item.stsOff) continue;
        if (!isWarehouseAttached(item.warehouseId)) {
          emit('attach-warehouse', {
            warehouseId: item.warehouseId,
            warehouseName: item.warehouseName || item.name,
            catalogUrl,
          });
        }
      }
    }
  } catch (e) {
    logError('[LoQE Tree] loadWarehouses', e);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Reload the warehouse list, keeping the pick.
 *
 * `loadWarehouses` resets the tree to its first page, so a picked warehouse from
 * beyond it is parked again — and the picker's value has not changed, so its
 * watcher never pages it back in and the tree goes blank. Page it in here, drop
 * the pick if the warehouse was deleted meanwhile, and reopen it if it was open
 * so Refresh reloads what you were looking at instead of collapsing it.
 */
async function refreshTree() {
  const picked = selectedWarehouseId.value;
  const wasOpen = !!picked && openedItems.value.includes(`wh-${picked}`);
  openedItems.value = [];
  await loadWarehouses();
  if (!picked) return;
  if (!warehouseChoices.value.some((wh) => wh.id === picked)) {
    selectedWarehouseId.value = null;
    return;
  }
  ensureWarehouseRendered(picked);
  if (wasOpen) openedItems.value = [`wh-${picked}`];
}

// ── Load namespaces for warehouse ─────────────────────────────────────

async function loadNamespacesForWarehouse(item: TreeItem) {
  if (item.loaded) return;

  try {
    const response = await functions.listNamespaces(
      item.warehouseId,
      undefined,
      undefined,
      false,
      TREE_PAGE_SIZE,
    );

    if (response?.namespaces) {
      item.children = response.namespaces.map((ns: string[]) => {
        const fullPath = ns.join('.');
        return {
          id: `ns-${item.warehouseId}-${fullPath}`,
          name: ns[ns.length - 1],
          type: 'namespace' as const,
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName || item.name,
          namespaceId: fullPath,
          children: [],
          loaded: false,
        };
      });

      // If the server returned a next-page-token, add a "Load more…" node
      if (response['next-page-token']) {
        pageTokens.value[item.id] = { namespaces: response['next-page-token'] };
        item.children.push({
          id: `load-more-${item.id}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName || item.name,
          loaded: true,
          loadMoreTypes: ['namespace'],
        });
      }
    }

    if (!item.children?.length) item.children = [statusNode(item, 'empty', 'No namespaces')];
    item.loaded = true;
    treeItems.value = [...treeItems.value]; // force reactivity

    // Emit attach-warehouse if not already attached. Browsing the namespaces of a
    // non-vending warehouse still works — that is catalog metadata; only its data
    // is out of reach — so expanding is allowed and just does not attach.
    if (!item.stsOff && !isWarehouseAttached(item.warehouseId)) {
      emit('attach-warehouse', {
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName || item.name,
        catalogUrl: getCatalogUrl(),
      });
    }
  } catch (error: any) {
    logError('[LoQE Tree] loadNamespaces', error);
    showLoadFailure(item, error);
  }
}

// ── Load children for namespace ───────────────────────────────────────

async function loadChildrenForNamespace(item: TreeItem) {
  if (item.loaded || !item.namespaceId) return;

  try {
    const apiNs = namespacePathToApiFormat(item.namespaceId);

    const [namespacesRes, tablesRes, viewsRes] = await Promise.all([
      functions.listNamespaces(item.warehouseId, apiNs, undefined, false, TREE_PAGE_SIZE),
      functions.listTables(item.warehouseId, apiNs, undefined, false, TREE_PAGE_SIZE),
      functions.listViews(item.warehouseId, apiNs, undefined, false, TREE_PAGE_SIZE),
    ]);

    const children: TreeItem[] = [];

    // Sub-namespaces
    if (namespacesRes?.namespaces) {
      namespacesRes.namespaces.forEach((ns: string[]) => {
        const fullPath = ns.join('.');
        children.push({
          id: `ns-${item.warehouseId}-${fullPath}`,
          name: ns[ns.length - 1],
          type: 'namespace',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: fullPath,
          children: [],
          loaded: false,
        });
      });
    }

    // Tables
    if (tablesRes?.identifiers) {
      tablesRes.identifiers.forEach((t: any) => {
        children.push({
          id: `table-${item.warehouseId}-${item.namespaceId}-${t.name}`,
          name: t.name,
          type: 'table',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: item.namespaceId,
          children: [],
          loaded: false,
        });
      });
    }

    // Views
    if (viewsRes?.identifiers) {
      viewsRes.identifiers.forEach((v: any) => {
        children.push({
          id: `view-${item.warehouseId}-${item.namespaceId}-${v.name}`,
          name: v.name,
          type: 'view',
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          namespaceId: item.namespaceId,
          children: [],
          loaded: false,
        });
      });
    }

    // Add a "Load more…" node if any resource type has more pages
    const tokens: { namespaces?: string; tables?: string; views?: string } = {};
    const loadMoreTypes: ('namespace' | 'table' | 'view')[] = [];
    if (namespacesRes?.['next-page-token']) {
      tokens.namespaces = namespacesRes['next-page-token'];
      loadMoreTypes.push('namespace');
    }
    if (tablesRes?.['next-page-token']) {
      tokens.tables = tablesRes['next-page-token'];
      loadMoreTypes.push('table');
    }
    if (viewsRes?.['next-page-token']) {
      tokens.views = viewsRes['next-page-token'];
      loadMoreTypes.push('view');
    }
    if (loadMoreTypes.length > 0) {
      pageTokens.value[item.id] = tokens;
      children.push({
        id: `load-more-${item.id}`,
        name: 'Load more…',
        type: 'load-more',
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName,
        namespaceId: item.namespaceId,
        loaded: true,
        loadMoreTypes,
      });
    }

    item.children = children.length
      ? children
      : [statusNode(item, 'empty', 'No namespaces, tables or views')];
    item.loaded = true;
    treeItems.value = [...treeItems.value];
  } catch (error: any) {
    logError('[LoQE Tree] loadNamespaceChildren', error);
    showLoadFailure(item, error);
  }
}

// ── Load fields for table/view ────────────────────────────────────────

async function loadFieldsForTableOrView(item: TreeItem) {
  if (item.loaded || (item.type !== 'table' && item.type !== 'view')) return;

  try {
    const apiNs = namespacePathToApiFormat(item.namespaceId!);

    const metadata: any =
      item.type === 'table'
        ? await functions.loadTable(item.warehouseId, apiNs, item.name, false)
        : await functions.loadView(item.warehouseId, apiNs, item.name, false);

    const fields: TreeItem[] = [];
    const ctx = fieldContext(metadata?.metadata, item.type);

    if (item.type === 'view') {
      if (metadata?.metadata?.versions) {
        const currentVersionId = metadata.metadata['current-version-id'];
        const currentVersion = metadata.metadata.versions.find(
          (v: any) => v['version-id'] === currentVersionId,
        );
        if (currentVersion) {
          const schemaId = currentVersion['schema-id'];
          const schema = metadata.metadata.schemas?.find((s: any) => s['schema-id'] === schemaId);
          ctx.identifierIds = new Set(schema?.['identifier-field-ids'] ?? []);
          schema?.fields?.forEach((field: any) => {
            fields.push(makeFieldItem(item, field, '', ctx));
          });
        }
      }
    } else {
      if (metadata?.metadata?.schemas) {
        const currentSchemaId = metadata.metadata['current-schema-id'] || 0;
        const schema = metadata.metadata.schemas.find(
          (s: any) => s['schema-id'] === currentSchemaId,
        );
        ctx.identifierIds = new Set(schema?.['identifier-field-ids'] ?? []);
        schema?.fields?.forEach((field: any) => {
          fields.push(makeFieldItem(item, field, '', ctx));
        });
      }
    }

    item.children = fields.length ? fields : [statusNode(item, 'empty', 'No columns')];
    item.loaded = true;
    treeItems.value = [...treeItems.value];
  } catch (error: any) {
    logError(`[LoQE Tree] loadFields(${item.type})`, error);
    showLoadFailure(item, error);
  }
}

/**
 * One field node, with children for anything nested.
 *
 * The Iceberg schema already describes nested types in full, so a struct/list/map
 * column expands rather than being flattened into a JSON blob. Nested nodes keep
 * a dotted path as their name so inserting one into the editor yields something
 * usable (`address.street`).
 */
function makeFieldItem(
  parent: TreeItem,
  field: any,
  namePath = '',
  ctx: FieldContext = EMPTY_FIELD_CONTEXT,
): TreeItem {
  const path = namePath ? `${namePath}.${field.name}` : field.name;
  const item: TreeItem = {
    id: `field-${parent.id}-${path}-${field.id}`,
    name: field.name,
    type: 'field',
    fieldType: formatIcebergType(field.type),
    fieldDoc: field.doc || undefined,
    required: !!field.required,
    isIdentifier: ctx.identifierIds.has(field.id),
    partitionTransform: ctx.partitionTransforms.get(field.id),
    warehouseId: parent.warehouseId,
    warehouseName: parent.warehouseName,
    namespaceId: parent.namespaceId,
    parentType: parent.type as 'table' | 'view',
    parentName: parent.name,
    fieldPath: path,
  };

  const children = makeNestedFieldItems(parent, field.type, path, ctx);
  if (children.length) item.children = children;
  return item;
}

/**
 * Children of a non-primitive type. List elements and map key/values have no
 * name of their own, so they are labelled by their role.
 */
function makeNestedFieldItems(
  parent: TreeItem,
  type: any,
  path: string,
  ctx: FieldContext,
): TreeItem[] {
  if (!type || typeof type === 'string') return [];

  if (type.type === 'struct') {
    return (type.fields ?? []).map((f: any) => makeFieldItem(parent, f, path, ctx));
  }

  if (type.type === 'list') {
    return [
      makeFieldItem(
        parent,
        { id: `${path}-element`, name: 'element', type: type.element },
        path,
        ctx,
      ),
    ];
  }

  if (type.type === 'map') {
    return [
      makeFieldItem(parent, { id: `${path}-key`, name: 'key', type: type.key }, path, ctx),
      makeFieldItem(parent, { id: `${path}-value`, name: 'value', type: type.value }, path, ctx),
    ];
  }

  return [];
}

// ── Handle "Load more…" node clicks ──────────────────────────────────

async function handleLoadMore(loadMoreItem: TreeItem) {
  // Root level: warehouses are paged in memory, the list endpoint has no pages.
  if (loadMoreItem.id === WAREHOUSE_LOAD_MORE_ID) {
    appendWarehousePage();
    return;
  }

  const parentId = loadMoreItem.id.replace('load-more-', '');
  const parent = findItemById(treeItems.value, parentId);
  if (!parent || !parent.children) return;

  const tokens = pageTokens.value[parentId];
  if (!tokens) return;

  // Show loading state
  loadMoreItem.name = 'Loading…';
  treeItems.value = [...treeItems.value];

  try {
    // If parent is a warehouse, load more namespaces
    if (parent.type === 'warehouse' && tokens.namespaces) {
      const response = await functions.listNamespaces(
        parent.warehouseId,
        undefined,
        tokens.namespaces,
        false,
        TREE_PAGE_SIZE,
      );

      parent.children = parent.children.filter((c) => c.id !== loadMoreItem.id);

      if (response?.namespaces) {
        response.namespaces.forEach((ns: string[]) => {
          const fullPath = ns.join('.');
          parent.children!.push({
            id: `ns-${parent.warehouseId}-${fullPath}`,
            name: ns[ns.length - 1],
            type: 'namespace',
            warehouseId: parent.warehouseId,
            warehouseName: parent.warehouseName,
            namespaceId: fullPath,
            children: [],
            loaded: false,
          });
        });
      }

      if (response?.['next-page-token']) {
        pageTokens.value[parentId] = { namespaces: response['next-page-token'] };
        parent.children.push({
          id: `load-more-${parentId}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: parent.warehouseId,
          warehouseName: parent.warehouseName,
          loaded: true,
          loadMoreTypes: ['namespace'],
        });
      } else {
        delete pageTokens.value[parentId];
      }
    }

    // If parent is a namespace, load more namespaces/tables/views
    if (parent.type === 'namespace' && parent.namespaceId) {
      const apiNs = namespacePathToApiFormat(parent.namespaceId);

      const calls: Promise<any>[] = [];
      const callTypes: string[] = [];
      if (tokens.namespaces) {
        calls.push(
          functions.listNamespaces(
            parent.warehouseId,
            apiNs,
            tokens.namespaces,
            false,
            TREE_PAGE_SIZE,
          ),
        );
        callTypes.push('namespaces');
      }
      if (tokens.tables) {
        calls.push(
          functions.listTables(parent.warehouseId, apiNs, tokens.tables, false, TREE_PAGE_SIZE),
        );
        callTypes.push('tables');
      }
      if (tokens.views) {
        calls.push(
          functions.listViews(parent.warehouseId, apiNs, tokens.views, false, TREE_PAGE_SIZE),
        );
        callTypes.push('views');
      }

      const results = await Promise.all(calls);

      parent.children = parent.children.filter((c) => c.id !== loadMoreItem.id);

      const newTokens: { namespaces?: string; tables?: string; views?: string } = {};

      results.forEach((data, idx) => {
        const type = callTypes[idx];

        if (type === 'namespaces' && data?.namespaces) {
          data.namespaces.forEach((ns: string[]) => {
            const fullPath = ns.join('.');
            parent.children!.push({
              id: `ns-${parent.warehouseId}-${fullPath}`,
              name: ns[ns.length - 1],
              type: 'namespace',
              warehouseId: parent.warehouseId,
              warehouseName: parent.warehouseName,
              namespaceId: fullPath,
              children: [],
              loaded: false,
            });
          });
          if (data['next-page-token']) newTokens.namespaces = data['next-page-token'];
        }

        if (type === 'tables' && data?.identifiers) {
          data.identifiers.forEach((t: any) => {
            parent.children!.push({
              id: `table-${parent.warehouseId}-${parent.namespaceId}-${t.name}`,
              name: t.name,
              type: 'table',
              warehouseId: parent.warehouseId,
              warehouseName: parent.warehouseName,
              namespaceId: parent.namespaceId,
              children: [],
              loaded: false,
            });
          });
          if (data['next-page-token']) newTokens.tables = data['next-page-token'];
        }

        if (type === 'views' && data?.identifiers) {
          data.identifiers.forEach((v: any) => {
            parent.children!.push({
              id: `view-${parent.warehouseId}-${parent.namespaceId}-${v.name}`,
              name: v.name,
              type: 'view',
              warehouseId: parent.warehouseId,
              warehouseName: parent.warehouseName,
              namespaceId: parent.namespaceId,
              children: [],
              loaded: false,
            });
          });
          if (data['next-page-token']) newTokens.views = data['next-page-token'];
        }
      });

      const loadMoreTypes: ('namespace' | 'table' | 'view')[] = [];
      if (newTokens.namespaces) loadMoreTypes.push('namespace');
      if (newTokens.tables) loadMoreTypes.push('table');
      if (newTokens.views) loadMoreTypes.push('view');

      if (loadMoreTypes.length > 0) {
        pageTokens.value[parentId] = newTokens;
        parent.children.push({
          id: `load-more-${parentId}`,
          name: 'Load more…',
          type: 'load-more',
          warehouseId: parent.warehouseId,
          warehouseName: parent.warehouseName,
          namespaceId: parent.namespaceId,
          loaded: true,
          loadMoreTypes,
        });
      } else {
        delete pageTokens.value[parentId];
      }
    }
  } catch (error: any) {
    logError('[LoQE Tree] handleLoadMore', error);
    loadMoreItem.name = 'Load more…';
  }

  treeItems.value = [...treeItems.value];
}

// ── Watch opened items ────────────────────────────────────────────────

watch(openedItems, async (newOpened, oldOpened) => {
  const newlyOpened = newOpened.filter((id) => !oldOpened.includes(id));

  for (const itemId of newlyOpened) {
    const item = findItemById(treeItems.value, itemId);
    if (!item || item.loaded) continue;

    if (item.type === 'warehouse') {
      await loadNamespacesForWarehouse(item);
    } else if (item.type === 'namespace') {
      await loadChildrenForNamespace(item);
    } else if (item.type === 'table' || item.type === 'view') {
      await loadFieldsForTableOrView(item);
    }
  }
});

// ── Find item in tree ─────────────────────────────────────────────────

function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ── Icon/color helpers ────────────────────────────────────────────────

function getTypeIcon(fieldType: string): string {
  const type = fieldType.toLowerCase();
  // Containers first: `struct<a:string>` contains its members' type names, so
  // testing primitives first would match those instead.
  if (isContainerType(type)) return 'mdi-code-json';
  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  )
    return 'mdi-numeric';
  if (type.includes('float') || type.includes('double') || type.includes('decimal'))
    return 'mdi-decimal';
  if (type.includes('string') || type.includes('char') || type.includes('varchar'))
    return 'mdi-format-text';
  if (type.includes('bool')) return 'mdi-checkbox-marked-circle-outline';
  if (type.includes('date') || type.includes('time') || type.includes('timestamp'))
    return 'mdi-calendar-clock';
  if (type.includes('binary') || type.includes('bytes')) return 'mdi-file-code';
  if (type.includes('uuid')) return 'mdi-identifier';
  return 'mdi-help-circle-outline';
}

/** True for struct/list/map summaries, whatever they contain. */
function isContainerType(type: string): boolean {
  return (
    type.startsWith('struct<') ||
    type.startsWith('list<') ||
    type.startsWith('map<') ||
    type.startsWith('array<')
  );
}

function getTypeColor(fieldType: string): string {
  const type = fieldType.toLowerCase();
  if (isContainerType(type)) return 'amber';
  if (
    type.includes('int') ||
    type.includes('long') ||
    type.includes('short') ||
    type.includes('byte')
  )
    return 'blue';
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) return 'cyan';
  if (type.includes('string') || type.includes('char') || type.includes('varchar')) return 'green';
  if (type.includes('bool')) return 'orange';
  if (type.includes('date') || type.includes('time') || type.includes('timestamp')) return 'purple';
  if (type.includes('binary') || type.includes('bytes')) return 'grey';
  if (type.includes('uuid')) return 'indigo';
  return 'grey';
}

// ── Field markers ─────────────────────────────────────────────────────

interface FieldContext {
  identifierIds: Set<number>;
  /** Source field id → transform, from the table's default partition spec. */
  partitionTransforms: Map<number, string>;
}
const EMPTY_FIELD_CONTEXT: FieldContext = {
  identifierIds: new Set(),
  partitionTransforms: new Map(),
};

/** What the loaded metadata says about fields beyond their type. Views have no partitions. */
function fieldContext(metadata: any, type: TreeItem['type']): FieldContext {
  const partitionTransforms = new Map<number, string>();
  if (type === 'table' && metadata) {
    const spec = (metadata['partition-specs'] ?? []).find(
      (s: any) => s['spec-id'] === metadata['default-spec-id'],
    );
    for (const f of spec?.fields ?? []) {
      const sourceId = f['source-id'] ?? f['source-ids']?.[0];
      if (sourceId !== undefined && !partitionTransforms.has(sourceId)) {
        partitionTransforms.set(sourceId, String(f.transform));
      }
    }
  }
  return { identifierIds: new Set(), partitionTransforms };
}

function fieldTooltip(item: TreeItem): string {
  return [
    item.fieldType,
    item.isIdentifier ? 'identifier field' : item.required ? 'NOT NULL' : '',
    item.partitionTransform ? `partitioned by ${item.partitionTransform}` : '',
    item.fieldDoc,
  ]
    .filter(Boolean)
    .join(' — ');
}

// ── Warehouse icon ────────────────────────────────────────────────────

/** Which mark a warehouse wears: an MDI glyph, or a bundled logo (`src`). */
function warehouseIcon(item: Pick<TreeItem, 'storageType' | 'storageFlavor' | 'storageEndpoint'>): {
  icon?: string;
  color?: string;
  src?: string;
  height?: number;
} {
  switch (item.storageType) {
    case 's3':
      if (item.storageFlavor === 'aws') return { icon: 'mdi-aws', color: 'orange' };
      if (item.storageEndpoint?.includes('cloudflarestorage')) return { src: cfIcon };
      if (isAliyunOssEndpoint(item.storageEndpoint)) return { src: aliyunIcon };
      return { icon: 'mdi-bucket-outline', color: 'primary' };
    case 'adls':
      return { icon: 'mdi-microsoft-azure', color: 'primary' };
    case 'gcs':
      return { icon: 'mdi-google-cloud', color: 'info' };
    case 'onelake':
      return { src: oneLakeIcon };
    case 'stackit':
      return { src: stackitIcon.value, height: 14 };
    default:
      return { icon: 'mdi-database', color: 'blue-grey' };
  }
}

// ── Status rows ───────────────────────────────────────────────────────

function statusNode(parent: TreeItem, kind: TreeItem['statusKind'], text: string): TreeItem {
  return {
    id: `status-${parent.id}`,
    name: text,
    type: 'status',
    statusKind: kind,
    retryOf: parent.id,
    warehouseId: parent.warehouseId,
    loaded: true,
  };
}

/**
 * Keep the node open and say what went wrong in place of its children. It used
 * to collapse back, which read as "nothing here" or as a click that missed.
 */
function showLoadFailure(item: TreeItem, error: any) {
  item.children = [
    isForbiddenError(error)
      ? statusNode(item, 'forbidden', 'No access')
      : statusNode(item, 'error', "Couldn't load"),
  ];
  item.loaded = true;
  treeItems.value = [...treeItems.value];
}

async function retryLoad(status: TreeItem) {
  const parent = status.retryOf ? findItemById(treeItems.value, status.retryOf) : null;
  if (!parent) return;
  parent.loaded = false;
  parent.children = [];
  treeItems.value = [...treeItems.value];
  if (parent.type === 'warehouse') await loadNamespacesForWarehouse(parent);
  else if (parent.type === 'namespace') await loadChildrenForNamespace(parent);
  else await loadFieldsForTableOrView(parent);
}

// ── Pins ──────────────────────────────────────────────────────────────

type Pin = (typeof visualStore.loqePinnedObjects)[number];

const PIN_ICONS: Record<Pin['type'], string> = {
  warehouse: 'mdi-database',
  namespace: 'mdi-folder-outline',
  table: 'mdi-table',
  view: 'mdi-eye-outline',
};

function pinKey(p: { warehouseId: string; namespaceId?: string; name: string; type: string }) {
  return `${p.type}:${p.warehouseId}:${p.namespaceId ?? ''}:${p.name}`;
}

/** Provider marks for pinned warehouses, from their nodes in the loaded list. */
const pinIcons = computed(() => {
  const ids = new Set(
    pinnedObjects.value.filter((p) => p.type === 'warehouse').map((p) => p.warehouseId),
  );
  const icons = new Map<string, ReturnType<typeof warehouseIcon>>();
  for (const item of [...treeItems.value, ...pendingWarehouses.value]) {
    if (item.type === 'warehouse' && ids.has(item.warehouseId)) {
      icons.set(item.warehouseId, warehouseIcon(item));
    }
  }
  for (const id of ids) if (!icons.has(id)) icons.set(id, warehouseIcon({}));
  return icons;
});

/**
 * The warehouse's current name. The pin keeps the name it had when pinned, and
 * the engine attaches under the current one, so a renamed warehouse would
 * otherwise insert a catalog that does not exist.
 */
function pinWarehouseName(pin: Pin): string {
  return warehouseNames.get(pin.warehouseId) ?? pin.warehouseName;
}

/** Only tables and views have a path the editor can use. */
function isInsertable(pin: Pin): boolean {
  return pin.type === 'table' || pin.type === 'view';
}

/** This project's pins, narrowed to the picked warehouse like the tree is. */
const pinnedObjects = computed(() => {
  const pid = visualStore.projectSelected['project-id'];
  const wh = selectedWarehouseId.value;
  return (visualStore.loqePinnedObjects ?? []).filter(
    (p) => p.projectId === pid && (!wh || p.warehouseId === wh),
  );
});

function isPinned(item: TreeItem): boolean {
  const key = pinKey(item);
  return pinnedObjects.value.some((p) => pinKey(p) === key);
}

function togglePin(item: TreeItem) {
  const type = item.type;
  if (type !== 'warehouse' && type !== 'namespace' && type !== 'table' && type !== 'view') return;
  if (type !== 'warehouse' && !item.namespaceId) return;
  if (isPinned(item)) {
    unpin(item);
    return;
  }
  visualStore.loqePinnedObjects = [
    ...(visualStore.loqePinnedObjects ?? []),
    {
      projectId: visualStore.projectSelected['project-id'],
      warehouseId: item.warehouseId,
      warehouseName: item.warehouseName || warehouseNames.get(item.warehouseId) || '',
      namespaceId: item.namespaceId ?? '',
      name: item.name,
      type,
    },
  ];
}

function unpin(pin: Parameters<typeof pinKey>[0]) {
  const pid = visualStore.projectSelected['project-id'];
  const key = pinKey(pin);
  visualStore.loqePinnedObjects = (visualStore.loqePinnedObjects ?? []).filter(
    (p) => !(p.projectId === pid && pinKey(p) === key),
  );
}

function insertPin(pin: Pin) {
  emit('item-selected', {
    type: pin.type,
    warehouseId: pin.warehouseId,
    warehouseName: pinWarehouseName(pin),
    namespaceId: pin.namespaceId,
    name: pin.name,
  });
}

// ── Emit handlers ─────────────────────────────────────────────────────

/** Double-click inserts, as in DataGrip/DBeaver; the row icon stays for discovery. */
function handleRowDblClick(item: TreeItem) {
  if (item.type === 'table' || item.type === 'view') handleInsertPath(item);
  else if (item.type === 'field') handleInsertField(item);
}

function handleInsertPath(item: TreeItem) {
  emit('item-selected', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

function handleInsertField(item: TreeItem) {
  emit('item-selected', {
    type: 'field',
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    // Nested fields insert their dotted path — `address.street` is what a query
    // needs, where `street` alone would not resolve.
    name: item.fieldPath || item.name,
  });
}

function handlePreview(item: TreeItem) {
  if (!item.namespaceId) return;
  emit('preview-table', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

function handleShowDDL(item: TreeItem) {
  if (!item.namespaceId) return;
  emit('show-ddl', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

/**
 * Spelled-out columns rather than `*`, so the query is a starting point to trim.
 * Top-level columns only: a struct comes back whole, and its fields are a
 * dotted path away. Loads the schema first when the table has not been opened.
 */
async function handleSelectAll(item: TreeItem) {
  if (!item.namespaceId) return;
  if (!item.loaded) await loadFieldsForTableOrView(item);
  emit('insert-select', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
    columns: (item.children ?? []).filter((c) => c.type === 'field').map((c) => c.name),
  });
}

function handleCopyPath(item: TreeItem) {
  if (!item.namespaceId) return;
  emit('copy-path', {
    type: item.type,
    warehouseId: item.warehouseId,
    warehouseName: item.warehouseName || '',
    namespaceId: item.namespaceId,
    name: item.name,
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────

onMounted(() => {
  loadWarehouses();
});

// Watch for project changes
const projectId = computed(() => visualStore.projectSelected['project-id']);
watch(projectId, () => {
  refreshTree();
});
</script>

<style scoped>
/* Warehouses 14px, everything inside them 13px — in line with the console's
   lists rather than caption-sized. */
.tree-view {
  font-size: 0.8125rem;
  min-width: max-content;
  background-color: transparent !important;
}

.tree-view :deep(.v-treeview-item) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item__content) {
  white-space: nowrap;
}

.tree-view :deep(.v-treeview-item .v-list-item) {
  background-color: transparent !important;
}

.tree-view :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.tree-view :deep(.v-list-item) {
  min-width: max-content;
  /* Tighter rows so the indent/connector lines read as one continuous tree. */
  min-height: 26px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
/* Leaf rows (tables/views/fields) are more compact than container rows. */
.tree-view :deep(.v-list-item:has(.tree-leaf-row)) {
  min-height: 20px !important;
}
.tree-view :deep(.v-list-item__content) {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.tree-view :deep(.v-list-item-title) {
  white-space: nowrap !important;
}

/* Only the pane scrolls. Vuetify clips list items, groups and titles, and any
   clipping box in between would capture the sticky actions instead of the pane.
   Groups are left alone: they do not clip, except while the expand transition
   sets overflow inline, and overriding that lets children spill mid-animation. */
.tree-view,
.tree-view :deep(.v-list-item),
.tree-view :deep(.v-list-item__content),
.tree-view :deep(.v-list-item-title) {
  overflow: visible !important;
}

/* macOS hides overlay scrollbars, so a long name gave no hint it could scroll. */
.tree-scroller::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.tree-scroller::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.25);
}

.tree-item-actions {
  position: sticky;
  right: 0;
  display: inline-flex;
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s ease;
  /* Covers the name it floats over; the second layer repeats the row's hover tint. */
  background:
    linear-gradient(rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-primary), 0.1)),
    rgb(var(--v-theme-surface));
}
.tree-item-container:hover .tree-item-actions {
  opacity: 1;
}

.tree-item-container {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.tree-item-title {
  user-select: none;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
}

.tree-item-doc {
  display: inline-block;
  max-width: 260px;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

/* 14px like the warehouse rows: at 16px "All warehouses" did not fit beside
   the two buttons at the default sidebar width. */
.tree-picker :deep(.v-field) {
  font-size: 0.875rem;
}

.pinned-section {
  background: rgba(var(--v-theme-on-surface), 0.03);
}
.pinned-header {
  cursor: pointer;
  user-select: none;
}

.tree-item-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 0.6875rem;
  line-height: 1.4;
  vertical-align: middle;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.tree-item-status {
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.tree-item-status:hover {
  text-decoration: none;
}
.tree-item-retry {
  margin-left: 8px;
  font-style: normal;
  color: rgb(var(--v-theme-primary));
}

.tree-item-title--warehouse {
  font-size: 0.875rem;
}

/* The expand toggle is a text v-btn and keeps focus after a click, which left a
   grey disc on the last caret touched. The chevron is sized to the 13px labels;
   at the default 24px it outweighed them. */
.tree-view :deep(.v-list-item-action .v-btn .v-btn__overlay) {
  opacity: 0 !important;
}
.tree-view :deep(.v-list-item-action .v-btn .v-icon) {
  font-size: 16px;
}

.tree-item-title:hover {
  text-decoration: underline;
}

.tree-item-insert-btn {
  flex-shrink: 0;
}

.tree-item-active {
  background-color: rgba(var(--v-theme-primary), 0.15);
  border-radius: 4px;
  margin: -2px -4px;
  padding: 2px 4px;
}

.tree-item-active .tree-item-title {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.filter-field :deep(.v-field) {
  font-size: 0.75rem !important;
}

.filter-field :deep(.v-field__input) {
  min-height: 28px !important;
  padding: 4px 8px !important;
}

.search-results-list :deep(.v-list-item) {
  min-height: 36px !important;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  cursor: pointer;
}

.search-results-list :deep(.v-list-item:hover) {
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
}

.search-result-item :deep(.v-list-item-subtitle) {
  opacity: 0.6;
}
</style>
