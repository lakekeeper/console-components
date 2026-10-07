<template>
  <!-- Everything one principal holds, for a principal that is already known —
       a role's own page, a user row, or the explorer once someone has been
       searched for. The listing crosses every resource in the project, so not
       every authorizer can answer it. -->
  <div class="d-flex flex-column" style="min-height: 0">
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
          {{ AUTHORIZER_UNREACHABLE_MESSAGE }}
        </div>
      </v-alert>
      <v-btn class="mt-3" size="small" variant="outlined" prepend-icon="mdi-refresh" @click="load">
        Retry
      </v-btn>
    </div>

    <!-- A refusal is an answer, not a failure: retrying asks the same question
         of the same rights, so no Retry is offered for it. -->
    <v-alert
      v-else-if="listRefused"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-lock-outline">
      {{
        access.isSelf(principalType, principalId)
          ? 'You are not allowed to list your own grants in this project.'
          : "You are not allowed to list this principal's grants. That needs the right to read grants across the whole project."
      }}
    </v-alert>

    <div v-else-if="loadError">
      <v-alert type="error" variant="tonal" density="compact">{{ loadError }}</v-alert>
      <v-btn class="mt-3" size="small" variant="outlined" prepend-icon="mdi-refresh" @click="load">
        Retry
      </v-btn>
    </div>

    <div v-else-if="!grants.length" class="pa-6 text-center text-medium-emphasis">
      <v-icon size="28" class="mb-2">mdi-shield-off-outline</v-icon>
      <!-- The listing covers every object in the project, not just the project
           itself, so the empty state spells the types out rather than reading
           as a statement about project-level grants only. -->
      <div>Holds no grants anywhere in {{ projectLabel }}.</div>
      <div class="text-caption mt-1">
        Not on the project itself, nor on any warehouse, namespace, table or view in it.
      </div>
    </div>

    <template v-else>
      <!-- The header row of the pane shape: what the listing is, and what acts
           on it as a whole. Revoke-all sits here rather than in the table so it
           does not read as acting on a row or on a selection. -->
      <div class="d-flex align-center flex-wrap ga-3 mb-2" style="flex: 0 0 auto">
        <v-text-field
          v-model="search"
          placeholder="Filter by name"
          density="compact"
          variant="underlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          style="max-width: 260px"></v-text-field>
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
          style="max-width: 200px"></v-select>
        <div class="text-caption text-medium-emphasis">
          {{ shownGrantCount }} {{ shownGrantCount === 1 ? 'grant' : 'grants' }} on
          {{ rows.length }}
          {{ rows.length === 1 ? 'resource' : 'resources' }}
          <template v-if="rows.length !== allRows.length">
            — filtered from {{ allRows.length }}
          </template>
          <template v-if="unresolvedPaths">· resolving names…</template>
        </div>
        <v-spacer></v-spacer>
        <!-- Red on the glyph, not on the label: the button is findable as the
             destructive one without reading as this pane's primary action. -->
        <v-btn
          v-if="allowEdit"
          size="small"
          variant="outlined"
          :disabled="!rows.length || !!revoking"
          @click="askRevokeAll">
          <template #prepend>
            <v-icon color="error">mdi-shield-remove-outline</v-icon>
          </template>
          Revoke all
        </v-btn>
      </div>

      <!-- A row that could not be opened for editing: said over the listing,
           which stays, since the rest of it is still good. -->
      <v-alert
        v-if="editError"
        class="mb-2"
        type="warning"
        variant="tonal"
        density="compact"
        closable
        style="flex: 0 0 auto"
        @click:close="editError = null">
        <div class="text-body-2">{{ editError.label }} could not be opened for editing.</div>
        <div class="text-caption">{{ editError.message }}</div>
      </v-alert>

      <v-alert
        v-if="revokeErrors.length"
        class="mb-2"
        type="warning"
        variant="tonal"
        density="compact"
        closable
        style="flex: 0 0 auto"
        @click:close="revokeErrors = []">
        <div class="text-body-2">
          {{ revokeErrors.length }}
          {{ revokeErrors.length === 1 ? 'resource' : 'resources' }} could not be revoked.
        </div>
        <div v-for="f in revokeErrors.slice(0, 5)" :key="f.label" class="text-caption">
          {{ f.label }} — {{ f.message }}
        </div>
        <div v-if="revokeErrors.length > 5" class="text-caption">
          …and {{ revokeErrors.length - 5 }} more.
        </div>
      </v-alert>

      <!-- The table scrolls, not the column around it: every host here embeds
           this panel in a region that scrolls already, so an unbounded table
           would put its last row — and this pane's only controls — below every
           one of a couple of hundred rows.

           A measured height is not available: measuring a top edge inside a
           scrolling parent re-measures as that parent scrolls. Hence the three
           bounds — floor, target, and what is actually left once the host's
           chrome (dialog title, action bar, the row above) is subtracted. -->
      <div
        style="
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          height: max(260px, min(60vh, calc(100vh - 340px)));
        ">
        <!-- Virtual, not paged: each row is an icon, a chip per privilege and
             up to three buttons, and a principal with a grant per namespace
             runs to hundreds of rows. The virtual table builds what is on
             screen and recycles the rest, which also retires the pager. -->
        <v-data-table-virtual
          density="compact"
          hover
          fixed-header
          height="100%"
          style="height: 100%"
          :headers="headers"
          :items="rows"
          item-value="key"
          :sort-by="[{ key: 'label', order: 'asc' }]">
          <template #item.label="{ item }">
            <div class="d-flex align-center ga-2" style="min-width: 0">
              <v-icon size="18">{{ item.icon }}</v-icon>
              <span class="text-body-2 text-truncate" :title="item.label">{{ item.label }}</span>
            </div>
          </template>

          <template #item.typeLabel="{ item }">
            <v-chip size="x-small" variant="outlined">{{ item.typeLabel }}</v-chip>
          </template>

          <template #item.privileges="{ item }">
            <v-chip
              v-for="g in item.grants"
              :key="g.privilege"
              class="mr-1 my-1"
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
          </template>

          <template #item.grantedAt="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.granted }}</span>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex align-center justify-end ga-1">
              <!-- Resolves the id to a path on click rather than on render: a
                   grant names its resource by id, every route names it by path,
                   and finding one costs several requests. -->
              <v-btn
                v-if="allowOpen && item.ref && canOpen(item.ref)"
                size="small"
                variant="text"
                icon="mdi-open-in-new"
                :loading="opening === item.key"
                title="Open this object"
                @click="openObject(item)"></v-btn>
              <v-btn
                v-if="item.ref && allowManage"
                size="small"
                variant="outlined"
                text="Manage"
                @click="emit('manage', { ref: item.ref, label: item.label })"></v-btn>
              <!-- Editing from the principal's own page: the resource is the
                   row, the principal is fixed, so it opens straight into the
                   same assign dialog the resource panels use. -->
              <template v-else-if="item.ref && allowEdit">
                <v-btn
                  size="small"
                  variant="text"
                  icon="mdi-pencil-outline"
                  title="Edit grants on this object"
                  :loading="preparing === item.key"
                  @click="openEdit(item)"></v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  icon="mdi-shield-remove-outline"
                  :loading="revoking === item.key"
                  :disabled="!!revoking && revoking !== item.key"
                  @click="askRevokeRow(item)"></v-btn>
              </template>
            </div>
          </template>

          <template #no-data>
            <v-empty-state
              icon="mdi-filter-remove-outline"
              title="Nothing matches"
              text="No grant in this listing matches the current filter."></v-empty-state>
          </template>
        </v-data-table-virtual>
      </div>
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

    <!-- Revoking is one confirm for both gestures: the row version names the
         object, the bulk version names the count, and neither can be undone
         except by granting again. -->
    <v-dialog v-model="confirmOpen" max-width="520" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
          <v-icon color="error">mdi-shield-remove-outline</v-icon>
          {{ pendingRow ? 'Revoke grants on this object' : 'Revoke every listed grant' }}
        </v-card-title>
        <v-card-text class="text-body-2">
          <template v-if="pendingRow">
            <div>
              Revokes
              <strong>{{ pendingRow.grants.map((g) => g.privilege).join(', ') }}</strong>
              from
              <strong>{{ principalName || principalId }}</strong>
              on
              <strong>{{ pendingRow.label }}</strong>
              .
            </div>
          </template>
          <template v-else>
            <div>
              Revokes
              <strong>
                {{ shownGrantCount }} {{ shownGrantCount === 1 ? 'grant' : 'grants' }}
              </strong>
              from
              <strong>{{ principalName || principalId }}</strong>
              , across
              {{ rows.length }} {{ rows.length === 1 ? 'resource' : 'resources' }}.
            </div>
            <!-- Revoke-all acts on what is listed, which the filters above have
                 already narrowed. Saying so here is the only place a reader can
                 catch a filter they forgot they set. -->
            <div v-if="rows.length !== allRows.length" class="mt-2">
              Only the
              <strong>{{ rows.length }}</strong>
              currently filtered
              {{ rows.length === 1 ? 'resource is' : 'resources are' }} affected — the other
              {{ allRows.length - rows.length }} stay as they are.
            </div>
            <div class="mt-2 text-medium-emphasis">
              Each resource is revoked on its own, so a failure part-way leaves the ones already
              done revoked.
            </div>
            <!-- Typed confirmation, and only here. A row revoke undoes in
                 seconds through Edit beside it, so a name to type there would
                 be friction on the cheap gesture; this one empties a principal
                 in a single click and can only be undone by granting every
                 resource back one at a time. -->
            <v-text-field
              v-model="confirmText"
              class="mt-3"
              density="compact"
              variant="outlined"
              hide-details
              autofocus
              :disabled="!!revoking"
              :label="`Type “${revokeConfirmPhrase}” to confirm`"
              @keyup.enter="confirmArmed && runRevoke()"></v-text-field>
          </template>
          <v-progress-linear
            v-if="revoking === 'all'"
            class="mt-4"
            :model-value="revokeProgress"
            height="6"
            rounded></v-progress-linear>
          <div v-if="revoking === 'all'" class="text-caption mt-1">
            {{ revokeDone }} of {{ revokeTotal }} done…
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="!!revoking" @click="confirmOpen = false">Cancel</v-btn>
          <v-btn
            variant="flat"
            color="error"
            :loading="!!revoking"
            :disabled="!confirmArmed"
            @click="runRevoke">
            Revoke
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
  AUTHORIZER_UNREACHABLE_MESSAGE,
  grantErrorMessage,
  refFromResponse,
  resourceIcon,
  resourceLabel,
  formatGrantedSummary,
  RESOURCE_TYPE_ORDER,
  usePrincipalGrantsAccess,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import type { GrantResourceRef } from '../common/interfaces';
