<template>
  <!-- One place to reach every scope's grants, laid out like the permission
       explorer: pick a resource on the left, manage its grants on the right.
       The principal mode asks the same data the other way round — not "who
       holds what here" but "what does this principal hold anywhere". -->
  <v-card flat>
    <!-- Measured, not guessed. A viewport formula has to know how much chrome
         sits above this pane, and that differs by host and by tab — too tall and
         the page grows a scrollbar of its own beside the tree's, which is what a
         long warehouse tree made obvious. Measuring the pane's own top edge is
         right wherever it is mounted. -->
    <div
      ref="paneRef"
      class="d-flex"
      :style="{ height: paneHeight ?? 'calc(100vh - 240px)', minHeight: '320px' }">
      <!-- LEFT: scope toggle + picker.

           Folded by animating the outer width to nothing rather than by
           unmounting: the column's contents keep their own width on the inside,
           so nothing reflows on the way out and the pane beside it grows into
           the space instead of jumping into it. The transition is dropped while
           the divider is being dragged, where it would lag the pointer. -->
      <div
        class="gx-fold"
        :class="{ 'gx-fold--instant': isResizing }"
        :style="{
          width: leftCollapsed ? '0px' : leftWidth + 'px',
          flexShrink: 0,
          overflow: 'hidden',
          height: '100%',
        }">
        <!-- The scope switch stays put; only the picker under it scrolls. One
             scroll region over both meant that choosing a warehouse — the
             scope with a tree long enough to need scrolling — pushed the
             switch off the top, so the control you would use to leave that
             scope was the first thing to disappear. -->
        <div
          class="d-flex flex-column"
          :style="{
            width: leftWidth + 'px',
            minWidth: '200px',
            maxWidth: '800px',
            height: '100%',
            minHeight: 0,
          }">
          <div class="pa-2 pb-0 flex-shrink-0">
            <!-- Five labels do not fit a narrow column, and wrapping clipped the
             last one against the toggle's fixed height. Below the width where
             the row still fits, the labels drop and the icons carry it. -->
            <v-btn-toggle
              v-model="scope"
              mandatory
              density="compact"
              variant="text"
              color="primary"
              class="mb-2"
              style="width: 100%">
              <v-btn
                v-for="s in scopes"
                :key="s.value"
                :value="s.value"
                size="small"
                class="flex-grow-1 px-1"
                style="min-width: 0">
                <v-icon :start="!compactScopes" size="18">{{ s.icon }}</v-icon>
                <span v-if="!compactScopes">{{ s.label }}</span>
                <v-tooltip v-if="compactScopes" activator="parent" location="bottom">
                  {{ s.label }}
                </v-tooltip>
              </v-btn>
            </v-btn-toggle>
            <v-divider class="mb-2"></v-divider>
          </div>

          <div class="pa-2 pt-0" style="flex: 1 1 auto; min-height: 0; overflow-y: auto">
            <div v-if="scope === 'server'" class="pa-2 text-caption text-medium-emphasis">
              Grants held on the server itself. These belong to no project.
            </div>

            <div v-else-if="scope === 'project'" class="pa-2 text-caption text-medium-emphasis">
              Grants held on
              <strong>{{ projectName }}</strong>
              itself. Grants on resources inside it are listed under those resources. Switch project
              in the app bar to work elsewhere.
            </div>

            <!-- Warehouse object tree: the same picker the permission explorer uses,
             so the two read identically. -->
            <WarehousesNavigationTree
              v-else-if="scope === 'warehouses'"
              pickable
              :pickable-types="['warehouse', 'namespace', 'table', 'view', 'generic-table']"
              @pick="onPick" />

            <div v-else-if="scope === 'tags'">
              <v-text-field
                v-model="tagSearch"
                label="Filter tags"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                class="mb-2"></v-text-field>
              <v-progress-linear
                v-if="tagsLoading"
                indeterminate
                color="primary"></v-progress-linear>
              <v-list density="compact" bg-color="transparent" nav>
                <v-list-item
                  v-for="t in filteredTags"
                  :key="t.id"
                  :active="selectedTagId === t.id"
                  color="primary"
                  prepend-icon="mdi-tag-outline"
                  :title="t.name"
                  @click="selectedTagId = t.id"></v-list-item>
                <v-list-item v-if="!tagsLoading && !filteredTags.length">
                  <span class="text-caption text-disabled">No tags.</span>
                </v-list-item>
              </v-list>
            </div>

            <div v-else-if="scope === 'principal'">
              <div class="text-caption text-medium-emphasis mb-2">
                Everything a user or role holds in
                <strong>{{ projectName }}</strong>
                . Server grants belong to no project and are not listed.
              </div>
              <PrincipalSearch
                v-model="principal"
                :lock-project-id="currentProjectId"></PrincipalSearch>
            </div>
          </div>
        </div>
      </div>

      <!-- Drag to resize; the button on it collapses the column outright. -->
      <div
        :style="{
          width: leftCollapsed ? '0px' : '5px',
          cursor: 'col-resize',
          userSelect: 'none',
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
          // Folds with the column rather than blinking out from under it.
          transition: isResizing ? 'none' : 'width 0.2s ease, background 0.3s',
          background:
            dividerHover || isResizing
              ? 'rgb(var(--v-theme-primary))'
              : 'rgba(var(--v-theme-on-surface), 0.12)',
        }"
        @mousedown="startResize"
        @mouseenter="dividerHover = true"
        @mouseleave="dividerHover = false">
        <v-btn
          icon
          size="x-small"
          variant="elevated"
          color="primary"
          style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10;
          "
          title="Hide selector"
          @click.stop="leftCollapsed = true">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
      </div>

      <!-- RIGHT: grants for the current selection. -->
      <div style="flex: 1 1 auto; min-width: 0; height: 100%; overflow: hidden">
        <div class="d-flex flex-column" style="height: 100%; min-height: 0">
          <div class="d-flex align-center pa-1 flex-grow-0">
            <!-- Not the hamburger: that one belongs to the app's own drawer, two
                 rows above this, and wearing its glyph made a control that folds
                 one column of one pane look like the one that folds the whole
                 navigation. Double chevrons point the column the way it goes. -->
            <v-btn
              :icon="leftCollapsed ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left'"
              size="small"
              variant="text"
              :title="leftCollapsed ? 'Show scope' : 'Hide scope'"
              @click="leftCollapsed = !leftCollapsed"></v-btn>
            <!-- "Scope", not "resources": this column picks a server, a project,
                 an object in a warehouse, a tag definition or a principal, and
                 only one of those five is a resource. The verb lives in the
                 icon and the tooltip; the label names what is behind it. -->
            <span class="text-caption text-medium-emphasis ml-1">Scope</span>
            <v-spacer></v-spacer>
            <!-- What can be granted at all, as published by this authorizer —
                 the reference behind every picker in this view. -->
            <GrantPrivilegeReference>
              <template #activator="{ props: aProps }">
                <v-btn
                  v-bind="aProps"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-book-open-variant-outline"
                  class="mr-2">
                  Grantable privileges
                </v-btn>
              </template>
            </GrantPrivilegeReference>
          </div>
          <v-divider></v-divider>

          <!-- The panel carries this row itself now, with the Grant action on
               it: two identity rows one above the other said the same thing
               twice and put the action on the wrong one. Principal mode has no
               panel, so it keeps its own. -->
          <div
            v-if="selectionHeader && scope === 'principal'"
            class="d-flex align-center ga-3 px-4 py-2 flex-grow-0"
            style="border-bottom: 1px solid rgba(var(--v-border-color), 0.16)">
            <v-icon size="22">{{ selectionHeader.icon }}</v-icon>
            <div style="min-width: 0">
              <div class="text-subtitle-2 text-truncate" :title="selectionHeader.title">
                {{ selectionHeader.title }}
              </div>
              <div
                class="text-caption text-medium-emphasis text-truncate"
                :title="selectionHeader.subtitle">
                {{ selectionHeader.subtitle }}
              </div>
            </div>
          </div>

          <div style="flex: 1 1 auto; min-height: 0; overflow: hidden">
            <!-- Resource modes all reduce to one panel over a resource ref. -->
            <template v-if="scope !== 'principal'">
              <div v-if="resolving" class="d-flex flex-column align-center pa-8">
                <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
                <span class="mt-4 text-body-2 text-medium-emphasis">Resolving…</span>
              </div>
              <GrantsPanel
                v-else-if="activeResource"
                :key="resourceKey(activeResource)"
                :resource="activeResource"
                :resource-name="activeResourceName"
                :warehouse-name="hierarchyWarehouseName"
                :namespace-path="hierarchyNamespacePath">
                <!-- Forwarded with the picked resource, because the scope here
                     changes as the rail is used: a host that wants to say
                     something about *this* scope needs to know which one it is.
                     -->
                <template v-if="$slots.notice" #notice>
                  <slot name="notice" :resource="activeResource"></slot>
                </template>
              </GrantsPanel>
              <div v-else class="pa-8 text-medium-emphasis d-flex align-center ga-2">
                <v-icon icon="mdi-arrow-left"></v-icon>
                {{ emptyHint }}
              </div>
            </template>

            <!-- Principal mode: the cross-resource listing, shared with the
                 role and user pages so all three read identically. -->
            <div v-else style="height: 100%; overflow-y: auto" class="pa-4">
              <div v-if="!principal" class="pa-8 text-center text-medium-emphasis">
                Select a principal to begin.
              </div>
              <PrincipalGrantsPanel
                v-else
                :key="`${principal.type}:${principal.id}`"
                :principal-id="principal.id"
                :principal-type="principal.type"
                allow-manage
                @manage="onManage" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { usePaneHeight } from '../common/paneHeight';
