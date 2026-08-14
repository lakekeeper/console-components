<template>
  <!-- One place to reach every scope's grants, laid out like the permission
       explorer: pick a resource on the left, manage its grants on the right.
       The principal mode asks the same data the other way round — not "who
       holds what here" but "what does this principal hold anywhere". -->
  <v-card flat>
    <div class="d-flex" style="height: calc(100vh - 240px); min-height: 400px">
      <!-- LEFT: scope toggle + picker. -->
      <div
        v-show="!leftCollapsed"
        class="pa-2"
        :style="{
          width: leftWidth + 'px',
          minWidth: '200px',
          maxWidth: '800px',
          flexShrink: 0,
          overflow: 'auto',
          height: '100%',
        }">
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

        <div v-if="scope === 'server'" class="pa-2 text-caption text-medium-emphasis">
          Grants held on the server itself. These belong to no project.
        </div>

        <div v-else-if="scope === 'project'" class="pa-2 text-caption text-medium-emphasis">
          Grants held on
          <strong>{{ projectName }}</strong>
          itself. Grants on resources inside it are listed under those resources. Switch project in
          the app bar to work elsewhere.
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
          <v-progress-linear v-if="tagsLoading" indeterminate color="primary"></v-progress-linear>
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

      <!-- Drag to resize; the button on it collapses the column outright. -->
      <div
        v-show="!leftCollapsed"
        style="
          width: 5px;
          cursor: col-resize;
          user-select: none;
          flex-shrink: 0;
          transition: background 0.3s;
          position: relative;
        "
        :style="{
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
            <v-btn
              :icon="leftCollapsed ? 'mdi-menu' : 'mdi-menu-open'"
              size="small"
              variant="text"
              :title="leftCollapsed ? 'Show selector' : 'Hide selector'"
              @click="leftCollapsed = !leftCollapsed"></v-btn>
            <span class="text-caption text-medium-emphasis ml-1">
              {{ leftCollapsed ? 'Show selector' : 'Hide selector' }}
            </span>
            <v-spacer></v-spacer>
            <v-chip size="small" variant="tonal" class="mr-2">Preview API</v-chip>
          </div>
          <v-divider></v-divider>

          <!-- Which object is being granted on — without this the tree
               selection and the panel are two unconnected things. -->
          <div
            v-if="selectionHeader"
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
                :resource-name="activeResourceName" />
              <div v-else class="pa-8 text-medium-emphasis d-flex align-center ga-2">
                <v-icon icon="mdi-arrow-left"></v-icon>
                {{ emptyHint }}
              </div>
            </template>

            <!-- Principal mode: the cross-resource listing. -->
            <div v-else style="height: 100%; overflow-y: auto" class="pa-4">
              <div v-if="!principal" class="pa-8 text-center text-medium-emphasis">
                Select a principal to begin.
              </div>

              <div v-else-if="principalLoading" class="d-flex flex-column align-center pa-8">
                <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
                <span class="mt-4 text-body-2 text-medium-emphasis">Loading grants…</span>
              </div>

              <!-- This listing crosses every resource in the project, which an
                   authorizer that stores permissions per resource cannot answer
                   without reading its whole store. A property of the deployment,
                   not a failure. -->
              <v-alert v-else-if="notImplemented" type="info" variant="tonal" density="comfortable">
                <div class="text-body-2 font-weight-medium mb-1">
                  Not available on this authorizer
                </div>
                <div class="text-body-2">
                  The configured backend
                  <strong>{{ authzBackend }}</strong>
                  stores permissions per resource, so it cannot list everything one principal holds
                  without reading its whole store. Pick a resource on the left instead — those
                  listings work under every authorizer.
                </div>
              </v-alert>

              <div v-else-if="principalBackendUnavailable">
                <v-alert type="warning" variant="tonal" density="comfortable">
                  <div class="text-body-2 font-weight-medium mb-1">
                    Authorization service unavailable
                  </div>
                  <div class="text-body-2">
                    The catalog could not reach its authorizer. This is a server-side outage, not a
                    permissions problem.
                  </div>
                </v-alert>
                <v-btn
                  class="mt-3"
                  size="small"
                  variant="outlined"
                  prepend-icon="mdi-refresh"
                  @click="loadPrincipal">
                  Retry
                </v-btn>
              </div>

              <div v-else-if="principalError">
                <v-alert type="error" variant="tonal" density="compact">
                  {{ principalError }}
                </v-alert>
                <v-btn
                  class="mt-3"
                  size="small"
                  variant="outlined"
                  prepend-icon="mdi-refresh"
                  @click="loadPrincipal">
                  Retry
                </v-btn>
              </div>

              <div v-else-if="!grantsList.length" class="pa-8 text-center text-medium-emphasis">
                <v-icon size="32" class="mb-2">mdi-shield-off-outline</v-icon>
                <div>{{ principal.title }} holds no grants in this project.</div>
              </div>

              <template v-else>
                <v-alert
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mb-3"
                  icon="mdi-information-outline">
                  Grants are reported where they are held. A grant a role holds is listed under
                  <strong>that role</strong>
                  , not under its members, and server grants belong to no project so they are not
                  listed here.
                </v-alert>

                <div class="text-subtitle-2 mb-2">
                  {{ grantsList.length }} {{ grantsList.length === 1 ? 'grant' : 'grants' }} across
                  {{ groupedByResource.length }}
                  {{ groupedByResource.length === 1 ? 'resource' : 'resources' }}
                </div>

                <v-list density="compact" bg-color="transparent">
                  <v-list-item v-for="group in groupedByResource" :key="group.key" class="px-2">
                    <template #prepend>
                      <v-icon size="20" class="mr-3">{{ group.icon }}</v-icon>
                    </template>
                    <v-list-item-title class="d-flex align-center ga-2">
                      <span class="text-body-2">{{ group.label }}</span>
                      <v-chip size="x-small" variant="outlined">{{ group.typeLabel }}</v-chip>
                    </v-list-item-title>
                    <v-list-item-subtitle class="mt-1">
                      <v-chip
                        v-for="g in group.grants"
                        :key="g.privilege"
                        class="mr-1 mb-1"
                        size="x-small"
                        variant="tonal"
                        :color="g.recognized === false ? 'warning' : undefined">
                        {{ g.privilege }}
                      </v-chip>
                    </v-list-item-subtitle>
                    <template #append>
                      <!-- Closes the loop: what you can see here, you can go and
                           change, without hunting for the resource in the tree. -->
                      <v-btn
                        v-if="group.ref"
                        size="small"
                        variant="outlined"
                        text="Manage"
                        @click="jumpTo(group)"></v-btn>
                    </template>
                  </v-list-item>
                </v-list>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import {
  useGrants,
  isGrantListingNotImplemented,
  isAuthorizationBackendUnavailable,
  refFromResponse,
  resourceIcon,
  resourceKey,
  resourceLabel,
} from '../composables/useGrants';
import GrantsPanel from './GrantsPanel.vue';
import PrincipalSearch, { type SelectedPrincipal } from './PrincipalSearch.vue';
import WarehousesNavigationTree from './WarehousesNavigationTree.vue';
import type { GrantResourceRef } from '../common/interfaces';
import type { GrantResponse, TagDefinition } from '../gen/management/types.gen';

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
const grants = useGrants();

