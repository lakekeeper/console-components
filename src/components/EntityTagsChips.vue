<template>
  <div class="etc">
    <!-- The heading is the host's, so it keeps the host's look; the count and
         the add control ride on it because acting on the object's tags belongs
         on the line that names them, not after the last chip. -->
    <!-- Sticky so Add stays in reach when a long list scrolls under it. -->
    <div class="etc-head-wrap">
      <slot name="heading" :count="tags.length" :add="AddControl" :filter-toggle="FilterToggle">
        <div class="etc-head">
          <span class="text-overline text-medium-emphasis">Tags</span>
          <v-chip v-if="tags.length" size="x-small" variant="tonal" class="ml-2">
            {{ tags.length }}
          </v-chip>
          <v-spacer></v-spacer>
          <FilterToggle />
          <AddControl />
        </div>
      </slot>
      <!-- Only over a list long enough to need it, as Properties does, and
           only once asked for: a field above every tag list costs a row on
           each visit for a search most visits do not run. -->
      <v-text-field
        v-if="filterOpen && tags.length > FILTER_FROM"
        v-model="filter"
        autofocus
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        placeholder="Filter tags and values"
        class="etc-filter"></v-text-field>
    </div>

    <v-progress-circular
      v-if="loading && !tags.length"
      indeterminate
      color="primary"
      size="18"></v-progress-circular>
    <template v-else>
      <!-- Everything is shown, grouped by what a tag is rather than folded at
           an arbitrary count: the host bounds the section and it scrolls.
           Markers and enumerated tags are both picked from a fixed vocabulary
           and stay short, so they share one row of chips (an enumerated one
           reads "name: value"). Free text can run to paragraphs, so it gets
           the full width under its name. -->
      <div v-if="classificationTags.length" class="etc-group">
        <div class="etc-label">
          Classifications
          <span class="etc-count">{{ classificationTags.length }}</span>
        </div>
        <div class="etc-row">
          <TagChip
            v-for="t in classificationTags"
            :key="t['tag-definition-id']"
            :tag="t"
            :definition="definitionByName.get(t.name)"
            :removable="canEdit && rights.canRemove(t['tag-definition-id']) === true"
            :editable="canEdit && rights.canApply(t['tag-definition-id']) === true"
            :busy="busy === t.name"
            @apply="assign"
            @remove="unassign" />
        </div>
      </div>

      <div v-if="freeTextTags.length" class="etc-group">
        <div class="etc-label">
          Free text
          <span class="etc-count">{{ freeTextTags.length }}</span>
        </div>
        <!-- The name line carries the row's action right beside the name, so
             it stays in reach however long the text below it runs. -->
        <div v-for="t in freeTextTags" :key="t['tag-definition-id']" class="etc-free">
          <div class="etc-free__head">
            <TagChip
              :tag="t"
              hide-value
              plain
              :definition="definitionByName.get(t.name)"
              :editable="canEdit && rights.canApply(t['tag-definition-id']) === true"
              :busy="busy === t.name"
              @apply="assign" />
            <span class="etc-free__colon">:</span>
            <v-menu
              v-if="canEdit && rights.canRemove(t['tag-definition-id']) === true"
              :model-value="confirmRow === t.name"
              location="bottom start"
              :close-on-content-click="false"
              @update:model-value="(open: boolean) => (confirmRow = open ? t.name : null)">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  class="etc-free__delete ml-1"
                  :class="{ 'etc-free__delete--open': confirmRow === t.name }"
                  :disabled="busy === t.name"
                  :aria-label="`Remove ${t.name}`"
                  :title="`Remove ${t.name}`"></v-btn>
              </template>
              <v-card min-width="240" class="pa-3">
                <div class="text-body-2 mb-3">
                  Remove
                  <strong>{{ t.name }}</strong>
                  ?
                </div>
                <div class="d-flex justify-end ga-2">
                  <v-btn size="small" variant="text" @click="confirmRow = null">Cancel</v-btn>
                  <v-btn
                    size="small"
                    color="error"
                    variant="flat"
                    @click="
                      confirmRow = null;
                      unassign(t.name);
                    ">
                    Remove
                  </v-btn>
                </div>
              </v-card>
            </v-menu>
          </div>
          <div class="etc-free__value">{{ t.value }}</div>
        </div>
      </div>

      <!-- What ancestors supply, labelled once per origin rather than on
           every chip. -->
      <div v-for="group in inheritedGroups" :key="group.type" class="etc-group">
        <div class="etc-label">
          Inherited
          <span class="etc-count">{{ group.tags.length }}</span>
          <div class="etc-sublabel">from {{ group.type }}</div>
        </div>
        <div class="etc-row">
          <TagChip v-for="t in group.tags" :key="t['tag-definition-id']" :tag="t" />
        </div>
      </div>
      <span v-if="term && tags.length && !anyMatch" class="text-medium-emphasis text-caption">
        No tag matches “{{ filter }}”.
      </span>
      <!-- A refused read is not an empty list, so it does not say "No tags". -->
      <span v-if="readError" class="text-medium-emphasis text-caption">
        <v-icon size="14" class="mr-1">mdi-eye-off-outline</v-icon>
        {{ readError }}
      </span>
      <span v-else-if="!tags.length" class="text-disabled text-caption">No tags</span>
      <!-- A change made on a chip is answered under the chips, where it was made. -->
      <div v-if="rowError" class="etc-error text-caption">
        <v-icon size="14" color="error" class="mr-1">mdi-alert-circle-outline</v-icon>
        {{ rowError }}
        <v-btn size="x-small" variant="text" @click="rowError = null">Dismiss</v-btn>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import {
  useGenericTablePermissions,
  useNamespacePermissions,
  useTablePermissions,
  useViewPermissions,
  useWarehousePermissions,
} from '../composables/useCatalogPermissions';
import { tagRefusal, useTagRights } from '../composables/useTagRights';
import { isForbiddenError } from '../common/errorUtils';
import { VBtn } from 'vuetify/components';
import TagChip from './TagChip.vue';
import TagAddMenu from './TagAddMenu.vue';
import { TagDefinition, TagScope, TargetTag } from '../gen/management/types.gen';

