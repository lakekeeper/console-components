<template>
  <div>
    <v-btn-toggle
      v-if="!usersOnly"
      :model-value="type"
      mandatory
      density="compact"
      variant="outlined"
      class="mb-3"
      @update:model-value="onTypeChange">
      <v-btn value="user" size="small" prepend-icon="mdi-account">User</v-btn>
      <v-btn value="role" size="small" prepend-icon="mdi-account-group">Role</v-btn>
    </v-btn-toggle>

    <!-- Role search is offered only in projects that allow it. While that is
         being asked, say so rather than offering every project. -->
    <div
      v-if="type === 'role' && loadingProjects"
      class="d-flex align-center ga-2 mb-3 text-caption text-medium-emphasis">
      <v-progress-circular indeterminate size="16" width="2"></v-progress-circular>
      Checking which projects you may search roles in…
    </div>
    <v-alert
      v-if="type === 'role' && projectListError && !loadingProjects"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-lock-outline"
      class="mb-3"
      :text="projectListError"></v-alert>

    <!-- Project selector for role search (roles are project-scoped) -->
    <v-select
      v-if="type === 'role' && !lockProjectId && !loadingProjects && userProjects.length > 1"
      v-model="selectedProject"
      :items="userProjects"
      item-title="project-name"
      item-value="project-id"
      label="Project"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-3"
      :loading="loadingProjects"
      no-data-text="No projects available"
      prepend-inner-icon="mdi-folder-account"
      @update:model-value="rerun">
      <template #item="{ props: ip, item }">
        <v-list-item v-bind="ip">
          <template #title>
            {{ item.raw['project-name'] }} ({{ item.raw['project-id'] }})
            <span
              v-if="item.raw['project-id'] === currentProjectId"
              class="text-primary text-caption">
              · active
            </span>
          </template>
        </v-list-item>
      </template>
      <template #selection="{ item }">
        {{ item.raw['project-name'] }} ({{ item.raw['project-id'] }})
      </template>
    </v-select>

    <div class="d-flex align-center">
      <v-spacer></v-spacer>
      <v-switch
        v-model="byId"
        label="By ID"
        density="compact"
        hide-details
        inset
        color="primary"></v-switch>
    </div>

    <!-- Some projects could not be checked; the others are still offered. -->
    <v-alert
      v-if="type === 'role' && roleCheckError && !loadingProjects && !roleCheckBlocked"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      :text="roleCheckError">
      <template #append>
        <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="loadProjects">
          Retry
        </v-btn>
      </template>
    </v-alert>

    <!-- Nowhere to search: said in place of a search that can only be refused. -->
    <v-alert
      v-if="roleSearchRefused"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-lock-outline"
      text="You are not allowed to search roles here."></v-alert>

    <!-- The check failed and left nowhere to search: said in place of the
         search, which could only come back empty. Not a refusal, so it says
         what went wrong and offers to ask again. -->
    <div v-else-if="roleCheckBlocked">
      <v-alert
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-2"
        :text="roleCheckError"></v-alert>
      <v-btn size="small" variant="outlined" prepend-icon="mdi-refresh" @click="loadProjects">
        Retry
      </v-btn>
    </div>

    <v-autocomplete
      v-else-if="!byId"
      :model-value="modelValue"
      :items="candidates"
      :loading="searching"
      :search="search"
      item-title="title"
      item-value="id"
      return-object
      :item-props="assignedItemProps"
      :label="type === 'role' && lockProjectId ? 'Search roles by name' : 'Search by name'"
      placeholder="Type to search"
      :hint="type === 'role' && lockProjectId ? lockedProjectHint : undefined"
      :persistent-hint="type === 'role' && !!lockProjectId"
      no-filter
      density="compact"
      variant="outlined"
      :hide-details="!(type === 'role' && lockProjectId)"
      :no-data-text="searchError || `No ${type}s found`"
      @update:search="onSearch"
      @update:model-value="$emit('update:modelValue', $event)"></v-autocomplete>

    <v-text-field
      v-else
      v-model="idInput"
      label="Paste an identifier"
      density="compact"
      variant="outlined"
      hide-details="auto"
      :messages="idAssignedTitle ? `${idAssignedTitle}: ${assignedLabel}` : undefined"
      clearable
      :loading="searching"
      @update:model-value="onIdSearch"></v-text-field>

    <!-- A refused search is not "no such principal": kept visible under the
         field, since the menu that would carry it closes on blur. -->
    <v-alert
      v-if="searchError && !roleSearchRefused"
      type="info"
      variant="tonal"
      density="compact"
      icon="mdi-lock-outline"
      class="mt-2"
      :text="searchError"></v-alert>

    <div v-if="modelValue" class="text-caption text-medium-emphasis mt-2">
      Selected:
      <strong>{{ modelValue.title }}</strong>
      · {{ modelValue.id }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, computed, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { hasAction } from '../composables/useCatalogPermissions';
import { isForbiddenError } from '../common/errorUtils';
import { tagRefusal } from '../composables/useTagRights';

export interface SelectedPrincipal {
  id: string;
  title: string;
  type: 'user' | 'role';
  /** Roles are project-scoped; callers that care which project need to know. */
  projectId?: string;
}

const props = defineProps<{
  modelValue: SelectedPrincipal | null;
  /** A role id to exclude from role results (e.g. the role being edited). */
  excludeRoleId?: string;
  /**
   * Principals already in place (e.g. a role's direct members). Still listed —
   * a search that finds nothing reads as "no such user" — but not selectable.
   */
  assignedIds?: string[];
  /** What to say about an assigned principal. Defaults to "Already a member". */
  assignedLabel?: string;
  /**
   * Pins role search to one project and takes the chooser away. For callers
   * whose target only accepts principals from a single project — offering the
   * others would just be a slower way to reach a server-side rejection.
   */
  lockProjectId?: string;
  /**
   * Offers users only, for a target that refuses roles. The host says why next
   * to the search.
   */
  usersOnly?: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: SelectedPrincipal | null): void;
}>();