import type { GrantEntry, GrantResponse, GrantablePrivilege } from '../gen/management/types.gen';
import { toPrincipal } from '../common/principal';
import { isForbiddenError } from '../common/errorUtils';

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
    /** Lets each listed resource's grants be edited and revoked in place. */
    allowEdit?: boolean;
    /** Offers a per-row jump to the object itself. */
    allowOpen?: boolean;
    /** Shown in the edit and revoke dialogs. */
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
const access = usePrincipalGrantsAccess(() => props.projectId);

/** One resource, with everything this principal holds on it. */
type GrantRow = {
  key: string;
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  icon: string;
  ref: GrantResourceRef | null;
  grants: GrantResponse[];
  granted: string;
  grantedAt: number;
};

const grants = ref<GrantResponse[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
// The listing itself was refused (403), as opposed to failing.
const listRefused = ref(false);
const notImplemented = ref(false);
const backendUnavailable = ref(false);
/** Narrows the listing to one kind of object; null shows everything. */
const typeFilter = ref<string | null>(null);
const search = ref('');

const headers = [
  { title: 'Object', key: 'label', minWidth: '260px' },
  { title: 'Type', key: 'typeLabel', width: '140px' },
  { title: 'Privileges', key: 'privileges', sortable: false, minWidth: '220px' },
  { title: 'Granted', key: 'grantedAt', width: '190px' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: '130px' },
];

const authzBackend = computed(() => visual.getServerInfo()?.['authz-backend'] || 'in use');
const projectLabel = computed(() => visual.projectSelected['project-name'] || 'this project');

/** Optional on every grant: an authorizer that does not record it reports none. */
function formatGrantedAt(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * The id of the resource itself, not of anything containing it. Every resource
 * below a warehouse also carries `warehouse-id`, so this has to be chosen by
 * `type` — a fallback chain would answer `warehouse-id` for every namespace,
 * table and view, collapsing a whole warehouse into one row whose actions then
 * addressed whichever of them the listing happened to return first.
 */
function resourceIdOf(resource: any): string {
  switch (resource?.type) {
    case 'namespace':
      return resource['namespace-id'] ?? '';
    case 'table':
      return resource['table-id'] ?? '';
    case 'view':
      return resource['view-id'] ?? '';
    case 'generic-table':
      return resource['generic-table-id'] ?? '';
    case 'tag-definition':
      return resource['tag-definition-id'] ?? '';
    case 'warehouse':
      return resource['warehouse-id'] ?? '';
    case 'project':
      return resource['project-id'] ?? '';
    default:
      return '';
  }
}

/** One row per resource: six privileges on one table is one line, not six. */
const allRows = computed<GrantRow[]>(() => {
  const byResource = new Map<string, GrantRow>();

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
        // per row, so the id stands in and the type carries the meaning. Ids
        // minted together share a long prefix, so the placeholder takes the
        // tail — otherwise every row of a warehouse reads the same until the
        // paths land.
        label: id ? `${resourceLabel(r?.type)} …${id.slice(-8)}` : resourceLabel(r?.type),
        icon: resourceIcon(r?.type),
        ref: refFromResponse(r),
        grants: [],
        granted: '',
        grantedAt: 0,
      });
    }
    byResource.get(key)!.grants.push(g);
  }

  return [...byResource.values()].map((row) => {
    const times = row.grants
      .map((g) => (g['created-at'] ? new Date(g['created-at']).getTime() : NaN))
      .filter((t) => !Number.isNaN(t));
    return {
      ...row,
      // Replaced by the real path once the warehouse index resolves.
      label: resolvedPaths.value[row.key] ?? row.label,
      granted: formatGrantedSummary(row.grants.map((g) => g['created-at'])),
      grantedAt: times.length ? Math.min(...times) : 0,
    };
  });
});

