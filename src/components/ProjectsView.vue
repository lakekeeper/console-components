<template>
  <div
    ref="paneRef"
    class="d-flex flex-column"
    :style="{ height: paneHeight ?? '60vh', minHeight: 0 }">
    <!-- The toolbar acts on the list: a filter over rows already loaded, and
         the one thing you can do to the set as a whole. -->
    <v-toolbar color="transparent" density="compact" flat style="flex: 0 0 auto">
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
      <v-spacer></v-spacer>
      <ProjectNameAddOrEditDialog
        v-if="canCreateProject"
        :id="''"
        :action-type="'add'"
        :name="''"
        @emit-project-create="addProject" />
      <v-btn icon size="small" variant="text" :loading="loading" @click="loadProjects">
        <v-icon>mdi-refresh</v-icon>
        <v-tooltip activator="parent" location="bottom">Re-read the project list</v-tooltip>
      </v-btn>
    </v-toolbar>

    <div style="flex: 1 1 auto; min-height: 0; overflow: hidden">
      <v-data-table
        :headers="headers"
        :items="filteredProjects"
        item-value="project-id"
        :loading="loading"
        :sort-by="[{ key: 'project-name', order: 'asc' }]"
        density="compact"
        fixed-header
        hover
        height="100%"
        style="height: 100%"
        @click:row="onRowClick">
        <template #item.project-name="{ item }">
          <!-- Each row asks for its own actions as it scrolls into view: a
               deployment with hundreds of projects should not spend hundreds of
               requests answering a question about rows nobody has looked at. -->
          <div
            v-intersect="(visible: boolean) => onRowVisible(item, visible)"
            class="d-flex align-center">
            <v-icon size="small" class="mr-2" color="secondary">mdi-home-silo</v-icon>
            {{ item['project-name'] }}
            <v-chip
              v-if="item['project-id'] === selectedProjectId"
              size="x-small"
              label
              color="primary"
              variant="flat"
              class="ml-2">
              active
            </v-chip>
          </div>
        </template>

        <template #item.project-id="{ item }">
          <span class="text-caption text-medium-emphasis">{{ item['project-id'] }}</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-inline-flex ga-2 align-center" @click.stop>
            <v-btn
              v-if="item['project-id'] !== selectedProjectId"
              size="small"
              variant="text"
              class="text-none"
              @click="activateProject(item)">
              Activate
              <v-tooltip activator="parent" location="top">
                Make this the project the rest of the console acts on
              </v-tooltip>
            </v-btn>

            <ProjectNameAddOrEditDialog
              v-if="canRename(item)"
              :id="item['project-id']"
              :action-type="'edit'"
              :name="item['project-name']"
              @emit-project-new-name="renameProject" />

            <!-- The active project is not offered for deletion here: deleting
                 what every other pane is currently reading leaves the console
                 pointed at nothing, and the list is the wrong place to discover
                 that. Activate something else first. -->
            <DeleteConfirmDialog
              v-if="canDelete(item) && item['project-id'] !== selectedProjectId"
              :type="'project'"
              :name="item['project-name']"
              @confirmed="deleteProject(item)"></DeleteConfirmDialog>
          </div>
        </template>

        <template #no-data>
          <v-empty-state
            icon="mdi-folder-off-outline"
            :title="searchQuery ? 'No projects match the filter' : 'No projects available'"
            size="small"></v-empty-state>
        </template>
      </v-data-table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useVisualStore } from '../stores/visual';
import { useFunctions } from '../plugins/functions';
import { useServerPermissions } from '../composables/useCatalogPermissions';
import { usePaneHeight } from '../common/paneHeight';
import {
  CreateProjectRequest,
  GetProjectResponse,
  RenameProjectRequest,
} from '../gen/management/types.gen';
import { Header } from '../common/interfaces';
import ProjectNameAddOrEditDialog from './ProjectNameAddOrEditDialog.vue';
import DeleteConfirmDialog from './DeleteConfirmDialog.vue';

type ProjectRow = GetProjectResponse;

// The list ends at the viewport rather than at a constant: the page above it
// carries a heading in one app and may not in another.
const { paneRef, paneHeight } = usePaneHeight();

const router = useRouter();
const visual = useVisualStore();
const functions = useFunctions();
const notify = true;

const serverId = computed(() => visual.getServerInfo()['server-id']);
const { canCreateProject } = useServerPermissions(serverId);

const selectedProjectId = computed(() => visual.projectSelected['project-id']);

const loading = ref(false);
const searchQuery = ref('');
const projects = reactive<ProjectRow[]>([]);

// Actions per project id, filled as rows come into view. A project absent from
// the map has not been asked about yet, which is not the same as "no actions" —
// so the row offers nothing until its answer arrives rather than flashing
// controls that then disappear.
const actionsById = reactive<Record<string, string[]>>({});
const actionsInFlight = new Set<string>();

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'project-name', align: 'start' },
  { title: 'ID', key: 'project-id', align: 'start' },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

const filteredProjects = computed(() => {
  const query = searchQuery.value?.toLowerCase().trim();
  if (!query) return projects;
  return projects.filter(
    (p) =>
      p['project-name'].toLowerCase().includes(query) ||
      p['project-id'].toLowerCase().includes(query),
  );
});

function canRename(item: ProjectRow): boolean {
  return actionsById[item['project-id']]?.includes('rename') ?? false;
}

function canDelete(item: ProjectRow): boolean {
  return actionsById[item['project-id']]?.includes('delete') ?? false;
}

async function onRowVisible(item: ProjectRow, visible: boolean) {
  const id = item['project-id'];
  if (!visible || id in actionsById || actionsInFlight.has(id)) return;
  actionsInFlight.add(id);
  try {
    // notify=false: a project the reader may not administer answers 403, and
    // that is the answer, not an error worth a snackbar.
    const granted = await functions.getProjectCatalogActionsFor(id, false);
    actionsById[id] = granted.map((permission) => permission.action);
  } catch {
    actionsById[id] = [];
  } finally {
    actionsInFlight.delete(id);
  }
}

function onRowClick(_event: unknown, payload: { item: ProjectRow }) {
  router.push(`/projects/${payload.item['project-id']}`);
}

async function loadProjects() {
  loading.value = true;
  try {
    projects.splice(0, projects.length, ...((await functions.loadProjectList()) ?? []));
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function activateProject(item: ProjectRow) {
  visual.setProjectSelected(item);
  // Home, not this page: every other pane in the console reads the selection,
  // and staying here would leave the reader on the one page where the switch
  // changes almost nothing.
  router.push('/');
}

async function addProject(createProject: CreateProjectRequest) {
  try {
    await functions.createProject(createProject['project-name'], notify);
  } catch (error) {
    console.error(error);
  } finally {
    await loadProjects();
  }
}

async function renameProject(renamed: RenameProjectRequest & { 'project-id': string }) {
  try {
    await functions.renameProject(renamed, renamed['project-id'], notify);
    if (visual.projectSelected['project-id'] === renamed['project-id']) {
      visual.projectSelected['project-name'] = renamed['new-name'];
    }
  } catch (error) {
    console.error(error);
  } finally {
    await loadProjects();
  }
}

async function deleteProject(item: ProjectRow) {
  try {
    await functions.deleteProject(item['project-id'], notify);
  } catch (error) {
    console.error(error);
  } finally {
    delete actionsById[item['project-id']];
    await loadProjects();
  }
}

onMounted(loadProjects);
</script>
