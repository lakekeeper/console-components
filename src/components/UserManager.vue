<template>
  <v-data-table
    height="calc(100vh - 340px)"
    items-per-page="50"
    fixed-header
    density="compact"
    :headers="headers"
    hover
    :items="searchResults"
    :sort-by="[{ key: 'name', order: 'asc' }]"
    :items-per-page-options="[
      { title: '25', value: 25 },
      { title: '50', value: 50 },
    ]"
    :loading="loading"
    @update:options="paginationCheck">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchUsers"
          label="Search users"
          prepend-inner-icon="mdi-magnify"
          placeholder="Type to search users"
          variant="underlined"
          hide-details
          clearable
          @update:model-value="searchUser"></v-text-field>
      </v-toolbar>
    </template>
    <template #item.actions="{ item }">
      <!-- Users have no detail page, so what a user can do is answered from
           their row rather than somewhere else. -->
      <v-btn
        v-if="grantsSupported"
        class="mr-2"
        size="small"
        variant="text"
        prepend-icon="mdi-shield-key-outline"
        text="Grants"
        @click="openGrants(item)"></v-btn>
      <v-btn
        class="mr-2"
        size="small"
        variant="text"
        prepend-icon="mdi-account-group-outline"
        text="Roles"
        @click="openRoles(item)"></v-btn>
      <span v-for="(action, i) in item.actions" :key="i" class="mr-2">
        <user-rename-dialog
          v-if="action == 'rename'"
          :id="item.id"
          :name="item.name"
          :status="renameStatus"
          @rename-user-name="renameUser"></user-rename-dialog>
        <DeleteConfirmDialog
          v-else-if="action === 'delete'"
          type="user"
          :name="item.name"
          :disabled="!canDeleteUsers"
          @confirmed="deleteUser(item)" />
      </span>
    </template>

    <template #item.id="{ item }">
      <td>
        <span style="display: flex; align-items: center">
          {{ item.id }}
          <v-btn
            icon="mdi-content-copy"
            size="small"
            variant="text"
            @click="functions.copyToClipboard(item.id)"></v-btn>
        </span>
      </td>
    </template>

    <template #item.name="{ item }">
      <td>
        <span style="display: flex; align-items: center">
          <v-icon v-if="item['user-type'] === 'application'" class="mr-2">
            mdi-robot-happy-outline
          </v-icon>
          <v-icon v-else class="mr-2">mdi-account-circle-outline</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>

    <template #item.last-updated-with="{ item }">
      <v-chip
        size="small"
        :color="updatedByLabels[item['last-updated-with']]?.color"
        variant="tonal">
        {{ updatedByLabels[item['last-updated-with']]?.text ?? item['last-updated-with'] }}
      </v-chip>
    </template>

    <template #no-data>
      <v-empty-state icon="mdi-account-off-outline" title="No users found"></v-empty-state>
    </template>
  </v-data-table>

  <!-- Wide enough for the privilege chips to lay out instead of wrapping into a
       cramped column, and tall enough to use the viewport it is given. -->
  <v-dialog v-model="grantsOpen" max-width="1100" scrollable>
    <v-card style="display: flex; flex-direction: column; max-height: 90vh">
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3 flex-grow-0">
        <v-icon>mdi-shield-key-outline</v-icon>
        Grants
        <span class="font-weight-medium">— {{ grantsUser?.name }}</span>
        <v-spacer></v-spacer>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text style="flex: 1 1 auto; min-height: 0; overflow-y: auto">
        <PrincipalGrantsPanel
          v-if="grantsOpen && grantsUser"
          :key="grantsUser.id"
          :principal-id="grantsUser.id"
          principal-type="user"
          :principal-name="grantsUser.name"
          allow-edit
          allow-open />
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions class="flex-grow-0">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="grantsOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <!-- Which roles a user holds is asked from their row for the same reason
       grants are: users have no detail page of their own. -->
  <!-- Sized like the Grants dialog beside it: a role id is 36 monospace
       characters, so the three columns need the width, and a long role list
       should use the viewport rather than growing the dialog off-screen. -->
  <v-dialog v-model="rolesOpen" max-width="1100" scrollable>
    <v-card style="display: flex; flex-direction: column; max-height: 90vh">
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3 flex-grow-0">
        <v-icon>mdi-account-group-outline</v-icon>
        Roles
        <span class="font-weight-medium">— {{ rolesUser?.name }}</span>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text style="flex: 1 1 auto; min-height: 0; overflow-y: auto">
        <!-- Direct assignment is what can be changed on the role; the closure is
             what the user's access actually comes from. -->
        <div
          v-if="rolesTransitiveSupported !== false"
          class="d-flex align-center flex-wrap ga-3 mb-4">
          <v-btn-toggle v-model="rolesScope" mandatory density="compact" variant="outlined">
            <v-btn value="direct" size="small">Direct</v-btn>
            <v-btn
              value="transitive"
              size="small"
              prepend-icon="mdi-file-tree-outline"
              :disabled="rolesTransitiveSupported === null">
              Incl. nested
            </v-btn>
          </v-btn-toggle>
          <span v-if="rolesTransitiveSupported === null" class="text-caption text-medium-emphasis">
            {{ TRANSITIVE_UNSUPPORTED }}
          </span>
        </div>

        <div v-if="rolesLoading" class="d-flex align-center ga-2 py-4">
          <v-progress-circular indeterminate size="18" width="2"></v-progress-circular>
          <span class="text-caption text-medium-emphasis">Reading roles…</span>
        </div>
        <!-- Same table as the role page's Member of tab: the id is part of the
             answer, and a row is clickable through to that role. -->
        <v-data-table
          v-else
          :headers="roleHeaders"
          :items="userRoles"
          :items-per-page="25"
          density="compact"
          item-value="id">
          <template #item.name="{ item }">
            <a
              class="text-primary"
              style="cursor: pointer; text-decoration: none"
              @click="jumpToRole(item.id)">
              <v-icon size="small" class="mr-2">mdi-account-group</v-icon>
              {{ item.name || item.ident || item.id }}
            </a>
          </template>
          <template #item.id="{ item }">
            <span class="d-flex align-center">
              <span class="font-monospace text-caption">{{ item.id }}</span>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                :title="`Copy role id ${item.id}`"
                @click.stop="functions.copyToClipboard(item.id)"></v-btn>
            </span>
          </template>
          <template #item.via="{ item }">
            <v-chip
              v-if="rolesScope === 'transitive' && !directRoleIds.has(item.id)"
              size="x-small"
              variant="tonal">
              nested
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">direct</span>
          </template>
          <template #no-data>
            <div class="text-medium-emphasis py-4">
              {{
                rolesScope === 'transitive'
                  ? 'This user holds no role, directly or through a nested one.'
                  : 'This user is not assigned to any role.'
              }}
            </div>
          </template>
        </v-data-table>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions class="flex-grow-0">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="rolesOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { User } from '../gen/management/types.gen';
