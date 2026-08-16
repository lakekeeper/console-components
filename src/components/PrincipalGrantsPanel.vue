<template>
  <!-- Everything one principal holds, for a principal that is already known —
       a role's own page, a user row, or the explorer once someone has been
       searched for. The listing crosses every resource in the project, so not
       every authorizer can answer it. -->
  <div>
    <div v-if="loading" class="d-flex flex-column align-center pa-8">
      <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
      <span class="mt-4 text-body-2 text-medium-emphasis">Loading grants…</span>
    </div>

    <!-- An authorizer that stores permissions per resource cannot answer this
         without reading its whole store. A property of the deployment, not a
         failure, so it reads as an explanation. -->
    <v-alert v-else-if="notImplemented" type="info" variant="tonal" density="comfortable">
      <div class="text-body-2 font-weight-medium mb-1">Not available on this authorizer</div>
      <div class="text-body-2">
        The configured backend
        <strong>{{ authzBackend }}</strong>
        stores permissions per resource, so it cannot list everything one principal holds without
        reading its whole store. Open a warehouse, namespace or table and read its grants there —
        those listings work under every authorizer.
      </div>
    </v-alert>

    <div v-else-if="backendUnavailable">
      <v-alert type="warning" variant="tonal" density="comfortable">
        <div class="text-body-2 font-weight-medium mb-1">Authorization service unavailable</div>
        <div class="text-body-2">
          The catalog could not reach its authorizer. This is a server-side outage, not a
          permissions problem.
        </div>
      </v-alert>
      <v-btn class="mt-3" size="small" variant="outlined" prepend-icon="mdi-refresh" @click="load">
        Retry
      </v-btn>
    </div>

    <div v-else-if="loadError">
      <v-alert type="error" variant="tonal" density="compact">{{ loadError }}</v-alert>
      <v-btn class="mt-3" size="small" variant="outlined" prepend-icon="mdi-refresh" @click="load">
        Retry
      </v-btn>
    </div>

    <div v-else-if="!grants.length" class="pa-6 text-center text-medium-emphasis">
      <v-icon size="28" class="mb-2">mdi-shield-off-outline</v-icon>
      <div>Holds no grants in {{ projectLabel }}.</div>
    </div>

    <template v-else>
      <div class="d-flex align-center flex-wrap ga-3 mb-2">
        <v-select
          v-if="presentTypes.length > 1"
          v-model="typeFilter"
          :items="[{ value: null, title: 'All objects' }, ...presentTypes]"
          item-title="title"
          item-value="value"
          label="Object"
          density="compact"
          variant="underlined"
          hide-details
          style="max-width: 220px"></v-select>
        <div class="text-caption text-medium-emphasis">
          {{ grants.length }} {{ grants.length === 1 ? 'grant' : 'grants' }} across
          {{ groupedByResource.length }}
          {{ groupedByResource.length === 1 ? 'resource' : 'resources' }}
        </div>
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
              <v-tooltip activator="parent" location="top">
                <template v-if="g.recognized === false">
                  No longer in this authorizer's vocabulary — enforces nothing, but is still held.
                </template>
                <template v-else-if="g['created-at']">
                  Granted {{ formatGrantedAt(g['created-at']) }}
                </template>
                <template v-else>{{ g.privilege }}</template>
              </v-tooltip>
            </v-chip>
            <div v-if="grantedSummary(group.grants)" class="text-caption text-medium-emphasis mt-1">
              {{ grantedSummary(group.grants) }}
            </div>
          </v-list-item-subtitle>
          <template v-if="allowManage || allowEdit || allowOpen" #append>
            <!-- Resolves the id to a path on click rather than on render: a
                 grant names its resource by id, every route names it by path,
                 and finding one costs several requests. -->
            <v-btn
              v-if="allowOpen && group.ref && canOpen(group.ref)"
              class="mr-2"
              size="small"
              variant="text"
              icon="mdi-open-in-new"
              :loading="opening === group.key"
              title="Open this object"
              @click="openObject(group)"></v-btn>
            <v-btn
              v-if="group.ref && allowManage"
              size="small"
              variant="outlined"
              text="Manage"
              @click="emit('manage', { ref: group.ref, label: group.label })"></v-btn>
            <!-- Editing from the principal's own page: the resource is the row,
                 the principal is fixed, so it opens straight into the same
                 assign dialog the resource panels use. -->
            <v-btn
              v-else-if="group.ref && allowEdit"
              size="small"
              variant="outlined"
              text="Edit"
              :loading="preparing === group.key"
              @click="openEdit(group)"></v-btn>
          </template>
        </v-list-item>
      </v-list>
    </template>

    <GrantAssignDialog
      v-if="editing"
      v-model="editOpen"
      :privileges="editPrivileges"
      :resource-type="editing.ref.type"
      :resource-name="editing.label"
      :principal="editPrincipal"
      :held-for="heldForEdit"
      :saving="saving"
      :error="saveError"
      @apply="applyEdit" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { helix } from 'ldrs';
