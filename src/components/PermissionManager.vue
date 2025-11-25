<template>
  <v-data-table
    fixed-header
    :headers="headers"
    hover
    :items="filteredAssignments"
    :sort-by="[{ key: 'name', order: 'asc' }]">
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-switch
          v-if="
            props.relationType === RelationType.Warehouse ||
            props.relationType === RelationType.Namespace
          "
          v-model="isManagedAccess"
          class="ml-4 mt-4"
          color="info"
          :label="managedAccess"
          @click="switchManagedAccess"></v-switch>

        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchQuery"
          label="Filter Assignments"
          prepend-inner-icon="mdi-filter"
          placeholder="Type to filter assignments"
          variant="underlined"
          hide-details
          clearable
          class="mr-4"
          style="max-width: 300px"></v-text-field>
        <span v-if="canManageGrants" style="display: flex; align-items: center">
          <PermissionAssignDialog
            :status="assignStatus"
            :action-type="'grant'"
            :assignee="''"
            :assignments="existingAssignments"
            class="mr-2"
            :obj="assignableObj"
            :relation="props.relationType"
            @assignments="assign" />
        </span>
      </v-toolbar>
    </template>
    <template #item.name="{ item }">
      <span style="display: flex; align-items: center">
        <v-icon v-if="item.kind == 'user'" class="mr-2">mdi-account-circle-outline</v-icon>
        <v-icon v-else-if="isRoleFromDifferentProject(item)" class="mr-2" color="warning">
          mdi-badge-account-alert-outline
        </v-icon>
        <v-icon v-else class="mr-2">mdi-account-box-multiple-outline</v-icon>
        {{ item.name }}
        <span v-if="isRoleFromDifferentProject(item)" class="text-caption text-grey ml-2">
          <v-chip
            v-if="isRoleFromDifferentProject(item)"
            class="ml-2"
            color="warning"
            size="x-small"
            variant="outlined">
            External Project Role
          </v-chip>
          ( Project-ID: {{ item['project-id'] }}
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="flat"
            @click="copyToClipboard(item['project-id'] || '')"></v-btn>
          )
        </span>
      </span>
    </template>
    <!--template v-slot:item.kind="{ item }">
      <td>
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2" v-if="item.kind == 'user'"
            >mdi-account-circle-outline</v-icon
          >
          <v-icon class="mr-2" v-else>mdi-account-box-multiple-outline</v-icon>
        </span>
      </td>
    </template-->
    <template #item.type="{ item }">
      <v-chip v-for="(t, i) in item.type" :key="i" class="mr-1" size="small">{{ t }}</v-chip>
    </template>
    <template #item.action="{ item }">
      <span style="display: flex; align-items: center; gap: 8px">
        <PermissionAssignDialog
          v-if="canManageGrants"
          :status="assignStatus"
          :action-type="'edit'"
          :assignee="item.id"
          :assignments="existingAssignments"
          :obj="assignableObj"
          :relation="props.relationType"
          @assignments="assign" />
        <v-btn
          v-if="canManageGrants"
          color="error"
          size="small"
          text="Revoke All"
          variant="outlined"
          @click="openDeleteDialog(item)"></v-btn>
      </span>
    </template>
    <template #no-data>
      <PermissionAssignDialog
        v-if="canManageGrants"
        :status="assignStatus"
        :action-type="'assign'"
        :assignee="''"
        :assignments="existingAssignments"
        :obj="assignableObj"
        :relation="props.relationType"
        @assignments="assign" />
    </template>
  </v-data-table>

  <!-- Revoke All Confirmation Dialog -->
  <v-dialog v-model="deleteDialog" max-width="500">
    <v-card>
      <v-card-title class="text-h5">Revoke All Permissions</v-card-title>
      <v-card-text>
        Are you sure you want to revoke all permissions for
        <strong>{{ itemToDelete?.name }}</strong>
        ?
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" text="Cancel" variant="text" @click="deleteDialog = false"></v-btn>
        <v-btn color="error" text="Revoke All" variant="flat" @click="confirmDelete"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { onMounted, reactive, computed, ref, inject } from 'vue';
