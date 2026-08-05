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
        <PermissionAssignDialog
          :status="assignStatus"
          action-type="grant"
          assignee=""
          :assignments="assignmentCollection"
          :obj="assignableObj"
          :relation="RelationType.Tag"
          @assignments="onAssign" />
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
        :prepend-icon="relIcon(rel)">
        {{ relLabel(rel) }}
      </v-chip>
    </template>

    <template #item.actions="{ item }">
      <span style="display: flex; align-items: center; gap: 8px; justify-content: flex-end">
        <PermissionAssignDialog
          :status="assignStatus"
          action-type="edit"
          :assignee="item.id"
          :assignments="assignmentCollection"
          :obj="assignableObj"
          :relation="RelationType.Tag"
          @assignments="onAssign" />
        <v-btn
          color="error"
          size="small"
          text="Revoke all"
          variant="outlined"
          :disabled="saving"
          @click="requestRevokeAll(item)"></v-btn>
      </span>
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
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { AssignmentCollection, Header, RelationType } from '../common/interfaces';
import { StatusIntent } from '../common/enums';
import PermissionAssignDialog from './PermissionAssignDialog.vue';
import { TagAssignment, TagRelation } from '../gen/management/types.gen';

const props = defineProps<{ tagDefinitionId: string; tagName?: string }>();

const functions = useFunctions();

const loading = ref(false);
const saving = ref(false);
const assignments = ref<TagAssignment[]>([]);
const nameCache = ref<Record<string, string>>({});
const searchQuery = ref('');
const assignStatus = ref(StatusIntent.INACTIVE);

const assignableObj = computed(() => ({
  id: props.tagDefinitionId,
  name: props.tagName || props.tagDefinitionId,
}));
// The dialog reads/filters plain { user|role, type } objects — TagAssignment matches.
const assignmentCollection = computed(() => assignments.value as unknown as AssignmentCollection);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Access', key: 'access', align: 'start', sortable: false },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

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

// PermissionAssignDialog emits the diff as { del, writes } of { user|role, type } —
// exactly TagAssignment, so we can hand them straight to the tag endpoint.
async function onAssign(payload: { del: AssignmentCollection; writes: AssignmentCollection }) {
  const del = payload.del as unknown as TagAssignment[];
  const writes = payload.writes as unknown as TagAssignment[];
  // Drive the status prop the dialog watches so it closes on success.
  assignStatus.value = StatusIntent.STARTING;
  if (!del.length && !writes.length) {
    assignStatus.value = StatusIntent.SUCCESS;
    return;
  }
  saving.value = true;
  try {
    const ok = await functions.updateTagAssignmentsById(props.tagDefinitionId, del, writes, true);
    if (ok) {
      assignStatus.value = StatusIntent.SUCCESS;
      await load();
    } else {
      assignStatus.value = StatusIntent.FAILURE;
    }
  } catch {
    assignStatus.value = StatusIntent.FAILURE;
  } finally {
    saving.value = false;
  }
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
  if (!row) return;
  saving.value = true;
  try {
    const ok = await functions.updateTagAssignmentsById(
      props.tagDefinitionId,
      row.assignments,
      [],
      true,
    );
    if (ok) await load();
  } finally {
    saving.value = false;
  }
}
</script>