const props = defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
  // When true, include inherited tags (effective). Default: direct only.
  effective?: boolean;
  // Offer add / remove / edit in place, for callers holding manage_tags.
  manageable?: boolean;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const tags = ref<TargetTag[]>([]);
const loading = ref(false);
const definitions = ref<TagDefinition[]>([]);
const busy = ref<string | null>(null);
const readError = ref<string | null>(null);
const confirmRow = ref<string | null>(null);
const definitionsError = ref<string | null>(null);
// A refused add is said in the open picker; a refused remove or value change,
// under the chips it was made on.
const addError = ref<string | null>(null);
const rowError = ref<string | null>(null);
const rights = useTagRights();

// The scope of an instance never changes, so the permission source is picked
// once. Only the composable for this scope runs, so only its request goes out.
function permissionsFor(scope: TagScope) {
  const e = computed(() => props.entityId);
  const w = computed(() => props.warehouseId);
  switch (scope) {
    case 'namespace':
      return useNamespacePermissions(e, w).canManageTags;
    case 'table':
      return useTablePermissions(e, w).canManageTags;
    case 'view':
      return useViewPermissions(e, w).canManageTags;
    case 'generic-table':
      return useGenericTablePermissions(e, w).canManageTags;
    case 'warehouse':
    default:
      return useWarehousePermissions(w).canManageTags;
  }
}
const canManageTags = props.manageable ? permissionsFor(props.scope) : computed(() => false);
const canEdit = computed(() => !!props.manageable && canManageTags.value);

const directTags = computed(() =>
  tags.value.filter((t) => !t['inherited-from']).sort((a, b) => a.name.localeCompare(b.name)),
);
const FILTER_FROM = 10;
const filter = ref('');
const filterOpen = ref(false);
// Closing clears, so a hidden filter can never be what is narrowing the list.
function toggleFilter() {
  filterOpen.value = !filterOpen.value;
  if (!filterOpen.value) filter.value = '';
}
const term = computed(() => (filter.value ?? '').trim().toLowerCase());
function matches(t: TargetTag): boolean {
  if (!term.value) return true;
  return (
    t.name.toLowerCase().includes(term.value) || (t.value ?? '').toLowerCase().includes(term.value)
  );
}
const hasValue = (t: TargetTag) => t.value !== null && t.value !== undefined;
// The kind lives on the definition. A reader who may not list definitions does
// not have it, so a short single-line value is taken for a classification and
// anything longer for free text — the same split the eye would make.
function isFreeText(t: TargetTag): boolean {
  if (!hasValue(t)) return false;
  const kind = definitionByName.value.get(t.name)?.['value-kind'];
  if (kind) return kind === 'free-text';
  return t.value!.length > 32 || t.value!.includes('\n');
}
const classificationTags = computed(() =>
  directTags.value.filter((t) => !isFreeText(t) && matches(t)),
);
const freeTextTags = computed(() => directTags.value.filter((t) => isFreeText(t) && matches(t)));
const anyMatch = computed(
  () =>
    classificationTags.value.length + freeTextTags.value.length + inheritedGroups.value.length > 0,
);

