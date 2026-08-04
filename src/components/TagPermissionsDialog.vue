<template>
  <v-dialog v-model="dialogOpen" max-width="620" scrollable>
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card>
      <v-toolbar color="transparent" density="compact" flat class="pl-4">
        <v-icon class="mr-2">mdi-shield-key-outline</v-icon>
        <v-toolbar-title>
          <span class="text-subtitle-1">Permissions — {{ tagName }}</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="dialogOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <v-card-text>
        <div v-for="group in groups" :key="group.relation" class="mb-4">
          <div class="d-flex align-center mb-1">
            <v-icon size="16" class="mr-2" :color="group.color">{{ group.icon }}</v-icon>
            <span class="text-subtitle-2">{{ group.label }}</span>
            <span class="text-caption text-medium-emphasis ml-2">{{ group.hint }}</span>
          </div>
          <v-sheet rounded="lg" border class="pa-2">
            <div v-if="loading" class="d-flex justify-center py-2">
              <v-progress-circular indeterminate size="20" color="primary" />
            </div>
            <template v-else-if="rowsFor(group.relation).length">
              <v-chip
                v-for="row in rowsFor(group.relation)"
                :key="row.key"
                class="mr-1 mb-1"
                size="small"
                variant="tonal"
                :prepend-icon="row.kind === 'user' ? 'mdi-account' : 'mdi-account-group'"
                closable
                @click:close="remove(row)">
                {{ row.label }}
              </v-chip>
            </template>
            <span v-else class="text-caption text-disabled">None</span>
          </v-sheet>
        </div>

        <v-divider class="my-3"></v-divider>
        <div class="text-overline mb-2">Grant access</div>
        <div class="d-flex flex-wrap align-start ga-2">
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
            hide-details
            style="min-width: 240px"
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
            hide-details
            style="min-width: 160px"></v-select>
          <v-btn color="primary" :disabled="!selectedPrincipal || saving" @click="grant">
            Grant
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { TagAssignment, TagRelation } from '../gen/management/types.gen';

const props = defineProps<{ tagDefinitionId: string; tagName: string }>();

const functions = useFunctions();

const dialogOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const assignments = ref<TagAssignment[]>([]);
// principal id -> display label cache
const nameCache = ref<Record<string, string>>({});

const groups = [
  {
    relation: 'ownership' as TagRelation,
    label: 'Owners',
    hint: 'full control — edit, delete, grant',
    icon: 'mdi-crown-outline',
    color: 'warning',
  },
  {
    relation: 'apply' as TagRelation,
    label: 'Can apply',
    hint: 'may attach this tag to objects',
    icon: 'mdi-tag-plus-outline',
    color: 'info',
  },
];

const relationItems = [
  { title: 'Owner', value: 'ownership' },
  { title: 'Can apply', value: 'apply' },
];

function principalId(a: TagAssignment): string {
  return 'user' in a ? a.user : a.role;
}
function principalKind(a: TagAssignment): 'user' | 'role' {
  return 'user' in a ? 'user' : 'role';
}

interface Row {
  key: string;
  kind: 'user' | 'role';
  id: string;
  label: string;
  assignment: TagAssignment;
}

function rowsFor(relation: TagRelation): Row[] {
  return assignments.value
    .filter((a) => a.type === relation)
    .map((a) => {
      const id = principalId(a);
      const kind = principalKind(a);
      return {
        key: `${kind}:${id}:${relation}`,
        kind,
        id,
        label: nameCache.value[id] ?? id,
        assignment: a,
      };
    });
}

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

watch(dialogOpen, (open) => {
  if (open) {
    assignments.value = [];
    load();
  }
});

// ---- grant form ----
interface PrincipalItem {
  title: string;
  subtitle?: string;
  kind: 'user' | 'role';
  value: { kind: 'user' | 'role'; id: string };
}
const principalItems = ref<PrincipalItem[]>([]);
const searching = ref(false);
const selectedPrincipal = ref<PrincipalItem | null>(null);
const selectedRelation = ref<TagRelation>('apply');

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

async function grant() {
  const p = selectedPrincipal.value;
  if (!p) return;
  saving.value = true;
  try {
    const ok = await functions.updateTagAssignmentsById(
      props.tagDefinitionId,
      [],
      [buildAssignment(p.value.kind, p.value.id, selectedRelation.value)],
      true,
    );
    if (ok) {
      selectedPrincipal.value = null;
      principalItems.value = [];
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function remove(row: Row) {
  saving.value = true;
  try {
    const ok = await functions.updateTagAssignmentsById(
      props.tagDefinitionId,
      [row.assignment],
      [],
      true,
    );
    if (ok) await load();
  } finally {
    saving.value = false;
  }
}
</script>
