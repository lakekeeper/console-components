<template>
  <!-- What can be granted, as opposed to what anyone holds. Most privileges
       repeat across levels, so this is a matrix rather than a list per type:
       the interesting fact is usually where a privilege does and does not
       exist. The vocabulary belongs to the configured authorizer and differs
       between deployments, so it is read from the server, not documented here. -->
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-book-open-variant-outline</v-icon>
          Grantable privileges
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="filterText"
          label="Filter privileges"
          prepend-inner-icon="mdi-filter"
          variant="underlined"
          density="compact"
          hide-details
          clearable
          class="mr-4"
          style="max-width: 320px"></v-text-field>
      </v-toolbar>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <v-card-text style="padding: 0; display: flex; min-height: 0; flex: 1 1 auto">
          <div v-if="loading" class="d-flex flex-column align-center pa-8" style="flex: 1 1 auto">
            <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
            <span class="mt-4 text-body-2 text-medium-emphasis">Loading vocabulary…</span>
          </div>

          <div v-else-if="loadError" class="pa-6" style="flex: 1 1 auto">
            <v-alert type="error" variant="tonal" density="compact">{{ loadError }}</v-alert>
            <v-btn
              class="mt-3"
              size="small"
              variant="outlined"
              prepend-icon="mdi-refresh"
              @click="load">
              Retry
            </v-btn>
          </div>

          <!-- No padding on the scroller itself: sticky offsets are measured
               from the scrollport edge, so padding leaves a strip above the
               pinned header (and left of the pinned column) that rows scroll
               into and remain visible in. The padding moves inside instead. -->
          <div v-else style="flex: 1 1 auto; min-height: 0; overflow: auto">
            <div v-if="typeFilter" class="px-4 pt-4">
              <v-chip
                size="small"
                variant="tonal"
                color="primary"
                closable
                :prepend-icon="resourceIcon(typeFilter)"
                @click:close="typeFilter = null">
                {{ resourceLabel(typeFilter) }} only
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis px-4 pt-4 mb-3">
              Which privileges this server's authorizer accepts at each level. Whether you may grant
              a given one depends on the specific resource — the grant form greys out the ones you
              cannot.
            </div>

            <div v-if="!rowGroups.length" class="text-body-2 text-medium-emphasis px-4 py-4">
              {{
                filterText
                  ? 'No privilege matches this filter.'
                  : 'This authorizer publishes no grantable privileges.'
              }}
            </div>

            <table v-else class="priv-matrix mb-4">
              <thead>
                <tr>
                  <th class="priv-matrix__name">Privilege</th>
                  <!-- Clicking a level narrows the rows to what it publishes;
                       the columns stay so you can still see where else each
                       surviving privilege applies. -->
                  <th
                    v-for="t in types"
                    :key="t"
                    class="priv-matrix__type"
                    :class="{
                      'priv-matrix__type--active': typeFilter === t,
                      'priv-matrix__dimmed': typeFilter && typeFilter !== t,
                    }"
                    :title="
                      typeFilter === t
                        ? 'Show every privilege again'
                        : `Show only privileges on a ${resourceLabel(t).toLowerCase()}`
                    "
                    @click="toggleTypeFilter(t)">
                    <div class="d-flex flex-column align-center ga-1">
                      <v-icon size="18">{{ resourceIcon(t) }}</v-icon>
                      <span>{{ resourceLabel(t) }}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="group in rowGroups" :key="group.name">
                  <tr>
                    <th class="priv-matrix__category" :colspan="types.length + 1">
                      {{ group.label }}
                    </th>
                  </tr>
                  <tr v-for="row in group.rows" :key="row.name">
                    <th
                      class="priv-matrix__name"
                      :class="{ 'priv-matrix__name--help': row.description }">
                      <div class="text-body-2">{{ row.displayName }}</div>
                      <!-- The wire name is what an API caller sends, so it stays
                           visible rather than being replaced by the label. -->
                      <div class="text-caption text-medium-emphasis font-mono">{{ row.name }}</div>
                      <v-tooltip
                        v-if="row.description"
                        activator="parent"
                        location="right"
                        max-width="420">
                        {{ row.description }}
                      </v-tooltip>
                    </th>
                    <!-- With a level selected, the other columns fade back: the
                         rows are already filtered to that level, so a full
                         strength tick elsewhere reads as part of the result. -->
                    <td
                      v-for="t in types"
                      :key="t"
                      class="priv-matrix__cell"
                      :class="{ 'priv-matrix__dimmed': typeFilter && typeFilter !== t }">
                      <v-icon v-if="row.types.has(t)" size="18" color="primary">
                        mdi-check-circle
                      </v-icon>
                      <span v-else class="text-disabled">–</span>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </v-card-text>
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">
          Published by the configured authorizer — this list differs between deployments.
          <template v-if="hasDescriptions">Hover a privilege for its description.</template>
        </span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { helix } from 'ldrs';
