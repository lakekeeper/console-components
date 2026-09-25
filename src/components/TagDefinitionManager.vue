<template>
  <v-card>
    <!-- No title row: the tab this sits under is called Tags, and a heading that
         repeats it costs a band of height on every screen. What was in it — the
         reload and the add — moves down to the row with the fold, where the rest
         of this pane's controls already are. -->
    <div
      v-if="canListTags"
      ref="paneRef"
      class="d-flex"
      :style="{ height: paneHeight, minHeight: '360px' }">
      <!-- Left: the filters, folded by animating the column to nothing rather
           than unmounting it — the controls keep their width on the inside, so
           nothing reflows on the way out and the table grows into the space
           instead of jumping into it. -->
      <div class="tags-fold flex-shrink-0" :class="{ 'tags-fold--collapsed': filtersCollapsed }">
        <div
          class="pa-3"
          style="
            width: 220px;
            height: 100%;
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
            no-data-text="No kinds available"
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
            no-data-text="No scopes available"
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
      </div>

      <!-- Right: the fold lives with the content it uncovers, not across the
           top of the card — the same place the grants pane keeps it. -->
      <div class="d-flex flex-column flex-grow-1" style="min-width: 0">
        <div class="d-flex align-center ga-2 px-1 py-1 flex-shrink-0">
          <v-btn
            size="small"
            variant="text"
            class="text-none"
            @click="filtersCollapsed = !filtersCollapsed">
            <template #prepend>
              <v-icon color="secondary">
                {{ filtersCollapsed ? 'mdi-arrow-expand-right' : 'mdi-arrow-collapse-left' }}
              </v-icon>
            </template>
            Filters
            <v-badge
              v-if="activeFilterCount"
              inline
              color="primary"
              :content="activeFilterCount"></v-badge>
            <v-tooltip activator="parent" location="bottom">
              {{ filtersCollapsed ? 'Show' : 'Hide' }} the filters
            </v-tooltip>
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn
            icon="mdi-refresh"
            size="small"
            variant="text"
            title="Refresh"
            :loading="loading"
            @click="loadDefinitions"></v-btn>
          <TagDefinitionDialog v-if="canCreateTag" action-type="add" @submit="createDefinition" />
        </div>

        <v-data-table
          class="flex-grow-1"
          style="min-width: 0"
          height="100%"
          fixed-header
          density="compact"
          :headers="headers"
          hover
          :items="displayedDefinitions"
          :sort-by="[{ key: 'name', order: 'asc' }]"
          :loading="loading"
          items-per-page="50"
          :items-per-page-options="[
            { title: '50', value: 50 },
            { title: '100', value: 100 },
            { title: 'All', value: -1 },
          ]"
          @click:row="onRowClick">
          <template #item.name="{ item }">
            <span style="display: flex; align-items: center">
              <v-icon class="mr-2" color="info">mdi-tag-outline</v-icon>
              {{ item.name }}
              <v-icon v-if="isSystem(item)" class="ml-2 text-medium-emphasis" size="x-small">
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
          <template #item.open>
            <v-icon size="small" class="text-medium-emphasis">mdi-chevron-right</v-icon>
          </template>
          <template #no-data>
            <span class="text-disabled">No tag definitions yet.</span>
          </template>
        </v-data-table>
      </div>
    </div>
    <div v-else class="pa-4">You don't have permission to list tag definitions</div>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import { Header } from '../common/interfaces';
import { useVisualStore } from '../stores/visual';
import { useProjectPermissions } from '../composables/useCatalogPermissions';
import {
  CreateTagDefinitionRequest,
  TagDefinition,
  TagScope,
  TagValueKind,
} from '../gen/management/types.gen';
import TagDefinitionDialog, { TagDefinitionInput } from './TagDefinitionDialog.vue';

const functions = useFunctions();
const visual = useVisualStore();
const router = useRouter();
const notify = true;

const definitions = ref<TagDefinition[]>([]);
const loading = ref(false);
const search = ref('');
// ---- how tall this pane is -------------------------------------------------
//
// Measured rather than derived from the viewport: a formula has to know how much
// chrome sits above the pane, which differs by host and by tab, and one that
// overshoots puts a second scrollbar down the page beside the list's own.

const paneRef = ref<HTMLElement | null>(null);
const paneHeight = ref('calc(100vh - 300px)');

function measurePane() {
  const el = paneRef.value;
  if (!el || typeof window === 'undefined') return;
  const top = el.getBoundingClientRect().top;
  paneHeight.value = `${Math.max(360, Math.round(window.innerHeight - top - 24))}px`;
}

const kindFilter = ref<TagValueKind[]>([]);
const scopeFilter = ref<TagScope[]>([]);
const kindOptions: TagValueKind[] = ['marker', 'free-text', 'enumerated'];
const scopeOptions: TagScope[] = [
  'warehouse',
  'namespace',
  'table',
  'view',
  'generic-table',
  'column',
];
// Filter rail closed by default; the open state is remembered per user (persisted in visual store).
const filtersCollapsed = computed({
  get: () => !visual.tagFilterPanelOpen,
  set: (v: boolean) => {
    visual.tagFilterPanelOpen = !v;
  },
});
const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Value kind', key: 'value-kind', align: 'start' },
  { title: 'Scope', key: 'scope', align: 'start', sortable: false },
  { title: 'Description', key: 'description', align: 'start' },
  { title: '', key: 'open', align: 'end', sortable: false, width: '48px' },
]);

// Row click → tag detail page (General / Permissions / Attachments).
function openDetail(item: TagDefinition) {
  router.push(`/governance/tags/${item.id}`);
}

function onRowClick(_e: unknown, ctx: { item: TagDefinition }) {
  openDetail(ctx.item);
}

const projectId = computed(() => visual.projectSelected['project-id']);
const { canListTags, canCreateTag } = useProjectPermissions(projectId);

// Client-side filter — the API only supports exact-name lookup, and the tag
// vocabulary is small enough to filter in the browser.
const displayedDefinitions = computed(() => {
  const q = search.value?.trim().toLowerCase();
  return definitions.value.filter((d) => {
    if (kindFilter.value.length && !kindFilter.value.includes(d['value-kind'])) return false;
    if (scopeFilter.value.length && !scopeFilter.value.some((s) => d.scope.includes(s)))
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

onMounted(() => {
  measurePane();
  // Again after the tab's transition settles, so the pane is measured where it
  // ends up rather than where it starts.
  requestAnimationFrame(measurePane);
  window.addEventListener('resize', measurePane);
});

onUnmounted(() => window.removeEventListener('resize', measurePane));

function isSystem(item: TagDefinition): boolean {
  return item.name.toLowerCase().startsWith('system.');
}

async function loadDefinitions() {
  loading.value = true;
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
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
</script>

<style scoped>
/* One width transition for the folding column, and nothing for a reader who has
   asked the system to stop moving things. */
.tags-fold {
  width: 220px;
  overflow: hidden;
  transition: width 0.2s ease;
}

.tags-fold--collapsed {
  width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tags-fold {
    transition: none;
  }
}
</style>
