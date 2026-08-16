<template>
  <!-- One resource's grants, in the shape the permissions tab uses: a row per
       principal, their privileges as chips, and editing behind a dialog. There
       is no cross-resource transaction, so each save is one atomic apply here. -->
  <div class="d-flex flex-column" style="min-height: 0; height: 100%">
    <div v-if="loading" class="d-flex flex-column align-center pa-8">
      <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
      <span class="mt-4 text-body-2 text-medium-emphasis">Loading grants…</span>
    </div>

    <!-- Reading grants is its own right, so a caller who can see the resource
         may still not be allowed to see who holds what on it. -->
    <div
      v-else-if="forbidden"
      class="pa-8 text-medium-emphasis d-flex align-center ga-2 justify-center">
      <v-icon>mdi-lock-outline</v-icon>
      You don't have permission to read the grants on this
      {{ resourceLabel(resource.type).toLowerCase() }}.
    </div>

    <!-- The authorizer itself is unreachable. Nothing is wrong with the request
         and nothing here is editable until it is back, so this says so rather
         than rendering an empty list that would read as "no one holds
         anything". -->
    <div v-else-if="backendUnavailable" class="pa-4">
      <v-alert type="warning" variant="tonal" density="comfortable">
        <div class="text-body-2 font-weight-medium mb-1">Authorization service unavailable</div>
        <div class="text-body-2">
          The catalog could not reach its authorizer, so grants cannot be read or changed right now.
          This is a server-side outage, not a permissions problem.
        </div>
      </v-alert>
      <v-btn
        class="mt-3"
        size="small"
        variant="outlined"
        prepend-icon="mdi-refresh"
        @click="load()">
        Retry
      </v-btn>
    </div>

    <div v-else-if="loadError" class="pa-4">
      <v-alert type="error" variant="tonal" density="compact">{{ loadError }}</v-alert>
      <v-btn
        class="mt-3"
        size="small"
        variant="outlined"
        prepend-icon="mdi-refresh"
        @click="load()">
        Retry
      </v-btn>
    </div>

    <template v-else>
      <v-data-table
        fixed-header
        hover
        density="compact"
        :headers="headers"
        :items="visibleRows"
        :items-per-page="50"
        :items-per-page-options="[50, 100, 250, -1]"
        :sort-by="[{ key: 'name', order: 'asc' }]"
        style="flex: 1 1 auto; min-height: 0">
        <template #top>
          <v-toolbar color="transparent" density="compact" flat>
            <!-- Same three-way toggle the role owners and members lists use, so
                 narrowing to users or roles works the same way everywhere. -->
            <v-btn-toggle
              v-model="kindFilter"
              mandatory
              density="compact"
              variant="outlined"
              class="ml-4">
              <v-btn value="all" size="small">All</v-btn>
              <v-btn value="user" size="small" prepend-icon="mdi-account">Users</v-btn>
              <v-btn value="role" size="small" prepend-icon="mdi-account-group">Roles</v-btn>
            </v-btn-toggle>
            <!-- Non-inheritance is worth stating — a short list here does not
                 mean few people can reach the resource — but it is one fact, so
                 it rides in the toolbar with the detail behind a tooltip rather
                 than as a banner over every pane. -->
            <span
              v-if="showScopeNote"
              class="text-caption text-medium-emphasis d-inline-flex align-center ga-1 ml-4">
              <v-icon size="14">mdi-information-outline</v-icon>
              Direct grants only
              <v-tooltip activator="parent" location="bottom" max-width="360">
                Grants held directly on this {{ resourceLabel(resource.type).toLowerCase() }}.
                Grants do not inherit — those held on a parent are listed under that parent.
              </v-tooltip>
            </span>
            <v-chip
              v-if="!canEditAnything"
              size="x-small"
              variant="outlined"
              color="warning"
              class="ml-4">
              Read only
            </v-chip>
            <v-spacer></v-spacer>
            <v-text-field
              v-model="filterText"
              label="Filter principals"
              prepend-inner-icon="mdi-filter"
              placeholder="Type to filter"
              variant="underlined"
              density="compact"
              hide-details
              clearable
              class="mr-4"
              style="max-width: 280px"></v-text-field>
            <v-btn
              v-if="canEditAnything"
              size="small"
              variant="outlined"
              prepend-icon="mdi-shield-plus-outline"
              class="mr-2"
              @click="openGrant">
              Grant
            </v-btn>
          </v-toolbar>
        </template>

        <template #item.name="{ item }">
          <div class="d-flex align-center ga-2">
            <v-icon size="18" :color="item.external ? 'warning' : undefined">
              {{
                item.kind === 'user'
                  ? 'mdi-account-circle-outline'
                  : item.external
                    ? 'mdi-badge-account-alert-outline'
                    : 'mdi-account-box-multiple-outline'
              }}
            </v-icon>
            <div style="min-width: 0">
              <div class="d-flex align-center ga-2">
                <span class="text-truncate" :title="item.name">{{ item.name }}</span>
                <v-chip v-if="item.external" size="x-small" variant="outlined" color="warning">
                  External project
                  <v-tooltip activator="parent" location="top" max-width="320">
                    This role belongs to project {{ item.projectId }}, not the one you are viewing.
                    Only server grants accept roles from another project.
                  </v-tooltip>
                </v-chip>
              </div>
              <div
                v-if="item.subtitle"
                class="text-caption text-medium-emphasis text-truncate"
                :title="item.subtitle">
                {{ item.subtitle }}
              </div>
            </div>
          </div>
        </template>

        <template #item.privileges="{ item }">
          <div class="py-1">
            <v-chip
              v-for="p in item.privileges"
              :key="p"
              class="mr-1 mb-1"
              size="x-small"
              variant="tonal">
              {{ displayName(p) }}
            </v-chip>
            <!-- A grant whose privilege has left the vocabulary enforces nothing
                 but is still held, and still revocable. -->
            <v-chip
              v-for="p in item.stale"
              :key="p"
              class="mr-1 mb-1"
              size="x-small"
              variant="outlined"
              color="warning">
              {{ p }}
              <v-tooltip activator="parent" location="top">
                No longer in this authorizer's vocabulary — enforces nothing, but is still held.
              </v-tooltip>
            </v-chip>
          </div>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex align-center ga-2 justify-end">
            <v-btn
              v-if="canEditAnything"
              size="small"
              variant="outlined"
              text="Edit"
              @click="openEdit(item)"></v-btn>
            <v-btn
              v-if="canEditAnything"
              color="error"
              size="small"
              variant="text"
              text="Revoke all"
              :disabled="saving"
              @click="requestRevokeAll(item)"></v-btn>
          </div>
        </template>

        <template #no-data>
          <span class="text-disabled">
            No grants are held on this {{ resourceLabel(resource.type).toLowerCase() }}.
          </span>
        </template>
      </v-data-table>
    </template>

    <GrantAssignDialog
      v-model="assignOpen"
      :privileges="privileges"
      :resource-type="resource.type"
      :resource-name="resourceName"
      :project-id="resourceProjectId"
      :principal="editing"
      :held-for="heldFor"
      :existing-keys="rows.map((r) => r.key)"
      :saving="saving"
      :error="saveError"
      @apply="applyAssignment" />

    <!-- Revoke-all confirmation -->
    <v-dialog v-model="confirmRevokeOpen" max-width="460">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="error">mdi-shield-remove-outline</v-icon>
          Revoke all grants
        </v-card-title>
        <v-card-text class="text-body-2">
          Revoke
          <strong>every privilege</strong>
          held by
          <strong>{{ pendingRevoke?.name }}</strong>
          on this {{ resourceLabel(resource.type).toLowerCase() }}?
          <div
            v-if="lockedFor(pendingRevoke).length"
            class="text-caption text-medium-emphasis mt-2">
            {{ lockedFor(pendingRevoke).join(', ') }} will remain — you may not revoke those here.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="saving" @click="confirmRevokeOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="doRevokeAll">
            Revoke all
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { isForbiddenError } from '../common/errorUtils';
import {
  useGrants,
  isAuthorizationBackendUnavailable,
  principalKey,
  resourceKey,
  resourceLabel,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import type { GrantResourceRef, Header } from '../common/interfaces';
import type { GrantEntry, GrantablePrivilege } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent.
helix.register();

const props = withDefaults(
  defineProps<{
    /** The single resource level this pane reads and writes. */
    resource: GrantResourceRef;
    /** Shown in the assign dialog's title, when the caller knows the name. */
    resourceName?: string;
    /** Suppresses the non-inheritance note where the host already explains it. */
    hideScopeNote?: boolean;
    /** Defers the first load until the pane is actually looked at. */
    active?: boolean;
  }>(),
  { hideScopeNote: false, active: true },
);

const emit = defineEmits<{ (e: 'saved'): void }>();

const functions = useFunctions();
const grants = useGrants();
const visual = useVisualStore();

/**
 * The project this resource sits in. Everything except the server is addressed
 * under a project — `x-project-id` for the project endpoints, and the selected
 * project for the rest — and roles must come from it.
 */
/** The project the console is currently working in. */
const activeProjectId = computed(() => visual.projectSelected['project-id'] || '');

const resourceProjectId = computed(() => {
  if (props.resource.type === 'server') return undefined;
  if (props.resource.type === 'project') {
    return props.resource.projectId || visual.projectSelected['project-id'] || undefined;
  }
  return visual.projectSelected['project-id'] || undefined;
});

const loading = ref(false);
const loaded = ref(false);
const forbidden = ref(false);
const backendUnavailable = ref(false);
const loadError = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);
const filterText = ref('');
const kindFilter = ref<'all' | 'user' | 'role'>('all');