import { useVisualStore } from '../stores/visual';
import {
  useGrants,
  isGrantListingNotImplemented,
  isMissingGrantPrincipal,
  isAuthorizationBackendUnavailable,
  refFromResponse,
  resourceIcon,
  resourceLabel,
  formatGrantedSummary,
  RESOURCE_TYPE_ORDER,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import type { GrantResourceRef } from '../common/interfaces';
import type { GrantEntry, GrantResponse, GrantablePrivilege } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent.
helix.register();

const props = withDefaults(
  defineProps<{
    principalId: string;
    principalType: 'user' | 'role';
    /** Which project's grants to list. Defaults to the active one. */
    projectId?: string;
    /** Offers a per-resource action; only hosts that can navigate should set it. */
    allowManage?: boolean;
    /** Lets each listed resource's grants be edited in place. */
    allowEdit?: boolean;
    /** Offers a per-row jump to the object itself. */
    allowOpen?: boolean;
    /** Shown in the edit dialog's title. */
    principalName?: string;
  }>(),
  { allowManage: false, allowEdit: false, allowOpen: false },
);

const emit = defineEmits<{
  (e: 'manage', v: { ref: GrantResourceRef; label: string }): void;
  /** Lets a host show a count without duplicating the request. */
  (e: 'loaded', count: number): void;
}>();

const visual = useVisualStore();
const router = useRouter();
const grantsApi = useGrants();

const grants = ref<GrantResponse[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const notImplemented = ref(false);
const backendUnavailable = ref(false);
/** Narrows the listing to one kind of object; null shows everything. */
const typeFilter = ref<string | null>(null);

const authzBackend = computed(() => visual.getServerInfo()?.['authz-backend'] || 'in use');
const projectLabel = computed(() => visual.projectSelected['project-name'] || 'this project');

function grantedSummary(list: GrantResponse[]): string {
  return formatGrantedSummary(list.map((g) => g['created-at']));
}

/** Optional on every grant: an authorizer that does not record it reports none. */
function formatGrantedAt(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

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
      type: string;
      typeLabel: string;
      label: string;
      icon: string;
      ref: GrantResourceRef | null;
      grants: GrantResponse[];
    }
  >();

  for (const g of grants.value) {
    const r: any = g.resource;
    const id = resourceIdOf(r);
    const key = `${r?.type}:${id}`;
    if (!byResource.has(key)) {
      byResource.set(key, {
        key,
        id,
        type: r?.type as string,
        typeLabel: resourceLabel(r?.type),
        // The listing carries ids, not names; resolving each would be a request
        // per row, so the id stands in and the type carries the meaning.
        label: id ? `${resourceLabel(r?.type)} ${id.slice(0, 8)}…` : resourceLabel(r?.type),
        // Replaced by the real path once the warehouse index resolves.
        icon: resourceIcon(r?.type),
        ref: refFromResponse(r),
        grants: [],
      });
    }
    byResource.get(key)!.grants.push(g);
  }

  return [...byResource.values()]
    .map((g) => ({ ...g, label: resolvedPaths.value[g.key] ?? g.label }))
    .filter((g) => !typeFilter.value || g.type === typeFilter.value)
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.label.localeCompare(b.label));
});

/** Types actually present in this listing — no point offering the rest. */
const presentTypes = computed(() => {
  const seen = new Set<string>();
  for (const g of grants.value) seen.add((g.resource as any)?.type);
  return RESOURCE_TYPE_ORDER.filter((t) => seen.has(t)).map((t) => ({
    value: t,
    title: resourceLabel(t),
  }));
});

// ---- opening the object ----------------------------------------------------

const opening = ref<string | null>(null);

/** The server and the project are not places you can navigate to. */
function canOpen(target: GrantResourceRef): boolean {
  return target.type !== 'server' && target.type !== 'project';
}

async function openObject(group: { key: string; ref: GrantResourceRef | null }) {
  if (!group.ref) return;
  opening.value = group.key;
  try {
    const { route } = await grantsApi.resolveResourceLocation(group.ref);
    if (route) router.push(route);
    else {
      // Resolution walks the warehouse; not finding it means the object is
      // dropped or invisible to this caller, not that the grant is bogus.
      loadError.value =
        'That object could not be located — it may have been dropped, or you may not be able to see it.';
    }
  } catch (e: any) {
    loadError.value = e?.error?.message || e?.message || 'Failed to locate that object';
  } finally {
    opening.value = null;
  }
}

// ---- editing ---------------------------------------------------------------

const editOpen = ref(false);
const preparing = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);
const editPrivileges = ref<GrantablePrivilege[]>([]);
const editing = ref<{ key: string; ref: GrantResourceRef; label: string } | null>(null);

