<template>
  <v-card>
    <v-toolbar class="mb-4" color="transparent" density="compact" flat>
      <template #prepend>
        <v-btn
          v-if="canListTags"
          size="small"
          variant="tonal"
          color="primary"
          class="mr-2"
          :prepend-icon="filtersCollapsed ? 'mdi-menu' : 'mdi-menu-open'"
          :text="filtersCollapsed ? 'Show filters' : 'Hide filters'"
          @click="filtersCollapsed = !filtersCollapsed"></v-btn>
        <v-icon>mdi-tag-multiple-outline</v-icon>
      </template>
      <v-toolbar-title>
        <span class="text-subtitle-1">Tag Definitions</span>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        title="Refresh"
        :loading="loading"
        @click="loadDefinitions"></v-btn>
      <TagDefinitionDialog v-if="canCreateTag" action-type="add" @submit="createDefinition" />
    </v-toolbar>

    <div v-if="canListTags" class="d-flex" style="height: calc(100vh - 300px)">
      <!-- Left: collapsible faceted filter rail -->
      <v-expand-x-transition>
        <div
          v-show="!filtersCollapsed"
          class="pa-3 flex-shrink-0"
          style="
            width: 220px;
            overflow-y: auto;
            border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12);
          ">
          <v-text-field
            v-model="search"
            label="Filter text"
            prepend-inner-icon="mdi-magnify"
            placeholder="type to filter by name or description"
            variant="outlined"
            hide-details
            clearable
            density="compact"></v-text-field>

          <v-select
            v-model="kindFilter"
            class="mt-4"
            label="Kind"
            :items="kindOptions"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            clearable
            hide-details></v-select>

          <v-select
            v-model="scopeFilter"
            class="mt-4"
            label="Scope"
            :items="scopeOptions"
            variant="outlined"
            density="compact"
            multiple
            chips
            closable-chips
            clearable
            hide-details></v-select>

          <v-btn
            v-if="hasActiveFilters"
            class="mt-4"
            size="small"
            variant="text"
            prepend-icon="mdi-close"
            @click="clearFilters">
            Clear all
          </v-btn>
        </div>
      </v-expand-x-transition>

      <!-- Right: table -->
      <v-data-table
        class="flex-grow-1"
        style="min-width: 0"
        height="100%"
        fixed-header
        :headers="headers"
        hover
        :items="displayedDefinitions"
        :sort-by="[{ key: 'name', order: 'asc' }]"
        :loading="loading">
        <template #item.name="{ item }">
          <span style="display: flex; align-items: center">
            <v-icon class="mr-2" color="info">mdi-tag-outline</v-icon>
            {{ item.name }}
            <v-icon v-if="isSystem(item)" class="ml-2" size="x-small" color="grey">
              mdi-lock-outline
            </v-icon>
          </span>
        </template>
        <template #item.value-kind="{ item }">
          <v-chip size="x-small" variant="tonal">{{ item['value-kind'] }}</v-chip>
        </template>
        <template #item.scope="{ item }">
          <v-chip v-for="s in item.scope" :key="s" class="mr-1" size="x-small" variant="outlined">
            {{ s }}
          </v-chip>
        </template>
        <template #item.description="{ item }">
          <v-tooltip
            v-if="item.description && item.description.length > 50"
            :text="item.description"
            location="top"
            max-width="400">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">{{ item.description.slice(0, 50) }}…</span>
            </template>
          </v-tooltip>
          <span v-else>{{ item.description }}</span>
        </template>
        <template #item.actions="{ item }">
          <TagAttachmentsDialog :tag-definition-id="item.id" :name="item.name" />
          <template v-if="!isSystem(item) && canCreateTag">
            <TagDefinitionDialog
              action-type="edit"
              :definition="item"
              @submit="(input) => updateDefinition(item.id, input)" />
            <v-btn
              icon="mdi-delete-outline"
              color="error"
              size="x-small"
              variant="text"
              title="Delete"
              :loading="checkingId === item.id"
              @click="requestDelete(item)"></v-btn>
          </template>
        </template>
        <template #no-data>
          <span class="text-disabled">No tag definitions yet.</span>
        </template>
      </v-data-table>
    </div>
    <div v-else class="pa-4">You don't have permission to list tag definitions</div>

    <!-- Type-to-confirm, only opened once the tag is confirmed deletable. -->
    <v-dialog v-model="confirmDialog" max-width="500">
      <v-card title="Confirm deletion of tag definition">
        <v-card-text>
          <div class="ma-2">
            Please enter the name "{{ pendingDelete?.name }}" to confirm the deletion
          </div>
          <v-text-field
            v-model="confirmName"
            label="Tag definition name"
            maxlength="500"
            :placeholder="pendingDelete?.name"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="success"
            :disabled="confirmName !== pendingDelete?.name"
            text="Confirm"
            @click="doDelete"></v-btn>
          <v-btn color="error" text="Cancel" @click="confirmDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Shown when the tag is still applied somewhere (checked up front). -->
    <v-dialog v-model="inUseDialog" max-width="480">
      <v-card>
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="warning">mdi-alert-circle-outline</v-icon>
          Can't delete tag
        </v-card-title>
        <v-card-text>
          <strong>{{ inUseName }}</strong>
          is still applied to
          {{ inUseAttachments.length ? inUseAttachments.length : 'one or more' }}
          resource{{ inUseAttachments.length === 1 ? '' : 's' }}. Remove it from all targets, then
          try again.
          <v-list
            v-if="inUseAttachments.length"
            density="compact"
            class="mt-2"
            style="max-height: 240px; overflow-y: auto">
            <v-list-item v-for="(a, i) in inUseAttachments" :key="i">
              <template #prepend>
                <v-chip class="mr-2" size="x-small" variant="tonal">{{ a.target.type }}</v-chip>
              </template>
              <span class="text-caption" style="font-family: monospace">
                {{ targetLabel(a.target) }}
              </span>
              <span v-if="a.value" class="text-caption text-medium-emphasis ml-1">
                = {{ a.value }}
              </span>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text="Close" @click="inUseDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { Header } from '../common/interfaces';