import { reactive, ref, onMounted, watch, inject } from 'vue';
import { Header } from '../common/interfaces';
import { isNotImplementedError } from '../common/errorUtils';
import { useRoleNavigation } from '../composables/useRoleNavigation';
import {
  TRANSITIVE_UNSUPPORTED,
  markTransitiveMembershipSupported,
  markTransitiveMembershipUnsupported,
  useTransitiveMembershipSupported,
} from '../common/transitiveMembership';
import { StatusIntent } from '../common/enums';
import { useServerPermissions } from '../composables/useCatalogPermissions';
import DeleteConfirmDialog from './DeleteConfirmDialog.vue';
import PrincipalGrantsPanel from './PrincipalGrantsPanel.vue';
import { useGrantPrincipalListingSupported } from '../composables/useGrants';
import UserRenameDialog from './UserRenameDialog.vue';

const functions = inject<any>('functions')!;

// Hidden where the authorizer manages no grants at all.
// Principal-scoped: this asks what one principal holds everywhere, which not
// every authorizer indexes for. OpenFGA cannot, so the surface is not offered
// there rather than offered and then explaining itself.
const grantsSupported = useGrantPrincipalListingSupported();
const grantsOpen = ref(false);
const grantsUser = ref<{ id: string; name: string } | null>(null);

function openGrants(item: { id: string; name: string }) {
  grantsUser.value = { id: item.id, name: item.name };
  grantsOpen.value = true;
}

const { openRole } = useRoleNavigation();

function jumpToRole(roleId: string) {
  rolesOpen.value = false;
  openRole(roleId);
}