const functions = useFunctions();
const visual = useVisualStore();

const type = ref<'user' | 'role'>('user');
const byId = ref(false);
const idInput = ref('');
const search = ref('');
const searching = ref(false);
const candidates = ref<SelectedPrincipal[]>([]);
// Set when the last search was refused or failed, so it does not read as "none found".
const searchError = ref('');

// Project selector (role search only)
const userProjects = reactive<any[]>([]);
const loadingProjects = ref(false);
const selectedProject = ref<string | null>(null);
// Set when the project listing itself was refused; role search still works in
// the active project, so this qualifies the picker rather than replacing it.
const projectListError = ref('');
// Whether the projects have been checked and none of them allow role search.
const projectsChecked = ref(false);
// Set when a project could not be checked for role search at all, so a failure
// does not read as a refusal.
const roleCheckError = ref('');
const roleSearchRefused = computed(
  () =>
    type.value === 'role' &&
    projectsChecked.value &&
    !loadingProjects.value &&
    !selectedProject.value &&
    !roleCheckError.value,
);
// A failed check left no project to search in.
const roleCheckBlocked = computed(
  () =>
    type.value === 'role' &&
    !loadingProjects.value &&
    !!roleCheckError.value &&
    !selectedProject.value,
);
const currentProjectId = computed(() => visual.projectSelected['project-id'] || null);
const lockedProjectHint = computed(
  () => `Only roles in ${lockedProjectLabel.value} — roles are project-scoped.`,
);
/**
 * A name, never an id: this reads inside a sentence. The project list arrives
 * asynchronously, so the store answers for the active project immediately and
 * the list only has to cover the rest — otherwise the hint would show a uuid
 * for a moment and then swap it for a name.
 */
