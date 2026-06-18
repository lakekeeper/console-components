<template>
  <v-card-text>
    <!-- Members of this role -->
    <v-card variant="outlined" class="mb-4">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-account-multiple</v-icon>
          Members
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ members.length }}</v-chip>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          v-if="canEdit"
          color="primary"
          variant="tonal"
          size="small"
          prepend-icon="mdi-plus"
          @click="openAdd">
          Add member
        </v-btn>
      </v-toolbar>
      <v-divider></v-divider>
      <v-data-table
        :headers="memberHeaders"
        :items="members"
        :loading="loading"
        density="compact"
        item-value="id">
        <template #item.type="{ item }">
          <v-chip size="x-small" variant="tonal" :color="item.type === 'role' ? 'primary' : 'info'">
            <v-icon start size="x-small">
              {{ item.type === 'role' ? 'mdi-account-group' : 'mdi-account' }}
            </v-icon>
            {{ item.type }}
          </v-chip>
        </template>
        <template #item.name="{ item }">{{ item.name || item.ident || item.id }}</template>
        <template #item.detail="{ item }">
          <span class="text-caption text-medium-emphasis">
            {{ item.type === 'user' ? item.email || item.id : item.ident }}
          </span>
        </template>
        <template #item.actions="{ item }">
          <v-btn
            v-if="canEdit"
            icon="mdi-close"
            size="x-small"
            variant="text"
            :loading="removingId === item.id"
            @click="remove(item)"></v-btn>
        </template>
        <template #no-data>
          <div class="text-center pa-4 text-medium-emphasis">No members</div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Roles this role is a member of -->
    <v-card variant="outlined">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2">mdi-account-arrow-up</v-icon>
          Member of
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ memberOf.length }}</v-chip>
        </v-toolbar-title>
      </v-toolbar>
      <v-divider></v-divider>
      <v-card-text>
        <div v-if="memberOf.length" class="d-flex flex-wrap" style="gap: 6px">
          <v-chip
            v-for="r in memberOf"
            :key="r.id"
            size="small"
            variant="tonal"
            prepend-icon="mdi-account-group">
            {{ r.name || r.ident }}
          </v-chip>
        </div>
        <div v-else class="text-medium-emphasis">This role is not a member of any other role.</div>
      </v-card-text>
    </v-card>

    <!-- Add member dialog -->
    <v-dialog v-model="addOpen" max-width="520">
      <v-card>
        <v-card-title>Add member</v-card-title>
        <v-card-text>
          <v-btn-toggle
            v-model="addType"
            mandatory
            density="compact"
            variant="outlined"
            class="mb-3">
            <v-btn value="user" size="small" prepend-icon="mdi-account">User</v-btn>
            <v-btn value="role" size="small" prepend-icon="mdi-account-group">Role</v-btn>
          </v-btn-toggle>
          <v-autocomplete
            v-model="addSelected"
            :items="addCandidates"
            :loading="searching"
            :search="addSearch"
            item-title="title"
            item-value="id"
            return-object
            label="Search…"
            placeholder="Type to search"
            no-filter
            density="compact"
            variant="outlined"
            hide-details
            @update:search="onSearch"></v-autocomplete>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Cancel" @click="addOpen = false"></v-btn>
          <v-btn
            color="primary"
            variant="flat"
            text="Add"
            :disabled="!addSelected"
            :loading="adding"
            @click="confirmAdd"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card-text>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import type { RoleMember, RoleMembership } from '../gen/management/types.gen';

const props = defineProps<{
  roleId: string;
  canEdit?: boolean;
}>();

const functions = useFunctions();

const loading = ref(false);
const members = ref<
  Array<RoleMember & { id: string; name?: string; ident?: string; email?: string }>
>([]);
const memberOf = ref<RoleMembership[]>([]);
const removingId = ref<string | null>(null);

const memberHeaders = [
  { title: 'Type', key: 'type', sortable: false, width: 90 },
  { title: 'Name', key: 'name', sortable: false },
  { title: 'Identifier', key: 'detail', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 56 },
];

