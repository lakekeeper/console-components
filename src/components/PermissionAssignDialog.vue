<template>
  <v-dialog v-model="isDialogActive" max-width="800">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-if="actionType == 'grant'"
        v-bind="activatorProps"
        color="primary"
        size="small"
        class="me-5"
        slim
        :text="`${props.actionType}`"
        variant="outlined"></v-btn>

      <v-btn
        v-else
        v-bind="activatorProps"
        color="primary"
        size="small"
        text="Edit"
        variant="outlined"></v-btn>
    </template>

    <v-card
      :title="
        $props.actionType == 'grant'
          ? `Create assignment to ${props.relation} - ${props.obj?.name}`
          : `Edit Assignment on ${props.relation} - ${props.obj?.name}`
      ">
      <v-card-text>
        <v-tabs
          v-if="props.actionType == 'grant'"
          v-model="searchForType"
          color="primary"
          class="mb-4"
          @update:model-value="clearSelectedItem">
          <v-tab value="user">
            <v-icon start>mdi-account-circle-outline</v-icon>
            Users
          </v-tab>
          <v-tab value="role">
            <v-icon start>mdi-account-box-multiple-outline</v-icon>
            Roles
          </v-tab>
        </v-tabs>

        <!-- Project Selector for Role Search -->
        <v-row v-if="props.actionType == 'grant' && searchForType === 'role'">
          <v-col>
            <v-select
              v-model="selectedProjectForRoleSearch"
              :items="userProjects"
              item-title="project-name"
              item-value="project-id"
              label="Select Project"
              density="comfortable"
              clearable
              hint="Choose a project to search for roles"
              persistent-hint
              :loading="loadingProjects">
              <template #prepend-inner>
                <v-icon>mdi-folder-account</v-icon>
              </template>
              <template #item="{ props: itemProps, item }">
                <v-list-item
                  v-bind="itemProps"
                  :title="`${item.raw['project-name']} (${item.raw['project-id']})`">
                  <template #prepend>
                    <v-icon v-if="item.raw['project-id'] === currentProjectId">
                      mdi-check-circle
                    </v-icon>
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ item.raw['project-name'] }} ({{ item.raw['project-id'] }})</span>
              </template>
            </v-select>
          </v-col>
        </v-row>

        <v-row v-if="props.actionType == 'grant'">
          <v-col>
            <v-checkbox
              v-model="byIdActivated"
              label="Search by ID"
              :disabled="searchForType === 'role' && loadingProjects"></v-checkbox>
          </v-col>
        </v-row>

        <v-autocomplete
          v-if="props.actionType == 'grant' && !byIdActivated"
          v-model="searchFor"
          class="mx-auto"
          clear-on-select
          density="comfortable"
          item-title="name"
          item-value="id"
          :items="items"
          variant="solo"
          :disabled="searchForType === 'role' && loadingProjects"
          :loading="searchForType === 'role' && loadingProjects"
          @update:focused="items.splice(0, items.length)"
          @update:model-value="selectedObject"
          @update:search="searchMember">
          <template #item="{ props: itemProps, item }">
            <v-list-item
              v-bind="itemProps"
              :prepend-icon="getItemIcon(item.raw)"
              :subtitle="getItemSubtitle(item.raw)"
              :title="getItemTitle(item.raw)"></v-list-item>
          </template>
        </v-autocomplete>
        <v-text-field
          v-if="props.actionType == 'grant' && byIdActivated"
          v-model="idSearchUserOrRole"
          clearable
          dense
          label="Search by ID"
          outlined
          :disabled="searchForType === 'role' && loadingProjects"
          @update:model-value="searchMemberById"></v-text-field>
        <span class="mt-16">
          <v-card-title>
            <span v-if="selectedItem.id == undefined">Search for a {{ searchForType }}</span>
            <span v-else>
              <v-icon
                v-if="isRoleFromDifferentProject(selectedItem)"
                class="mr-2"
                color="warning"
                size="small">
                mdi-badge-account-alert-outline
              </v-icon>
              {{ selectedItem.name }}
              <span v-if="isRoleFromDifferentProject(selectedItem)" class="text-caption text-grey">
                ({{ (selectedItem as any)['project-id'] }})
              </span>
            </span>
          </v-card-title>
          <span v-if="selectedItem.id != undefined">
            <v-card-subtitle>
              ID: {{ selectedItem.id }}
              <v-btn
                :disabled="selectedItem.id == undefined"
                icon="mdi-content-copy"
                size="small"
                variant="flat"
                @click="functions.copyToClipboard(selectedItem.id)"></v-btn>
              <v-chip
                v-if="isRoleFromDifferentProject(selectedItem)"
                class="ml-2"
                color="warning"
                size="x-small"
                variant="outlined">
                External Project Role
              </v-chip>
            </v-card-subtitle>
            <v-card-text>
              <v-row no-gutters>
                <v-col v-for="(rel, i) in objRelation" :key="i" cols="4" lg="4" md="4" sm="4">
                  <v-checkbox
                    v-model="selectedReleations"
                    :disabled="selectedItem.id == ''"
                    :label="rel"
                    :value="rel"
                    @update:model-value="sendAssignment($event)"></v-checkbox>
                </v-col>
              </v-row>
            </v-card-text>
          </span>
        </span>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn
          color="success"
          :disabled="toWrite.length == 0 && toDelete.length == 0"
          @click="assign">
          save
        </v-btn>
        <v-btn color="error" text="Cancel" @click="cancelRoleAssignment"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { defineEmits, defineProps, reactive, ref, onMounted, computed, watch } from 'vue';