import { useRolePermissions } from '../composables/useCatalogPermissions';

import {
  useServerAuthorizerPermissions,
  useWarehouseAuthorizerPermissions,
  useNamespaceAuthorizerPermissions,
  useProjectAuthorizerPermissions,
  useRoleAuthorizerPermissions,
  useViewAuthorizerPermissions,
  useTableAuthorizerPermissions,
} from '../composables/useAuthorizerPermissions';

import { AssignmentCollection, Header, RelationType } from '../common/interfaces';
import { StatusIntent } from '../common/enums';
import { useVisualStore } from '../stores/visual';

const functions = inject<any>('functions')!;
const visualStore = useVisualStore();

const searchQuery = ref('');

// Computed property to filter projects based on search query
const filteredAssignments = computed(() => {
  if (!searchQuery.value || searchQuery.value.trim() === '') {
    return permissionRows;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return permissionRows.filter(
    (permission) =>
      permission['id'].toLowerCase().includes(query) ||
      permission['name'].toLowerCase().includes(query) ||
      permission['email'].toLowerCase().includes(query),
  );
});

const currentProjectId = computed(() => {
  return visualStore.projectSelected['project-id'] || null;
});

/**
 * Check if a role belongs to a different project
 */
function isRoleFromDifferentProject(item: any): boolean {
  if (item.kind !== 'role') return false;
  if (!item['project-id']) return false;
  if (!currentProjectId.value) return false;
  return item['project-id'] !== currentProjectId.value;
}

const isManagedAccess = ref(false);
const isManagedAccessInherited = ref(false);
const deleteDialog = ref(false);
const itemToDelete = ref<any>(null);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Email', key: 'email', align: 'start' },
  { title: 'Roles', key: 'type', align: 'start', sortable: false },
  { title: 'Action', key: 'action', align: 'center', sortable: false },
]);

const permissionRows = reactive<
  {
    id: string;
    name: string;
    email: string;
    type: string[];
    kind: string;
    'project-id'?: string | null;
  }[]
>([]);

// <!--false, true -> "Managed access enabled by parent"
// true, true -> "Managed access enabled"
// false, false -> "Managed access disabled"-->

const managedAccess = computed(() => {
  if (props.relationType === RelationType.Namespace) {
    return isManagedAccess.value && isManagedAccessInherited.value
      ? 'Managed access enabled'
      : !isManagedAccess.value && isManagedAccessInherited.value
        ? 'Managed access enabled by parent'
        : 'Managed access disabled';
  } else if (props.relationType === RelationType.Warehouse) {
    return isManagedAccess.value ? 'Managed access enabled' : 'Managed access disabled';
  } else {
    return 'Managed access not applicable';
  }
});

function copyToClipboard(text: string) {
  functions.copyToClipboard(text);
}
const props = withDefaults(
  defineProps<{
    objectId: string;
    relationType: RelationType;
    warehouseId?: string; // Required for table and view assignments
    status?: StatusIntent;
  }>(),
  {
    status: StatusIntent.INACTIVE,
  },
);

const emit = defineEmits<{
  (e: 'statusUpdate', status: StatusIntent): void;
  (e: 'objectLoaded', obj: { id: string; name: string }): void;
}>();

// Internal state management
const loaded = ref(false);
const assignStatus = ref(StatusIntent.INACTIVE);
const existingAssignments = reactive<any[]>([]);
const assignableObj = reactive<{ id: string; name: string }>({
  id: '',
  name: '',
});

// Permission composables - create them once outside computed
// These will automatically load permissions on mount and when objectId changes
const objectIdRef = computed(() => props.objectId);
const warehouseIdRef = computed(() => props.warehouseId || '');