const rows = computed(() => {
  const needle = (search.value ?? '').trim().toLowerCase();
  return allRows.value.filter((row) => {
    if (typeFilter.value && row.type !== typeFilter.value) return false;
    if (!needle) return true;
    return (
      row.label.toLowerCase().includes(needle) ||
      row.typeLabel.toLowerCase().includes(needle) ||
      row.grants.some((g) => g.privilege.toLowerCase().includes(needle))
    );
  });
});

const shownGrantCount = computed(() => rows.value.reduce((n, r) => n + r.grants.length, 0));

/** While these are outstanding the listing still shows ids, not paths. */
const unresolvedPaths = computed(
  () => allRows.value.filter((r) => !resolvedPaths.value[r.key]).length,
);

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
/** A row whose grantable privileges could not be read, so its edit did not open. */
const editError = ref<{ label: string; message: string } | null>(null);
const editing = ref<{ key: string; ref: GrantResourceRef; label: string } | null>(null);

const editPrincipal = computed<GrantPrincipalRow>(() => ({
  key: `${props.principalType}:${props.principalId}`,
  id: props.principalId,
  kind: props.principalType,
  name: props.principalName || props.principalId,
}));

/** What this principal holds on the resource being edited, from the listing. */
function heldForEdit(): string[] {
  const row = allRows.value.find((r) => r.key === editing.value?.key);
  const known = new Set(editPrivileges.value.map((p) => p.privilege.name));
  // Stale privileges have no checkbox, so they are not part of this diff.
  return (row?.grants ?? []).map((g) => g.privilege).filter((n) => known.has(n));
}