import {
  NamespaceRelation,
  ProjectRelation,
  Role,
  RoleRelation,
  ServerRelation,
  TableRelation,
  User,
  ViewRelation,
  WarehouseRelation,
} from '@/gen/management/types.gen';

import { AssignmentCollection, RelationType } from '@/common/interfaces';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { StatusIntent } from '@/common/enums';

const functions = useFunctions();
const visualStore = useVisualStore();
const byIdActivated = ref(false);
const items = reactive<any[]>([]);
const selectedItem = reactive<User | Role | { name: string; id: string }>({
  name: '',
  id: '',
});
const searchFor = ref<string>('');
const isDialogActive = ref(false);
const newAddAssignments = reactive<any[]>([]);
const newDelAssignments = reactive<any[]>([]);
const existingAssignments = reactive<any[]>([]);
const role = reactive<{ id: string; name: string }>({
  name: 'empty',
  id: '',
});

// Project selection for role search
const selectedProjectForRoleSearch = ref<string | null>(null);
const userProjects = reactive<any[]>([]);
const loadingProjects = ref(false);

const selectedReleations = ref<any[]>([]);
const idSearchUserOrRole = ref<string>('');
const searchForType = ref<'user' | 'role'>('user');

const objRelation = computed(() => {
  if (props.relation === 'role') {
    return roleRelations;
  } else if (props.relation === 'server') {
    return serverRelation;
  } else if (props.relation === 'table') {
    return tableRelation;
  } else if (props.relation === 'view') {
    return viewRelation;
  } else if (props.relation === 'warehouse') {
    return warehouseRelation;
  } else if (props.relation === 'namespace') {
    return namespaceRelation;
  } else if (props.relation === 'project') {
    return projectRelation;
  }
  throw new Error('Invalid relation type');
});
const roleRelations: RoleRelation[] = ['assignee', 'ownership'];
const serverRelation: ServerRelation[] = ['admin', 'operator'];
const toWrite = reactive<any[]>([]);
const toDelete = reactive<any[]>([]);
const tableRelation: TableRelation[] = [
  'ownership',
  'pass_grants',
  'manage_grants',
  'describe',
  'select',
  'modify',
];
const viewRelation: ViewRelation[] = [
  'ownership',
  'pass_grants',
  'manage_grants',
  'describe',
  'modify',
];
const warehouseRelation: WarehouseRelation[] = [
  'ownership',
  'pass_grants',
  'manage_grants',
  'describe',
  'select',
  'create',
  'modify',
];
const namespaceRelation: NamespaceRelation[] = [
  'ownership',
  'pass_grants',
  'manage_grants',
  'describe',
  'select',
  'create',
  'modify',
];
const projectRelation: ProjectRelation[] = [
  'project_admin',
  'security_admin',
  'data_admin',
  'role_creator',
  'describe',
  'select',
  'create',
  'modify',
];