import {
  resourceIcon,
  resourceKey,
  resourceLabel,
  useGrantPrincipalListingSupported,
} from '../composables/useGrants';
import GrantsPanel from './GrantsPanel.vue';
import PrincipalSearch, { type SelectedPrincipal } from './PrincipalSearch.vue';
import PrincipalGrantsPanel from './PrincipalGrantsPanel.vue';
import GrantPrivilegeReference from './GrantPrivilegeReference.vue';
import WarehousesNavigationTree from './WarehousesNavigationTree.vue';
import { isForbiddenError, isNotFoundError } from '../common/errorUtils';
import type { GrantResourceRef } from '../common/interfaces';
import type { TagDefinition } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent.
helix.register();

interface PickItem {
  type: string;
  warehouseId: string;
  /** Dot-separated namespace path, as the tree carries it. */
  namespaceId?: string;
  name: string;
}

const functions = useFunctions();
const visual = useVisualStore();

const scope = ref<'server' | 'project' | 'warehouses' | 'tags' | 'principal'>('server');

const ALL_SCOPES = [
  { value: 'server', label: 'Server', icon: 'mdi-server' },
  { value: 'project', label: 'Project', icon: 'mdi-folder-account-outline' },
  { value: 'warehouses', label: 'Warehouses', icon: 'mdi-database-outline' },
  { value: 'tags', label: 'Tags', icon: 'mdi-tag-outline' },
  { value: 'principal', label: 'Principal', icon: 'mdi-shield-account-outline' },
] as const;