import { useVisualStore } from '../stores/visual';
import { useProjectPermissions } from '../composables/useCatalogPermissions';
import {
  CreateTagDefinitionRequest,
  UpdateTagDefinitionRequest,
  TagDefinition,
  TagAttachment,
  TagAttachmentTarget,
} from '../gen/management/types.gen';
import TagDefinitionDialog, { TagDefinitionInput } from './TagDefinitionDialog.vue';

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const definitions = ref<TagDefinition[]>([]);
const loading = ref(false);
const search = ref('');
const kindFilter = ref<string[]>([]);
const scopeFilter = ref<string[]>([]);
const kindOptions = ['marker', 'free-text', 'enumerated'];
const scopeOptions = ['warehouse', 'namespace', 'table', 'view', 'generic-table', 'column'];
// Filter rail closed by default; the open state is remembered per user (persisted in visual store).
const filtersCollapsed = computed({
  get: () => !visual.tagFilterPanelOpen,
  set: (v: boolean) => {
    visual.tagFilterPanelOpen = !v;
  },
});
const inUseDialog = ref(false);
const inUseName = ref('');
const inUseAttachments = ref<TagAttachment[]>([]);
const confirmDialog = ref(false);
const confirmName = ref('');
const pendingDelete = ref<TagDefinition | null>(null);
const checkingId = ref<string | null>(null);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Value kind', key: 'value-kind', align: 'start' },
  { title: 'Scope', key: 'scope', align: 'start', sortable: false },
  { title: 'Description', key: 'description', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

const projectId = computed(() => visual.projectSelected['project-id']);
const { canListTags, canCreateTag } = useProjectPermissions(projectId);

// Client-side filter — the API only supports exact-name lookup, and the tag
// vocabulary is small enough to filter in the browser.
const displayedDefinitions = computed(() => {
  const q = search.value?.trim().toLowerCase();
  return definitions.value.filter((d) => {
    if (kindFilter.value.length && !kindFilter.value.includes(d['value-kind'])) return false;
    if (scopeFilter.value.length && !scopeFilter.value.some((s) => d.scope.includes(s as any)))
      return false;
    if (q) {
      const hit =
        d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
});

const activeFilterCount = computed(
  () => (search.value ? 1 : 0) + kindFilter.value.length + scopeFilter.value.length,
);
const hasActiveFilters = computed(() => activeFilterCount.value > 0);
function clearFilters() {
  search.value = '';
  kindFilter.value = [];
  scopeFilter.value = [];
}

// Reload when the selected project changes (the list is project-scoped).
watch(projectId, () => {
  if (canListTags.value) loadDefinitions();
});

function isSystem(item: TagDefinition): boolean {
  return item.name.toLowerCase().startsWith('system.');
}

async function loadDefinitions() {
  loading.value = true;
  try {
    const res = await functions.listTagDefinitions(1000, undefined, undefined, false);
    definitions.value = res['tag-definitions'] ?? [];
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

let hasLoaded = false;
watch(
  canListTags,
  async (canList) => {
    if (canList && !hasLoaded) {
      hasLoaded = true;
      await loadDefinitions();
    }
  },
  { immediate: true },
);

async function createDefinition(input: TagDefinitionInput) {
  const body: CreateTagDefinitionRequest = {
    name: input.name,
    description: input.description,
    'value-kind': input.valueKind,
    scope: input.scope,
    'allowed-values': input.allowedValues ?? null,
  };
  try {
    await functions.createTagDefinition(body, notify);
    await loadDefinitions();
  } catch {
    // handled
  }
}

async function updateDefinition(id: string, input: TagDefinitionInput) {
  const body: UpdateTagDefinitionRequest = {
    name: input.name,
    description: input.description,
    scope: input.scope,
    'add-allowed-values': input.addAllowedValues ?? null,
  };
  try {
    await functions.updateTagDefinition(id, body, notify);
    await loadDefinitions();
  } catch {
    // handled
  }
}

// Check up front whether the tag is still applied. If so, show the "in use"
// dialog; otherwise open the type-to-confirm dialog.
function showInUse(name: string, attachments: TagAttachment[]) {
  inUseName.value = name;
  inUseAttachments.value = attachments;
  inUseDialog.value = true;
}

async function requestDelete(item: TagDefinition) {
  checkingId.value = item.id;
  let attachments: TagAttachment[] = [];
  try {
    const res = await functions.listTagAttachments(item.id, { pageSize: 100 }, false);
    attachments = res.attachments ?? [];
  } catch {
    // Can't read attachments (e.g. not the tag owner) — fall through and let the
    // delete attempt decide; it surfaces the in-use dialog on failure.
  } finally {
    checkingId.value = null;
  }
  if (attachments.length) {
    showInUse(item.name, attachments);
    return;
  }
  pendingDelete.value = item;
  confirmName.value = '';
  confirmDialog.value = true;
}

async function doDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  confirmDialog.value = false;
  try {
    // notify=false: suppress the generic error snackbar so we can show a
    // friendly "still in use" dialog if it became attached since the check.
    await functions.deleteTagDefinition(item.id, false);
    definitions.value = definitions.value.filter((d) => d.id !== item.id);
  } catch {
    // Became attached since the check — re-read to show where.
    let attachments: TagAttachment[] = [];
    try {
      const res = await functions.listTagAttachments(item.id, { pageSize: 100 }, false);
      attachments = res.attachments ?? [];
    } catch {
      // ignore — show the generic message
    }
    showInUse(item.name, attachments);
  }
}

// Compact label for an attachment target (ids; columns show field-id).
function targetLabel(target: TagAttachmentTarget): string {
  switch (target.type) {
    case 'warehouse':
      return target['warehouse-id'];
    case 'namespace':
      return target['namespace-id'];
    case 'table':
      return target['table-id'];
    case 'view':
      return target['view-id'];
    case 'generic-table':
      return target['generic-table-id'];
    case 'column':
      return `${target['table-id']} · field ${target['field-id']}`;
    default:
      return '';
  }
}
</script>
