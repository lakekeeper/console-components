<template>
  <div
    ref="paneRef"
    class="d-flex flex-column"
    :style="{ height: paneHeight ?? '60vh', minHeight: 0 }">
    <!-- Identity row. The actions addressing the project as a whole sit on the
         line that names it, not in a tab's toolbar where they would read as
         acting on whatever that tab is showing. -->
    <div class="d-flex flex-wrap align-center mb-2" style="gap: 8px; flex: 0 0 auto">
      <v-btn
        icon="mdi-arrow-left"
        size="small"
        variant="text"
        :to="'/projects'"
        aria-label="Back to projects"></v-btn>
      <v-icon color="secondary">mdi-home-silo</v-icon>
      <span class="text-subtitle-1 font-weight-medium">{{ projectName || projectId }}</span>
      <v-chip v-if="isActive" size="x-small" label color="primary" variant="flat">active</v-chip>
      <v-chip size="x-small" label variant="tonal" class="text-caption">
        {{ projectId }}
        <v-tooltip activator="parent" location="bottom">Project ID</v-tooltip>
      </v-chip>

      <v-spacer></v-spacer>

      <v-btn
        v-if="!isActive"
        size="small"
        variant="tonal"
        class="text-none"
        prepend-icon="mdi-check-circle-outline"
        @click="activate">
        Activate
        <v-tooltip activator="parent" location="bottom">
          Make this the project the rest of the console acts on
        </v-tooltip>
      </v-btn>

      <ProjectNameAddOrEditDialog
        v-if="canRename"
        :id="projectId"
        :action-type="'edit'"
        :name="projectName"
        @emit-project-new-name="renameProject" />

      <!-- Deleting the project every other pane is reading leaves the console
           pointed at nothing, so it is offered only on a project that is not
           the active one. -->
      <DeleteConfirmDialog
        v-if="canDelete && !isActive"
        :type="'project'"
        :name="projectName"
        @confirmed="deleteProject"></DeleteConfirmDialog>
    </div>

    <v-tabs v-model="activeTab" style="flex: 0 0 auto">
      <v-tab value="overview">overview</v-tab>
      <v-tab v-if="showPermissionsTab" value="permissions">permissions</v-tab>
      <v-tab v-if="grantsSupported" value="grants">grants</v-tab>
      <v-tab v-if="showStatisticsTab" value="statistics">statistics</v-tab>
    </v-tabs>

    <v-tabs-window
      v-model="activeTab"
      style="flex: 1 1 auto; min-height: 0; overflow-y: auto"
      class="pt-2">
      <v-tabs-window-item value="overview">
        <v-list lines="two" density="compact">
          <v-list-item :title="projectName" :subtitle="`ID: ${projectId}`">
            <template #prepend>
              <v-icon color="secondary">mdi-home-silo</v-icon>
            </template>
          </v-list-item>
        </v-list>

        <v-divider class="my-3"></v-divider>

        <!-- Tasks are not a tab here. The maintenance dashboard is already the
             project-scoped view of them, with the per-warehouse configuration
             beside it; a second, thinner copy on this page would be the same
             question answered worse in two places. -->
        <v-list density="compact" class="py-0">
          <v-list-item
            :to="isActive ? '/maintenance' : undefined"
            :disabled="!isActive"
            prepend-icon="mdi-wrench-clock"
            title="Maintenance & tasks"
            :subtitle="
              isActive
                ? 'Task status and per-warehouse maintenance configuration'
                : 'Activate this project to open its maintenance dashboard'
            ">
            <template #append>
              <v-icon v-if="isActive" size="small">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
          <v-list-item
            :to="isActive ? '/warehouse' : undefined"
            :disabled="!isActive"
            prepend-icon="mdi-database"
            title="Warehouses"
            :subtitle="
              isActive
                ? 'The warehouses this project holds'
                : 'Activate this project to list its warehouses'
            ">
            <template #append>
              <v-icon v-if="isActive" size="small">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-tabs-window-item>

      <v-tabs-window-item v-if="showPermissionsTab" value="permissions">
        <PermissionManager
          v-if="activeTab === 'permissions'"
          :object-id="projectId"
          :relation-type="permissionType" />
      </v-tabs-window-item>

      <v-tabs-window-item v-if="grantsSupported" value="grants" style="height: 100%">
        <!-- Named rather than implied: this page can be open on a project that
             is not the selected one, and GrantsPanel falls back to the
             selection when the ref carries no id. -->
        <div class="pa-1 d-flex flex-column" style="height: 100%; min-height: 0">
          <div style="flex: 1 1 auto; min-height: 0; overflow: hidden">
            <GrantsPanel
              v-if="activeTab === 'grants'"
              :resource="{ type: 'project', projectId }"
              :resource-name="projectName" />
          </div>
        </div>
      </v-tabs-window-item>

      <v-tabs-window-item v-if="showStatisticsTab" value="statistics" style="height: 100%">
        <!-- The statistics endpoint takes no project: it answers for whichever
             project the session has selected. Rather than show another
             project's numbers under this one's name, the tab says so. -->
        <v-alert v-if="!isActive" type="info" variant="tonal" density="compact" class="ma-2">
          Statistics are reported for the active project. Activate
          <strong>{{ projectName }}</strong>
          to see its numbers.
        </v-alert>
        <ProjectStatistics v-else ref="projectStatisticsRef" />
      </v-tabs-window-item>
    </v-tabs-window>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useVisualStore } from '../stores/visual';
