<template>
  <!-- The lineage, top to bottom, with the entity you came from at the bottom.
       Grants are listed per level and never roll up, so the question this
       answers is "who reaches this from above" — which needs the chain visible,
       not one level at a time behind tabs. Each level loads only when asked:
       walking every ancestor on open would be six listings nobody requested. -->
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-file-tree-outline</v-icon>
          Grant hierarchy
          <span class="font-weight-medium">— {{ entityName }}</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
      </v-toolbar>
      <v-divider></v-divider>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <!-- LEFT: the lineage. Indentation carries the hierarchy, and picking a
             level narrows the table beside it — the chain stays context rather
             than becoming a set of separate tables. -->
        <div
          class="flex-shrink-0"
          style="
            width: 300px;
            overflow-y: auto;
            border-right: 1px solid rgba(var(--v-border-color), 0.16);
          ">
          <div v-if="buildingChain" class="d-flex align-center ga-2 pa-4">
            <v-progress-circular indeterminate size="18" width="2"></v-progress-circular>
            <span class="text-caption text-medium-emphasis">Resolving…</span>
          </div>

          <v-list v-else density="compact" nav>
            <v-list-item
              :active="!levelFilter"
              color="primary"
              prepend-icon="mdi-file-tree-outline"
              @click="levelFilter = ''">
              <v-list-item-title class="text-body-2">All levels</v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ rows.length }} {{ rows.length === 1 ? 'grant' : 'grants' }}
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider class="my-1"></v-divider>

            <v-list-item
              v-for="(level, depth) in chain"
              :key="level.key"
              :active="levelFilter === level.key"
              color="primary"
              @click="levelFilter = level.key">
              <div class="d-flex align-center ga-2" style="min-width: 0">
                <span :style="{ width: depth * 12 + 'px' }" class="flex-shrink-0"></span>
                <v-icon v-if="depth" size="13" class="text-disabled flex-shrink-0">
                  mdi-subdirectory-arrow-right
                </v-icon>
                <v-icon size="18" class="flex-shrink-0">{{ level.icon }}</v-icon>
                <div style="min-width: 0">
                  <div class="text-body-2 text-truncate" :title="level.title">
                    {{ level.title }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ level.subtitle }}
                    <template v-if="level.key === leafKey">· this one</template>
                  </div>
                </div>
                <v-spacer></v-spacer>
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ countFor(level.key) }}
                </span>
              </div>
            </v-list-item>
          </v-list>

          <div v-if="chainError" class="text-caption text-warning px-4 pb-3">{{ chainError }}</div>
        </div>

        <!-- RIGHT: one table, always. The level is a column, so "all levels"
             and a single level are the same view with a different filter. -->
        <div style="flex: 1 1 auto; min-width: 0; overflow-y: auto">
          <div style="padding: 8px 16px 16px">
            <div v-if="loading" class="d-flex flex-column align-center pa-8">
              <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
              <span class="mt-4 text-body-2 text-medium-emphasis">Reading every level…</span>
            </div>

            <template v-else>
              <div class="d-flex align-center flex-wrap ga-3 mb-2">
                <span class="text-caption text-medium-emphasis">
                  <template v-if="levelFilter">
                    Grants held on
                    <strong>{{ selectedLevelTitle }}</strong>
                    — not listed under the levels below, but they still reach them.
                  </template>
                  <template v-else>
                    Every grant that reaches this
                    {{ resourceLabel(resource.type).toLowerCase() }}, and the level it is held on.
                  </template>
                </span>
                <v-spacer></v-spacer>
                <v-btn-toggle v-model="kindFilter" mandatory density="compact" variant="outlined">
                  <v-btn value="all" size="small">All</v-btn>
                  <v-btn value="user" size="small" prepend-icon="mdi-account">Users</v-btn>
                  <v-btn value="role" size="small" prepend-icon="mdi-account-group">Roles</v-btn>
                </v-btn-toggle>
                <v-text-field
                  v-model="filterText"
                  label="Filter"
                  prepend-inner-icon="mdi-filter"
                  variant="underlined"
                  density="compact"
                  hide-details
                  clearable
                  style="max-width: 220px"></v-text-field>
              </div>

              <v-data-table
                density="compact"
                hover
                :headers="headers"
                :items="visibleRows"
                show-expand
                item-value="key"
                :items-per-page="50"
                :items-per-page-options="[50, 100, -1]"
                :sort-by="[{ key: 'principal', order: 'asc' }]">
                <template #item.principal="{ item }">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="18">
                      {{
                        item.kind === 'user'
                          ? 'mdi-account-circle-outline'
                          : 'mdi-account-box-multiple-outline'
                      }}
                    </v-icon>
                    <div style="min-width: 0">
                      <div class="text-truncate" :title="item.principal">{{ item.principal }}</div>
                      <div v-if="item.subtitle" class="text-caption text-medium-emphasis">
                        {{ item.subtitle }}
                      </div>
                    </div>
                  </div>
                </template>

                <template #item.level="{ item }">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16">{{ item.levelIcon }}</v-icon>
                    <div style="min-width: 0">
                      <div class="text-body-2 text-truncate" :title="item.levelTitle">
                        {{ item.levelTitle }}
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        {{ item.levelSubtitle }}
                        <template v-if="item.levelKey === leafKey">· this one</template>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- Counts per category, not the names: a row here can hold two
                     dozen privileges, and the wall of chips pushed every other
                     column off screen. The names are one expand away. -->
                <template #item.privileges="{ item }">
                  <div class="d-flex align-center flex-wrap ga-1">
                    <v-chip
                      v-for="c in item.categories"
                      :key="c"
                      size="x-small"
                      variant="tonal"
                      color="primary">
                      {{ c }} · {{ item.byCategory[c].length }}
                      <v-tooltip activator="parent" location="top" max-width="360">
                        {{ item.byCategory[c].join(', ') }}
                      </v-tooltip>
                    </v-chip>
                    <span v-if="!item.privileges.length" class="text-disabled">–</span>
                    <v-chip
                      v-for="p in item.stale"
                      :key="p"
                      size="x-small"
                      variant="outlined"
                      color="warning">
                      {{ p }}
                      <v-tooltip activator="parent" location="top">
                        No longer in this authorizer's vocabulary — enforces nothing, but is still
                        held.
                      </v-tooltip>
                    </v-chip>
                  </div>
                </template>

                <template #expanded-row="{ columns, item }">
                  <tr>
                    <td :colspan="columns.length" class="py-2">
                      <div
                        v-for="c in item.categories"
                        :key="c"
                        class="d-flex align-start ga-2 mb-1">
                        <span
                          class="text-caption text-medium-emphasis text-uppercase"
                          style="min-width: 110px">
                          {{ c }}
                        </span>
                        <div>
                          <v-chip
                            v-for="p in item.byCategory[c]"
                            :key="p"
                            class="mr-1 mb-1"
                            size="x-small"
                            variant="tonal">
                            {{ p }}
                          </v-chip>
                        </div>
                      </div>
                      <span v-if="!item.privileges.length" class="text-disabled text-caption">
                        Only unrecognized privileges are held here.
                      </span>
                    </td>
                  </tr>
                </template>

                <template #item.granted="{ item }">
                  <span class="text-caption text-medium-emphasis">{{ item.granted || '—' }}</span>
                </template>

                <template #item.actions="{ item }">
                  <!-- Editing where the grant is actually held: this table spans
                       levels, so the row carries which one. -->
                  <div class="d-flex align-center ga-2 justify-end">
                    <v-btn
                      size="small"
                      variant="outlined"
                      text="Edit"
                      :loading="preparing === item.key"
                      @click="openEdit(item)"></v-btn>
                    <v-btn
                      color="error"
                      size="small"
                      variant="text"
                      text="Revoke all"
                      :loading="revoking === item.key"
                      @click="requestRevokeAll(item)"></v-btn>
                  </div>
                </template>

                <template #no-data>
                  <span class="text-disabled">
                    {{
                      levelFilter
                        ? 'Nothing is granted on this level.'
                        : 'Nothing is granted anywhere along this path.'
                    }}
                  </span>
                </template>
              </v-data-table>

              <!-- Revoke-all confirmation. Named per level, because this table
                   spans several and revoking the wrong one is not undoable. -->
              <v-dialog v-model="confirmRevokeOpen" max-width="480">
                <v-card>
                  <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
                    <v-icon color="error">mdi-shield-remove-outline</v-icon>
                    Revoke all grants
                  </v-card-title>
                  <v-card-text class="text-body-2">
                    Revoke
                    <strong>every privilege</strong>
                    held by
                    <strong>{{ pendingRevoke?.principal }}</strong>
                    on
                    <strong>{{ pendingRevoke?.levelTitle }}</strong>
                    ({{ pendingRevoke?.levelSubtitle.toLowerCase() }})?
                    <div v-if="revokeLocked.length" class="text-caption text-medium-emphasis mt-2">
                      {{ revokeLocked.join(', ') }} will remain — you may not revoke those here.
                    </div>
                    <div v-if="revokeError" class="text-caption text-error mt-2">
                      {{ revokeError }}
                    </div>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn variant="text" :disabled="!!revoking" @click="confirmRevokeOpen = false">
                      Cancel
                    </v-btn>
                    <v-btn color="error" variant="flat" :loading="!!revoking" @click="doRevokeAll">
                      Revoke all
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-dialog>

              <GrantAssignDialog
                v-if="editing"
                v-model="editOpen"
                :privileges="editPrivileges"
                :resource-type="editing.resource.type"
                :resource-name="editing.levelTitle"
                :principal="editing.principal"
                :held-for="heldForEdit"
                :project-id="editProjectId"
                :saving="saving"
                :error="saveError"
                @apply="applyEdit" />
            </template>
          </div>
        </div>
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">
          Each level saves on its own — grants are held where they are listed.
        </span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import {
  derivePrivilegeCategory,
  formatGrantedSummary,
  principalKey,
  privilegeCategoryRank,
  resourceIcon,
  resourceKey,
  resourceLabel,
  useGrants,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import type { GrantEntry, GrantablePrivilege } from '../gen/management/types.gen';
import type { Header } from '../common/interfaces';
import type { GrantResourceRef } from '../common/interfaces';
import type { GetNamespaceResponse } from '../gen/iceberg/types.gen';

const props = defineProps<{
  /** The entity the caller opened this from — the deepest level in the rail. */
  resource: GrantResourceRef;
  /** Display name for the toolbar and the leaf rail entry. */
  entityName: string;
  /** Warehouse display name, when the chain passes through one. */
  warehouseName?: string;
  /**
   * Unit-separated namespace path of the entity, used to build the namespace
   * levels. For a namespace this is its own path; for a table or view it is
   * the containing one.
   */
  namespacePath?: string;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();

const functions = useFunctions();
const visual = useVisualStore();
const grants = useGrants();

// Registers the <l-helix> custom element. Idempotent.
helix.register();

const dialogOpen = ref(false);
const leafKey = ref('');
const loading = ref(false);
const filterText = ref('');
const kindFilter = ref<'all' | 'user' | 'role'>('all');
/** Empty shows every level; otherwise the tree narrows the table to one. */
const levelFilter = ref('');

const selectedLevelTitle = computed(
  () => chain.value.find((l) => l.key === levelFilter.value)?.title ?? '',
);

function countFor(levelKey: string): number {
  return rows.value.filter((r) => r.levelKey === levelKey).length;
}

const headers = computed<Header[]>(() => [
  { title: 'Principal', key: 'principal', align: 'start' },
  // Redundant once the tree has narrowed to a single level.
  ...(levelFilter.value ? [] : [{ title: 'Granted on', key: 'level', align: 'start' as const }]),
  { title: 'Privileges', key: 'privileges', align: 'start', sortable: false },
  { title: 'Since', key: 'granted', align: 'start', sortable: false },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

interface Row {
  key: string;
  principal: string;
  principalId: string;
  subtitle: string;
  kind: 'user' | 'role';
  levelKey: string;
  levelTitle: string;
  levelSubtitle: string;
  levelIcon: string;
  depth: number;
  privileges: string[];
  /** Held privileges bucketed by category, for the collapsed summary. */
  byCategory: Record<string, string[]>;
  /** The categories this row actually holds, in display order. */
  categories: string[];
  stale: string[];
  granted: string;
}

/**
 * The category comes off the name, not the authorizer's vocabulary: this table
 * spans levels whose vocabularies are only fetched when a row is edited, and
 * loading six of them just to group chips is not worth the round trips.
 */
function bucketByCategory(privileges: string[]): {
  byCategory: Record<string, string[]>;
  categories: string[];
} {
  const byCategory: Record<string, string[]> = {};
  for (const name of privileges) {
    (byCategory[derivePrivilegeCategory(name)] ??= []).push(name);
  }
  const categories = Object.keys(byCategory).sort(
    (a, b) => privilegeCategoryRank(a) - privilegeCategoryRank(b) || a.localeCompare(b),
  );
  return { byCategory, categories };
}
const rows = ref<Row[]>([]);

const visibleRows = computed(() => {
  const q = filterText.value?.toLowerCase().trim();
  return rows.value.filter((r) => {
    if (levelFilter.value && r.levelKey !== levelFilter.value) return false;
    if (kindFilter.value !== 'all' && r.kind !== kindFilter.value) return false;
    if (!q) return true;
    return (
      r.principal.toLowerCase().includes(q) ||
      r.levelTitle.toLowerCase().includes(q) ||
      r.privileges.some((p) => p.toLowerCase().includes(q))
    );
  });
});

// ---- editing ---------------------------------------------------------------

const editOpen = ref(false);
const preparing = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);
const editPrivileges = ref<GrantablePrivilege[]>([]);
const editing = ref<{
  row: Row;
  resource: GrantResourceRef;
  levelTitle: string;
  principal: GrantPrincipalRow;
} | null>(null);

/** Roles must come from the resource's project; the server itself has none. */
const editProjectId = computed(() =>
  editing.value?.resource.type === 'server'
    ? undefined
    : visual.projectSelected['project-id'] || undefined,
);

function heldForEdit(): string[] {
  const known = new Set(editPrivileges.value.map((p) => p.privilege.name));
  return (editing.value?.row.privileges ?? []).filter((n) => known.has(n));
}

async function openEdit(row: Row) {
  const level = chain.value.find((l) => l.key === row.levelKey);
  if (!level) return;
  preparing.value = row.key;
  saveError.value = null;
  try {
    editPrivileges.value = await grants.grantablePrivileges(level.resource);
    editing.value = {
      row,
      resource: level.resource,
      levelTitle: level.title,
      principal: {
        key: `${row.kind}:${row.principalId}`,
        id: row.principalId,
        kind: row.kind,
        name: row.principal,
      },
    };
    editOpen.value = true;
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to read grantable privileges';
  } finally {
    preparing.value = null;
  }
}

// ---- revoke all ------------------------------------------------------------

const confirmRevokeOpen = ref(false);
const pendingRevoke = ref<Row | null>(null);
const revoking = ref<string | null>(null);
const revokeError = ref<string | null>(null);
/** Held here but not revocable by this caller — they survive the revoke. */
const revokeLocked = ref<string[]>([]);

/**
 * The vocabulary is fetched before asking, so the confirmation can say what
 * will actually be removed rather than promising "everything" and leaving
 * privileges behind.
 */
async function requestRevokeAll(row: Row) {
  const level = chain.value.find((l) => l.key === row.levelKey);
  if (!level) return;
  revoking.value = row.key;
  revokeError.value = null;
  try {
    const privs = await grants.grantablePrivileges(level.resource);
    const grantable = new Set(privs.filter((p) => p.allowed).map((p) => p.privilege.name));
    revokeLocked.value = row.privileges.filter((p) => !grantable.has(p));
    pendingRevoke.value = row;
    confirmRevokeOpen.value = true;
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to read grantable privileges';
  } finally {
    revoking.value = null;
  }
}

async function doRevokeAll() {
  const row = pendingRevoke.value;
  if (!row) return;
  const level = chain.value.find((l) => l.key === row.levelKey);
  if (!level) return;

  revoking.value = row.key;
  revokeError.value = null;
  try {
    const principal = row.kind === 'user' ? { user: row.principalId } : { role: row.principalId };
    const locked = new Set(revokeLocked.value);
    // Stale privileges go too: they enforce nothing, but a "revoke all" that
    // left some behind would be a lie.
    const deletes: GrantEntry[] = [
      ...row.privileges.filter((p) => !locked.has(p)),
      ...row.stale,
    ].map((privilege) => ({ principal, privilege }));

    if (deletes.length) {
      await grants.applyGrants(level.resource, { deletes });
      await loadAllLevels();
      emit('saved');
    }
    confirmRevokeOpen.value = false;
    pendingRevoke.value = null;
  } catch (e: any) {
    revokeError.value = e?.error?.message || e?.message || 'Failed to revoke grants';
  } finally {
    revoking.value = null;
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
  // Only what this caller may change on either side — a revoke they are not
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
    await grants.applyGrants(target.resource, { writes, deletes });
    editOpen.value = false;
    await loadAllLevels();
    emit('saved');
  } catch (e: any) {
    saveError.value = e?.error?.message || e?.message || 'Failed to apply grants';
  } finally {
    saving.value = false;
  }
}

/**
 * Reads every level in the chain and flattens them into one listing.
 *
 * All of them at once, unlike the per-level panels: the question here is where
 * someone's access comes from, which cannot be answered a level at a time.
 * Levels this caller cannot read are skipped rather than failing the table.
 */
async function loadAllLevels() {
  loading.value = true;
  const next: Row[] = [];
  try {
    await Promise.all(
      chain.value.map(async (level, depth) => {
        let listed;
        try {
          listed = await grants.listGrants(level.resource);
        } catch {
          return;
        }
        const byPrincipal = new Map<string, any[]>();
        for (const g of listed) {
          const key = principalKey(g.principal);
          if (!byPrincipal.has(key)) byPrincipal.set(key, []);
          byPrincipal.get(key)!.push(g);
        }
        await Promise.all(
          [...byPrincipal.entries()].map(async ([pk, list]) => {
            const kind: 'user' | 'role' = pk.startsWith('user:') ? 'user' : 'role';
            const id = pk.slice(pk.indexOf(':') + 1);
            const meta = await grants.resolvePrincipalName(kind, id);
            const held = list
              .filter((g) => g.recognized !== false)
              .map((g) => g.privilege)
              .sort();
            next.push({
              key: `${level.key}|${pk}`,
              principal: meta.name,
              principalId: id,
              subtitle: meta.subtitle,
              kind,
              levelKey: level.key,
              levelTitle: level.title,
              levelSubtitle: level.subtitle,
              levelIcon: level.icon,
              depth,
              privileges: held,
              ...bucketByCategory(held),
              stale: list
                .filter((g) => g.recognized === false)
                .map((g) => g.privilege)
                .sort(),
              granted: formatGrantedSummary(list.map((g) => g['created-at'])),
            });
          }),
        );
      }),
    );
    rows.value = next;
  } finally {
    loading.value = false;
  }
}
const buildingChain = ref(false);
const chainError = ref<string | null>(null);

interface Level {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  resource: GrantResourceRef;
}
const chain = ref<Level[]>([]);

function levelFor(resource: GrantResourceRef, title: string, subtitle?: string): Level {
  return {
    key: resourceKey(resource),
    title,
    subtitle: subtitle ?? resourceLabel(resource.type),
    icon: resourceIcon(resource.type),
    resource,
  };
}

/**
 * Builds the rail from the server down to the entity.
 *
 * The namespace levels are the expensive part: a grant is addressed by
 * namespace id, but the console carries a path, so each ancestor prefix is
 * resolved separately. A prefix the caller cannot read is skipped rather than
 * failing the whole rail — its own pane would have shown a lock anyway.
 */
async function buildChain() {
  buildingChain.value = true;
  chainError.value = null;
  const levels: Level[] = [];

  try {
    const leaf = props.resource;

    levels.push(levelFor({ type: 'server' }, 'Server'));
    levels.push(
      levelFor({ type: 'project' }, visual.projectSelected['project-name'] || 'Project', 'Project'),
    );

    const warehouseId = (leaf as any).warehouseId as string | undefined;
    if (warehouseId) {
      levels.push(
        levelFor(
          { type: 'warehouse', warehouseId },
          props.warehouseName || 'Warehouse',
          'Warehouse',
        ),
      );
    }

    if (warehouseId && props.namespacePath) {
      const parts = props.namespacePath.split('\x1F').filter(Boolean);
      // A namespace leaf is the last prefix; anything else sits under the full
      // path, so every prefix is an ancestor.
      const depth = parts.length;
      for (let i = 1; i <= depth; i++) {
        const prefix = parts.slice(0, i);
        const isLeafNamespace = leaf.type === 'namespace' && i === depth;
        try {
          const id = isLeafNamespace
            ? (leaf as any).namespaceId
            : await resolveNamespaceId(warehouseId, prefix.join('\x1F'));
          if (!id) continue;
          levels.push(
            levelFor(
              { type: 'namespace', warehouseId, namespaceId: id },
              prefix.join('.'),
              'Namespace',
            ),
          );
        } catch {
          // Not readable by this caller — leave it out of the rail.
          chainError.value = 'Some namespace levels could not be resolved.';
        }
      }
    }

    // The leaf, unless one of the levels above already is it.
    const key = resourceKey(leaf);
    leafKey.value = key;
    if (!levels.some((l) => l.key === key)) {
      levels.push(levelFor(leaf, props.entityName, resourceLabel(leaf.type)));
    }

    chain.value = levels;
    await loadAllLevels();
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to build the resource hierarchy';
    chain.value = levels;
  } finally {
    buildingChain.value = false;
  }
}

const namespaceIdCache = new Map<string, string>();

async function resolveNamespaceId(warehouseId: string, path: string): Promise<string> {
  const cacheKey = `${warehouseId}|${path}`;
  const cached = namespaceIdCache.get(cacheKey);
  if (cached) return cached;
  const meta = (await functions.loadNamespaceMetadata(
    warehouseId,
    path,
    false,
  )) as GetNamespaceResponse;
  const id = meta.properties?.namespace_id || (meta as any)['namespace-uuid'] || '';
  if (id) namespaceIdCache.set(cacheKey, id);
  return id;
}

watch(dialogOpen, (open) => {
  if (open) {
    rows.value = [];
    levelFilter.value = '';
    buildChain();
  }
});

defineExpose({ open: () => (dialogOpen.value = true) });
</script>
