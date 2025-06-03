<template>
  <v-dialog v-model="dialog" fullscreen transition="dialog-bottom-transition">
    <template #activator="{ props: activatorProps }">
      <v-list-item-title
        v-bind="activatorProps"
        prepend-icon="mdi-home-silo"
        :text="project['project-name']">
        <div class="text-center pa-4">
          <v-btn prepend-icon="mdi-home-silo" :text="project['project-name']"></v-btn>
        </div>
      </v-list-item-title>
    </template>

    <v-card>
      <v-toolbar>
        <v-btn icon="mdi-close" @click="dialog = false"></v-btn>

        <v-toolbar-title>{{ project['project-name'] }}</v-toolbar-title>

        <v-spacer></v-spacer>
      </v-toolbar>

      <v-tabs v-model="tab">
        <v-tab value="overview">overview</v-tab>
        <v-tab
          v-if="canReadAssignments && enabledAuthentication && enabledPermissions"
          value="permissions">
          Permissions
        </v-tab>
        <v-tab value="statistics">Statistics</v-tab>
      </v-tabs>
      <v-tabs-window v-model="tab">
        <v-tabs-window-item value="overview">
          <v-list lines="two" subheader>
            <v-list-subheader>Selected Project</v-list-subheader>

            <v-list-item
              link
              :subtitle="`ID: ${project['project-id']}`"
              :title="`${project['project-name']}`"></v-list-item>

            <v-divider class="mt-8"></v-divider>
          </v-list>

          <v-data-table
            fixed-header
            :headers="headers"
            hover
            :items="availableProjects"
            :sort-by="[{ key: 'name', order: 'asc' }]">
            <template #top>
              <v-toolbar color="transparent" density="compact" flat>
                <v-spacer></v-spacer>

                <!--AddProjectDialog @add-project="addProject" /-->
              </v-toolbar>
            </template>

            <template #item.info="{ item }">
              <v-chip v-if="item.info === 'selected'" class="mr-2">selected</v-chip>
              <v-chip v-if="item.info === 'switch'" class="mr-2">switch</v-chip>
            </template>

            <template #item.actions="{ item }">
              <ProjectNameAddOrEditDialog
                :id="item['project-id']"
                :action-type="'edit'"
                :name="item['project-name']"
                @emit-project-new-name="renameProject" />
            </template>

            <template #no-data>
              <div>No projects available</div>
            </template>
          </v-data-table>
        </v-tabs-window-item>
        <v-tabs-window-item v-if="canReadAssignments" value="permissions">
          <PermissionManager
            v-if="loaded && enabledPermissions"
            :status="assignStatus"
            :assignable-obj="permissionObject"
            :existing-permissions-from-obj="existingAssignments"
            :relation-type="permissionType"
            @permissions="assign" />
        </v-tabs-window-item>

        <v-tabs-window-item value="statistics">
          <StatisticsProject v-if="loadedStatistics" :stats="statistics" />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { onMounted, ref, reactive, computed, inject } from 'vue';

import {
  GetEndpointStatisticsResponse,
  GetProjectResponse,
  ProjectAction,
  ProjectAssignment,
  RenameProjectRequest,
} from '../gen/management/types.gen';
import { AssignmentCollection, Header, RelationType } from '../types/interfaces';
import { StatusIntent } from '../types/enums';
import PermissionManager from './PermissionManager.vue';
import ProjectNameAddOrEditDialog from './ProjectNameAddOrEditDialog.vue';
import StatisticsProject from './StatisticsProject.vue';
import { AppFunctions, FUNCTIONS_INJECTION_KEY } from '../types/functions';

const dialog = ref(false);
const tab = ref('overview');

const assignStatus = ref(StatusIntent.INACTIVE);

const functions = inject<AppFunctions>(FUNCTIONS_INJECTION_KEY);

const {
  enabledAuthentication,
  enabledPermissions,
  project,
  authMethod,
  projectAssignments,
  statistics,
  availableProjects,
} = defineProps<{
  enabledAuthentication: boolean;
  enabledPermissions: boolean;
  project: GetProjectResponse;
  authMethod: 'allow-all' | 'authz';
  myAccess: ProjectAction[];
  projectAssignments: ProjectAssignment[];
  statistics: GetEndpointStatisticsResponse;
  availableProjects: (GetProjectResponse & { actions: string[]; info: string })[];
}>();

const permissionType = ref<RelationType>('project');
const myAccess = reactive<ProjectAction[]>([]);
const canReadAssignments = ref(false);
const canDeleteProject = ref(false);

const existingAssignments = reactive<ProjectAssignment[]>([]);
const loaded = ref(true);
const loadedStatistics = ref(true);
const assignments = reactive<
  { id: string; name: string; email: string; type: string; kind: string }[]
>([]);

const headers: readonly Header[] = Object.freeze([
  { title: 'Info', key: 'info', align: 'start' },

  { title: 'Name', key: 'project-name', align: 'start' },
  { title: 'ID', key: 'project-id', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'start', sortable: false },
]);

const permissionObject = reactive<any>({
  id: '',
  description: '',
  name: 'Project',
});

const emit = defineEmits<{
  (
    e: 'updateProjectAssignments',
    permissions: {
      del: AssignmentCollection;
      writes: AssignmentCollection;
    },
  ): void;
  (
    e: 'renameProject',
    newName: { renamedProject: RenameProjectRequest & { 'project-id': string } },
  ): void;
}>();

async function init() {
  try {
    loaded.value = false;
    permissionObject.id = project['project-id'];
    permissionObject.name = project['project-name'];

    canReadAssignments.value = !!myAccess.includes('read_assignments');

    canDeleteProject.value = !!myAccess.includes('delete');

    existingAssignments.splice(0, existingAssignments.length);
    Object.assign(existingAssignments, projectAssignments);
    availableProjects.forEach((p) => {
      p.actions = ['rename'];

      p.actions.push('delete');
      if (p['project-id'] === project['project-id']) {
        p.info = 'selected';
      } else {
        p.info = 'switch';
      }
    });

    for (const assignment of projectAssignments) {
      const searchUser: any = assignment;

      if (searchUser.user) {
        const user = await functions?.getUser(searchUser.user);

        if (user) {
          assignments.push({
            id: user.id,
            name: user.name,
            email: user.email ?? '',
            type: assignment.type,
            kind: 'user',
          });
        }
      } else {
        const role = await functions?.getRole(searchUser.role);
        if (role) {
          assignments.push({
            id: role.id,
            name: role.name,
            email: '',
            type: assignment.type,
            kind: 'role',
          });
        }
      }
    }
    loaded.value = true;
  } catch (error: any) {
    console.error(error);
  }
}

async function assign(item: { del: AssignmentCollection; writes: AssignmentCollection }) {
  try {
    assignStatus.value = StatusIntent.STARTING;

    loaded.value = false;
    const del = item.del as ProjectAssignment[]; // Define 'del' variable
    const writes = item.writes as ProjectAssignment[]; // Define 'del' variable

    emit('updateProjectAssignments', { del, writes });
    assignStatus.value = StatusIntent.SUCCESS;

    await init();
    loaded.value = true;
  } catch (error) {
    assignStatus.value = StatusIntent.FAILURE;

    console.error(error);
  } finally {
    await init();
    loaded.value = true;
  }
}

async function renameProject(renamedProject: RenameProjectRequest & { 'project-id': string }) {
  try {
    emit('renameProject', { renamedProject });
  } catch (error) {
    console.error(error);
  }
}
onMounted(async () => {
  await init();
});
</script>