const editPrincipal = computed<GrantPrincipalRow>(() => ({
  key: `${props.principalType}:${props.principalId}`,
  id: props.principalId,
  kind: props.principalType,
  name: props.principalName || props.principalId,
}));

/** What this principal holds on the resource being edited, from the listing. */
function heldForEdit(): string[] {
  const group = groupedByResource.value.find((g) => g.key === editing.value?.key);
  const known = new Set(editPrivileges.value.map((p) => p.privilege.name));
  // Stale privileges have no checkbox, so they are not part of this diff.
  return (group?.grants ?? []).map((g) => g.privilege).filter((n) => known.has(n));
}

/**
 * The vocabulary is per resource and carries the caller's `allowed` flags, so it
 * is fetched when a row is opened rather than for every row in the listing.
 */
async function openEdit(group: { key: string; ref: GrantResourceRef | null; label: string }) {
  if (!group.ref) return;
  preparing.value = group.key;
  saveError.value = null;
  try {
    editPrivileges.value = await grantsApi.grantablePrivileges(group.ref);
    editing.value = { key: group.key, ref: group.ref, label: group.label };
    editOpen.value = true;
  } catch (e: any) {
    loadError.value = e?.error?.message || e?.message || 'Failed to read grantable privileges';
  } finally {
    preparing.value = null;
  }
}

async function applyEdit(payload: { principal: GrantPrincipalRow; privileges: string[] }) {
  const target = editing.value;
  if (!target) return;
  const before = new Set(heldForEdit());
  const after = new Set(payload.privileges);
  const grantable = new Set(
    editPrivileges.value.filter((p) => p.allowed).map((p) => p.privilege.name),
  );
  const entry = (privilege: string): GrantEntry => ({
    principal:
      payload.principal.kind === 'user'
        ? { user: payload.principal.id }
        : { role: payload.principal.id },
    privilege,
  });
  // Only what the caller may change on either side — a revoke they are not
  // entitled to would fail the whole atomic apply.
  const writes = [...after].filter((n) => !before.has(n) && grantable.has(n)).map(entry);
  const deletes = [...before].filter((n) => !after.has(n) && grantable.has(n)).map(entry);

  if (!writes.length && !deletes.length) {
    editOpen.value = false;
    return;
  }

  saving.value = true;
  saveError.value = null;
  try {
    await grantsApi.applyGrants(target.ref, { writes, deletes });
    editOpen.value = false;
    await load();
  } catch (e: any) {
    saveError.value = e?.error?.message || e?.message || 'Failed to apply grants';
  } finally {
    saving.value = false;
  }
}

const resolvedPaths = ref<Record<string, string>>({});

/**
 * Replaces every row's id with its real path. All rows on one warehouse share a
 * single walk of it, so this is one index build per warehouse rather than one
 * per row — and the ids stay on screen until it returns rather than blocking
 * the listing behind it.
 */
async function resolvePaths() {
  const groups = [...new Set(grants.value.map((g) => g.resource))];
  const seen = new Set<string>();
  await Promise.all(
    groups.map(async (resource: any) => {
      const target = refFromResponse(resource);
      if (!target) return;
      const key = `${resource?.type}:${resourceIdOf(resource)}`;
      if (seen.has(key)) return;
      seen.add(key);
      try {
        const { path } = await grantsApi.resolveResourceLocation(target);
        resolvedPaths.value = { ...resolvedPaths.value, [key]: path };
      } catch {
        // Leaves the id in place; the row is still usable.
      }
    }),
  );
}

async function load() {
  if (!props.principalId) return;
  loading.value = true;
  loadError.value = null;
  notImplemented.value = false;
  backendUnavailable.value = false;
  grants.value = [];
  try {
    const filter =
      props.principalType === 'user'
        ? { principalUser: props.principalId }
        : { principalRole: props.principalId };
    grants.value = await grantsApi.listPrincipalGrants(filter, props.projectId);
    emit('loaded', grants.value.length);
    resolvedPaths.value = {};
    // Not awaited: the listing is useful immediately, paths fill in behind it.
    resolvePaths();
  } catch (e: any) {
    if (isGrantListingNotImplemented(e)) notImplemented.value = true;
    else if (isAuthorizationBackendUnavailable(e)) backendUnavailable.value = true;
    // Should not happen — a principal is always supplied — but the endpoint has
    // a dedicated error for it, so name it rather than showing a bare 400.
    else if (isMissingGrantPrincipal(e)) {
      loadError.value = 'This listing needs a user or role to report on.';
    } else loadError.value = e?.error?.message || e?.message || 'Failed to load grants';
  } finally {
    loading.value = false;
  }
}

watch(() => [props.principalId, props.principalType, props.projectId], load);
onMounted(load);

defineExpose({ reload: load });
</script>
