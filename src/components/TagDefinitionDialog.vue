<template>
  <v-dialog v-model="isDialogActive" max-width="760">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-if="actionType === 'add'"
          class="me-2"
          v-bind="activatorProps"
          color="primary"
          size="small"
          text="New Tag"
          variant="flat"></v-btn>
        <v-btn
          v-else
          v-bind="activatorProps"
          icon="mdi-pencil-outline"
          size="x-small"
          variant="text"></v-btn>
      </slot>
    </template>

    <v-card :title="actionType === 'add' ? 'New Tag Definition' : 'Edit Tag Definition'">
      <v-card-text>
        <v-text-field
          v-model="data.name"
          label="Name"
          placeholder="pii.classification"
          hint="`.` is the hierarchy delimiter. Unique per project (case-insensitive)."
          persistent-hint
          :rules="[nameRule]"
          @keyup.enter="save"></v-text-field>

        <v-textarea
          v-model="data.description"
          class="mt-2"
          label="Description"
          rows="2"
          auto-grow></v-textarea>

        <v-select
          v-model="data.valueKind"
          class="mt-2"
          label="Value kind"
          :items="valueKindOptions"
          :disabled="actionType === 'edit'"
          :hint="actionType === 'edit' ? 'Value kind is immutable' : ''"
          :persistent-hint="actionType === 'edit'"
          no-data-text="No value kinds available"></v-select>

        <!-- A closed set of six, every one of which matters to the decision, so
             they are all on screen rather than behind a menu — the same picker
             shape the grant dialog uses for privileges. -->
        <div class="mt-4">
          <div class="d-flex align-center flex-wrap ga-2 mb-1">
            <span class="text-body-2 font-weight-medium">Scope</span>
            <v-chip size="x-small" variant="tonal">{{ data.scope.length }} selected</v-chip>
            <v-spacer></v-spacer>
            <v-btn
              size="x-small"
              variant="text"
              :disabled="allScopesSelected"
              @click="selectAllScopes">
              Select all
            </v-btn>
            <v-btn size="x-small" variant="text" :disabled="!canClearScopes" @click="clearScopes">
              Clear
            </v-btn>
          </div>
          <v-row no-gutters>
            <v-col v-for="opt in scopeOptions" :key="opt.value" cols="12" sm="6" md="4">
              <v-tooltip location="top" :disabled="!lockedScopes.includes(opt.value)">
                <template #activator="{ props: tp }">
                  <div v-bind="tp">
                    <v-checkbox
                      v-model="data.scope"
                      :value="opt.value"
                      :label="opt.title"
                      :disabled="lockedScopes.includes(opt.value)"
                      density="compact"
                      color="primary"
                      hide-details></v-checkbox>
                  </div>
                </template>
                Already in use — scope can only be widened.
              </v-tooltip>
            </v-col>
          </v-row>
          <div v-if="!data.scope.length" class="text-caption text-error mt-1">
            Select at least one scope
          </div>
          <div v-else-if="actionType === 'edit'" class="text-caption text-disabled mt-1">
            Scope can only be widened — existing scopes cannot be removed.
          </div>
        </div>

        <template v-if="data.valueKind === 'enumerated'">
          <div v-if="existingAllowedValues.length" class="mb-1">
            <div class="text-caption text-disabled">Existing values (cannot be removed):</div>
            <v-chip
              v-for="val in existingAllowedValues"
              :key="val"
              class="mr-1 mt-1"
              size="small"
              variant="tonal">
              {{ val }}
            </v-chip>
          </div>
          <v-combobox
            v-model="data.newAllowedValues"
            class="mt-2"
            :label="actionType === 'add' ? 'Allowed values' : 'Add allowed values'"
            multiple
            chips
            closable-chips
            hint="Press enter to add each value"
            persistent-hint></v-combobox>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" text="Cancel" @click="cancel"></v-btn>
        <v-btn color="primary" variant="flat" :disabled="!isValid" @click="save">save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { TagScope, TagValueKind, TagDefinition } from '../gen/management/types.gen';

export interface TagDefinitionInput {
  name: string;
  description: string | null;
  valueKind: TagValueKind;
  scope: TagScope[];
  /** create-only: full allowed-value set */
  allowedValues?: string[];
  /** edit-only: newly added allowed values */
  addAllowedValues?: string[];
}