import { useFunctions } from '../plugins/functions';
import { useProjectPermissions } from '../composables/useCatalogPermissions';
import { useProjectAuthorizerPermissions } from '../composables/useAuthorizerPermissions';
import { useGrantsSupported } from '../composables/useGrants';
import { usePaneHeight } from '../common/paneHeight';
import { RelationType } from '../common/interfaces';
import { RenameProjectRequest } from '../gen/management/types.gen';
import ProjectNameAddOrEditDialog from './ProjectNameAddOrEditDialog.vue';
import DeleteConfirmDialog from './DeleteConfirmDialog.vue';
import GrantsPanel from './GrantsPanel.vue';
import ProjectStatistics from './ProjectStatistics.vue';

const props = defineProps<{ projectId: string }>();

// Measured rather than a constant: the identity row above the tabs wraps to a
// second line on a narrow window, and a formula cannot know when it has.
const { paneRef, paneHeight } = usePaneHeight();

const router = useRouter();
const visual = useVisualStore();
const functions = useFunctions();
const notify = true;

const permissionType = RelationType.Project;

const TABS = ['overview', 'permissions', 'grants', 'statistics'] as const;

const activeTab = ref('overview');

/**
 * `?tab=` is for sharing a link; nothing here depends on it having been read.
 *
 * Written with `history.replaceState` rather than `router.replace`, which from
 * inside a component runs the app's guard pipeline and does not reliably land.
 * A tab named in the address bar is held until the flag that shows it resolves
 * — `permissions`, `grants` and `statistics` each appear only once the server
 * has answered, and selecting one before then lands on `overview` instead,
 * which reads as the tab having disappeared.
 */
const requestedTab = ref<string | null>(null);

function writeTabToUrl(tab: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (tab === 'overview') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', url);
}

function tabAvailable(tab: string): boolean {
  if (tab === 'permissions') return showPermissionsTab.value;
  if (tab === 'grants') return grantsSupported.value;
  if (tab === 'statistics') return showStatisticsTab.value;
  return tab === 'overview';
}

const projectId = computed(() => props.projectId);
const isActive = computed(() => visual.projectSelected['project-id'] === props.projectId);

const projectName = ref('');
const actions = ref<string[]>([]);

const canRename = computed(() => actions.value.includes('rename'));
const canDelete = computed(() => actions.value.includes('delete'));

const { showStatisticsTab } = useProjectPermissions(projectId);
const { showPermissionsTab } = useProjectAuthorizerPermissions(projectId);
// Null while the server is still being asked, which is not the same as no.
const serverGrantsSupported = useGrantsSupported();
const grantsSupported = computed(() => serverGrantsSupported.value === true);

const projectStatisticsRef = ref<InstanceType<typeof ProjectStatistics> | null>(null);

async function load() {
  try {
    const project = await functions.getProject(props.projectId);
    projectName.value = project?.['project-name'] ?? '';
  } catch {
    // A project the reader cannot read is reported by the functions plugin;
    // the page still has an id to show, which is what the header falls back to.
    projectName.value = '';
  }
  try {
    const granted = await functions.getProjectCatalogActionsFor(props.projectId, false);
    actions.value = granted.map((permission) => permission.action);
  } catch {
    actions.value = [];
  }
}

function activate() {
  visual.setProjectSelected({ 'project-id': props.projectId, 'project-name': projectName.value });
  // Stay here. Unlike the list, this page is about this project, and the switch
  // is what makes its statistics and its links work.
}

async function renameProject(renamed: RenameProjectRequest & { 'project-id': string }) {
  try {
    await functions.renameProject(renamed, renamed['project-id'], notify);
    projectName.value = renamed['new-name'];
    if (isActive.value) visual.projectSelected['project-name'] = renamed['new-name'];
  } catch (error) {
    console.error(error);
  }
}

async function deleteProject() {
  try {
    await functions.deleteProject(props.projectId, notify);
    router.push('/projects');
  } catch (error) {
    console.error(error);
  }
}

watch(() => props.projectId, load);

watch(activeTab, (tab) => writeTabToUrl(tab));

// The held tab lands as soon as the flag that shows it turns true, and is
// dropped once every flag has settled — otherwise a link naming a tab this
// deployment does not offer would keep waiting for it forever.
watch(
  () => [showPermissionsTab.value, grantsSupported.value, showStatisticsTab.value] as const,
  () => {
    const wanted = requestedTab.value;
    if (!wanted) return;
    if (tabAvailable(wanted)) {
      activeTab.value = wanted;
      requestedTab.value = null;
    } else if (serverGrantsSupported.value !== null) {
      requestedTab.value = null;
    }
  },
);

watch(
  () => [activeTab.value, isActive.value] as const,
  async ([tab, active]) => {
    if (tab === 'statistics' && active) await projectStatisticsRef.value?.loadStatistics();
  },
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    const wanted = new URL(window.location.href).searchParams.get('tab');
    if (wanted && (TABS as readonly string[]).includes(wanted)) {
      if (tabAvailable(wanted)) activeTab.value = wanted;
      else requestedTab.value = wanted;
    }
  }
  load();
});

// A `?tab=` left behind on another page reads as having selected a tab there.
onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('tab')) return;
  url.searchParams.delete('tab');
  window.history.replaceState(window.history.state, '', url);
});
</script>
