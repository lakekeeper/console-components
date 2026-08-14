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
        <v-tab value="overview" v-if="userStorage.isAuthenticated">overview</v-tab>
        <v-tab v-if="showPermissionsTab && userStorage.isAuthenticated" value="permissions">
          Permissions
        </v-tab>
        <v-tab
          v-if="showTasksTab && userStorage.isAuthenticated"
          value="tasks"
          @click="loadProjectTasks">
          Tasks
        </v-tab>
        <v-tab v-if="grantsSupported && userStorage.isAuthenticated" value="grants">Grants</v-tab>
        <v-tab v-if="grantsSupported && userStorage.isAuthenticated" value="grants-by-principal">
          By principal
        </v-tab>
        <v-tab v-if="showStatisticsTab" value="statistics" @click="loadStatistics">
          Statistics
        </v-tab>
      </v-tabs>
      <v-tabs-window
        v-model="tab"
        crossfade
        style="max-height: calc(100vh - 140px); overflow-y: auto">
        <v-tabs-window-item value="overview" v-if="userStorage.isAuthenticated">
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
            density="compact"
            :headers="headers"
            hover
            :items="filteredProjects"
            :sort-by="[{ key: 'project-name', order: 'asc' }]">
            <template #top>
              <v-toolbar color="transparent" density="compact" flat>
                <v-toolbar-title class="text-subtitle-1">Available Projects</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-text-field
                  v-model="searchQuery"
                  label="Filter projects"
                  prepend-inner-icon="mdi-filter"
                  placeholder="Type to filter projects"
                  variant="underlined"
                  hide-details
                  clearable
                  class="mr-4"
                  style="max-width: 300px"></v-text-field>
                <ProjectNameAddOrEditDialog
                  v-if="canCreateProject"
                  :id="''"
                  :action-type="'add'"
                  :name="''"
                  @emit-project-create="addProject" />
              </v-toolbar>
            </template>

            <template #item.info="{ item }">
              <v-btn
                v-if="item.info === 'selected'"
                text="selected"
                color="primary"
                size="small"
                disabled
                variant="plain">
                selected
              </v-btn>
              <v-btn
                v-if="item.info === 'activate'"
                text="activate"
                color="primary"
                size="small"
                variant="flat"
                @click="activateProject(item)"></v-btn>
            </template>

            <template #item.actions="{ item }">
              <div class="d-inline-flex ga-2 align-center">
                <ProjectNameAddOrEditDialog
                  :id="item['project-id']"
                  :action-type="'edit'"
                  :name="item['project-name']"
                  @emit-project-new-name="renameProject" />

                <DeleteConfirmDialog
                  v-if="item.actions?.includes('delete') && item.info !== 'selected'"
                  :type="'project'"
                  :name="item['project-name']"
                  @confirmed="deleteProject(item)"></DeleteConfirmDialog>
              </div>
            </template>

            <template #no-data>
              <v-empty-state
                icon="mdi-folder-off-outline"
                title="No projects available"
                size="small"></v-empty-state>
            </template>
          </v-data-table>
        </v-tabs-window-item>
        <v-tabs-window-item
          v-if="showPermissionsTab && userStorage.isAuthenticated"
          value="permissions">
          <PermissionManager
            v-if="project['project-id']"
            :object-id="project['project-id']"
            :relation-type="permissionType" />
        </v-tabs-window-item>

        <v-tabs-window-item
          v-if="showTasksTab && userStorage.isAuthenticated"
          value="tasks"
          style="height: 100%">
          <ProjectTaskManager
            v-if="project['project-id']"
            ref="projectTaskManagerRef"
            :project-id="project['project-id']" />
        </v-tabs-window-item>

        <!-- Grants. Sits beside Permissions rather than replacing it: the two
             are different models over the same intent, and a deployment can be
             moving from one to the other. Server grants belong to no project,
             so the level switcher is the only route to them from here. -->
        <v-tabs-window-item
          v-if="grantsSupported && userStorage.isAuthenticated"
          value="grants"
          style="height: 100%">
          <div class="pa-4 d-flex flex-column" style="height: calc(100vh - 220px); min-height: 0">
            <v-btn-toggle
              v-model="grantLevel"
              mandatory
              density="compact"
              variant="outlined"
              class="mb-3 flex-grow-0 align-self-start">
              <v-btn value="project" size="small" prepend-icon="mdi-folder-account-outline">
                Project
              </v-btn>
              <v-btn value="server" size="small" prepend-icon="mdi-server">Server</v-btn>
            </v-btn-toggle>
            <GrantsPanel
              v-if="tab === 'grants'"
              :key="grantLevel"
              :resource="
                grantLevel === 'server' ? { type: 'server' } : { type: 'project', projectId }
              " />
          </div>
        </v-tabs-window-item>

        <v-tabs-window-item
          v-if="grantsSupported && userStorage.isAuthenticated"
          value="grants-by-principal"
          style="height: 100%">
          <GrantsExplorer v-if="tab === 'grants-by-principal'" />
        </v-tabs-window-item>

        <v-tabs-window-item v-if="showStatisticsTab" value="statistics" style="height: 100%">
          <ProjectStatistics ref="projectStatisticsRef" />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { onMounted, ref, reactive, computed } from 'vue';
