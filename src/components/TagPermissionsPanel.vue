<template>
  <v-data-table
    fixed-header
    hover
    density="compact"
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
          v-if="canManage"
          :status="assignStatus"
          action-type="grant"
          assignee=""
          :assignments="assignmentCollection"
          :obj="assignableObj"
          :relation="RelationType.Tag"
          @assignments="onAssign" />
      </v-toolbar>
      <v-alert
        v-if="writeError"
        type="error"
        variant="tonal"
        density="compact"
        closable
        class="mx-4 mb-2"
        @click:close="writeError = ''">
        {{ writeError }}
      </v-alert>
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
      <span
        v-if="canManage"
        style="display: flex; align-items: center; gap: 8px; justify-content: flex-end">
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
      <span v-if="readError" class="text-medium-emphasis">{{ readError }}</span>
      <span v-else class="text-disabled">No permissions assigned.</span>
    </template>
  </v-data-table>

  <!-- Revoke-all confirmation -->
  <v-dialog v-model="confirmRevokeOpen" max-width="440">
    <v-card>
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
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
        <v-btn variant="text" text="Cancel" @click="confirmRevokeOpen = false"></v-btn>
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
import { principalRef } from '../common/principal';
import { isForbiddenError } from '../common/errorUtils';
import { tagRefusal } from '../composables/useTagRights';
import { useTagPermissions } from '../composables/useCatalogPermissions';

const props = defineProps<{ tagDefinitionId: string; tagName?: string }>();

const functions = useFunctions();

const loading = ref(false);
const saving = ref(false);
const assignments = ref<TagAssignment[]>([]);
const nameCache = ref<Record<string, string>>({});
const searchQuery = ref('');
const assignStatus = ref(StatusIntent.INACTIVE);
const readError = ref('');
const writeError = ref('');

const REFUSED = 'You are not allowed to see who has access to this tag.';
// The wrapper resolves false rather than throwing, so the cause is not known here.
const WRITE_FAILED = 'Could not change who has access to this tag.';

// Reading and changing this tag's assignments are one right on the server
// (`can_read_assignments` = may grant apply or change ownership), published as
// `read_grants`. Only a definite yes shows the controls.
const tagPerms = useTagPermissions(computed(() => props.tagDefinitionId));
const canManage = computed(() => tagPerms.answered.value && tagPerms.canReadGrants.value === true);

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

// Both properties are optional on the wire now, so a row that names neither is
// schema-valid and has to resolve to something. It is dropped from the table
// rather than rendered as a principal with no id.
function principalId(a: TagAssignment): string {
  return principalRef(a)?.id ?? '';
}
/** Both properties are optional on the wire, so a row can name no principal at
 *  all. Such a row has nothing to group under and nothing to look up — keeping
 *  it would put a nameless entry in the table and send `getUser('')`. */
function namesAPrincipal(a: TagAssignment): boolean {
  return principalRef(a) !== null;
}
function principalKind(a: TagAssignment): 'user' | 'role' {
  return principalRef(a)?.kind ?? 'user';
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
  for (const a of assignments.value.filter(namesAPrincipal)) {
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
  for (const a of assignments.value.filter(namesAPrincipal)) ids.add(principalId(a));
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
  readError.value = '';
  // A definite no is known before asking: say so rather than send a request
  // whose refusal would only arrive as a snackbar from the shared wrapper.
  if (tagPerms.answered.value && !tagPerms.canReadGrants.value) {
    assignments.value = [];
    readError.value = REFUSED;
    return;
  }
  loading.value = true;
  try {
    const res = await functions.getTagAssignmentsById(props.tagDefinitionId);
    assignments.value = res.assignments ?? [];
    await resolveNames();
  } catch (e: any) {
    assignments.value = [];
    readError.value = isForbiddenError(e)
      ? REFUSED
      : tagRefusal(e, 'read who has access to this tag');
  } finally {
    loading.value = false;
  }
}

// Waits for the rights answer, so a refusal is told in place without a request.
onMounted(() => {
  if (tagPerms.answered.value) load();
});
// The action list is replaced on every answer — including the one for a new
// id — so this, not the id, is what starts a load.
watch(
  () => tagPerms.permissions.value,
  () => {
    if (tagPerms.answered.value) load();
  },
);
watch(
  () => props.tagDefinitionId,
  () => {
    assignments.value = [];
    readError.value = '';
    writeError.value = '';
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
  writeError.value = '';
  try {
    // Silent on error (notify=false): the failure is told here, not in a snackbar.
    const ok = await functions.updateTagAssignmentsById(props.tagDefinitionId, del, writes, false);
    if (ok) {
      assignStatus.value = StatusIntent.SUCCESS;
      await load();
    } else {
      assignStatus.value = StatusIntent.FAILURE;
      writeError.value = WRITE_FAILED;
    }
  } catch {
    assignStatus.value = StatusIntent.FAILURE;
    writeError.value = WRITE_FAILED;
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
  writeError.value = '';
  try {
    const ok = await functions.updateTagAssignmentsById(
      props.tagDefinitionId,
      row.assignments,
      [],
      false,
    );
    if (ok) await load();
    else writeError.value = WRITE_FAILED;
  } finally {
    saving.value = false;
  }
}
</script>