// Computed property to check if user can manage grants
// This will re-evaluate when permissions load or change
const canManageGrants = computed(() => {
  switch (props.relationType) {
    case RelationType.Server:
      return useServerAuthorizerPermissions(objectIdRef);

    case RelationType.Warehouse:
      return useWarehouseAuthorizerPermissions(objectIdRef);

    case RelationType.Namespace:
      return useNamespaceAuthorizerPermissions(objectIdRef, warehouseIdRef);

    case RelationType.Project:
      return useProjectAuthorizerPermissions(objectIdRef);

    case RelationType.Role:
      return useRoleAuthorizerPermissions(objectIdRef);
    case RelationType.Table:
      return useTableAuthorizerPermissions(objectIdRef, warehouseIdRef);
    case RelationType.View:
      return useViewAuthorizerPermissions(objectIdRef, warehouseIdRef);

    default:
      return false;
  }
});

async function loadObjectData() {
  try {
    let objData: any = null;

    if (props.relationType === RelationType.Server) {
      objData = await functions.getServerInfo();
      assignableObj.id = objData['server-id'];
      assignableObj.name = 'Server';
    } else if (props.relationType === RelationType.Warehouse) {
      objData = await functions.getWarehouse(props.objectId);
      assignableObj.id = objData.id;
      assignableObj.name = objData.name;
    } else if (props.relationType === RelationType.Namespace) {
      // For namespace, we only have the ID, use it directly
      assignableObj.id = props.objectId;
      assignableObj.name = props.objectId; // Namespace display name is the ID
    } else if (props.relationType === RelationType.Table) {
      // For tables, we get basic info from the table list
      assignableObj.id = props.objectId;
      assignableObj.name = props.objectId; // Tables don't have a separate get endpoint
    } else if (props.relationType === RelationType.View) {
      // For views, we get basic info from the view list
      assignableObj.id = props.objectId;
      assignableObj.name = props.objectId; // Views don't have a separate get endpoint
    } else if (props.relationType === RelationType.Project) {
      objData = await functions.getProject(props.objectId);
      assignableObj.id = objData['project-id'];
      assignableObj.name = objData['project-name'];
    } else if (props.relationType === RelationType.Role) {
      objData = await functions.getRole(props.objectId);
      assignableObj.id = objData.id;
      assignableObj.name = objData.name;
    }

    emit('objectLoaded', { id: assignableObj.id, name: assignableObj.name });
  } catch (error) {
    console.error('Error loading object data:', error);
  }
}

async function fetchAssignments() {
  try {
    let assignments: any[] = [];

    if (props.relationType === RelationType.Server) {
      assignments = await functions.getServerAssignments();
    } else if (props.relationType === RelationType.Warehouse) {
      assignments = await functions.getWarehouseAssignmentsById(assignableObj.id);
    } else if (props.relationType === RelationType.Namespace) {
      assignments = await functions.getNamespaceAssignmentsById(assignableObj.id);
    } else if (props.relationType === RelationType.Table && props.warehouseId) {
      assignments = await functions.getTableAssignmentsById(assignableObj.id, props.warehouseId);
    } else if (props.relationType === RelationType.View && props.warehouseId) {
      assignments = await functions.getViewAssignmentsById(assignableObj.id, props.warehouseId);
    } else if (props.relationType === RelationType.Project) {
      assignments = await functions.getProjectAssignments();
    } else if (props.relationType === RelationType.Role) {
      assignments = await functions.getRoleAssignmentsById(assignableObj.id);
    }

    existingAssignments.splice(0, existingAssignments.length);
    Object.assign(existingAssignments, assignments);
    return assignments;
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return [];
  }
}

