<template>
  <div class="d-flex flex-column" :style="{ height }">
    <v-toolbar
      v-if="!hideTitle"
      color="transparent"
      density="compact"
      flat
      class="pl-4 flex-shrink-0">
      <v-icon class="mr-2">mdi-tag-multiple-outline</v-icon>
      <v-toolbar-title>
        <span class="text-subtitle-1">{{ title }}</span>
      </v-toolbar-title>
    </v-toolbar>
    <v-divider v-if="!hideTitle"></v-divider>

    <!-- Two columns: what can be applied, and what is applied. Clicking moves a
         tag between them, so the whole thing is one gesture rather than a form.
         The split defaults to a third / two thirds — names on the left are short,
         assigned tags carry a value, an origin and a date. -->
    <div ref="splitRef" class="d-flex flex-grow-1" style="min-height: 0">
      <div
        class="d-flex flex-column"
        :style="{ flex: `0 0 ${splitPercent}%`, minWidth: 0, minHeight: 0 }">
        <div class="px-4 pt-3 pb-2 flex-shrink-0">
          <div class="text-caption text-medium-emphasis mb-2">
            AVAILABLE TAGS {{ availableCount }}
          </div>
          <v-text-field
            v-model="search"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            placeholder="Filter tags"></v-text-field>
          <!-- Kind decides how a tag is applied, so it is the useful axis to
               narrow by once there are more definitions than fit on screen. -->
          <div class="d-flex align-center flex-wrap mt-2" style="gap: 8px">
            <v-chip-group v-model="kindFilter" multiple column>
              <v-chip
                v-for="kind in kindOptions"
                :key="kind"
                :value="kind"
                size="small"
                variant="outlined"
                filter>
                {{ kindLabel(kind) }}
              </v-chip>
            </v-chip-group>
            <v-spacer></v-spacer>
            <!-- Named states beat a tick nobody can decode: the list defaults to
                 what can still be added, and says so. -->
            <v-btn-toggle
              v-model="availabilityFilter"
              mandatory
              density="compact"
              variant="outlined"
              divided>
              <v-btn size="x-small" value="all">All</v-btn>
              <v-btn size="x-small" value="unassigned">Not assigned</v-btn>
              <v-btn size="x-small" value="assigned">Assigned</v-btn>
            </v-btn-toggle>
          </div>
        </div>
        <div class="px-2 pb-3" style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
          <div v-if="loadingDefinitions" class="d-flex justify-center pa-6">
            <l-helix size="35" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
          </div>
          <div
            v-else-if="!filteredDefinitions.length"
            class="text-body-2 text-medium-emphasis pa-4">
            {{ availableEmptyMessage }}
          </div>
          <v-list v-else density="compact" class="py-0">
            <template v-for="def in filteredDefinitions" :key="def.id">
              <v-list-item
                :active="isAssigned(def)"
                :class="isAssigned(def) ? 'tag-def--assigned' : ''"
                :disabled="busy === def.name"
                rounded="lg"
                @click="onDefinitionClick(def)">
                <template #prepend>
                  <v-icon :color="isAssigned(def) ? 'primary' : 'info'" size="small">
                    {{ isAssigned(def) ? 'mdi-tag-check-outline' : 'mdi-tag-outline' }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-body-2">{{ def.name }}</v-list-item-title>
                <v-list-item-subtitle v-if="def.description" class="text-caption">
                  {{ def.description }}
                </v-list-item-subtitle>
                <template #append>
                  <!-- Says it in words, not only in a tint: this one is already on
                       the entity, so clicking it changes or removes it. -->
                  <v-chip
                    v-if="isAssigned(def)"
                    size="x-small"
                    variant="flat"
                    color="primary"
                    class="ml-2">
                    assigned
                  </v-chip>
                  <!-- The kind decides whether one click is enough: only a marker
                       carries no value. -->
                  <v-chip size="x-small" variant="tonal" class="ml-2">
                    {{ kindLabel(def['value-kind']) }}
                  </v-chip>
                  <!-- Fixed slot, occupied or not: a marker has no chevron, and
                       without the reserved width its chip would sit further right
                       than every other row's. -->
                  <span
                    class="ml-2 d-inline-flex justify-center align-center"
                    style="width: 16px; flex: 0 0 16px">
                    <v-progress-circular
                      v-if="busy === def.name"
                      indeterminate
                      size="16"
                      width="2"
                      color="primary"></v-progress-circular>
                    <v-icon v-else-if="def['value-kind'] !== 'marker'" size="16">
                      {{ expandedId === def.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                    </v-icon>
                  </span>
                </template>
              </v-list-item>

              <!-- Value picker for the kinds a single click cannot satisfy. -->
              <div v-if="expandedId === def.id" :key="`${def.id}-editor`" class="px-4 pb-3 pt-1">
                <div v-if="def['value-kind'] === 'enumerated'">
                  <div v-if="loadingValues" class="text-caption text-medium-emphasis">
                    Loading values…
                  </div>
                  <div v-else-if="!allowedValues.length" class="text-caption text-medium-emphasis">
                    This tag has no values to choose from.
                  </div>
                  <v-chip-group v-else column>
                    <v-chip
                      v-for="value in allowedValues"
                      :key="value"
                      size="small"
                      :color="assignedValue(def) === value ? 'primary' : undefined"
                      :variant="assignedValue(def) === value ? 'flat' : 'outlined'"
                      @click="assign(def, value)">
                      {{ value }}
                    </v-chip>
                  </v-chip-group>
                </div>
                <div v-else class="d-flex align-start" style="gap: 8px">
                  <v-text-field
                    v-model="freeTextValue"
                    density="compact"
                    variant="outlined"
                    maxlength="256"
                    hide-details
                    placeholder="Value"
                    @keyup.enter="freeTextValue && assign(def, freeTextValue)"></v-text-field>
                  <v-btn
                    color="primary"
                    variant="flat"
                    size="small"
                    class="mt-1"
                    :disabled="!freeTextValue"
                    @click="assign(def, freeTextValue)">
                    {{ isAssigned(def) ? 'Update' : 'Assign' }}
                  </v-btn>
                </div>
                <div v-if="isAssigned(def)" class="mt-2">
                  <v-btn
                    color="error"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-tag-off-outline"
                    @click="unassign(def.name)">
                    Remove from this {{ scope }}
                  </v-btn>
                </div>
              </div>
            </template>
          </v-list>
        </div>
      </div>

      <!-- Drag handle, same behaviour as the LoQE sidebar divider. -->
      <div
        style="width: 5px; cursor: col-resize; user-select: none; flex-shrink: 0"
        :style="{
          background:
            dividerHover || isResizing
              ? 'rgb(var(--v-theme-primary))'
              : 'rgba(var(--v-theme-on-surface), 0.12)',
          transition: 'background 0.2s',
        }"
        @mousedown="startSplitResize"
        @dblclick="splitPercent = DEFAULT_SPLIT"
        @mouseenter="dividerHover = true"
        @mouseleave="dividerHover = false"></div>

      <div class="d-flex flex-column" style="flex: 1 1 0; min-width: 0; min-height: 0">
        <div class="px-4 pt-3 pb-2 flex-shrink-0">
          <div class="d-flex align-center">
            <div class="text-caption text-medium-emphasis">ASSIGNED {{ assignedCount }}</div>
            <v-spacer></v-spacer>
            <!-- Only the assigned side is affected by inheritance, so the switch
                 lives here rather than over the whole panel. -->
            <v-switch
              v-if="scope !== 'warehouse'"
              v-model="effective"
              color="info"
              density="compact"
              hide-details
              label="Show inherited"
              @update:model-value="loadTags"></v-switch>
          </div>
          <v-text-field
            v-model="assignedSearch"
            class="mt-2"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            placeholder="Filter assigned tags and values"></v-text-field>
          <!-- Both axes share one wrapping row: origin (set here vs imposed by an
               ancestor) and kind, the same axis the available column filters on. -->
          <div class="d-flex align-center flex-wrap" style="gap: 8px">
            <v-chip-group v-if="hasInherited" v-model="originFilter" column class="mt-1">
              <v-chip value="direct" size="small" variant="outlined" filter>direct</v-chip>
              <v-chip value="inherited" size="small" variant="outlined" filter>inherited</v-chip>
            </v-chip-group>
            <v-divider v-if="hasInherited" vertical class="my-2"></v-divider>
            <v-chip-group v-model="assignedKindFilter" multiple column class="mt-1">
              <v-chip
                v-for="kind in kindOptions"
                :key="kind"
                :value="kind"
                size="small"
                variant="outlined"
                filter>
                {{ kindLabel(kind) }}
              </v-chip>
            </v-chip-group>
          </div>
        </div>
        <div class="px-4 pb-3" style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
          <div v-if="loading" class="d-flex justify-center pa-6">
            <l-helix size="35" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
          </div>
          <!-- Only a filter hiding everything short-circuits the sections; with
               nothing assigned at all, the direct section says so itself. -->
          <div
            v-else-if="tags.length && !sortedTags.length"
            class="text-body-2 text-medium-emphasis pa-4">
            No assigned tag matches these filters.
          </div>
          <template v-else>
            <!-- Split by origin instead of relying on fill alone: what was applied
                 here is yours to change, what an ancestor imposes is not — and
                 "nothing here yet" has to be stated, not inferred from a gap. -->
            <template v-for="section in assignedSections" :key="section.key">
              <div class="d-flex align-center mb-2" :class="section.key === 'direct' ? '' : 'mt-5'">
                <v-icon size="14" :color="section.color" class="mr-2">{{ section.icon }}</v-icon>
                <span class="text-caption font-weight-medium">
                  {{ section.title }} ({{ section.rows.length }})
                </span>
              </div>
              <div v-if="section.hint" class="text-caption text-medium-emphasis mb-2">
                {{ section.hint }}
              </div>
              <v-sheet
                v-if="!section.rows.length"
                rounded="lg"
                border
                class="pa-4 mb-2 text-body-2 text-medium-emphasis text-center">
                {{ section.empty }}
              </v-sheet>
              <v-card
                v-for="tag in section.rows"
                :key="tag['tag-definition-id']"
                :variant="tag['inherited-from'] ? 'outlined' : 'tonal'"
                :class="[
                  'mb-2',
                  tag['inherited-from']
                    ? 'tag-row--inherited text-medium-emphasis'
                    : 'tag-row--direct',
                ]"
                rounded="lg">
                <v-card-text class="py-2 px-3">
                  <div class="d-flex align-center">
                    <v-icon
                      size="small"
                      class="mr-2"
                      :color="tag['inherited-from'] ? undefined : 'info'">
                      mdi-tag-outline
                    </v-icon>
                    <div style="min-width: 0">
                      <div class="text-body-2">
                        {{ tag.name }}
                        <span v-if="tag.value" class="font-weight-medium">= {{ tag.value }}</span>
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        {{ originLabel(tag) }} · updated {{ fmtDate(tag['updated-at']) }}
                      </div>
                    </div>
                    <v-spacer></v-spacer>
                    <v-chip
                      v-if="tag['inherited-from']"
                      size="x-small"
                      variant="tonal"
                      class="ml-2">
                      <v-icon start size="x-small">mdi-arrow-top-left</v-icon>
                      inherited
                    </v-chip>
                    <template v-else>
                      <!-- Changing a value belongs where the value is shown; hunting
                           for the definition on the left to edit it is a detour. -->
                      <v-btn
                        v-if="isEditable(tag)"
                        :icon="editingTag === tag.name ? 'mdi-close' : 'mdi-pencil-outline'"
                        size="x-small"
                        variant="text"
                        class="ml-2"
                        @click="editingTag === tag.name ? cancelEdit() : startEdit(tag)"></v-btn>
                      <!-- An inherited tag belongs to an ancestor; it can only be
                           removed where it was applied. -->
                      <v-btn
                        color="error"
                        icon="mdi-close"
                        size="x-small"
                        variant="text"
                        class="ml-2"
                        :loading="busy === tag.name"
                        @click="unassign(tag.name)"></v-btn>
                    </template>
                  </div>

                  <div v-if="editingTag === tag.name" class="mt-3">
                    <div v-if="editKind === 'enumerated'">
                      <div v-if="loadingEditValues" class="text-caption text-medium-emphasis">
                        Loading values…
                      </div>
                      <div v-else-if="!editValues.length" class="text-caption text-medium-emphasis">
                        This tag has no values to choose from.
                      </div>
                      <v-chip-group v-else column>
                        <v-chip
                          v-for="value in editValues"
                          :key="value"
                          size="small"
                          :color="tag.value === value ? 'primary' : undefined"
                          :variant="tag.value === value ? 'flat' : 'outlined'"
                          @click="saveEdit(tag, value)">
                          {{ value }}
                        </v-chip>
                      </v-chip-group>
                    </div>
                    <div v-else class="d-flex align-start" style="gap: 8px">
                      <v-text-field
                        v-model="editText"
                        density="compact"
                        variant="outlined"
                        maxlength="256"
                        hide-details
                        placeholder="Value"
                        @keyup.enter="editText && saveEdit(tag, editText)"></v-text-field>
                      <v-btn
                        color="primary"
                        variant="flat"
                        size="small"
                        class="mt-1"
                        :disabled="!editText || editText === tag.value"
                        :loading="busy === tag.name"
                        @click="saveEdit(tag, editText)">
                        Update
                      </v-btn>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { TagScope, TagValueKind, TargetTag, TagDefinition } from '../gen/management/types.gen';

// Registers the <l-helix> custom element. Idempotent (no-ops if another
// component, e.g. WarehouseManager, already registered it) — don't rely on
// load order between components that both use <l-helix>.
helix.register();

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  title?: string;
  // The host bounds the panel; each column scrolls inside it.
  height?: string;
  // The fullscreen dialog already names the entity in its own toolbar.
  hideTitle?: boolean;
}>();