const scope = ref<'server' | 'project' | 'warehouses' | 'tags' | 'principal'>('server');

const scopes = [
  { value: 'server', label: 'Server', icon: 'mdi-server' },
  { value: 'project', label: 'Project', icon: 'mdi-folder-account-outline' },
  { value: 'warehouses', label: 'Warehouses', icon: 'mdi-database-outline' },
  { value: 'tags', label: 'Tags', icon: 'mdi-tag-outline' },
  { value: 'principal', label: 'Principal', icon: 'mdi-shield-account-outline' },
] as const;
const resolving = ref(false);

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
const authzBackend = computed(() => visual.getServerInfo()?.['authz-backend'] || 'in use');

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
      pickedRef.value = next;
      pickedName.value = item.name;
      pickedNamespace.value = item.namespaceId ?? '';
      resolveWarehouseName(wh);
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

const emptyHint = computed(() => {
  if (scope.value === 'tags') return 'Pick a tag to manage who holds what on it.';
  if (scope.value === 'project') return 'Pick a project to manage its grants.';
  return 'Pick a warehouse, namespace, table, view or dataset to manage its grants.';
});

// ---- principal mode --------------------------------------------------------

const principal = ref<SelectedPrincipal | null>(null);
const grantsList = ref<GrantResponse[]>([]);
const principalLoading = ref(false);
const principalError = ref<string | null>(null);
const notImplemented = ref(false);
const principalBackendUnavailable = ref(false);

function resourceIdOf(resource: any): string {
  return (
    resource?.['warehouse-id'] ??
    resource?.['namespace-id'] ??
    resource?.['table-id'] ??
    resource?.['view-id'] ??
    resource?.['generic-table-id'] ??
    resource?.['tag-definition-id'] ??
    resource?.['project-id'] ??
    ''
  );
}

/** One row per resource: six privileges on one table is one line, not six. */
const groupedByResource = computed(() => {
  const byResource = new Map<
    string,
    {
      key: string;
      id: string;
      typeLabel: string;
      label: string;
      icon: string;
      ref: GrantResourceRef | null;
      grants: GrantResponse[];
    }
  >();

  for (const g of grantsList.value) {
    const r: any = g.resource;
    const id = resourceIdOf(r);
    const key = `${r?.type}:${id}`;
    if (!byResource.has(key)) {
      byResource.set(key, {
        key,
        id,
        typeLabel: resourceLabel(r?.type),
        // The listing carries ids, not names; resolving each would be a request
        // per row, so the id stands in and the type carries the meaning.
        label: id ? `${resourceLabel(r?.type)} ${id.slice(0, 8)}…` : resourceLabel(r?.type),
        icon: resourceIcon(r?.type),
        ref: refFromResponse(r),
        grants: [],
      });
    }
    byResource.get(key)!.grants.push(g);
  }

  return [...byResource.values()].sort(
    (a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.label.localeCompare(b.label),
  );
});

/** Switches to the resource view for a listed grant, so it can be changed there. */
function jumpTo(group: { ref: GrantResourceRef | null; label: string }) {
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

async function loadPrincipal() {
  if (!principal.value) return;
  principalLoading.value = true;
  principalError.value = null;
  notImplemented.value = false;
  principalBackendUnavailable.value = false;
  grantsList.value = [];
  try {
    const filter =
      principal.value.type === 'user'
        ? { principalUser: principal.value.id }
        : { principalRole: principal.value.id };
    grantsList.value = await grants.listPrincipalGrants(filter);
  } catch (e: any) {
    if (isGrantListingNotImplemented(e)) notImplemented.value = true;
    else if (isAuthorizationBackendUnavailable(e)) principalBackendUnavailable.value = true;
    else principalError.value = e?.error?.message || e?.message || 'Failed to load grants';
  } finally {
    principalLoading.value = false;
  }
}

watch(principal, loadPrincipal);
// The app bar can change project underneath this view; a principal from the old
// one must not stay selected against the new one's listing.
watch(currentProjectId, () => {
  principal.value = null;
  grantsList.value = [];
});
watch(scope, (s) => {
  if (s === 'tags') loadTags();
});

onMounted(() => {
  if (scope.value === 'tags') loadTags();
});
</script>