// Every other scope reads one resource's grants, which every authorizer can
// answer. Principal asks the reverse — what one principal holds anywhere — and
// OpenFGA keeps no index for it, so the scope is dropped rather than offered
// and then declined.
const principalListingSupported = useGrantPrincipalListingSupported();
const scopes = computed(() =>
  ALL_SCOPES.filter((s) => s.value !== 'principal' || principalListingSupported.value),
);
// The answer arrives after mount, so a scope that stops being offered has to
// give the view back rather than leave it on a button that no longer exists.
watch(principalListingSupported, (ok) => {
  if (!ok && scope.value === 'principal') scope.value = 'server';
});
const resolving = ref(false);

// ---- how tall this pane is -------------------------------------------------

const { paneRef, paneHeight } = usePaneHeight(320);

// ---- the selection, in the URL ---------------------------------------------
//
// A reload used to drop you back on the server scope, having thrown away the
// object you were looking at. The query carries it instead of a store, so the
// state that survives a refresh is the same state you can send to someone else.

/** Ids differ per kind; this is the one the ref carries. */
function refId(ref: GrantResourceRef | null): string {
  if (!ref) return '';
  const r = ref as any;
  return r.namespaceId || r.tableId || r.viewId || r.genericTableId || r.warehouseId || '';
}