async function switchManagedAccess() {
  try {
    if (props.relationType === RelationType.Warehouse) {
      await functions.setWarehouseManagedAccess(assignableObj.id, !isManagedAccess.value, true);
    }

    if (props.relationType === RelationType.Namespace) {
      await functions.setNamespaceManagedAccess(assignableObj.id, !isManagedAccess.value, true);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await loadManagedAccess();
  }
}

async function loadManagedAccess() {
  if (props.relationType === RelationType.Warehouse) {
    const managedAccess = await functions.getWarehouseById(assignableObj.id);
    isManagedAccess.value = managedAccess;
  }

  if (props.relationType === RelationType.Namespace) {
    const isManaged = await functions.getNamespaceById(assignableObj.id);

    isManagedAccess.value = isManaged['managed-access'];
    isManagedAccessInherited.value = isManaged['managed-access-inherited'];
  }
}

async function init() {
  loaded.value = false;
  permissionRows.splice(0, permissionRows.length);

  await loadObjectData();
  await loadManagedAccess();

  const assignments = await fetchAssignments();

  for (const permission of assignments) {
    const searchUser: any = permission;

    if (searchUser.user) {
      const user = await functions.getUser(searchUser.user);
      const idx = permissionRows.findIndex((a) => a.id === user.id);
      if (user) {
        if (idx === -1) {
          permissionRows.push({
            id: user.id,
            name: user.name,
            email: user.email ?? '',
            type: [permission.type],
            kind: 'user',
          });
        } else {
          permissionRows[idx].type.push(permission.type);
        }
      }
    } else {
      const role = await functions.getRole(searchUser.role);
      const idx = permissionRows.findIndex((a) => a.id === role.id);

      if (role) {
        if (idx === -1) {
          permissionRows.push({
            id: role.id,
            name: role.name,
            email: '',
            type: [permission.type],
            kind: 'role',
            'project-id': role['project-id'] || null,
          });
        } else {
          permissionRows[idx].type.push(permission.type);
        }
      }
    }
  }

  loaded.value = true;
}

async function assign(permissions: { del: AssignmentCollection; writes: AssignmentCollection }) {
  try {
    loaded.value = false;
    assignStatus.value = StatusIntent.STARTING;
    emit('statusUpdate', StatusIntent.STARTING);

    // Handle different relation types
    if (props.relationType === RelationType.Server) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      await functions.updateServerAssignments(del, writes, true);
    } else if (props.relationType === RelationType.Warehouse) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      await functions.updateWarehouseAssignmentsById(assignableObj.id, del, writes, true);
    } else if (props.relationType === RelationType.Namespace) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      await functions.updateNamespaceAssignmentsById(assignableObj.id, del, writes, true);
    } else if (props.relationType === RelationType.Table) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      if (!props.warehouseId) {
        throw new Error('warehouseId is required for table assignments');
      }
      await functions.updateTableAssignmentsById(
        assignableObj.id,
        del,
        writes,
        props.warehouseId,
        true,
      );
    } else if (props.relationType === RelationType.View) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      if (!props.warehouseId) {
        throw new Error('warehouseId is required for view assignments');
      }
      await functions.updateViewAssignmentsById(
        assignableObj.id,
        del,
        writes,
        props.warehouseId,
        true,
      );
    } else if (props.relationType === RelationType.Project) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      await functions.updateProjectAssignments(del, writes, true);
    } else if (props.relationType === RelationType.Role) {
      const del = permissions.del as any[];
      const writes = permissions.writes as any[];
      await functions.updateRoleAssignmentsById(assignableObj.id, del, writes, true);
    }

    assignStatus.value = StatusIntent.SUCCESS;
    emit('statusUpdate', StatusIntent.SUCCESS);
    await init(); // Reload the data
  } catch (error) {
    console.error(error);
    assignStatus.value = StatusIntent.FAILURE;
    emit('statusUpdate', StatusIntent.FAILURE);
  } finally {
    loaded.value = true;
  }
}

function openDeleteDialog(item: any) {
  itemToDelete.value = item;
  deleteDialog.value = true;
}

async function confirmDelete() {
  try {
    if (!itemToDelete.value) return;

    deleteDialog.value = false;
    loaded.value = false;
    assignStatus.value = StatusIntent.STARTING;
    emit('statusUpdate', StatusIntent.STARTING);

    // Get all assignments for this user/role
    const assignmentsToDelete = existingAssignments.filter(
      (a: any) => a.user === itemToDelete.value.id || a.role === itemToDelete.value.id,
    );

    // Delete all assignments
    await assign({ del: assignmentsToDelete, writes: [] });

    itemToDelete.value = null;
  } catch (error) {
    console.error('Error deleting assignments:', error);
    assignStatus.value = StatusIntent.FAILURE;
    emit('statusUpdate', StatusIntent.FAILURE);
  }
}

onMounted(async () => {
  await init();
});
</script>