// Nearest ancestor first: a namespace's tags say more about this object than
// the warehouse's do.
const inheritedGroups = computed(() => {
  const groups: { type: string; tags: TargetTag[] }[] = [];
  for (const type of ['namespace', 'warehouse']) {
    const list = tags.value
      .filter((t) => t['inherited-from']?.type === type && matches(t))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) groups.push({ type, tags: list });
  }
  return groups;
});

const directNames = computed(() => directTags.value.map((t) => t.name));
const applicableDefinitions = computed(() =>
  definitions.value
    .filter((d) => d.scope.includes(props.scope))
    .sort((a, b) => a.name.localeCompare(b.name)),
);
const definitionByName = computed(() => {
  const map = new Map<string, TagDefinition>();
  for (const d of definitions.value) map.set(d.name, d);
  return map;
});

// Handed to the heading slot beside Add. Accented while a filter is set.
const FilterToggle = defineComponent({
  name: 'EntityTagsFilterToggle',
  setup() {
    return () =>
      tags.value.length > FILTER_FROM
        ? h(VBtn, {
            icon: filterOpen.value || term.value ? 'mdi-filter' : 'mdi-filter-outline',
            size: 'small',
            variant: 'text',
            color: filterOpen.value || term.value ? 'secondary' : undefined,
            title: filterOpen.value ? 'Hide filter' : 'Filter tags',
            'aria-label': filterOpen.value ? 'Hide filter' : 'Filter tags',
            onClick: toggleFilter,
          })
        : null;
  },
});

// Handed to the heading slot so a host can put it on its own heading row.
const AddControl = defineComponent({
  name: 'EntityTagsAdd',
  setup() {
    return () =>
      canEdit.value
        ? h(TagAddMenu, {
            button: true,
            definitions: applicableDefinitions.value,
            assignedNames: directNames.value,
            busy: busy.value,
            canApply: rights.canApply,
            error: addError.value,
            definitionsError: definitionsError.value,
            onApply: (name: string, value?: string | null) => assign(name, value, 'add'),
            checkRights: rights.ensure,
            onOpen: () => {
              addError.value = null;
            },
          })
        : null;
  },
});

type SetFn = (tagName: string, value?: string | null) => Promise<unknown>;
type DelFn = (tagName: string) => Promise<unknown>;
type ListFn = (effective?: boolean) => Promise<{ tags: TargetTag[] }>;

const api = computed<{ list: ListFn; set: SetFn; del: DelFn }>(() => {
  const w = props.warehouseId;
  const e = props.entityId;
  switch (props.scope) {
    case 'namespace':
      return {
        list: (eff) => functions.listNamespaceTags(w, e, eff, false),
        set: (t, v) => functions.setNamespaceTag(w, e, t, v, false),
        del: (t) => functions.deleteNamespaceTag(w, e, t, false),
      };
    case 'table':
      return {
        list: (eff) => functions.listTableTags(w, e, eff, false),
        set: (t, v) => functions.setTableTag(w, e, t, v, false),
        del: (t) => functions.deleteTableTag(w, e, t, false),
      };
    case 'view':
      return {
        list: (eff) => functions.listViewTags(w, e, eff, false),
        set: (t, v) => functions.setViewTag(w, e, t, v, false),
        del: (t) => functions.deleteViewTag(w, e, t, false),
      };
    case 'generic-table':
      return {
        list: (eff) => functions.listGenericTableTags(w, e, eff, false),
        set: (t, v) => functions.setGenericTableTag(w, e, t, v, false),
        del: (t) => functions.deleteGenericTableTag(w, e, t, false),
      };
    case 'warehouse':
    default:
      return {
        list: (eff) => functions.listWarehouseTags(w, eff, false),
        set: (t, v) => functions.setWarehouseTag(w, t, v, false),
        del: (t) => functions.deleteWarehouseTag(w, t, false),
      };
  }
});