function writeSelection() {
  if (restoring.value) return;

  // The store is what actually survives a reload; the query is for sharing.
  visual.grantsExplorerSelection =
    scope.value === 'warehouses' && pickedRef.value
      ? {
          scope: 'warehouses',
          type: (pickedRef.value as any).type,
          warehouseId: (pickedRef.value as any).warehouseId,
          id: refId(pickedRef.value),
          name: pickedName.value,
          namespacePath: pickedNamespace.value,
        }
      : scope.value === 'tags' && selectedTagId.value
        ? { scope: 'tags', tagId: selectedTagId.value }
        : scope.value === 'principal' && principal.value
          ? {
              scope: 'principal',
              principalKind: principal.value.type,
              principalId: principal.value.id,
              principalTitle: principal.value.title,
            }
          : { scope: scope.value };

  const next: Record<string, string | undefined> = { gscope: scope.value };
  if (scope.value === 'warehouses' && pickedRef.value) {
    const r = pickedRef.value as any;
    next.gtype = r.type;
    next.gwh = r.warehouseId;
    next.gid = refId(pickedRef.value);
    next.gname = pickedName.value || undefined;
    next.gns = pickedNamespace.value || undefined;
  } else if (scope.value === 'tags' && selectedTagId.value) {
    next.gtag = selectedTagId.value;
  } else if (scope.value === 'principal' && principal.value) {
    next.gpkind = principal.value.type;
    next.gpid = principal.value.id;
  }
  patchQuery(next);
}

/** The parameters this pane owns; everything else in the query is left alone. */
const OWNED = ['gscope', 'gtype', 'gwh', 'gid', 'gname', 'gns', 'gtag', 'gpkind', 'gpid'];

/**
 * Writes the address bar without navigating.
 *
 * `router.replace` runs the full guard pipeline on this app — the same reason
 * the namespace page stopped using it for its own tab sync — and from here it
 * simply never landed: the query stayed as it was while the Tags and Policies
 * tabs, whose own sync happens in the page above, updated fine. This touches
 * only the parameters this pane owns, so the page's `tab` is never disturbed.
 */
function patchQuery(next: Record<string, string | undefined>) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const k of OWNED) params.delete(k);
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const search = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  );
}

const restoring = ref(true);

/**
 * Puts the selection back, or falls back to the server scope.
 *
 * A link can name an object that has since been dropped, or one this caller may
 * not read. Landing on a pane full of refusals would be a worse answer than
 * landing on the scope that always works, so the object is checked before it is
 * selected — one request, and only for the kinds whose disappearance is
 * ordinary.
 */
