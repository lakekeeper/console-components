<template>
  <div class="d-flex flex-column" style="min-height: 0">
    <div class="px-3 pt-3 pb-2 flex-shrink-0">
      <v-text-field
        v-model="search"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        autofocus
        prepend-inner-icon="mdi-magnify"
        placeholder="Filter tags"></v-text-field>
      <v-chip-group v-model="kindFilter" multiple column class="mt-1">
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

    <div class="px-1 pb-2" :style="{ maxHeight: listMaxHeight, overflowY: 'auto', minHeight: 0 }">
      <div v-if="!filtered.length" class="text-body-2 text-medium-emphasis pa-3">
        {{ definitions.length ? 'No tag matches these filters.' : 'No tags available.' }}
      </div>
      <v-list v-else density="compact" class="py-0">
        <template v-for="def in filtered" :key="def.id">
          <v-list-item :disabled="busy === def.name" rounded="lg" @click="onClick(def)">
            <template #prepend>
              <v-icon :color="assignedNames.includes(def.name) ? 'primary' : 'info'" size="small">
                {{ assignedNames.includes(def.name) ? 'mdi-tag-check-outline' : 'mdi-tag-outline' }}
              </v-icon>
            </template>
            <v-list-item-title class="text-body-2">{{ def.name }}</v-list-item-title>
            <v-list-item-subtitle v-if="def.description" class="text-caption">
              {{ def.description }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip size="x-small" variant="tonal" class="ml-2">
                {{ kindLabel(def['value-kind']) }}
              </v-chip>
              <!-- Fixed slot whether or not it holds anything, so the kind chips
                   line up across rows of different kinds. -->
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

          <!-- Only a marker can be applied by the click alone. -->
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
                  :color="currentValue === value ? 'primary' : undefined"
                  :variant="currentValue === value ? 'flat' : 'outlined'"
                  @click="emit('apply', def.name, value)">
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
                @keyup.enter="
                  freeTextValue && emit('apply', def.name, freeTextValue)
                "></v-text-field>
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                class="mt-1"
                :disabled="!freeTextValue"
                @click="emit('apply', def.name, freeTextValue)">
                {{ assignedNames.includes(def.name) ? 'Update' : 'Assign' }}
              </v-btn>
            </div>
          </div>
        </template>
      </v-list>
    </div>

    <!-- The menu deliberately survives a click so several tags can go on in one
         visit, which leaves clicking outside as the only way out. This is it. -->
    <v-divider></v-divider>
    <div class="d-flex align-center px-3 py-2">
      <span class="text-caption text-medium-emphasis">Changes apply immediately.</span>
      <v-spacer></v-spacer>
      <v-btn size="small" variant="text" @click="emit('close')">Done</v-btn>
    </div>
  </div>
</template>

<script lang="ts" setup>
// The tag half of any "apply a tag to this thing" surface: search, kind filter,
// and a value editor for the kinds a single click cannot satisfy. It owns no
// data — the host decides what a click writes to.
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { TagDefinition, TagValueKind } from '../gen/management/types.gen';

const props = defineProps<{
  definitions: TagDefinition[];
  // Tag names the target already carries, shown ticked.
  assignedNames?: string[];
  // Current value when editing a single assigned tag.
  currentValue?: string | null;
  // Opens straight into one tag's value editor, for "change this value".
  autoExpandId?: string | null;
  busy?: string | null;
  listMaxHeight?: string;
}>();

const emit = defineEmits<{
  (e: 'apply', tagName: string, value?: string | null): void;
  (e: 'close'): void;
}>();

const functions = useFunctions();

const assignedNames = computed(() => props.assignedNames ?? []);
const listMaxHeight = computed(() => props.listMaxHeight ?? '320px');

const search = ref('');
const kindOptions: TagValueKind[] = ['marker', 'free-text', 'enumerated'];
const kindFilter = ref<TagValueKind[]>([]);

function kindLabel(kind: TagValueKind): string {
  if (kind === 'marker') return 'marker';
  if (kind === 'enumerated') return 'enumerated';
  return 'free text';
}

const filtered = computed(() => {
  const term = (search.value ?? '').trim().toLowerCase();
  return [...props.definitions]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((d) => {
      if (kindFilter.value.length && !kindFilter.value.includes(d['value-kind'])) return false;
      if (
        term &&
        !d.name.toLowerCase().includes(term) &&
        !(d.description ?? '').toLowerCase().includes(term)
      )
        return false;
      return true;
    });
});

const expandedId = ref<string | null>(null);
const allowedValues = ref<string[]>([]);
const loadingValues = ref(false);
const freeTextValue = ref('');

// List responses omit `allowed-values`, so the single definition has to be
// fetched before its choices can be offered.
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

async function expand(def: TagDefinition) {
  expandedId.value = def.id;
  freeTextValue.value = props.currentValue ?? '';
  allowedValues.value = [];
  if (def['value-kind'] === 'enumerated') await loadAllowedValues(def);
}

async function onClick(def: TagDefinition) {
  if (props.busy) return;
  if (def['value-kind'] === 'marker') {
    emit('apply', def.name);
    return;
  }
  if (expandedId.value === def.id) {
    expandedId.value = null;
    return;
  }
  await expand(def);
}

watch(
  () => props.autoExpandId,
  async (id) => {
    const def = props.definitions.find((d) => d.id === id);
    if (def) await expand(def);
  },
);

onMounted(async () => {
  const def = props.definitions.find((d) => d.id === props.autoExpandId);
  if (def) await expand(def);
});
</script>