// Reloads overlap (entity change, tagsRefresh); only the latest one lands.
let loadSeq = 0;
async function load() {
  if (!props.entityId || !props.warehouseId) return;
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const res = await api.value.list(props.effective);
    if (seq !== loadSeq) return;
    tags.value = res.tags ?? [];
    readError.value = null;
  } catch (e) {
    if (seq !== loadSeq) return;
    tags.value = [];
    readError.value = isForbiddenError(e)
      ? `The tags on this ${props.scope} are not visible to you.`
      : tagRefusal(e, 'read the tags');
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// Definitions say each tag's kind (which group it goes in) and are what the
// picker offers. Listed once, silently: a reader who may not list them still
// gets the grouping, by the fallback in isFreeText.
let definitionsLoaded = false;
async function loadDefinitions() {
  if (definitionsLoaded) return;
  definitionsLoaded = true;
  try {
    definitions.value = await functions.listAllTagDefinitions(undefined, false);
    definitionsError.value = null;
  } catch (e) {
    definitionsLoaded = false;
    definitionsError.value = isForbiddenError(e)
      ? 'You are not allowed to list the tags of this project, so none can be offered.'
      : tagRefusal(e, 'list the tags');
  }
}

async function assign(tagName: string, value?: string | null, from: 'add' | 'row' = 'row') {
  if (busy.value) return;
  const def = definitionByName.value.get(tagName);
  busy.value = tagName;
  addError.value = null;
  rowError.value = null;
  try {
    await api.value.set(tagName, def?.['value-kind'] === 'marker' ? undefined : value);
    // The refresh signal reloads this row too, along with every other display.
    visual.bumpTagsRefresh();
  } catch (e) {
    const text = tagRefusal(e, `apply '${tagName}' here`);
    if (from === 'add') addError.value = text;
    else rowError.value = text;
  } finally {
    busy.value = null;
  }
}

async function unassign(tagName: string) {
  if (busy.value) return;
  busy.value = tagName;
  rowError.value = null;
  try {
    await api.value.del(tagName);
    // The refresh signal reloads this row too, along with every other display.
    visual.bumpTagsRefresh();
  } catch (e) {
    rowError.value = tagRefusal(e, `remove '${tagName}' here`);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
watch(() => [props.entityId, props.warehouseId, props.scope], load);
watch(canEdit, loadDefinitions, { immediate: true });
// The ✕ and the value edit wait for the tag's own answer; only the tags shown
// are asked about.
watch(
  () => [canEdit.value, directTags.value.map((t) => t['tag-definition-id']).join()],
  () => {
    if (canEdit.value) rights.ensure(directTags.value.map((t) => t['tag-definition-id']));
  },
  { immediate: true },
);
// Reload when a tag change is made elsewhere (another chip row, the schema tab).
watch(
  computed(() => visual.tagsRefresh),
  load,
);
</script>

<style scoped>
.etc {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.etc-head-wrap {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}
.etc-filter {
  margin: 4px 0 8px;
}
.etc-head {
  display: flex;
  align-items: center;
  min-height: 32px;
}
.etc-row {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.etc-error {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-error));
}
/* Each group's name sits on its own short line above what it holds, so the
   chips and values get the full width rather than leaving a column of empty
   space under a label. */
.etc-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
/* More room between groups than inside one, so each reads as its own block. */
.etc-group + .etc-group {
  margin-top: 12px;
}
.etc-label {
  font-size: 0.75rem;
  line-height: 18px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.etc-sublabel {
  display: inline;
  margin-left: 4px;
  font-style: italic;
}
.etc-count {
  margin-left: 4px;
  opacity: 0.7;
}
.etc-free {
  min-width: 0;
}
.etc-free + .etc-free {
  margin-top: 6px;
}
.etc-free__head {
  display: flex;
  align-items: center;
  min-height: 24px;
}
.etc-free__colon {
  margin-left: 1px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
/* The delete comes with its entry under the pointer (or keyboard focus);
   touch screens have no hover, so they keep it. */
@media (hover: hover) {
  .etc-free:not(:hover) .etc-free__delete:not(:focus-visible):not(.etc-free__delete--open) {
    opacity: 0;
  }
}
.etc-free__value {
  font-size: 0.875rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