async function restoreSelection() {
  // The query wins when it carries a selection — a shared link is an explicit
  // request — and the store stands in when it does not, which is every ordinary
  // reload.
  const saved = visual.grantsExplorerSelection;
  const url = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  const fromQuery: Record<string, string | undefined> = {};
  for (const k of OWNED) fromQuery[k] = url?.get(k) ?? undefined;
  const q: Record<string, string | undefined> = fromQuery.gscope
    ? fromQuery
    : {
        gscope: saved?.scope,
        gtype: saved?.type,
        gwh: saved?.warehouseId,
        gid: saved?.id,
        gname: saved?.name || saved?.principalTitle,
        gns: saved?.namespacePath,
        gtag: saved?.tagId,
        gpkind: saved?.principalKind,
        gpid: saved?.principalId,
      };
  const want = q.gscope as typeof scope.value | undefined;
  try {
    if (!want) return;
    if (want === 'tags' && q.gtag) {
      scope.value = 'tags';
      selectedTagId.value = q.gtag;
      return;
    }
    if (want === 'principal' && q.gpid && q.gpkind) {
      scope.value = 'principal';
      principal.value = {
        id: q.gpid,
        type: q.gpkind as 'user' | 'role',
        title: q.gname || q.gpid,
      };
      return;
    }
    if (want !== 'warehouses' || !q.gtype || !q.gwh || !q.gid) {
      scope.value = want === 'project' ? 'project' : 'server';
      return;
    }

    const ref =
      q.gtype === 'warehouse'
        ? ({ type: 'warehouse', warehouseId: q.gwh } as GrantResourceRef)
        : q.gtype === 'namespace'
          ? ({ type: 'namespace', warehouseId: q.gwh, namespaceId: q.gid } as GrantResourceRef)
          : q.gtype === 'table'
            ? ({ type: 'table', warehouseId: q.gwh, tableId: q.gid } as GrantResourceRef)
            : q.gtype === 'view'
              ? ({ type: 'view', warehouseId: q.gwh, viewId: q.gid } as GrantResourceRef)
              : ({
                  type: 'generic-table',
                  warehouseId: q.gwh,
                  genericTableId: q.gid,
                } as GrantResourceRef);

    scope.value = 'warehouses';
    pickedRef.value = ref;
    pickedName.value = q.gname || '';
    pickedNamespace.value = q.gns || '';
    // Not awaited, and not a gate: see below.
    resolveWarehouseName(q.gwh);
    verifyRestored(ref);
  } catch {
    scope.value = 'server';
    pickedRef.value = null;
  } finally {
    restoring.value = false;
    writeSelection();
  }
}

/**
 * Confirms afterwards that the restored object is still there.
 *
 * Afterwards, and never as a precondition: on a reload this runs before the
 * access token has hydrated, and the request that comes back rejected says
 * nothing about whether the object exists. Checking first and falling back on
 * any failure sent every reload to the server scope.
 *
 * So only the two answers that actually mean "not yours to look at" move you:
 * gone, or refused. A rejection for any other reason leaves the selection
 * standing, and the pane reports it in its own states.
 */
async function verifyRestored(ref: GrantResourceRef) {
  const r = ref as any;
  try {
    await functions.getWarehouse(r.warehouseId, false);
    if (r.type === 'namespace') await functions.getNamespaceById(r.namespaceId, false);
  } catch (e: any) {
    if (!isNotFoundError(e) && !isForbiddenError(e)) return;
    if (resourceKey(pickedRef.value ?? { type: 'server' }) !== resourceKey(ref)) return;
    scope.value = 'server';
    pickedRef.value = null;
    writeSelection();
  }
}

// Left column: collapsible and drag-resizable, the same behaviour the warehouse
// pages use for their navigation tree.
const leftCollapsed = ref(false);
const leftWidth = ref(320);
const dividerHover = ref(false);
const isResizing = ref(false);

// Measured against the widest label set: below this the row cannot hold five
// labels on one line, so they give way to their icons.
const compactScopes = computed(() => leftWidth.value < 520);