const lockedProjectLabel = computed(() => {
  const match = userProjects.find((p: any) => p['project-id'] === props.lockProjectId);
  if (match?.['project-name']) return match['project-name'];
  if (props.lockProjectId === visual.projectSelected['project-id']) {
    return visual.projectSelected['project-name'] || 'the active project';
  }
  return 'the selected project';
});

/**
 * Whether this project lets the caller search its roles (`search_roles`): yes,
 * no, or the failure that kept the question from being answered. Only a 403 is
 * a no; an authorizer or network failure says nothing about the caller's rights.
 */
async function maySearchRoles(projectId: string): Promise<boolean | { error: unknown }> {
  try {
    // notify=false: a project the reader may not search answers 403, and that
    // is the answer, not an error worth a snackbar.
    const actions = await functions.getProjectCatalogActionsFor(projectId, false);
    return hasAction(actions, 'search_roles');
  } catch (e) {
    return isForbiddenError(e) ? false : { error: e };
  }
}

async function loadProjects() {
  // A failed check is asked again (Retry, or the next switch to roles); an
  // answer is kept.
  if ((projectsChecked.value && !roleCheckError.value) || loadingProjects.value) return;
  loadingProjects.value = true;
  projectListError.value = '';
  try {
    let projects: any[] = [];
    if (props.lockProjectId) {
      // Pinned: only that project matters, and only whether it may be searched.
      const match = visual.projectList.find((p: any) => p['project-id'] === props.lockProjectId);
      projects = [match ?? { 'project-id': props.lockProjectId, 'project-name': '' }];
    } else {
      try {
        projects = (await functions.loadProjectList()) ?? [];
      } catch (e) {
        // The active project is still one the reader works in; offer that.
        projectListError.value = isForbiddenError(e)
          ? 'You are not permitted to list projects.'
          : tagRefusal(e, 'list projects');
        projects = visual.projectSelected['project-id'] ? [{ ...visual.projectSelected }] : [];
      }
    }
    // Only projects where the search can succeed are offered.
    const answers = await Promise.all(projects.map((p) => maySearchRoles(p['project-id'])));
    const searchable = projects.filter((_, i) => answers[i] === true);
    const failed = answers.find((a): a is { error: unknown } => typeof a === 'object');
    roleCheckError.value = failed
      ? tagRefusal(
          failed.error,
          props.lockProjectId
            ? 'check whether you may search roles here'
            : 'check whether you may search roles in every project',
        )
      : '';
    userProjects.splice(0, userProjects.length, ...searchable);
    const ids = new Set(searchable.map((p) => p['project-id']));
    if (props.lockProjectId) {
      selectedProject.value = ids.has(props.lockProjectId) ? props.lockProjectId : null;
    } else if (!selectedProject.value || !ids.has(selectedProject.value)) {
      selectedProject.value =
        currentProjectId.value && ids.has(currentProjectId.value)
          ? currentProjectId.value
          : (searchable[0]?.['project-id'] ?? null);
    }
  } finally {
    projectsChecked.value = true;
    loadingProjects.value = false;
  }
}

function onTypeChange(v: 'user' | 'role') {
  type.value = v;
  emit('update:modelValue', null);
  candidates.value = [];
  searchError.value = '';
  search.value = '';
  idInput.value = '';
  if (v === 'role') loadProjects();
}