const title = computed(() => props.title ?? 'Manage tags');
const height = computed(() => props.height ?? '60vh');

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

// ---- column split ----------------------------------------------------------
// Percent of the panel given to the available column. Double-clicking the
// handle restores it, so a dragged-away split is never stuck.
const DEFAULT_SPLIT = 33;
const splitPercent = ref(DEFAULT_SPLIT);
const splitRef = ref<HTMLElement | null>(null);
const dividerHover = ref(false);
const isResizing = ref(false);

function startSplitResize(e: MouseEvent) {
  const total = splitRef.value?.getBoundingClientRect().width ?? 0;
  if (!total) return;
  isResizing.value = true;
  const startX = e.clientX;
  const startPercent = splitPercent.value;

  const onMove = (ev: MouseEvent) => {
    const delta = ((ev.clientX - startX) / total) * 100;
    // Both columns stay usable: neither can be dragged to a sliver.
    splitPercent.value = Math.max(20, Math.min(70, startPercent + delta));
  };
  const onUp = () => {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

const tags = ref<TargetTag[]>([]);
const loading = ref(false);
const loadingDefinitions = ref(false);
// Show inherited (effective) tags by default so the full picture is visible.
const effective = ref(true);
const definitions = ref<TagDefinition[]>([]);
const search = ref('');
// The tag name currently being written, so its row can show progress and refuse
// a second click.
const busy = ref<string | null>(null);

const applicableDefinitions = computed(() =>
  definitions.value
    .filter((d) => d.scope.includes(props.scope))
    .sort((a, b) => a.name.localeCompare(b.name)),
);

const kindOptions: TagValueKind[] = ['marker', 'free-text', 'enumerated'];
const kindFilter = ref<TagValueKind[]>([]);
// Defaults to what can still be added; the other two states exist because
// "which of these is already on?" is a real question the tick could not answer.
const availabilityFilter = ref<'all' | 'assigned' | 'unassigned'>('unassigned');

const filteredDefinitions = computed(() => {
  const term = (search.value ?? '').trim().toLowerCase();
  return applicableDefinitions.value.filter((d) => {
    if (kindFilter.value.length && !kindFilter.value.includes(d['value-kind'])) return false;
    const assigned = directByName.value.has(d.name);
    if (availabilityFilter.value === 'unassigned' && assigned) return false;
    if (availabilityFilter.value === 'assigned' && !assigned) return false;
    if (
      term &&
      !d.name.toLowerCase().includes(term) &&
      !(d.description ?? '').toLowerCase().includes(term)
    )
      return false;
    return true;
  });
});

// Only directly-applied tags can be toggled here; inherited ones belong to an
// ancestor, so they must not read as "assigned" on the left.
// Definitions keyed by name: an applied tag reports its name, not its kind,
// so every kind-aware decision goes through this map.
const definitionByName = computed(() => {
  const map = new Map<string, TagDefinition>();
  for (const d of definitions.value) map.set(d.name, d);
  return map;
});

const directByName = computed(() => {
  const map = new Map<string, TargetTag>();
  for (const tag of tags.value) if (!tag['inherited-from']) map.set(tag.name, tag);
  return map;
});

const assignedSearch = ref('');
const originFilter = ref<'direct' | 'inherited' | undefined>(undefined);
const assignedKindFilter = ref<TagValueKind[]>([]);
const hasInherited = computed(() => tags.value.some((t) => !!t['inherited-from']));

const filteredTags = computed(() => {
  const term = (assignedSearch.value ?? '').trim().toLowerCase();
  return tags.value.filter((t) => {
    if (originFilter.value === 'direct' && t['inherited-from']) return false;
    if (originFilter.value === 'inherited' && !t['inherited-from']) return false;
    if (assignedKindFilter.value.length) {
      // An applied tag carries no kind of its own; it comes from the definition.
      const kind = definitionByName.value.get(t.name)?.['value-kind'];
      if (!kind || !assignedKindFilter.value.includes(kind)) return false;
    }
    if (
      term &&
      !t.name.toLowerCase().includes(term) &&
      !(t.value ?? '').toLowerCase().includes(term)
    )
      return false;
    return true;
  });
});

// An empty left column means one of three different things; saying which saves
// the user checking their filters when nothing is wrong.
const availableEmptyMessage = computed(() => {
  if (!applicableDefinitions.value.length)
    return `No tag definitions apply to this ${props.scope}.`;
  const anyAssigned = applicableDefinitions.value.some((d) => directByName.value.has(d.name));
  // Each filter is empty for its own reason, and saying which saves the user
  // wondering whether something is broken.
  if (availabilityFilter.value === 'assigned' && !anyAssigned)
    return `No tags are applied to this ${props.scope} yet — switch to “Not assigned” to add one.`;
  if (
    availabilityFilter.value === 'unassigned' &&
    applicableDefinitions.value.every((d) => directByName.value.has(d.name))
  )
    return 'Every applicable tag is already assigned.';
  return 'No tag matches these filters.';
});

// "(12 of 303)" while filtering, plain "(303)" otherwise — built here rather
// than in the template, where the spans pick up stray whitespace.
function countLabel(shown: number, total: number): string {
  return shown === total ? `(${total})` : `(${shown} of ${total})`;
}
const availableCount = computed(() =>
  countLabel(filteredDefinitions.value.length, applicableDefinitions.value.length),
);
const assignedCount = computed(() => countLabel(filteredTags.value.length, tags.value.length));

const sortedTags = computed(() =>
  [...filteredTags.value].sort((a, b) => {
    const direct = Number(!!a['inherited-from']) - Number(!!b['inherited-from']);
    return direct !== 0 ? direct : a.name.localeCompare(b.name);
  }),
);

const directTags = computed(() => sortedTags.value.filter((t) => !t['inherited-from']));
const inheritedTags = computed(() => sortedTags.value.filter((t) => !!t['inherited-from']));

// Two sections rather than one mixed list. The direct one always renders, even
// empty, because "no tags of your own" is the answer the user came for; the
// inherited one appears only when an ancestor actually supplies something.
const assignedSections = computed(() => {
  const sections = [
    {
      key: 'direct',
      title: `APPLIED TO THIS ${props.scope.toUpperCase()}`,
      icon: 'mdi-tag-check-outline',
      color: 'primary',
      rows: directTags.value,
      hint: '',
      empty: inheritedTags.value.length
        ? `No tags applied to this ${props.scope} directly — everything below comes from its ancestors.`
        : `No tags applied to this ${props.scope} yet. Pick one on the left.`,
    },
  ];
  if (inheritedTags.value.length) {
    sections.push({
      key: 'inherited',
      title: 'INHERITED',
      icon: 'mdi-arrow-top-left',
      color: '',
      rows: inheritedTags.value,
      hint: 'Applied on an ancestor — remove them where they were applied.',
      empty: '',
    });
  }
  return sections;
});

function isAssigned(def: TagDefinition): boolean {
  return directByName.value.has(def.name);
}

function assignedValue(def: TagDefinition): string | null | undefined {
  return directByName.value.get(def.name)?.value;
}

function kindLabel(kind: TagValueKind): string {
  if (kind === 'marker') return 'marker';
  if (kind === 'enumerated') return 'enumerated';
  return 'free text';
}

function originLabel(tag: TargetTag): string {
  const from = tag['inherited-from'];
  if (!from) return 'direct';
  return from.type === 'namespace' ? 'from namespace' : 'from warehouse';
}

function fmtDate(v?: string | null): string {
  return v ? new Date(v).toLocaleString() : '—';
}

type SetFn = (tagName: string, value?: string | null, notify?: boolean) => Promise<unknown>;
type DelFn = (tagName: string, notify?: boolean) => Promise<unknown>;
type ListFn = (effective?: boolean, notify?: boolean) => Promise<{ tags: TargetTag[] }>;

const api = computed<{ list: ListFn; set: SetFn; del: DelFn }>(() => {
  const w = props.warehouseId;
  const e = props.entityId;
  switch (props.scope) {
    case 'namespace':
      return {
        list: (eff, n) => functions.listNamespaceTags(w, e, eff, n),
        set: (t, v, n) => functions.setNamespaceTag(w, e, t, v, n),
        del: (t, n) => functions.deleteNamespaceTag(w, e, t, n),
      };
    case 'table':
      return {
        list: (eff, n) => functions.listTableTags(w, e, eff, n),
        set: (t, v, n) => functions.setTableTag(w, e, t, v, n),
        del: (t, n) => functions.deleteTableTag(w, e, t, n),
      };
    case 'view':
      return {
        list: (eff, n) => functions.listViewTags(w, e, eff, n),
        set: (t, v, n) => functions.setViewTag(w, e, t, v, n),
        del: (t, n) => functions.deleteViewTag(w, e, t, n),
      };
    case 'generic-table':
      return {
        list: (eff, n) => functions.listGenericTableTags(w, e, eff, n),
        set: (t, v, n) => functions.setGenericTableTag(w, e, t, v, n),
        del: (t, n) => functions.deleteGenericTableTag(w, e, t, n),
      };
    case 'warehouse':
    default:
      return {
        list: (eff, n) => functions.listWarehouseTags(w, eff, n),
        set: (t, v, n) => functions.setWarehouseTag(w, t, v, n),
        del: (t, n) => functions.deleteWarehouseTag(w, t, n),
      };
  }
});

async function loadTags() {
  loading.value = true;
  try {
    const res = await api.value.list(effective.value, false);
    tags.value = res.tags ?? [];
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

async function loadDefinitions() {
  loadingDefinitions.value = true;
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
  } catch {
    // handled
  } finally {
    loadingDefinitions.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadDefinitions(), loadTags()]);
});
watch(
  () => [props.warehouseId, props.entityId, props.scope],
  async () => {
    collapse();
    await Promise.all([loadDefinitions(), loadTags()]);
  },
);

// ---- assigning ------------------------------------------------------------
// A marker tag is one click. Anything with a value opens its editor below the
// row instead, because the click alone does not say what to store.
const expandedId = ref<string | null>(null);
const allowedValues = ref<string[]>([]);
const loadingValues = ref(false);
const freeTextValue = ref('');

function collapse() {
  expandedId.value = null;
  allowedValues.value = [];
  freeTextValue.value = '';
}

async function onDefinitionClick(def: TagDefinition) {
  if (busy.value) return;

  if (def['value-kind'] === 'marker') {
    if (isAssigned(def)) await unassign(def.name);
    else await assign(def);
    return;
  }

  if (expandedId.value === def.id) {
    collapse();
    return;
  }

  collapse();
  expandedId.value = def.id;
  freeTextValue.value = assignedValue(def) ?? '';
  if (def['value-kind'] === 'enumerated') await loadAllowedValues(def);
}

// List entries omit `allowed-values`, so the single definition has to be fetched
// before its choices can be offered.
async function loadAllowedValues(def: TagDefinition) {
  allowedValues.value = def['allowed-values'] ?? [];
  if (allowedValues.value.length) return;
  loadingValues.value = true;
  try {
    const full = await functions.getTagDefinition(def.id, false);
    allowedValues.value = full['allowed-values'] ?? [];
  } catch {
    // handled
  } finally {
    loadingValues.value = false;
  }
}

async function assign(def: TagDefinition, value?: string | null) {
  if (busy.value) return;
  busy.value = def.name;
  try {
    await api.value.set(def.name, def['value-kind'] === 'marker' ? undefined : value, notify);
    collapse();
    await loadTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  } finally {
    busy.value = null;
  }
}

// ---- editing an assigned value in place ------------------------------------
// The assigned column carries its own editor state: both editors can be open at
// once, and sharing one set of refs would let the left column's expansion
// overwrite what is being typed here.
const editingTag = ref<string | null>(null);
const editKind = ref<TagValueKind | undefined>(undefined);
const editText = ref('');
const editValues = ref<string[]>([]);
const loadingEditValues = ref(false);

function isEditable(tag: TargetTag): boolean {
  const kind = definitionByName.value.get(tag.name)?.['value-kind'];
  return !!kind && kind !== 'marker';
}

function cancelEdit() {
  editingTag.value = null;
  editKind.value = undefined;
  editValues.value = [];
  editText.value = '';
}

async function startEdit(tag: TargetTag) {
  const def = definitionByName.value.get(tag.name);
  if (!def || def['value-kind'] === 'marker') return;
  cancelEdit();
  editingTag.value = tag.name;
  editKind.value = def['value-kind'];
  editText.value = tag.value ?? '';
  if (def['value-kind'] !== 'enumerated') return;

  editValues.value = def['allowed-values'] ?? [];
  if (editValues.value.length) return;
  loadingEditValues.value = true;
  try {
    const full = await functions.getTagDefinition(def.id, false);
    editValues.value = full['allowed-values'] ?? [];
  } catch {
    // handled
  } finally {
    loadingEditValues.value = false;
  }
}

async function saveEdit(tag: TargetTag, value: string) {
  const def = definitionByName.value.get(tag.name);
  if (!def) return;
  await assign(def, value);
  cancelEdit();
}

async function unassign(tagName: string) {
  if (busy.value) return;
  busy.value = tagName;
  try {
    await api.value.del(tagName, notify);
    collapse();
    await loadTags();
    visual.bumpTagsRefresh();
  } catch {
    // handled
  } finally {
    busy.value = null;
  }
}
</script>