const privileges = ref<GrantablePrivilege[]>([]);

interface Row extends GrantPrincipalRow {
  subtitle: string;
  /** Owning project, for roles — users are not project-scoped. */
  projectId?: string;
  /** Role from a project other than the active one. Server grants allow it. */
  external: boolean;
  /** Held privileges that are still in the vocabulary. */
  privileges: string[];
  /** Held privileges the authorizer no longer recognizes. */
  stale: string[];
}
const rows = ref<Row[]>([]);
const nameCache = new Map<string, { name: string; subtitle: string; projectId?: string }>();

const headers: readonly Header[] = Object.freeze([
  { title: 'Principal', key: 'name', align: 'start' },
  { title: 'Privileges', key: 'privileges', align: 'start', sortable: false },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

const showScopeNote = computed(() => !props.hideScopeNote && props.resource.type !== 'server');
const canEditAnything = computed(() => privileges.value.some((p) => p.allowed));
const grantableNames = computed(
  () => new Set(privileges.value.filter((p) => p.allowed).map((p) => p.privilege.name)),
);

function displayName(name: string): string {
  const p = privileges.value.find((x) => x.privilege.name === name);
  return p?.privilege['display-name'] || name;
}

const visibleRows = computed(() => {
  const q = filterText.value?.toLowerCase().trim();
  return rows.value.filter((r) => {
    if (kindFilter.value !== 'all' && r.kind !== kindFilter.value) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.subtitle.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.privileges.some((p) => p.toLowerCase().includes(q))
    );
  });
});

/** What one principal currently holds, for the dialog to open on. */
function heldFor(key: string): string[] {
  return rows.value.find((r) => r.key === key)?.privileges ?? [];
}

/** Privileges a row holds that this caller may not revoke — they survive a revoke-all. */
function lockedFor(row: Row | null): string[] {
  if (!row) return [];
  return row.privileges.filter((p) => !grantableNames.value.has(p));
}

/**
 * Grants carry an id, not a name, so each distinct principal is resolved once
 * and remembered — a list of twenty should not re-fetch them on every reload.
 */
async function resolveName(
  kind: 'user' | 'role',
  id: string,
): Promise<{ name: string; subtitle: string; projectId?: string }> {
  const key = `${kind}:${id}`;
  const cached = nameCache.get(key);
  if (cached) return cached;

  const out: { name: string; subtitle: string; projectId?: string } = {
    name: id,
    subtitle: kind === 'role' ? 'Role' : '',
  };
  try {
    if (kind === 'user') {
      const u: any = await functions.getUser(id);
      out.name = u?.name || u?.['preferred_username'] || id;
      out.subtitle = u?.email || '';
    } else {
      const r: any = await functions.getRoleMetadata(id);
      out.name = r?.name || id;
      out.projectId = r?.['project-id'] || undefined;
    }
  } catch {
    // A principal that can no longer be read still holds its grants, so the row
    // stays and shows the raw id rather than vanishing from the list.
    out.subtitle = kind === 'role' ? 'Role · unresolved' : 'Unresolved';
  }

  nameCache.set(key, out);
  return out;
}

// ---- load ------------------------------------------------------------------

async function load() {
  loading.value = true;
  loadError.value = null;
  forbidden.value = false;
  backendUnavailable.value = false;
  saveError.value = null;
  try {
    // The vocabulary carries the per-caller `allowed` decision, which is the
    // only signal of grant authority — action introspection does not report it.
    const [privs, listed] = await Promise.all([
      grants.grantablePrivileges(props.resource),
      grants.listGrants(props.resource),
    ]);

    privileges.value = privs;
    const known = new Set(privs.map((p) => p.privilege.name));
    // Chips read in the order the authorizer publishes its vocabulary, which is
    // already grouped by category.
    const order = new Map(privs.map((p, i) => [p.privilege.name, i]));

    const byPrincipal = new Map<string, Row>();
    for (const g of listed) {
      const key = principalKey(g.principal);
      if (!byPrincipal.has(key)) {
        const kind: 'user' | 'role' = key.startsWith('user:') ? 'user' : 'role';
        byPrincipal.set(key, {
          key,
          id: key.slice(key.indexOf(':') + 1),
          kind,
          name: '',
          subtitle: '',
          external: false,
          privileges: [],
          stale: [],
        });
      }
      const row = byPrincipal.get(key)!;
      // `recognized: false` means the authorizer no longer knows the privilege.
      if (g.recognized === false || !known.has(g.privilege)) row.stale.push(g.privilege);
      else row.privileges.push(g.privilege);
    }

    const next = [...byPrincipal.values()];
    await Promise.all(
      next.map(async (row) => {
        const meta = await resolveName(row.kind, row.id);
        row.name = meta.name;
        row.subtitle = meta.subtitle;
        row.projectId = meta.projectId;
        // Server grants accept roles from any project, so one shown here may
        // well not be from the project you are looking at. Say so rather than
        // letting the name imply otherwise.
        row.external =
          row.kind === 'role' &&
          !!meta.projectId &&
          !!activeProjectId.value &&
          meta.projectId !== activeProjectId.value;
        row.privileges.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
        row.stale.sort();
      }),
    );

    rows.value = next.sort((a, b) => a.name.localeCompare(b.name));
    loaded.value = true;
  } catch (e: any) {
    if (isForbiddenError(e)) forbidden.value = true;
    else if (isAuthorizationBackendUnavailable(e)) backendUnavailable.value = true;
    else loadError.value = e?.error?.message || e?.message || 'Failed to load grants';
  } finally {
    loading.value = false;
  }
}

// ---- assign ----------------------------------------------------------------

const assignOpen = ref(false);
const editing = ref<GrantPrincipalRow | null>(null);

function openGrant() {
  editing.value = null;
  saveError.value = null;
  assignOpen.value = true;
}

function openEdit(row: Row) {
  editing.value = { key: row.key, id: row.id, kind: row.kind, name: row.name };
  saveError.value = null;
  assignOpen.value = true;
}

/**
 * Turns a desired privilege set for one principal into the diff the API takes.
 *
 * Only privileges this caller may grant are considered on either side: one they
 * hold but cannot revoke must not appear in `deletes`, or the whole atomic
 * apply is refused.
 */
async function applyAssignment(payload: { principal: GrantPrincipalRow; privileges: string[] }) {
  const { principal, privileges: desired } = payload;
  const before = new Set(heldFor(principal.key));
  const after = new Set(desired);
  const entry = (privilege: string): GrantEntry => ({
    principal: principal.kind === 'user' ? { user: principal.id } : { role: principal.id },
    privilege,
  });

  const writes = [...after].filter((p) => !before.has(p) && grantableNames.value.has(p)).map(entry);
  const deletes = [...before]
    .filter((p) => !after.has(p) && grantableNames.value.has(p))
    .map(entry);

  if (!writes.length && !deletes.length) {
    assignOpen.value = false;
    return;
  }

  saving.value = true;
  saveError.value = null;
  try {
    await grants.applyGrants(props.resource, { writes, deletes });
    assignOpen.value = false;
    // Apply answers 204 with no body — whether an entry was already in the
    // requested state is not reported — so the truth comes from a re-read.
    await load();
    emit('saved');
  } catch (e: any) {
    saveError.value = e?.error?.message || e?.message || 'Failed to apply grants';
  } finally {
    saving.value = false;
  }
}

// ---- revoke all ------------------------------------------------------------

const confirmRevokeOpen = ref(false);
const pendingRevoke = ref<Row | null>(null);

function requestRevokeAll(row: Row) {
  pendingRevoke.value = row;
  confirmRevokeOpen.value = true;
}

async function doRevokeAll() {
  const row = pendingRevoke.value;
  if (!row) return;
  saving.value = true;
  try {
    const principal = row.kind === 'user' ? { user: row.id } : { role: row.id };
    // Stale privileges go too: they enforce nothing, but a "revoke all" that
    // left some behind would be a lie.
    const deletes: GrantEntry[] = [
      ...row.privileges.filter((p) => grantableNames.value.has(p)),
      ...row.stale,
    ].map((privilege) => ({ principal, privilege }));

    if (deletes.length) {
      await grants.applyGrants(props.resource, { deletes });
      await load();
      emit('saved');
    }
    confirmRevokeOpen.value = false;
    pendingRevoke.value = null;
  } catch (e: any) {
    loadError.value = e?.error?.message || e?.message || 'Failed to revoke grants';
    confirmRevokeOpen.value = false;
  } finally {
    saving.value = false;
  }
}

// ---- lifecycle -------------------------------------------------------------

// Panes in the rail mount together but load on first view, so opening the modal
// does not fire a listing for every level of the hierarchy at once.
watch(
  () => props.active,
  (active) => {
    if (active && !loaded.value && !loading.value) load();
  },
);

// Keyed on the identity rather than the object: hosts pass the ref as an inline
// literal, so a deep watch on it would refire on every parent re-render.
watch(
  () => resourceKey(props.resource),
  () => {
    loaded.value = false;
    if (props.active) load();
  },
);

onMounted(() => {
  if (props.active) load();
});

defineExpose({ reload: load });
</script>
