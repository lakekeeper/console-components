<template>
  <div>
    <v-btn-toggle
      :model-value="type"
      mandatory
      density="compact"
      variant="outlined"
      class="mb-3"
      @update:model-value="onTypeChange">
      <v-btn value="user" size="small" prepend-icon="mdi-account">User</v-btn>
      <v-btn value="role" size="small" prepend-icon="mdi-account-group">Role</v-btn>
    </v-btn-toggle>

    <!-- Project selector for role search (roles are project-scoped) -->
    <v-select
      v-if="type === 'role' && userProjects.length > 1"
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

    <v-autocomplete
      v-if="!byId"
      :model-value="modelValue"
      :items="candidates"
      :loading="searching"
      :search="search"
      item-title="title"
      item-value="id"
      return-object
      label="Search by name"
      placeholder="Type to search"
      no-filter
      density="compact"
      variant="outlined"
      hide-details
      @update:search="onSearch"
      @update:model-value="$emit('update:modelValue', $event)"></v-autocomplete>

    <v-text-field
      v-else
      v-model="idInput"
      label="Paste an identifier"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      :loading="searching"
      @update:model-value="onIdSearch"></v-text-field>

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

export interface SelectedPrincipal {
  id: string;
  title: string;
  type: 'user' | 'role';
}

const props = defineProps<{
  modelValue: SelectedPrincipal | null;
  /** A role id to exclude from role results (e.g. the role being edited). */
  excludeRoleId?: string;
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

// Project selector (role search only)
const userProjects = reactive<any[]>([]);
const loadingProjects = ref(false);
const selectedProject = ref<string | null>(null);
const currentProjectId = computed(() => visual.projectSelected['project-id'] || null);

async function loadProjects() {
  if (userProjects.length) return;
  loadingProjects.value = true;
  try {
    const projects = await functions.loadProjectList();
    userProjects.splice(0, userProjects.length, ...projects);
    if (!selectedProject.value) {
      selectedProject.value =
        projects.length === 1 ? projects[0]['project-id'] : currentProjectId.value;
    }
  } catch {
    /* surfaced by the functions plugin */
  } finally {
    loadingProjects.value = false;
  }
}

function onTypeChange(v: 'user' | 'role') {
  type.value = v;
  emit('update:modelValue', null);
  candidates.value = [];
  search.value = '';
  idInput.value = '';
  if (v === 'role') loadProjects();
}

function looksLikeId(s: string): boolean {
  return /~/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^[A-Za-z0-9_-]{16,}$/.test(s);
}

let timer: ReturnType<typeof setTimeout> | null = null;
function onSearch(q: string) {
  search.value = q;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => runSearch(q), 250);
}
function rerun() {
  runSearch(search.value);
}

async function runSearch(q: string) {
  if (!q) {
    candidates.value = [];
    return;
  }
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
        .map((r: any) => ({ id: r.id, type: 'role' as const, title: r.name || r.ident || r.id }));
    }
    if (looksLikeId(q) && !list.some((c) => c.id === q)) {
      const resolved = await resolveById(q);
      if (resolved) list.unshift(resolved);
    }
    candidates.value = list;
  } catch {
    candidates.value = [];
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
      emit('update:modelValue', null);
      return;
    }
    searching.value = true;
    try {
      const resolved = await resolveById(v);
      emit('update:modelValue', resolved);
    } finally {
      searching.value = false;
    }
  }, 300);
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
        return { id: r.id, type: 'role', title: r.name || r.id };
      }
    }
  } catch {
    /* not a resolvable id */
  }
  return null;
}

watch(byId, () => {
  emit('update:modelValue', null);
  idInput.value = '';
});

onMounted(() => {
  if (type.value === 'role') loadProjects();
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
  if (idTimer) clearTimeout(idTimer);
});
</script>