const props = defineProps<{
  status: StatusIntent;
  actionType: string;
  relation: RelationType;
  assignee: string;
  obj: {
    id: string;
    name: string;
  };
  assignments: AssignmentCollection;
}>();

const emit = defineEmits<{
  (
    e: 'assignments',
    assignments: {
      del: AssignmentCollection;
      writes: AssignmentCollection;
    },
  ): void;
}>();

/**
 * Get the current project ID from the visual store
 */
const currentProjectId = computed(() => {
  return visualStore.projectSelected['project-id'] || null;
});

/**
 * Check if a role belongs to a different project
 */
function isRoleFromDifferentProject(role: any): boolean {
  if (searchForType.value !== 'role') return false;
  if (!role['project-id']) return false;
  if (!currentProjectId.value) return false;
  return role['project-id'] !== currentProjectId.value;
}

/**
 * Get the appropriate icon for the item
 */
function getItemIcon(item: any): string {
  if (searchForType.value === 'role') {
    // Use a different icon for roles from different projects
    return isRoleFromDifferentProject(item)
      ? 'mdi-badge-account-alert-outline' // Different icon for external roles
      : 'mdi-account-box-multiple-outline'; // Standard role icon
  }
  return 'mdi-account-circle-outline'; // User icon
}

/**
 * Get the formatted title for the item
 */
function getItemTitle(item: any): string {
  if (searchForType.value === 'role' && isRoleFromDifferentProject(item)) {
    return `${item.name} (${item['project-id']})`;
  }
  return item.name;
}

/**
 * Get the subtitle for the item
 */
function getItemSubtitle(item: any): string {
  if (searchForType.value === 'user') {
    return item.email || '';
  }
  // For roles from different projects, show a hint
  if (isRoleFromDifferentProject(item)) {
    return 'External project role';
  }
  return item.description || '';
}

async function searchMember(search: string) {
  try {
    items.splice(0, items.length);
    if (search === '') return;

    if (searchForType.value === 'user') {
      const userSearchOutput = await functions.searchUser(search);
      Object.assign(items, userSearchOutput);
    } else {
      // For role search, pass the selected project ID if available
      const searchRequest: any = { search: search };
      if (selectedProjectForRoleSearch.value) {
        searchRequest['project-id'] = selectedProjectForRoleSearch.value;
      }

      const roleSearchOutput = await functions.searchRole(searchRequest);

      const roleSearchOutputFiltered = roleSearchOutput.filter((it: Role) => {
        return it.id !== props.obj.id;
      });

      Object.assign(items, roleSearchOutputFiltered);
    }
  } catch (error) {
    console.error(error);
  }
}

async function searchMemberById(idSearchUserOrRolePar: string) {
  try {
    if (idSearchUserOrRolePar === '') return;

    if (idSearchUserOrRolePar === null) return;

    if (searchForType.value === 'user') {
      const userSearchOutput = await functions.getUser(idSearchUserOrRolePar);

      Object.assign(selectedItem, userSearchOutput);

      spliceAssignments();
      existingAssignments.push(
        ...props.assignments.filter(
          (a: any) => a.user === selectedItem.id || a.role === selectedItem.id,
        ),
      );

      for (const assignment of existingAssignments) {
        selectedReleations.value.push(assignment.type);
      }

      idSearchUserOrRole.value = '';
    } else {
      const roleSearchOutput = await functions.getRole(idSearchUserOrRolePar);

      Object.assign(selectedItem, roleSearchOutput);

      spliceAssignments();
      existingAssignments.push(
        ...props.assignments.filter(
          (a: any) => a.user === selectedItem.id || a.role === selectedItem.id,
        ),
      );

      for (const assignment of existingAssignments) {
        selectedReleations.value.push(assignment.type);
      }

      idSearchUserOrRole.value = '';
    }
  } catch (error) {
    console.error(error);
  }
}

// Function to clear all properties of selectedItem
function clearSelectedItem() {
  Object.keys(selectedItem).forEach((key) => {
    delete (selectedItem as any)[key];
  });
  Object.assign(selectedItem, { name: '' });
  idSearchUserOrRole.value = '';
  byIdActivated.value = false;
  selectedReleations.value.splice(0, selectedReleations.value.length);
  spliceAssignments();
}