function startResize(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = leftWidth.value;

  function onMouseMove(ev: MouseEvent) {
    leftWidth.value = Math.max(200, Math.min(800, startWidth + (ev.clientX - startX)));
  }
  function onMouseUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

// Grants always concern the active project; switching project is an app-bar
// action, so this view follows it rather than offering a second control for it.
const currentProjectId = computed(() => visual.projectSelected['project-id'] || '');

const projectName = computed(() => visual.projectSelected['project-name'] || 'this project');

// ---- resource selection ----------------------------------------------------

const pickedRef = ref<GrantResourceRef | null>(null);
const pickedName = ref('');
/** Dotted namespace path of the pick, for the header's breadcrumb. */
const pickedNamespace = ref('');
/** Warehouse names, resolved once each — the tree hands back only ids. */
const warehouseNames = ref<Record<string, string>>({});

async function resolveWarehouseName(id: string) {
  if (!id || warehouseNames.value[id]) return;
  try {
    const wh: any = await functions.getWarehouse(id, false);
    if (wh?.name) warehouseNames.value = { ...warehouseNames.value, [id]: wh.name };
  } catch {
    // surfaced by the functions plugin; the id stands in
  }
}

/** App routes and Iceberg endpoints address namespaces with the unit separator. */
function toApiNs(dotted?: string): string {
  return (dotted ?? '').split('.').join('\x1F');
}

/**
 * The tree hands back names and paths; grants are addressed by id, so each pick
 * is resolved before the panel can read anything.
 */
async function onPick(item: PickItem) {
  resolving.value = true;
  const wh = item.warehouseId;
  const apiNs = toApiNs(item.namespaceId);
  try {
    let next: GrantResourceRef | null = null;
    switch (item.type) {
      case 'warehouse':
        next = { type: 'warehouse', warehouseId: wh };
        break;
      case 'namespace': {
        const meta: any = await functions.loadNamespaceMetadata(wh, apiNs, false);
        const id = meta?.properties?.namespace_id || meta?.['namespace-uuid'];
        if (id) next = { type: 'namespace', warehouseId: wh, namespaceId: id };
        break;
      }
      case 'table': {
        const t: any = await functions.loadTable(wh, apiNs, item.name, false);
        const id = t?.metadata?.['table-uuid'];
        if (id) next = { type: 'table', warehouseId: wh, tableId: id };
        break;
      }
      case 'view': {
        const v: any = await functions.loadView(wh, apiNs, item.name, false);
        const id = v?.metadata?.['view-uuid'];
        if (id) next = { type: 'view', warehouseId: wh, viewId: id };
        break;
      }
      case 'generic-table': {
        const res: any = await functions.listGenericTables(wh, apiNs, undefined, false);
        const match = (res.identifiers ?? []).find((g: any) => g.name === item.name);
        if (match?.id) next = { type: 'generic-table', warehouseId: wh, genericTableId: match.id };
        break;
      }
    }
    if (next) {
      // Awaited, not fired off: the panel builds its hierarchy from this name
      // the moment the ref changes, and reads it once. Left to resolve on its
      // own, every chain came out with the literal word "Warehouse" where the
      // warehouse should be. Cached after the first pick, so this costs one
      // request per warehouse and nothing after that.
      await resolveWarehouseName(wh);
      pickedRef.value = next;
      pickedName.value = item.name;
      pickedNamespace.value = item.namespaceId ?? '';
    }
  } catch {
    // surfaced by the functions plugin
  } finally {
    resolving.value = false;
  }
}

/** Tags scope. */
const tags = ref<TagDefinition[]>([]);
const tagsLoading = ref(false);
const tagSearch = ref('');
const selectedTagId = ref('');
const selectedTagName = computed(
  () => tags.value.find((t) => t.id === selectedTagId.value)?.name || '',
);
const filteredTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase();
  const list = q ? tags.value.filter((t) => t.name.toLowerCase().includes(q)) : tags.value;
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
});
async function loadTags() {
  if (tags.value.length || tagsLoading.value) return;
  tagsLoading.value = true;
  try {
    tags.value = await functions.listAllTagDefinitions(undefined, false);
  } catch {
    // surfaced by the functions plugin
  } finally {
    tagsLoading.value = false;
  }
}

/** The resource the right pane manages, derived from the active scope. */
const activeResource = computed<GrantResourceRef | null>(() => {
  switch (scope.value) {
    case 'server':
      return { type: 'server' };
    case 'project':
      // No explicit id: the wrappers fall back to the active project's header.
      return { type: 'project' };
    case 'warehouses':
      return pickedRef.value;
    case 'tags':
      return selectedTagId.value
        ? { type: 'tag-definition', tagDefinitionId: selectedTagId.value }
        : null;
    default:
      return null;
  }
});

/**
 * What the right pane is about to change, spelled out. The panel names the kind
 * of resource but not which one, and in the tree view that is the whole
 * question.
 */