async function load() {
  loading.value = true;
  try {
    const [m, mo] = await Promise.all([
      functions.listRoleMembers(props.roleId),
      functions.listRoleMemberOf(props.roleId).catch(() => ({ roles: [] })),
    ]);
    members.value = (m?.members ?? []) as any;
    memberOf.value = (mo?.roles ?? []) as RoleMembership[];
  } catch {
    /* surfaced by the functions plugin */
  } finally {
    loading.value = false;
  }
}

async function remove(item: { id: string; type: 'user' | 'role' }) {
  removingId.value = item.id;
  try {
    await functions.removeRoleMember(props.roleId, item.type, item.id, true);
    await load();
  } catch {
    /* surfaced */
  } finally {
    removingId.value = null;
  }
}

// --- Add member -------------------------------------------------------------
const addOpen = ref(false);
const addType = ref<'user' | 'role'>('user');
const addSelected = ref<{ id: string; title: string } | null>(null);
const addCandidates = ref<Array<{ id: string; title: string }>>([]);
const addSearch = ref('');
const searching = ref(false);
const adding = ref(false);

function openAdd() {
  addSelected.value = null;
  addCandidates.value = [];
  addSearch.value = '';
  addOpen.value = true;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearch(q: string) {
  addSearch.value = q;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(q), 250);
}
// Treat a query as an identifier (so we also try a direct lookup) when it looks
// like a UUID or carries an idp prefix (e.g. `oidc~…`, `kubernetes~…`).
function looksLikeId(s: string): boolean {
  return /~/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^[A-Za-z0-9_-]{16,}$/.test(s);
}

async function runSearch(q: string) {
  if (!q) {
    addCandidates.value = [];
    return;
  }
  searching.value = true;
  try {
    let candidates: { id: string; title: string }[] = [];
    if (addType.value === 'user') {
      const users = await functions.searchUser(q);
      candidates = (users ?? []).map((u: any) => ({
        id: u.id,
        title: `${u.name || u['preferred_username'] || u.id}${u.email ? ` · ${u.email}` : ''}`,
      }));
    } else {
      const roles = await functions.searchRole(q);
      candidates = (roles ?? [])
        .filter((r: any) => r.id !== props.roleId)
        .map((r: any) => ({ id: r.id, title: r.name || r.ident || r.id }));
    }

    // Also resolve by identifier (mirrors the Permissions dialog "Search by ID")
    // so principals without a searchable name — service principals, OIDC/k8s
    // subjects, or a known role id — are still findable.
    if (looksLikeId(q) && !candidates.some((c) => c.id === q)) {
      try {
        if (addType.value === 'user') {
          const u: any = await functions.getUser(q);
          if (u?.id) {
            candidates.unshift({
              id: u.id,
              title: `${u.name || u['preferred_username'] || u.id}${u.email ? ` · ${u.email}` : ''}`,
            });
          }
        } else {
          const r: any = await functions.getRoleMetadata(q);
          if (r?.id && r.id !== props.roleId) {
            candidates.unshift({ id: r.id, title: r.name || r.id });
          }
        }
      } catch {
        /* not a resolvable id — name results (if any) still stand */
      }
    }
    addCandidates.value = candidates;
  } catch {
    addCandidates.value = [];
  } finally {
    searching.value = false;
  }
}
watch(addType, () => {
  addSelected.value = null;
  addCandidates.value = [];
  addSearch.value = '';
});

async function confirmAdd() {
  if (!addSelected.value) return;
  adding.value = true;
  try {
    await functions.addRoleMembers(
      props.roleId,
      [{ id: addSelected.value.id, type: addType.value }],
      true,
    );
    addOpen.value = false;
    await load();
  } catch {
    /* surfaced */
  } finally {
    adding.value = false;
  }
}

onMounted(load);
watch(() => props.roleId, load);
onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>
