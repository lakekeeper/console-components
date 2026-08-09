<template>
  <v-card variant="outlined">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" color="primary">mdi-account-multiple</v-icon>
        Members
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ members.length }}</v-chip>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn-toggle
        v-model="memberFilter"
        mandatory
        density="compact"
        variant="outlined"
        class="mr-2">
        <v-btn value="all" size="small">All</v-btn>
        <v-btn value="user" size="small" prepend-icon="mdi-account">Users</v-btn>
        <v-btn value="role" size="small" prepend-icon="mdi-account-group">Roles</v-btn>
      </v-btn-toggle>
      <v-btn
        v-if="canEdit && selected.length"
        color="error"
        variant="tonal"
        size="small"
        prepend-icon="mdi-account-remove"
        class="mr-2"
        @click="requestRemove(selectedItems)">
        Remove ({{ selected.length }})
      </v-btn>
      <v-btn
        v-if="canEdit"
        color="primary"
        variant="elevated"
        size="small"
        prepend-icon="mdi-plus"
        @click="openAdd">
        Add member
      </v-btn>
    </v-toolbar>
    <v-divider></v-divider>
    <v-data-table
      v-model="selected"
      :headers="memberHeaders"
      :items="filteredMembers"
      :loading="loading"
      :show-select="canEdit"
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
          @click="requestRemove([item])"></v-btn>
      </template>
      <template #no-data>
        <div class="text-center pa-4 text-medium-emphasis">No members</div>
      </template>
    </v-data-table>

    <!-- Add member dialog -->
    <v-dialog v-model="addOpen" max-width="1000">
      <v-card>
        <v-card-title>Add member</v-card-title>
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

    <!-- Remove member(s) confirm dialog -->
    <v-dialog v-model="removeConfirm.open" max-width="480">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-medium">
          Remove {{ removeConfirm.items.length }} member{{
            removeConfirm.items.length === 1 ? '' : 's'
          }}?
        </v-card-title>
        <v-card-text class="text-body-2">
          They will lose the permissions inherited from this role.
          <ul class="mt-2 ml-4">
            <li v-for="it in removeConfirm.items" :key="it.id">
              {{ it.name || it.ident || it.id }}
            </li>
          </ul>
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
import type { RoleMember } from '../gen/management/types.gen';
import PrincipalSearch, { type SelectedPrincipal } from './PrincipalSearch.vue';

const props = defineProps<{
  roleId: string;
  canEdit?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const currentProjectId = computed(() => visual.projectSelected['project-id'] || '');

const loading = ref(false);
const members = ref<
  Array<
    RoleMember & { id: string; name?: string; ident?: string; email?: string; projectId?: string }
  >
>([]);

// Selection + type filter + remove-confirm state
const selected = ref<string[]>([]);
const memberFilter = ref<'all' | 'user' | 'role'>('all');
const removing = ref(false);
const removeConfirm = reactive<{ open: boolean; items: any[] }>({ open: false, items: [] });

const filteredMembers = computed(() =>
  memberFilter.value === 'all'
    ? members.value
    : members.value.filter((m) => m.type === memberFilter.value),
);
const selectedItems = computed(() => members.value.filter((m) => selected.value.includes(m.id)));

const memberHeaders = [
  { title: 'Type', key: 'type', sortable: false, width: 90 },
  { title: 'Name', key: 'name', sortable: false },
  { title: 'Identifier', key: 'detail', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 56 },
];

async function load() {
  loading.value = true;
  try {
    const m = await functions.listRoleMembers(props.roleId);
    const list = (m?.members ?? []) as any[];
    // RoleMembership carries no project-id, so resolve it for role members
    // (lets the list flag nested roles from another project).
    await Promise.all(
      list
        .filter((x) => x.type === 'role')
        .map(async (x) => {
          const meta: any = await functions.getRoleMetadata(x.id).catch(() => null);
          x.projectId = meta?.['project-id'];
        }),
    );
    members.value = list as any;
  } catch {
    /* surfaced by the functions plugin */
  } finally {
    loading.value = false;
  }
}

function requestRemove(items: Array<{ id: string; type: 'user' | 'role'; name?: string }>) {
  if (!items.length) return;
  removeConfirm.items = [...items];
  removeConfirm.open = true;
}

async function confirmRemove() {
  removing.value = true;
  try {
    for (const it of removeConfirm.items) {
      await functions.removeRoleMember(props.roleId, it.type, it.id, false);
    }
    selected.value = [];
    await load();
  } catch {
    /* surfaced by the functions plugin */
  } finally {
    removing.value = false;
    removeConfirm.open = false;
  }
}

// --- Add member -------------------------------------------------------------
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
    await functions.addRoleMembers(
      props.roleId,
      [{ id: addSelected.value.id, type: addSelected.value.type }],
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
</script>
