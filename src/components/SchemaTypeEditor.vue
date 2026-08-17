<template>
  <div class="schema-type-editor">
    <div class="d-flex align-center ga-2 flex-wrap">
      <v-select
        :model-value="modelValue.kind"
        :items="KIND_ITEMS"
        label="Kind"
        variant="outlined"
        density="compact"
        hide-details
        style="min-width: 130px; max-width: 150px"
        @update:model-value="changeKind" />

      <v-select
        v-if="modelValue.kind === 'primitive'"
        :model-value="modelValue.type"
        :items="availableTypes"
        label="Type"
        variant="outlined"
        density="compact"
        hide-details
        style="min-width: 160px; max-width: 200px"
        @update:model-value="changePrimitive" />

      <span v-else class="text-caption text-medium-emphasis font-monospace">
        {{ formatTypeNode(modelValue) }}
      </span>
    </div>

    <!-- Nested members. Indented and rule-marked so depth is readable without
         reading the summary above. -->
    <div v-if="modelValue.kind !== 'primitive'" class="nested mt-2">
      <template v-if="modelValue.kind === 'struct'">
        <div
          v-for="(field, index) in modelValue.fields"
          :key="index"
          class="mb-3 pb-2 nested-field">
          <div class="d-flex align-center ga-2 flex-wrap mb-2">
            <v-text-field
              :model-value="field.name"
              label="Field name"
              placeholder="column_name"
              variant="outlined"
              density="compact"
              hide-details
              style="min-width: 160px; max-width: 220px"
              @update:model-value="(v: string) => updateStructField(index, { name: v })" />
            <v-checkbox
              :model-value="field.nullable"
              label="Nullable"
              density="compact"
              hide-details
              @update:model-value="
                (v: boolean | null) => updateStructField(index, { nullable: !!v })
              " />
            <v-spacer />
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              color="error"
              variant="text"
              :disabled="modelValue.fields.length === 1"
              @click="removeStructField(index)" />
          </div>
          <!-- Nested fields carry `doc` too, so they get the same description
               input as the top level. -->
          <v-text-field
            :model-value="field.doc"
            label="Description (optional)"
            placeholder="What this field holds"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-2"
            @update:model-value="(v: string) => updateStructField(index, { doc: v })" />

          <SchemaTypeEditor
            :model-value="field.type"
            :available-types="availableTypes"
            @update:model-value="(t: TypeNode) => updateStructField(index, { type: t })" />
        </div>
        <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addStructField">
          Add nested field
        </v-btn>
      </template>

      <template v-else-if="modelValue.kind === 'list'">
        <div class="d-flex align-center ga-2 mb-2">
          <span class="text-caption text-medium-emphasis">Element</span>
          <v-checkbox
            :model-value="modelValue.elementNullable"
            label="Nullable"
            density="compact"
            hide-details
            @update:model-value="(v: boolean | null) => emitPatch({ elementNullable: !!v })" />
        </div>
        <SchemaTypeEditor
          :model-value="modelValue.element"
          :available-types="availableTypes"
          @update:model-value="(t: TypeNode) => emitPatch({ element: t })" />
      </template>

      <template v-else-if="modelValue.kind === 'map'">
        <!-- Iceberg map keys are always required, so no flag here. -->
        <div class="text-caption text-medium-emphasis mb-2">Key (always required)</div>
        <SchemaTypeEditor
          :model-value="modelValue.key"
          :available-types="availableTypes"
          @update:model-value="(t: TypeNode) => emitPatch({ key: t })" />

        <div class="d-flex align-center ga-2 mt-3 mb-2">
          <span class="text-caption text-medium-emphasis">Value</span>
          <v-checkbox
            :model-value="modelValue.valueNullable"
            label="Nullable"
            density="compact"
            hide-details
            @update:model-value="(v: boolean | null) => emitPatch({ valueNullable: !!v })" />
        </div>
        <SchemaTypeEditor
          :model-value="modelValue.value"
          :available-types="availableTypes"
          @update:model-value="(t: TypeNode) => emitPatch({ value: t })" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  formatTypeNode,
  newSchemaField,
  nodeForKind,
  type SchemaField,
  type TypeNode,
} from '@/common/icebergTypes';

/**
 * Recursive editor for one Iceberg type.
 *
 * Builds struct/list/map by clicking rather than by typing a type expression,
 * which also lets every member carry its own required flag.
 */
defineOptions({ name: 'SchemaTypeEditor' });

const props = defineProps<{
  modelValue: TypeNode;
  availableTypes: string[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: TypeNode): void }>();

const KIND_ITEMS = [
  { title: 'Primitive', value: 'primitive' },
  { title: 'Struct', value: 'struct' },
  { title: 'List', value: 'list' },
  { title: 'Map', value: 'map' },
];

function emitPatch(patch: Record<string, unknown>) {
  emit('update:modelValue', { ...props.modelValue, ...patch } as TypeNode);
}

function changeKind(kind: TypeNode['kind']) {
  if (kind === props.modelValue.kind) return;
  emit('update:modelValue', nodeForKind(kind));
}

function changePrimitive(type: string) {
  emit('update:modelValue', { kind: 'primitive', type });
}

function updateStructField(index: number, patch: Partial<SchemaField>) {
  if (props.modelValue.kind !== 'struct') return;
  const fields = props.modelValue.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
  emit('update:modelValue', { kind: 'struct', fields });
}

function addStructField() {
  if (props.modelValue.kind !== 'struct') return;
  emit('update:modelValue', {
    kind: 'struct',
    fields: [...props.modelValue.fields, newSchemaField()],
  });
}

function removeStructField(index: number) {
  if (props.modelValue.kind !== 'struct') return;
  const fields = props.modelValue.fields.filter((_, i) => i !== index);
  emit('update:modelValue', { kind: 'struct', fields });
}
</script>

<style scoped>
.nested {
  padding-left: 16px;
  border-left: 2px solid rgba(var(--v-border-color), 0.22);
}

.nested-field:not(:last-of-type) {
  border-bottom: 1px dashed rgba(var(--v-border-color), 0.18);
}

.font-monospace {
  font-family: monospace;
}
</style>