const rolesOpen = ref(false);
const rolesUser = ref<{ id: string; name: string } | null>(null);
const rolesScope = ref<'direct' | 'transitive'>('direct');
// Only an explicit 501 withdraws the transitive offer: it needs catalog-managed
// assignments, which an authorizer that owns them cannot provide. Shared, so the
// answer is learned once per session rather than per user opened.
const rolesTransitiveSupported = useTransitiveMembershipSupported();
const rolesLoading = ref(false);
const userRoles = ref<Array<{ id: string; name?: string; ident?: string }>>([]);
const directRoleIds = ref<Set<string>>(new Set());

const roleHeaders = [
  { title: 'Role', key: 'name', sortable: false },
  { title: 'Role ID', key: 'id', sortable: false },
  { title: 'Via', key: 'via', sortable: false, align: 'end' as const, width: 90 },
];

function openRoles(item: { id: string; name: string }) {
  rolesUser.value = { id: item.id, name: item.name };
  rolesScope.value = 'direct';
  userRoles.value = [];
  directRoleIds.value = new Set();
  rolesOpen.value = true;
  loadUserRoles();
}

async function loadUserRoles() {
  const user = rolesUser.value;
  if (!user) return;
  rolesLoading.value = true;
  try {
    if (rolesScope.value === 'transitive') {
      // The direct listing comes too, so the closure can mark what is only
      // reached through another role.
      const [transitive, direct] = await Promise.all([
        functions.listUserTransitiveRoles(user.id),
        functions.listUserRoles(user.id),
      ]);
      markTransitiveMembershipSupported();
      directRoleIds.value = new Set(((direct as any)?.roles ?? []).map((r: any) => r.id));
      userRoles.value = ((transitive as any)?.roles ?? []) as any[];
    } else {
      const res: any = await functions.listUserRoles(user.id);
      userRoles.value = (res?.roles ?? []) as any[];
      directRoleIds.value = new Set(userRoles.value.map((r) => r.id));
    }
  } catch (e) {
    if (rolesScope.value === 'transitive' && isNotImplementedError(e)) {
      markTransitiveMembershipUnsupported();
      rolesScope.value = 'direct';
      return;
    }
    /* otherwise surfaced by the functions plugin */
  } finally {
    rolesLoading.value = false;
  }
}

watch(rolesScope, () => {
  if (rolesOpen.value) loadUserRoles();
});