function selectedObject() {
  clearSelectedItem();
  selectedReleations.value.splice(0, selectedReleations.value.length);
  const obj = items.find((item: any) => item.id === searchFor.value);

  Object.assign(selectedItem, obj);
  spliceAssignments();
  existingAssignments.push(
    ...props.assignments.filter(
      (a: any) => a.user === selectedItem.id || a.role === selectedItem.id,
    ),
  );

  for (const assignment of existingAssignments) {
    selectedReleations.value.push(assignment.type);
  }

  searchFor.value = '';
  items.splice(0, items.length);
}

function sendAssignment(value: any) {
  toWrite.splice(0, toWrite.length);
  toWrite.push(...value);
  toDelete.splice(0, toDelete.length);
  toDelete.push(...(objRelation.value || []).filter((r) => !value.includes(r)));
}

function spliceAssignments() {
  existingAssignments.splice(0, existingAssignments.length);
  newAddAssignments.splice(0, newAddAssignments.length);
  newDelAssignments.splice(0, newDelAssignments.length);
}

function cancelRoleAssignment() {
  if (props.actionType === 'grant') {
    clearSelectedItem();
    spliceAssignments();
    selectedReleations.value.splice(0, selectedReleations.value.length);
  }
  isDialogActive.value = false;
}

function assign() {
  try {
    // add if missing
    if (toWrite.length > 0) {
      for (const v of toWrite) {
        const idx = existingAssignments.findIndex((a: any) => a.type === v);

        if (idx === -1) {
          const canBeAddedToWrite = newAddAssignments.findIndex((a: any) => a.type === v);

          if (canBeAddedToWrite === -1)
            newAddAssignments.push({
              [searchForType.value === 'user' ? 'user' : 'role']: selectedItem.id,
              type: v,
            });
        }
      }
    }

    if (toDelete.length > 0) {
      for (const v of toDelete) {
        const idx = existingAssignments.findIndex((a: any) => a.type === v);
        if (idx !== -1) {
          const canBeAddedToDel = newDelAssignments.findIndex((a: any) => a.type === v);

          if (canBeAddedToDel === -1)
            newDelAssignments.push({
              [searchForType.value === 'user' ? 'user' : 'role']: selectedItem.id,
              type: v,
            });
        }
      }
    }

    emit('assignments', {
      del: newDelAssignments,
      writes: newAddAssignments,
    });
  } catch (error) {
    console.error(error);
  }
}

async function init() {
  try {
    spliceAssignments();
    Object.assign(role, props.obj);

    if (props.actionType === 'edit') {
      const assignee: any = props.assignments.find(
        (a: any) => a.user === props.assignee || a.role === props.assignee,
      );

      searchForType.value = 'user' in assignee ? 'user' : 'role';

      const assignments: any = props.assignments.filter(
        (a: any) => a.user === props.assignee || a.role === props.assignee,
      );

      Object.assign(existingAssignments, assignments);

      for (const assignment of existingAssignments) {
        selectedReleations.value.push(assignment.type);
      }
      Object.assign(
        selectedItem,
        assignee.user
          ? await functions.getUser(assignee.user)
          : await functions.getRole(assignee.role),
      );
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadUserProjects() {
  try {
    loadingProjects.value = true;
    const projects = await functions.loadProjectList();
    userProjects.splice(0, userProjects.length, ...projects);

    // Auto-select current project if available
    if (currentProjectId.value && !selectedProjectForRoleSearch.value) {
      selectedProjectForRoleSearch.value = currentProjectId.value;
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  } finally {
    loadingProjects.value = false;
  }
}

onMounted(async () => {
  await init();
});

// Clear state when dialog opens
watch(isDialogActive, (newValue) => {
  if (newValue && props.actionType === 'grant') {
    // Clear everything when opening for grant action
    clearSelectedItem();
    // Load projects for role search
    if (userProjects.length === 0) {
      loadUserProjects();
    }
  } else if (newValue && props.actionType === 'edit') {
    // Reinitialize when opening for edit action
    init();
  }
});

// Load projects when role tab is selected
watch(searchForType, (newValue) => {
  if (newValue === 'role' && userProjects.length === 0) {
    loadUserProjects();
  }
});

watch(
  () => props.status,
  (newValue) => {
    if (newValue === StatusIntent.SUCCESS) {
      cancelRoleAssignment();
    }
  },
  { immediate: true },
);
</script>