/**
 * The vocabulary is per resource and carries the caller's `allowed` flags, so it
 * is fetched when a row is opened rather than for every row in the listing.
 */
async function openEdit(group: { key: string; ref: GrantResourceRef | null; label: string }) {
  if (!group.ref) return;
  preparing.value = group.key;
  saveError.value = null;
  editError.value = null;
  try {
    editPrivileges.value = await grantsApi.grantablePrivileges(group.ref);
    editing.value = { key: group.key, ref: group.ref, label: group.label };
    editOpen.value = true;
  } catch (e: any) {
    editError.value = {
      label: group.label,
      message: grantErrorMessage(e, 'Failed to read grantable privileges'),
    };
  } finally {
    preparing.value = null;
  }
}

function grantEntry(privilege: string): GrantEntry {
  return { principal: toPrincipal(props.principalType, props.principalId), privilege };
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
    principal: toPrincipal(payload.principal.kind, payload.principal.id),
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
    saveError.value = grantErrorMessage(e, 'Failed to apply grants');
  } finally {
    saving.value = false;
  }
}

// ---- revoking --------------------------------------------------------------

const confirmOpen = ref(false);
const pendingRow = ref<GrantRow | null>(null);
const confirmText = ref('');
/** The row key being revoked, `'all'` for the bulk run, null when idle. */
const revoking = ref<string | null>(null);
const revokeDone = ref(0);
const revokeTotal = ref(0);
const revokeErrors = ref<{ label: string; message: string }[]>([]);

