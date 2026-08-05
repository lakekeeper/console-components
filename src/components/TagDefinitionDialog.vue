<template>
  <v-dialog v-model="isDialogActive" max-width="560">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-if="actionType === 'add'"
          class="me-2"
          v-bind="activatorProps"
          color="info"
          size="small"
          text="New Tag"
          variant="flat"></v-btn>
        <v-btn
          v-else
          v-bind="activatorProps"
          icon="mdi-pencil"
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
          :rules="[nameRule]"></v-text-field>

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
          :persistent-hint="actionType === 'edit'"></v-select>

        <v-select
          v-model="data.scope"
          class="mt-2"
          label="Scope"
          :items="scopeOptions"
          multiple
          chips
          :rules="[(v: string[]) => v.length > 0 || 'Select at least one scope']">
          <template #chip="{ item, props: chipProps }">
            <v-chip
              v-bind="chipProps"
              :closable="!lockedScopes.includes(item.value)"
              :text="item.title"></v-chip>
          </template>
        </v-select>
        <div v-if="actionType === 'edit'" class="text-caption text-disabled mb-2">
          Scope can only be widened — existing scopes cannot be removed.
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
        <v-btn color="success" :disabled="!isValid" @click="save">save</v-btn>
        <v-btn color="error" text="Cancel" @click="cancel"></v-btn>
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

// Prevent removing locked scopes.
watch(
  () => data.scope,
  (next) => {
    for (const s of lockedScopes.value) {
      if (!next.includes(s)) data.scope = [...next, s];
    }
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
    const full = await functions.getTagDefinition(props.definition.id, false);
    existingAllowedValues.value = full['allowed-values'] ?? [];
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