import {
  useGrants,
  derivePrivilegeCategory,
  privilegeCategoryRank,
  resourceIcon,
  resourceLabel,
  RESOURCE_TYPE_ORDER,
} from '../composables/useGrants';
import type { PrivilegeDescriptor } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent.
helix.register();

const grants = useGrants();

const dialogOpen = ref(false);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref<string | null>(null);
const filterText = ref('');
/** Narrows the rows to one resource level; null shows every privilege. */
const typeFilter = ref<string | null>(null);

function toggleTypeFilter(type: string) {
  typeFilter.value = typeFilter.value === type ? null : type;
}
const vocab = ref<Record<string, PrivilegeDescriptor[]>>({});

/**
 * Columns in hierarchy order. Types the server publishes but this build does
 * not know are appended rather than dropped, so a newer authorizer's vocabulary
 * still shows up.
 */
const types = computed(() => {
  const known = RESOURCE_TYPE_ORDER.filter((t) => t in vocab.value);
  const extra = Object.keys(vocab.value).filter((t) => !RESOURCE_TYPE_ORDER.includes(t));
  return [...known, ...extra];
});

interface Row {
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  types: Set<string>;
}

/**
 * One row per distinct privilege name, carrying the set of levels that publish
 * it. The same name can appear under several types; the first descriptor wins
 * for the label and description, which is what makes the matrix readable.
 */
const rowGroups = computed(() => {
  const byName = new Map<string, Row>();
  for (const type of types.value) {
    for (const p of vocab.value[type] ?? []) {
      let row = byName.get(p.name);
      if (!row) {
        row = {
          name: p.name,
          displayName: p['display-name'] || p.name,
          description: p.description ?? null,
          // The authorizer's own grouping wins; a CRUD bucket is inferred only
          // where it publishes none, so the matrix does not degenerate into one
          // undifferentiated block.
          category: p.category ?? derivePrivilegeCategory(p.name),
          types: new Set<string>(),
        };
        byName.set(p.name, row);
      }
      // A later level may carry a description where an earlier one had none.
      if (!row.description && p.description) row.description = p.description;
      row.types.add(type);
    }
  }

  const q = filterText.value?.toLowerCase().trim();
  const rows = [...byName.values()].filter((r) => {
    if (typeFilter.value && !r.types.has(typeFilter.value)) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  });

  const byCategory = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  return [...byCategory.entries()]
    .sort(
      (a, b) =>
        privilegeCategoryRank(a[0]) - privilegeCategoryRank(b[0]) || a[0].localeCompare(b[0]),
    )
    .map(([name, list]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      rows: list.sort((a, b) => a.name.localeCompare(b.name)),
    }));
});

/**
 * Whether any privilege carries a description. An authorizer that has written
 * none reports null rather than guessing, and pointing at a tooltip that will
 * never appear is worse than saying nothing.
 */
const hasDescriptions = computed(() =>
  rowGroups.value.some((g) => g.rows.some((r) => !!r.description)),
);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    vocab.value = await grants.vocabulary();
    loaded.value = true;
  } catch (e: any) {
    loadError.value = e?.error?.message || e?.message || 'Failed to load the privilege vocabulary';
  } finally {
    loading.value = false;
  }
}

// The vocabulary is cached for the session, so reopening costs nothing.
watch(dialogOpen, (open) => {
  if (open && !loaded.value) load();
});
</script>

<style scoped>
.priv-matrix {
  border-collapse: collapse;
  font-size: 0.875rem;
}

.priv-matrix th,
.priv-matrix td {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.16);
  padding: 6px 10px;
}

/* The privilege column stays put while the levels scroll under it, and the
   header stays put while the rows do. */
.priv-matrix__name {
  position: sticky;
  left: 0;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
  text-align: left;
  font-weight: 400;
  min-width: 240px;
  padding-left: 16px;
}

.priv-matrix__name--help {
  cursor: help;
}

.priv-matrix thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: rgb(var(--v-theme-surface));
}

.priv-matrix thead th.priv-matrix__name {
  z-index: 4;
}

.priv-matrix__type {
  cursor: pointer;
  user-select: none;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.7);
  white-space: nowrap;
  padding: 8px 12px;
}

.priv-matrix__type:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.priv-matrix__type--active {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.priv-matrix__category {
  text-align: left;
  padding-left: 16px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.04);
  position: sticky;
  left: 0;
}

.priv-matrix__cell {
  text-align: center;
}

.priv-matrix__dimmed {
  opacity: 0.25;
}

.priv-matrix tr > *:last-child {
  padding-right: 16px;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}
</style>