const revokeProgress = computed(() =>
  revokeTotal.value ? (revokeDone.value / revokeTotal.value) * 100 : 0,
);

/**
 * What has to be typed out before a bulk revoke arms: the principal being
 * emptied, which is the one thing a reader who opened this from the wrong row
 * would not have in front of them.
 */
const revokeConfirmPhrase = computed(() => props.principalName || props.principalId);

/** A row revoke arms immediately; only the bulk one asks for the name. */
const confirmArmed = computed(
  () =>
    !!pendingRow.value ||
    confirmText.value.trim().toLowerCase() === revokeConfirmPhrase.value.trim().toLowerCase(),
);

function askRevokeRow(row: GrantRow) {
  pendingRow.value = row;
  confirmText.value = '';
  revokeErrors.value = [];
  confirmOpen.value = true;
}

function askRevokeAll() {
  pendingRow.value = null;
  confirmText.value = '';
  revokeErrors.value = [];
  confirmOpen.value = true;
}

/**
 * Everything held here, in one atomic apply per resource.
 *
 * Unrecognized privileges go in too: they are still held, and a listing that
 * offers "revoke everything" and then leaves one behind is worse than a request
 * the authorizer refuses — which is reported per resource either way.
 */
async function revokeRow(row: GrantRow): Promise<void> {
  if (!row.ref) throw new Error('This resource cannot be addressed for a revoke.');
  const deletes = [...new Set(row.grants.map((g) => g.privilege))].map(grantEntry);
  await grantsApi.applyGrants(row.ref, { deletes });
}

/**
 * A few at a time rather than all at once: a principal with a grant per
 * namespace is hundreds of resources, and each revoke is its own request
 * because the endpoint is per resource. Firing them together buries the
 * catalog and gets the browser's connection limit to serialise them anyway.
 */
const REVOKE_CONCURRENCY = 6;

async function runRevoke() {
  if (!confirmArmed.value) return;
  const targets = pendingRow.value ? [pendingRow.value] : [...rows.value];
  if (!targets.length) {
    confirmOpen.value = false;
    return;
  }

  revoking.value = pendingRow.value ? pendingRow.value.key : 'all';
  revokeDone.value = 0;
  revokeTotal.value = targets.length;
  revokeErrors.value = [];

  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const row = targets[next++];
      try {
        await revokeRow(row);
      } catch (e: any) {
        revokeErrors.value = [
          ...revokeErrors.value,
          { label: row.label, message: grantErrorMessage(e, 'Revoke failed') },
        ];
      } finally {
        revokeDone.value++;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(REVOKE_CONCURRENCY, targets.length) }, worker));
  } finally {
    revoking.value = null;
    confirmOpen.value = false;
    pendingRow.value = null;
    confirmText.value = '';
    await load();
  }
}

// ---- loading ---------------------------------------------------------------

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
  // The rights answer first: a definite no is shown in place without asking
  // the listing for a 403 it is already known to give.
  if (!access.answered.value) return;
  loadError.value = null;
  listRefused.value = false;
  editError.value = null;
  notImplemented.value = false;
  backendUnavailable.value = false;
  grants.value = [];
  if (!access.canList(props.principalType, props.principalId)) {
    listRefused.value = true;
    loading.value = false;
    return;
  }
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
    else if (isForbiddenError(e)) listRefused.value = true;
    // Should not happen — a principal is always supplied — but the endpoint has
    // a dedicated error for it, so name it rather than showing a bare 400.
    else if (isMissingGrantPrincipal(e)) {
      loadError.value = 'This listing needs a user or role to report on.';
    } else loadError.value = grantErrorMessage(e, 'Failed to load grants');
  } finally {
    loading.value = false;
  }
}

// Another principal: what failed for the previous one does not apply.
watch(
  () => [props.principalId, props.principalType, props.projectId, access.answered.value],
  () => {
    revokeErrors.value = [];
    load();
  },
);
onMounted(load);

defineExpose({ reload: load });
</script>