// User ids are always `<idp_id>~<user-id>`, role ids are UUIDs. Anything looser
// catches plain names (`service-account-spark`) and the lookup comes back 400.
function looksLikeId(s: string): boolean {
  return type.value === 'user'
    ? /^[^~\s]+~\S+$/.test(s)
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

let timer: ReturnType<typeof setTimeout> | null = null;
function onSearch(q: string) {
  search.value = q;
  if (timer) clearTimeout(timer);
  // Picking an item writes its title into the search box; that is not a query.
  if (props.modelValue && q === props.modelValue.title) return;
  timer = setTimeout(() => runSearch(q), 250);
}
function rerun() {
  runSearch(search.value);
}

async function runSearch(q: string) {
  if (!q) {
    candidates.value = [];
    searchError.value = '';
    return;
  }
  if (type.value === 'role' && (loadingProjects.value || !selectedProject.value)) return;
  searching.value = true;
  try {
    let list: SelectedPrincipal[] = [];
    if (type.value === 'user') {
      const users = await functions.searchUser(q);
      list = (users ?? []).map((u: any) => ({
        id: u.id,
        type: 'user' as const,
        title: `${u.name || u['preferred_username'] || u.id}${u.email ? ` · ${u.email}` : ''}`,
      }));
    } else {
      const req: any = { search: q };
      if (selectedProject.value) req['project-id'] = selectedProject.value;
      const roles = await functions.searchRole(req);
      list = (roles ?? [])
        .filter((r: any) => r.id !== props.excludeRoleId)
        .map((r: any) => ({
          id: r.id,
          type: 'role' as const,
          title: r.name || r.ident || r.id,
          projectId: r['project-id'] ?? selectedProject.value ?? undefined,
        }));
    }
    if (looksLikeId(q) && !list.some((c) => c.id === q)) {
      const resolved = await resolveById(q);
      if (resolved) list.unshift(resolved);
    }
    candidates.value = list;
    searchError.value = '';
  } catch (e) {
    candidates.value = [];
    searchError.value = isForbiddenError(e)
      ? `You are not allowed to search ${type.value}s here.`
      : tagRefusal(e, `search ${type.value}s`);
  } finally {
    searching.value = false;
  }
}

let idTimer: ReturnType<typeof setTimeout> | null = null;
function onIdSearch(v: string) {
  idInput.value = v;
  if (idTimer) clearTimeout(idTimer);
  idTimer = setTimeout(async () => {
    if (!v) {
      idAssignedTitle.value = '';
      searching.value = false;
      emit('update:modelValue', null);
      return;
    }
    searching.value = true;
    try {
      const resolved = await resolveById(v);
      // The debounce only delays the start; a lookup already in flight can
      // still answer after the input changed, and must not overwrite it.
      if (v !== idInput.value) return;
      const assigned = !!resolved && isAssigned(resolved.id);
      idAssignedTitle.value = assigned ? resolved!.title : '';
      emit('update:modelValue', assigned ? null : resolved);
    } finally {
      if (v === idInput.value) searching.value = false;
    }
  }, 300);
}

const assignedLabel = computed(() => props.assignedLabel ?? 'Already a member');
// Set when a pasted id resolves to an assigned principal, which is then not selected.
const idAssignedTitle = ref('');

function isAssigned(id: string): boolean {
  return !!props.assignedIds?.includes(id);
}

function assignedItemProps(item: SelectedPrincipal) {
  return isAssigned(item.id) ? { disabled: true, subtitle: assignedLabel.value } : {};
}

async function resolveById(id: string): Promise<SelectedPrincipal | null> {
  try {
    if (type.value === 'user') {
      const u: any = await functions.getUser(id);
      if (u?.id) {
        return {
          id: u.id,
          type: 'user',
          title: `${u.name || u['preferred_username'] || u.id}${u.email ? ` · ${u.email}` : ''}`,
        };
      }
    } else {
      const r: any = await functions.getRoleMetadata(id);
      if (r?.id && r.id !== props.excludeRoleId) {
        return {
          id: r.id,
          type: 'role',
          title: r.name || r.id,
          projectId: r['project-id'] ?? selectedProject.value ?? undefined,
        };
      }
    }
  } catch {
    /* not a resolvable id */
  }
  return null;
}

// Turning `usersOnly` on drops an open role search.
watch(
  () => props.usersOnly,
  (only) => {
    if (only && type.value === 'role') onTypeChange('user');
  },
);

watch(byId, () => {
  emit('update:modelValue', null);
  idInput.value = '';
  idAssignedTitle.value = '';
});

onMounted(() => {
  if (props.lockProjectId) selectedProject.value = props.lockProjectId;
  if (type.value === 'role') loadProjects();
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
  if (idTimer) clearTimeout(idTimer);
});
</script>
