<template>
  <v-data-table
    fixed-header
    hover
    :headers="headers"
    :items="principalRows"
    :loading="loading"
    :sort-by="[{ key: 'name', order: 'asc' }]">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchQuery"
          label="Filter assignments"
          prepend-inner-icon="mdi-filter"
          placeholder="Type to filter assignments"
          variant="underlined"
          hide-details
          clearable
          class="mr-4"
          style="max-width: 300px"></v-text-field>
        <v-btn
          color="primary"
          variant="outlined"
          size="small"
          slim
          class="me-5"
          text="grant"
          @click="openGrant"></v-btn>
      </v-toolbar>
    </template>

    <template #item.name="{ item }">
      <span style="display: flex; align-items: center">
        <v-icon class="mr-2">
          {{
            item.kind === 'user' ? 'mdi-account-circle-outline' : 'mdi-account-box-multiple-outline'
          }}
        </v-icon>
        {{ item.name }}
      </span>
    </template>

    <template #item.access="{ item }">
      <v-chip
        v-for="rel in item.relations"
        :key="rel"
        class="mr-1"
        size="small"
        :color="relColor(rel)"
        variant="tonal"
        :prepend-icon="relIcon(rel)"
        closable
        @click:close="removeRelation(item, rel)">
        {{ relLabel(rel) }}
      </v-chip>
    </template>

    <template #item.actions="{ item }">
      <v-btn
        color="error"
        size="small"
        text="Revoke all"
        variant="outlined"
        :disabled="saving"
        @click="requestRevokeAll(item)"></v-btn>
    </template>

    <template #no-data>
      <span class="text-disabled">No permissions assigned.</span>
    </template>
  </v-data-table>

  <!-- Revoke-all confirmation -->
  <v-dialog v-model="confirmRevokeOpen" max-width="460">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="error">mdi-account-remove-outline</v-icon>
        Revoke all access
      </v-card-title>
      <v-card-text>
        Revoke
        <strong>all access</strong>
        for
        <strong>{{ pendingRevoke?.name }}</strong>
        on this tag?
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text="Cancel" @click="confirmRevokeOpen = false"></v-btn>
        <v-btn color="error" variant="flat" text="Revoke all" @click="doRevokeAll"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Grant access dialog (mirrors PermissionAssignDialog) -->
  <v-dialog v-model="grantDialog" max-width="720">
    <v-card title="Grant access">
      <v-card-text>
        <v-tabs
          v-model="searchForType"
          color="primary"
          class="mb-4"
          @update:model-value="clearSelected">
          <v-tab value="user">
            <v-icon start>mdi-account-circle-outline</v-icon>
            Users
          </v-tab>
          <v-tab value="role">
            <v-icon start>mdi-account-box-multiple-outline</v-icon>
            Roles
          </v-tab>
        </v-tabs>

        <v-autocomplete
          v-model="searchFor"
          clear-on-select
          density="comfortable"
          item-title="name"
          item-value="id"
          :items="items"
          variant="solo"
          :loading="searching"
          :label="`Search for a ${searchForType}`"
          @update:focused="items = []"
          @update:search="onSearch"
          @update:model-value="onSelect">
          <template #item="{ props: ip, item }">
            <v-list-item
              v-bind="ip"
              :prepend-icon="searchForType === 'user' ? 'mdi-account' : 'mdi-account-group'"
              :subtitle="item.raw.subtitle"
              :title="item.raw.name"></v-list-item>
          </template>
        </v-autocomplete>

        <template v-if="selectedItem.id">
          <v-card-title class="px-0">{{ selectedItem.name }}</v-card-title>
          <v-card-subtitle class="px-0">
            ID: {{ selectedItem.id }}
            <v-btn
              icon="mdi-content-copy"
              size="small"
              variant="flat"
              @click="functions.copyToClipboard(selectedItem.id)"></v-btn>
          </v-card-subtitle>
          <v-row no-gutters class="mt-2">
            <v-col v-for="rel in relationItems" :key="rel.value" cols="6">
              <v-checkbox
                v-model="selectedRelations"
                :label="rel.title"
                :value="rel.value"
                hide-details></v-checkbox>
            </v-col>
          </v-row>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="success" :disabled="!grantDirty || saving" @click="saveGrant">save</v-btn>
        <v-btn color="error" text="Cancel" @click="grantDialog = false"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { Header } from '../common/interfaces';
import { TagAssignment, TagRelation } from '../gen/management/types.gen';

const props = defineProps<{ tagDefinitionId: string }>();

const functions = useFunctions();

const loading = ref(false);
const saving = ref(false);
const assignments = ref<TagAssignment[]>([]);
const nameCache = ref<Record<string, string>>({});
const searchQuery = ref('');

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Access', key: 'access', align: 'start', sortable: false },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

const relationItems = [
  { title: 'Owner', value: 'ownership' },
  { title: 'Can apply', value: 'apply' },
];
function relLabel(rel: TagRelation): string {
  return rel === 'ownership' ? 'Owner' : 'Can apply';
}
function relColor(rel: TagRelation): string {
  return rel === 'ownership' ? 'warning' : 'info';
}
function relIcon(rel: TagRelation): string {
  return rel === 'ownership' ? 'mdi-crown-outline' : 'mdi-tag-plus-outline';
}

function principalId(a: TagAssignment): string {
  return 'user' in a ? a.user : a.role;
}
function principalKind(a: TagAssignment): 'user' | 'role' {
  return 'user' in a ? 'user' : 'role';
}

interface PrincipalRow {
  id: string;
  kind: 'user' | 'role';
  name: string;
  relations: TagRelation[];
  assignments: TagAssignment[];
}

