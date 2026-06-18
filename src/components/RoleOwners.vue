<template>
  <v-card variant="outlined">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" color="primary">mdi-shield-account</v-icon>
        Owners
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ owners.length }}</v-chip>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn-toggle
        v-model="ownerFilter"
        mandatory
        density="compact"
        variant="outlined"
        class="mr-2">
        <v-btn value="all" size="small">All</v-btn>
        <v-btn value="user" size="small" prepend-icon="mdi-account">Users</v-btn>
        <v-btn value="role" size="small" prepend-icon="mdi-account-group">Roles</v-btn>
      </v-btn-toggle>
      <v-btn
        v-if="canEdit"
        color="primary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-plus"
        @click="openAdd">
        Add owner
      </v-btn>
    </v-toolbar>
    <v-divider></v-divider>
    <v-data-table
      :headers="ownerHeaders"
      :items="filteredOwners"
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
      <template #item.name="{ item }">
        {{ item.name || item.id }}
        <span
          v-if="item.type === 'role' && item.projectId && item.projectId !== currentProjectId"
          class="text-caption text-grey">
          <v-chip class="ml-1" color="warning" size="x-small" variant="outlined">
            External Project Role
          </v-chip>
          ( Project-ID: {{ item.projectId }}
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="flat"
            @click="functions.copyToClipboard(item.projectId)"></v-btn>
          )
        </span>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="canEdit"
          icon="mdi-close"
          size="x-small"
          variant="text"
          @click="requestRemove(item)"></v-btn>
      </template>
      <template #no-data>
        <div class="text-center pa-4 text-medium-emphasis">No owners</div>
      </template>
    </v-data-table>

    <!-- Add owner dialog -->
    <v-dialog v-model="addOpen" max-width="1000">
      <v-card>
        <v-card-title>Add owner</v-card-title>
        <v-card-text>
          <PrincipalSearch v-model="addSelected" :exclude-role-id="roleId" />
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

    <!-- Remove owner confirm -->
    <v-dialog v-model="removeConfirm.open" max-width="460">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-medium">Remove owner?</v-card-title>
        <v-card-text class="text-body-2">
          {{ removeConfirm.item?.name || removeConfirm.item?.id }} will no longer be able to
          administer this role.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="removeConfirm.open = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="removing" @click="confirmRemove">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import type { RoleAssignment } from '../gen/management/types.gen';
import PrincipalSearch, { type SelectedPrincipal } from './PrincipalSearch.vue';

const props = defineProps<{
  roleId: string;
  canEdit?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const currentProjectId = computed(() => visual.projectSelected['project-id'] || '');

interface OwnerRow {
  id: string;
  type: 'user' | 'role';
  name?: string;
  projectId?: string;
}

const loading = ref(false);
const owners = ref<OwnerRow[]>([]);
const ownerFilter = ref<'all' | 'user' | 'role'>('all');
const filteredOwners = computed(() =>
  ownerFilter.value === 'all'
    ? owners.value
    : owners.value.filter((o) => o.type === ownerFilter.value),
);
const ownerHeaders = [
  { title: 'Type', key: 'type', sortable: false, width: 90 },
  { title: 'Name', key: 'name', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 56 },
];

async function load() {
  loading.value = true;
  try {
    const assignments = (await functions.getRoleAssignmentsById(props.roleId)) as RoleAssignment[];
    const ownerships = (assignments ?? []).filter((a: any) => a.type === 'ownership');
    const rows: OwnerRow[] = [];
    for (const a of ownerships as any[]) {
      if (a.user) {
        const u: any = await functions.getUser(a.user).catch(() => null);
        rows.push({ id: a.user, type: 'user', name: u?.name || u?.['preferred_username'] });
      } else if (a.role) {
        const r: any = await functions.getRoleMetadata(a.role).catch(() => null);
        rows.push({ id: a.role, type: 'role', name: r?.name, projectId: r?.['project-id'] });
      }
    }
    owners.value = rows;
  } catch {
    /* surfaced by the functions plugin */
  } finally {
    loading.value = false;
  }
}

// --- Remove ---------------------------------------------------------------
const removing = ref(false);
const removeConfirm = reactive<{ open: boolean; item: OwnerRow | null }>({
  open: false,
  item: null,
});
function requestRemove(item: OwnerRow) {
  removeConfirm.item = item;
  removeConfirm.open = true;
}
async function confirmRemove() {
  const item = removeConfirm.item;
  if (!item) return;
  removing.value = true;
  try {
    const del: any[] = [
      item.type === 'user'
        ? { user: item.id, type: 'ownership' }
        : { role: item.id, type: 'ownership' },
    ];
    await functions.updateRoleAssignmentsById(props.roleId, del, [], true);
    await load();
  } catch {
    /* surfaced */
  } finally {
    removing.value = false;
    removeConfirm.open = false;
  }
}

// --- Add ------------------------------------------------------------------
const addOpen = ref(false);
const addSelected = ref<SelectedPrincipal | null>(null);
const adding = ref(false);

function openAdd() {
  addSelected.value = null;
  addOpen.value = true;
}

async function confirmAdd() {
  if (!addSelected.value) return;
  adding.value = true;
  try {
    const writes: any[] = [
      addSelected.value.type === 'user'
        ? { user: addSelected.value.id, type: 'ownership' }
        : { role: addSelected.value.id, type: 'ownership' },
    ];
    await functions.updateRoleAssignmentsById(props.roleId, [], writes, true);
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
</script>