const props = defineProps<{
  actionType: 'add' | 'edit';
  definition?: TagDefinition;
}>();

const emit = defineEmits<{ (e: 'submit', input: TagDefinitionInput): void }>();

const functions = useFunctions();
const isDialogActive = ref(false);

const valueKindOptions: { title: string; value: TagValueKind }[] = [
  { title: 'Marker (no value)', value: 'marker' },
  { title: 'Free text', value: 'free-text' },
  { title: 'Enumerated', value: 'enumerated' },
];

const scopeOptions: { title: string; value: TagScope }[] = [
  { title: 'Warehouse', value: 'warehouse' },
  { title: 'Namespace', value: 'namespace' },
  { title: 'Table', value: 'table' },
  { title: 'View', value: 'view' },
  { title: 'Generic table', value: 'generic-table' },
  { title: 'Column', value: 'column' },
];

const data = reactive<{
  name: string;
  description: string;
  valueKind: TagValueKind;
  scope: TagScope[];
  newAllowedValues: string[];
}>({ name: '', description: '', valueKind: 'marker', scope: [], newAllowedValues: [] });

// Scopes present at open time (edit) may not be removed.
const lockedScopes = ref<TagScope[]>([]);

const allScopesSelected = computed(() => scopeOptions.every((o) => data.scope.includes(o.value)));
// Locked scopes are already in use and cannot be withdrawn, so Clear leaves them.
const canClearScopes = computed(() => data.scope.some((sc) => !lockedScopes.value.includes(sc)));
function selectAllScopes() {
  data.scope = scopeOptions.map((o) => o.value);
}
function clearScopes() {
  data.scope = data.scope.filter((sc) => lockedScopes.value.includes(sc));
}
const existingAllowedValues = ref<string[]>([]);

const nameRule = (value: string) => {
  if (typeof value !== 'string' || value.trim() === '') return 'Name is required';
  if (props.actionType === 'add' && value.toLowerCase().startsWith('system.'))
    return 'The `system.` prefix is reserved';
  return true;
};

const isValid = computed(() => {
  if (nameRule(data.name) !== true) return false;
  if (!data.scope.length) return false;
  if (data.valueKind === 'enumerated') {
    const total = existingAllowedValues.value.length + data.newAllowedValues.length;
    if (total === 0) return false;
  }
  return true;
});

// Prevent removing locked scopes. Collect every missing locked scope before
// assigning once — reassigning per-scope inside the loop would each time
// rebuild from the same stale `next`, dropping all but the last one added back.
watch(
  () => data.scope,
  (next) => {
    const missing = lockedScopes.value.filter((s) => !next.includes(s));
    if (missing.length) data.scope = [...next, ...missing];
  },
  { deep: true },
);

async function hydrateForEdit() {
  if (props.actionType !== 'edit' || !props.definition) return;
  data.name = props.definition.name;
  data.description = props.definition.description ?? '';
  data.valueKind = props.definition['value-kind'];
  data.scope = [...props.definition.scope];
  lockedScopes.value = [...props.definition.scope];
  data.newAllowedValues = [];
  // List entries omit allowed-values — fetch the full definition.
  if (data.valueKind === 'enumerated') {
    try {
      const full = await functions.getTagDefinition(props.definition.id, false);
      existingAllowedValues.value = full['allowed-values'] ?? [];
    } catch {
      // handled by functions.handleError
    }
  }
}

function reset() {
  data.name = '';
  data.description = '';
  data.valueKind = 'marker';
  data.scope = [];
  data.newAllowedValues = [];
  lockedScopes.value = [];
  existingAllowedValues.value = [];
}

watch(isDialogActive, async (open) => {
  if (open) {
    reset();
    await hydrateForEdit();
  }
});

function save() {
  if (!isValid.value) return;
  const base: TagDefinitionInput = {
    name: data.name.trim(),
    description: data.description.trim() || null,
    valueKind: data.valueKind,
    scope: data.scope,
  };
  if (props.actionType === 'add') {
    if (data.valueKind === 'enumerated') base.allowedValues = data.newAllowedValues;
  } else if (data.valueKind === 'enumerated' && data.newAllowedValues.length) {
    base.addAllowedValues = data.newAllowedValues;
  }
  emit('submit', base);
  isDialogActive.value = false;
}

function cancel() {
  isDialogActive.value = false;
}
</script>