import { useVisualStore } from '../stores/visual';
import { useUserStore } from '../stores/user';
import { useFunctions } from '../plugins/functions';
import { useProjectPermissions, useServerPermissions } from '../composables/useCatalogPermissions';
import { useProjectAuthorizerPermissions } from '../composables/useAuthorizerPermissions';
import { usePermissionStore } from '../stores/permissions';
import {
  CreateProjectRequest,
  GetProjectResponse,
  RenameProjectRequest,
} from '../gen/management/types.gen';
import { Header, RelationType } from '../common/interfaces';
import { useRouter } from 'vue-router';
import ProjectTaskManager from './ProjectTaskManager.vue';
import ProjectStatistics from './ProjectStatistics.vue';
import GrantsPanel from './GrantsPanel.vue';
import GrantsExplorer from './GrantsExplorer.vue';
import { useGrantsSupported } from '../composables/useGrants';

const dialog = ref(false);
const tab = ref('overview');
const userStorage = useUserStore();
const projectTaskManagerRef = ref<InstanceType<typeof ProjectTaskManager> | null>(null);
const projectStatisticsRef = ref<InstanceType<typeof ProjectStatistics> | null>(null);

const visual = useVisualStore();
const functions = useFunctions();
const notify = true;

const router = useRouter();

const permissionType = RelationType.Project;

const project = computed(() => visual.projectSelected);
const projectId = computed(() => project.value['project-id']);
const serverId = computed(() => visual.getServerInfo()['server-id']);

// Use composables for permissions
const { showStatisticsTab, showTasksTab } = useProjectPermissions(projectId);
const { showPermissionsTab } = useProjectAuthorizerPermissions(projectId);
// Hidden where the authorizer manages no grants — under `allow-all` every
// vocabulary comes back empty, and an empty matrix would say nothing.
const grantsSupported = useGrantsSupported();
const grantLevel = ref<'project' | 'server'>('project');
const { canCreateProject } = useServerPermissions(serverId);
const loaded = ref(true);

async function loadStatistics() {
  if (projectStatisticsRef.value) {
    await projectStatisticsRef.value.loadStatistics();
  }
}

const headers: readonly Header[] = Object.freeze([
  { title: 'Info', key: 'info', align: 'start' },
  { title: 'Name', key: 'project-name', align: 'start' },
  { title: 'ID', key: 'project-id', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'start', sortable: false },
]);

const availableProjects = reactive<(GetProjectResponse & { actions: string[]; info: string })[]>(
  [],
);

const searchQuery = ref('');

// Computed property to filter projects based on search query
const filteredProjects = computed(() => {
  if (!searchQuery.value || searchQuery.value.trim() === '') {
    return availableProjects;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return availableProjects.filter(
    (project) =>
      project['project-name'].toLowerCase().includes(query) ||
      project['project-id'].toLowerCase().includes(query),
  );
});

async function init() {
  try {
    loaded.value = false;
    await loadProjects();
    loaded.value = true;
  } catch (error: any) {
    console.error(error);
  }
}

async function loadProjectTasks() {
  // Refresh tasks when tab is clicked
  if (projectTaskManagerRef.value) {
    await projectTaskManagerRef.value.refreshTasks();
  }
}

async function loadProjects() {
  try {
    availableProjects.splice(0, availableProjects.length);

    Object.assign(availableProjects, await functions.loadProjectList());

    const permissionStore = usePermissionStore();

    // Load permissions for all projects in parallel
    await Promise.all(
      availableProjects.map(async (p) => {
        if (p['project-id'] === project.value['project-id']) {
          p.info = 'selected';
        } else {
          p.info = 'activate';
        }

        p.actions = [];
        const access = await permissionStore.getProjectPermissions();
        p.actions.push(...access.map((permission) => permission.action));
      }),
    );
  } catch (error) {
    console.error(error);
  }
}

async function activateProject(item: { 'project-id': string; 'project-name': string }) {
  loaded.value = false;
  try {
    visual.setProjectSelected(item);
    router.push('/');
  } catch (error) {
    console.error(error);
  } finally {
    await init();
    loaded.value = true;
  }
}

async function deleteProject(project: GetProjectResponse & { actions: string[]; info: string }) {
  try {
    await functions.deleteProject(project['project-id'], notify);
    // if we delete the current project, switch to the first project
    if (project['project-id'] === visual.projectSelected['project-id']) {
      router.push('/');
    }
  } catch (error) {
    console.error(error);
  } finally {
    await loadProjects();
  }
}

async function addProject(createProject: CreateProjectRequest & { 'project-name': string }) {
  try {
    await functions.createProject(createProject['project-name'], notify);
  } catch (error) {
    console.error(error);
  } finally {
    await loadProjects();
  }
}

async function renameProject(renamedProject: RenameProjectRequest & { 'project-id': string }) {
  try {
    await functions.renameProject(renamedProject, renamedProject['project-id'], notify);

    // Update the selected project name if this is the currently selected project
    if (visual.projectSelected['project-id'] === renamedProject['project-id']) {
      visual.projectSelected['project-name'] = renamedProject['new-name'];
    }
  } catch (error) {
    console.error(error);
  } finally {
    await loadProjects();
  }
}
onMounted(async () => {
  if (userStorage.isAuthenticated) {
    await init();
  }
});
</script>