const principalRows = computed<PrincipalRow[]>(() => {
  const byId = new Map<string, PrincipalRow>();
  for (const a of assignments.value) {
    const id = principalId(a);
    let row = byId.get(id);
    if (!row) {
      row = {
        id,
        kind: principalKind(a),
        name: nameCache.value[id] ?? id,
        relations: [],
        assignments: [],
      };
      byId.set(id, row);
    }
    row.relations.push(a.type);
    row.assignments.push(a);
  }
  const q = searchQuery.value.trim().toLowerCase();
  return [...byId.values()].filter((r) => !q || r.name.toLowerCase().includes(q));
});

async function resolveNames() {
  const ids = new Set<string>();
  for (const a of assignments.value) ids.add(principalId(a));
  await Promise.all(
    [...ids]
      .filter((id) => !(id in nameCache.value))
      .map(async (id) => {
        const a = assignments.value.find((x) => principalId(x) === id)!;
        try {
          if (principalKind(a) === 'user') {
            const u = await functions.getUser(id, false);
            nameCache.value[id] = u.name || u.email || id;
          } else {
            const r = await functions.getRole(id, false);
            nameCache.value[id] = r.name || id;
          }
        } catch {
          nameCache.value[id] = id;
        }
      }),
  );
}

async function load() {
  if (!props.tagDefinitionId) return;
  loading.value = true;
  try {
    const res = await functions.getTagAssignmentsById(props.tagDefinitionId);
    assignments.value = res.assignments ?? [];
    await resolveNames();
  } catch {
    // handled by functions.handleError
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(
  () => props.tagDefinitionId,
  () => {
    assignments.value = [];
    load();
  },
);

// ---- grant dialog (Users/Roles tabs + relation checkboxes, like PermissionAssignDialog) ----
interface SearchItem {
  id: string;
  name: string;
  subtitle?: string;
}
const grantDialog = ref(false);
const searching = ref(false);
const searchForType = ref<'user' | 'role'>('user');
const items = ref<SearchItem[]>([]);
const searchFor = ref('');
const selectedItem = ref<{ id: string; name: string }>({ id: '', name: '' });
const selectedRelations = ref<TagRelation[]>([]);

function openGrant() {
  searchForType.value = 'user';
  clearSelected();
  grantDialog.value = true;
}

function clearSelected() {
  items.value = [];
  searchFor.value = '';
  selectedItem.value = { id: '', name: '' };
  selectedRelations.value = [];
}

let searchToken = 0;
async function onSearch(q: string) {
  const query = (q ?? '').trim();
  if (!query) {
    items.value = [];
    return;
  }
  const token = ++searchToken;
  searching.value = true;
  try {
    if (searchForType.value === 'user') {
      const users = await functions.searchUser(query).catch(() => []);
      if (token !== searchToken) return;
      items.value = users.map((u: any) => ({
        id: u.id,
        name: u.name || u.email || u.id,
        subtitle: u.email || 'User',
      }));
    } else {
      const roles = await functions.searchRole(query).catch(() => []);
      if (token !== searchToken) return;
      items.value = roles.map((r: any) => ({ id: r.id, name: r.name || r.id, subtitle: 'Role' }));
    }
  } finally {
    if (token === searchToken) searching.value = false;
  }
}

// When a principal is selected, pre-seed the checkboxes with its current relations.
function onSelect(id: string | null) {
  const found = items.value.find((i) => i.id === id);
  selectedItem.value = found ? { id: found.id, name: found.name } : { id: '', name: '' };
  selectedRelations.value = id
    ? assignments.value.filter((a) => principalId(a) === id).map((a) => a.type)
    : [];
}

function buildAssignment(kind: 'user' | 'role', id: string, relation: TagRelation): TagAssignment {
  return (
    kind === 'user' ? { user: id, type: relation } : { role: id, type: relation }
  ) as TagAssignment;
}

async function updateAssignments(deletes: TagAssignment[], writes: TagAssignment[]) {
  saving.value = true;
  try {
    const ok = await functions.updateTagAssignmentsById(
      props.tagDefinitionId,
      deletes,
      writes,
      true,
    );
    if (ok) await load();
  } finally {
    saving.value = false;
  }
}

// Current relations the selected principal already has.
const existingRelations = computed<TagRelation[]>(() =>
  selectedItem.value.id
    ? assignments.value.filter((a) => principalId(a) === selectedItem.value.id).map((a) => a.type)
    : [],
);
const grantDirty = computed(() => {
  if (!selectedItem.value.id) return false;
  const cur = new Set(selectedRelations.value);
  const old = new Set(existingRelations.value);
  return cur.size !== old.size || [...cur].some((r) => !old.has(r));
});

async function saveGrant() {
  const id = selectedItem.value.id;
  if (!id) return;
  const kind = searchForType.value;
  const cur = new Set(selectedRelations.value);
  const old = new Set(existingRelations.value);
  const writes = [...cur].filter((r) => !old.has(r)).map((r) => buildAssignment(kind, id, r));
  const deletes = [...old].filter((r) => !cur.has(r)).map((r) => buildAssignment(kind, id, r));
  if (!writes.length && !deletes.length) return;
  await updateAssignments(deletes, writes);
  grantDialog.value = false;
}

async function removeRelation(row: PrincipalRow, rel: TagRelation) {
  const target = row.assignments.find((a) => a.type === rel);
  if (target) await updateAssignments([target], []);
}

const confirmRevokeOpen = ref(false);
const pendingRevoke = ref<PrincipalRow | null>(null);

function requestRevokeAll(row: PrincipalRow) {
  pendingRevoke.value = row;
  confirmRevokeOpen.value = true;
}

async function doRevokeAll() {
  const row = pendingRevoke.value;
  confirmRevokeOpen.value = false;
  if (row) await updateAssignments(row.assignments, []);
}
</script>