const selectionHeader = computed<{ icon: string; title: string; subtitle: string } | null>(() => {
  const target = activeResource.value;
  if (!target || scope.value === 'principal') return null;

  const icon = resourceIcon(target.type);
  const type = resourceLabel(target.type);

  if (target.type === 'server')
    return { icon, title: 'Server', subtitle: 'Grants held server-wide' };
  if (target.type === 'project') return { icon, title: projectName.value, subtitle: type };
  if (target.type === 'tag-definition') {
    return { icon, title: selectedTagName.value || 'Tag', subtitle: type };
  }

  const whId = (target as any).warehouseId as string;
  const whName = warehouseNames.value[whId] || whId;
  const crumbs = [whName, pickedNamespace.value].filter(Boolean).join(' / ');
  return {
    icon,
    title: target.type === 'warehouse' ? whName : pickedName.value,
    subtitle: target.type === 'warehouse' ? type : `${type} · ${crumbs}`,
  };
});

const activeResourceName = computed(() => {
  if (scope.value === 'project') return projectName.value;
  if (scope.value === 'tags') return selectedTagName.value;
  if (scope.value === 'warehouses') return pickedName.value;
  return '';
});

/**
 * The two extra bits the hierarchy needs, which the panel itself does not.
 *
 * `pickedNamespace` is dotted for the breadcrumb, while grant resources address
 * namespaces with the unit separator — and the tree hands back a warehouse id
 * where the rail wants a name.
 */
const hierarchyWarehouseName = computed(() => {
  const id = (activeResource.value as any)?.warehouseId as string | undefined;
  return id ? warehouseNames.value[id] || '' : '';
});

const hierarchyNamespacePath = computed(() =>
  activeResource.value && 'warehouseId' in activeResource.value
    ? toApiNs(pickedNamespace.value)
    : '',
);

const emptyHint = computed(() => {
  if (scope.value === 'tags') return 'Pick a tag to manage who holds what on it.';
  if (scope.value === 'project') return 'Pick a project to manage its grants.';
  return 'Pick a warehouse, namespace, table, view or generic table to manage its grants.';
});

// ---- principal mode --------------------------------------------------------

const principal = ref<SelectedPrincipal | null>(null);

/** Switches to the resource view for a listed grant, so it can be changed there. */
function onManage(group: { ref: GrantResourceRef; label: string }) {
  const target = group.ref;
  if (!target) return;
  pickedName.value = group.label;
  pickedNamespace.value = '';
  switch (target.type) {
    case 'server':
      scope.value = 'server';
      break;
    case 'project':
      scope.value = 'project';
      break;
    case 'tag-definition':
      selectedTagId.value = target.tagDefinitionId;
      loadTags();
      scope.value = 'tags';
      break;
    default:
      pickedRef.value = target;
      scope.value = 'warehouses';
  }
}

// The app bar can change project underneath this view; a principal from the old
// one must not stay selected against the new one's listing.
watch(currentProjectId, () => {
  principal.value = null;
});
watch(scope, (s) => {
  if (s === 'tags') loadTags();
});

watch([scope, pickedRef, selectedTagId, principal], writeSelection, { deep: true });

// Leaving the tab takes them with it: a link that still named a warehouse while
// sitting on Policies read as though it selected the tab, which it never did.
// The stored selection is what a reload restores from, so nothing is lost.
const mountedPath = typeof window === 'undefined' ? '' : window.location.pathname;
onUnmounted(() => {
  if (typeof window !== 'undefined' && window.location.pathname === mountedPath) patchQuery({});
});

onMounted(async () => {
  await restoreSelection();
  if (scope.value === 'tags') loadTags();
});
</script>

<style scoped>
/* One width transition for the folding column. Kept here rather than inline so
   the resize drag can turn it off with a class — a transition on width makes
   the pointer and the edge disagree while dragging. */
.gx-fold {
  transition: width 0.2s ease;
}

.gx-fold--instant {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .gx-fold {
    transition: none;
  }
}
</style>
