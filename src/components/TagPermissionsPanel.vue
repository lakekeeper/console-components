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
          variant="flat"
          size="small"
          prepend-icon="mdi-account-plus-outline"
          @click="openGrant">
          Grant access
        </v-btn>
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
        @click="revokeAll(item)"></v-btn>
    </template>

    <template #no-data>
      <span class="text-disabled">No permissions assigned.</span>
    </template>
  </v-data-table>

  <!-- Grant access dialog -->
  <v-dialog v-model="grantDialog" max-width="520">
    <v-card title="Grant access">
      <v-card-text>
        <v-autocomplete
          v-model="selectedPrincipal"
          label="User or role"
          placeholder="Type to search"
          :items="principalItems"
          :loading="searching"
          item-title="title"
          item-value="value"
          return-object
          no-filter
          density="compact"
          class="mb-2"
          @update:search="onSearch">
          <template #item="{ props: ip, item }">
            <v-list-item
              v-bind="ip"
              :prepend-icon="item.raw.kind === 'user' ? 'mdi-account' : 'mdi-account-group'"
              :subtitle="item.raw.subtitle"></v-list-item>
          </template>
        </v-autocomplete>
        <v-select
          v-model="selectedRelation"
          label="Access"
          :items="relationItems"
          density="compact"
          hide-details></v-select>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text="Cancel" @click="grantDialog = false"></v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!selectedPrincipal || saving"
          @click="grant">
          Grant
        </v-btn>
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

// ---- grant dialog ----
interface PrincipalItem {
  title: string;
  subtitle?: string;
  kind: 'user' | 'role';
  value: { kind: 'user' | 'role'; id: string };
}
const grantDialog = ref(false);
const principalItems = ref<PrincipalItem[]>([]);
const searching = ref(false);
const selectedPrincipal = ref<PrincipalItem | null>(null);
const selectedRelation = ref<TagRelation>('apply');

function openGrant() {
  selectedPrincipal.value = null;
  principalItems.value = [];
  selectedRelation.value = 'apply';
  grantDialog.value = true;
}

let searchToken = 0;
async function onSearch(q: string) {
  const query = (q ?? '').trim();
  if (!query) {
    principalItems.value = [];
    return;
  }
  const token = ++searchToken;
  searching.value = true;
  try {
    const [users, roles] = await Promise.all([
      functions.searchUser(query).catch(() => []),
      functions.searchRole(query).catch(() => []),
    ]);
    if (token !== searchToken) return;
    principalItems.value = [
      ...users.map((u: any) => ({
        title: u.name || u.email || u.id,
        subtitle: u.email || 'User',
        kind: 'user' as const,
        value: { kind: 'user' as const, id: u.id },
      })),
      ...roles.map((r: any) => ({
        title: r.name || r.id,
        subtitle: 'Role',
        kind: 'role' as const,
        value: { kind: 'role' as const, id: r.id },
      })),
    ];
  } finally {
    if (token === searchToken) searching.value = false;
  }
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

async function grant() {
  const p = selectedPrincipal.value;
  if (!p) return;
  await updateAssignments([], [buildAssignment(p.value.kind, p.value.id, selectedRelation.value)]);
  grantDialog.value = false;
}

async function removeRelation(row: PrincipalRow, rel: TagRelation) {
  const target = row.assignments.find((a) => a.type === rel);
  if (target) await updateAssignments([target], []);
}

async function revokeAll(row: PrincipalRow) {
  await updateAssignments(row.assignments, []);
}
</script>