// Get server ID and permissions
const serverId = ref('');
const { canDeleteUsers, canListUsers } = useServerPermissions(serverId);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Email', key: 'email', align: 'start' },
  { title: 'Updated By', key: 'last-updated-with', align: 'start' },
  { title: 'Id', key: 'id', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

const updatedByLabels: Record<string, { text: string; color: string }> = {
  'create-endpoint': { text: 'Created', color: 'info' },
  'config-call-creation': { text: 'Config', color: 'warning' },
  'update-endpoint': { text: 'Updated', color: 'success' },
  'role-provider': { text: 'Role Provider', color: 'secondary' },
};

const emit = defineEmits<{
  (e: 'deletedUser', user: User): void;
}>();

// Internal state for pagination
const loadedUsers: (User & { actions: string[] })[] = reactive([]);
const searchResults: (User & { actions: string[] })[] = reactive([]);
const paginationTokenUser = ref('');
const loading = ref(false);
const searchUsers = ref('');
const renameStatus = ref(StatusIntent.INACTIVE);

async function loadUsers() {
  if (!canListUsers.value) return;

  try {
    loading.value = true;
    loadedUsers.splice(0, loadedUsers.length);

    // Load more than the default display amount to always stay ahead
    const data = await functions.listUser(undefined, 100);

    // Directly assign the users array instead of using Object.assign
    const initialUsers = (data.users || []) as (User & { actions: string[] })[];
    loadedUsers.push(...initialUsers);

    if (data['next-page-token']) {
      paginationTokenUser.value = data['next-page-token'];
    } else {
      paginationTokenUser.value = '';
    }

    loadedUsers.forEach((user) => {
      user.actions = [];
      if (user['user-type'] === 'application') {
        user.actions.push('rename');
      }
      user.actions.push('delete');
    });
  } catch (error) {
    console.error('Error in loadUsers:', error);
  } finally {
    loading.value = false;
  }
}

async function searchUser(search: string) {
  try {
    searchResults.splice(0, searchResults.length);
    if (search === '') {
      // If search is empty, show the loaded users
      searchResults.push(...loadedUsers);
      return;
    }

    loading.value = true;
    const userSearchOutput = await functions.searchUser(search);

    // Add actions to search results
    const searchUsersWithActions = userSearchOutput.map((user: User) => ({
      ...user,
      actions: user['user-type'] === 'application' ? ['rename', 'delete'] : ['delete'],
    })) as (User & { actions: string[] })[];

    searchResults.push(...searchUsersWithActions);
  } catch (error) {
    console.error('Error searching users:', error);
  } finally {
    loading.value = false;
  }
}

async function paginationCheck(option: any) {
  // If there's a search query, don't do pagination - search handles its own results
  if (searchUsers.value !== '') {
    return;
  }

  if (loadedUsers.length >= 10000) return;

  // Always stay ahead by loading more data when we're getting close to the end
  // Load more when we need more items than currently loaded, ensuring we always have a buffer
  const itemsNeeded = option.page * option.itemsPerPage;
  const bufferSize = Math.max(option.itemsPerPage, 50); // Always maintain at least 50 item buffer
  const shouldLoadMore = itemsNeeded + bufferSize > loadedUsers.length;

  if (shouldLoadMore && paginationTokenUser.value !== '') {
    try {
      const data = await functions.listUser(paginationTokenUser.value, 100);

      // Directly assign the users array and cast to the proper type
      const loadedUsersTmp: (User & { actions: string[] })[] = (data.users || []) as (User & {
        actions: string[];
      })[];
      paginationTokenUser.value = data['next-page-token'] || '';

      loadedUsersTmp.forEach((user) => {
        user.actions = [];
        if (user['user-type'] === 'application') {
          user.actions.push('rename');
        }
        user.actions.push('delete');
      });

      loadedUsers.push(...loadedUsersTmp);

      // If no search is active, also update search results
      if (searchUsers.value === '') {
        searchResults.push(...loadedUsersTmp);
      }
    } catch (error) {
      console.error('Error in pagination:', error);
    }
  } else {
    console.info(
      'Pagination condition not met - shouldLoadMore:',
      shouldLoadMore,
      'hasToken:',
      !!paginationTokenUser.value,
    );
  }
}

async function deleteUser(user: User) {
  try {
    await functions.deleteUser(user.id, true);

    // Remove the deleted user from both loaded users and search results arrays
    const loadedIndex = loadedUsers.findIndex((u) => u.id === user.id);
    if (loadedIndex !== -1) {
      loadedUsers.splice(loadedIndex, 1);
    }

    const searchIndex = searchResults.findIndex((u) => u.id === user.id);
    if (searchIndex !== -1) {
      searchResults.splice(searchIndex, 1);
    }

    emit('deletedUser', user);
  } catch (error) {
    console.error(error);
  }
}

async function renameUser(user: { name: string; id: string }) {
  try {
    renameStatus.value = StatusIntent.STARTING;
    await functions.updateUserById(user.name, user.id, true);
    renameStatus.value = StatusIntent.SUCCESS;

    // Update the user in both loaded users and search results arrays
    const loadedUserIndex = loadedUsers.findIndex((u) => u.id === user.id);
    if (loadedUserIndex !== -1) {
      loadedUsers[loadedUserIndex].name = user.name;
    }

    const searchUserIndex = searchResults.findIndex((u) => u.id === user.id);
    if (searchUserIndex !== -1) {
      searchResults[searchUserIndex].name = user.name;
    }
  } catch (error) {
    console.error(error);
    renameStatus.value = StatusIntent.FAILURE;
  }
}

// Load users when component mounts and server ID is loaded
onMounted(async () => {
  const serverInfo = await functions.getServerInfo();
  serverId.value = serverInfo['server-id'];
});

// Watch for permission changes and load users when we get permission
watch(canListUsers, async (newValue) => {
  if (newValue) {
    await loadUsers();
    // Initialize search results with loaded users
    searchResults.push(...loadedUsers);
  }
});

// Expose loadUsers function for parent component to call if needed
defineExpose({
  loadUsers,
});
</script>
