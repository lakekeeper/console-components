<template>
  <v-dialog v-model="dialog" max-width="1000" persistent>
    <template #activator="{ props: dialogProps }">
      <v-btn
        v-bind="dialogProps"
        size="small"
        color="primary"
        variant="flat"
        prepend-icon="mdi-table-plus">
        Add Table
      </v-btn>
    </template>

    <!-- Bounded so the schema list cannot push the title off the top and the
         Create button below the fold: only the body between them scrolls. -->
    <v-card style="max-height: 90vh; display: flex; flex-direction: column">
      <v-card-title class="d-flex justify-space-between align-center text-subtitle-1 py-3">
        Create Table
        <v-btn icon="mdi-close" variant="text" size="small" @click="closeDialog"></v-btn>
      </v-card-title>

      <!-- Creating through the catalog means the version is ours to send, so it
           is a choice among what the warehouse permits rather than a prediction. -->
      <div v-if="warehouseName" class="d-flex align-center ga-3 px-4 pt-2 flex-wrap">
        <v-select
          v-if="selectableFormatVersions.length > 1"
          v-model="formatVersion"
          :items="selectableFormatVersions"
          label="Format version"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 190px">
          <template #selection="{ item }">Iceberg v{{ item.value }}</template>
          <template #item="{ item, props: itemProps }">
            <v-list-item v-bind="itemProps" :title="`Iceberg v${item.value}`" />
          </template>
        </v-select>
        <v-chip v-else size="x-small" variant="tonal">Iceberg v{{ formatVersion }}</v-chip>

        <span class="text-caption text-medium-emphasis">
          <template v-if="selectableFormatVersions.length > 1">
            allowed by the warehouse policy
          </template>
          <template v-else>set by the warehouse policy</template>
          <template v-if="formatVersion < 3">
            · v3 types ({{ V3_PRIMITIVE_TYPES.join(', ') }}) need v3
          </template>
        </span>
      </div>

      <v-tabs v-model="formatTab" align-tabs="start" density="compact" color="primary">
        <v-tab value="iceberg">
          <v-img :src="icebergIcon" width="16" height="16" class="mr-2" />
          Iceberg
        </v-tab>
        <v-tab value="generic">Generic (Lance, Delta, Vortex…)</v-tab>
      </v-tabs>
      <v-divider></v-divider>

      <v-tabs-window v-model="formatTab" crossfade class="create-table-window">
        <v-tabs-window-item value="iceberg" class="create-table-pane">
          <v-card-text ref="icebergBodyRef" style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
            <!-- Table Name -->
            <v-text-field
              v-model="tableName"
              label="Table Name"
              placeholder="my_table"
              variant="outlined"
              density="comfortable"
              :rules="[rules.required, rules.validIdentifier]"
              class="mb-4"
              autofocus></v-text-field>

            <!-- No storage warnings here any more: the catalog writes the
                 metadata, so creation needs no browser-side storage access. -->
            <!-- Namespace Info -->
            <v-alert type="info" variant="tonal" class="mb-4">
              <div class="text-body-2">
                <strong>Catalog:</strong>
                {{ warehouseName }}
                <br />
                <strong>Namespace:</strong>
                {{ namespaceId }}
              </div>
            </v-alert>

            <!-- Schema Fields -->
            <div class="mb-4">
              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-h6">Schema</span>
                <v-btn
                  variant="text"
                  color="primary"
                  size="small"
                  prepend-icon="mdi-plus"
                  @click="addField">
                  Add Field
                </v-btn>
              </div>

              <div class="text-caption text-medium-emphasis mb-3">
                Set a field's
                <strong>Kind</strong>
                to Struct, List or Map to nest — each nested member gets its own type and nullable
                flag, to any depth.
              </div>

              <v-alert
                v-if="unsupportedForVersion.length"
                type="warning"
                variant="tonal"
                class="mb-3">
                {{ unsupportedForVersion.join(', ') }}
                {{ unsupportedForVersion.length === 1 ? 'requires' : 'require' }} format version 3.
                Raise the version, or change those fields.
              </v-alert>

              <v-alert v-if="fields.length === 0" type="warning" variant="tonal">
                No fields defined. Add at least one field to create the table.
              </v-alert>

              <v-list v-else lines="two" class="pa-0">
                <v-list-item
                  v-for="(field, index) in fields"
                  :key="index"
                  class="px-0 mb-2 border rounded">
                  <v-row dense class="px-4">
                    <!-- Field Name -->
                    <v-col cols="12" sm="4">
                      <v-text-field
                        v-model="field.name"
                        label="Field Name"
                        placeholder="column_name"
                        variant="outlined"
                        density="compact"
                        :rules="[rules.required, rules.validIdentifier]"
                        hide-details="auto"></v-text-field>
                    </v-col>

                    <!-- Nullable + Delete -->
                    <v-col cols="12" sm="8" class="d-flex align-center">
                      <v-checkbox
                        v-model="field.nullable"
                        label="Nullable"
                        density="compact"
                        hide-details></v-checkbox>
                      <v-spacer></v-spacer>
                      <v-btn
                        icon="mdi-delete-outline"
                        size="small"
                        color="error"
                        variant="text"
                        @click="removeField(index)"></v-btn>
                    </v-col>

                    <!-- Column documentation, stored as the field's `doc`. -->
                    <v-col cols="12" class="pb-2">
                      <v-text-field
                        v-model="field.doc"
                        label="Description (optional)"
                        placeholder="What this column holds"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"></v-text-field>
                    </v-col>

                    <!-- Type, built rather than typed. Recurses for struct,
                         list and map. -->
                    <v-col cols="12" class="pb-3">
                      <SchemaTypeEditor v-model="field.type" :available-types="icebergDataTypes" />
                    </v-col>
                  </v-row>
                </v-list-item>
              </v-list>
            </div>

            <!-- Request Preview: what actually goes to the catalog. -->
            <v-expansion-panels v-if="requestPreview" class="mb-4">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <v-icon class="mr-2">mdi-code-braces</v-icon>
                  Request Preview
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="bg-surface-light pa-3 rounded text-caption">{{ requestPreview }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <!-- Error Message -->
            <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
              {{ error }}
            </v-alert>

            <!-- Loading State -->
            <v-alert v-if="isCreating" type="info" variant="tonal" class="mb-4">
              <v-progress-circular indeterminate size="24" class="mr-2"></v-progress-circular>
              Creating table...
            </v-alert>

            <!-- Success Message -->
            <v-alert v-if="success" type="success" variant="tonal" class="mb-4">
              Table created successfully!
            </v-alert>
          </v-card-text>

          <v-card-actions
            style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="closeDialog" :disabled="isCreating">Cancel</v-btn>
            <v-btn
              color="primary"
              variant="flat"
              @click="createTable"
              :disabled="!canCreate || isCreating"
              :loading="isCreating">
              Create Table
            </v-btn>
          </v-card-actions>
        </v-tabs-window-item>

        <v-tabs-window-item value="generic" class="create-table-pane">
          <v-card-text style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
            <v-alert type="info" variant="tonal" prominent class="my-2">
              <div class="text-body-1 font-weight-bold mb-2">Roadmap</div>
              <div class="text-body-2">
                Creating generic tables (Lance, Delta, Vortex, …) through the UI is on the roadmap.
                For now, create them from your data engine (for example a Lance writer) and they
                will appear here automatically.
              </div>
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="closeDialog">Close</v-btn>
          </v-card-actions>
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, nextTick } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useLoQE } from '@/composables/useLoQE';
import icebergIcon from '@/assets/iceberg.svg';
import {
  V2_PRIMITIVE_TYPES,
  V3_PRIMITIVE_TYPES,
  buildSchema,
  newSchemaField,
  unsupportedPrimitives,
  type SchemaField,
  type TypeNode,
} from '@/common/icebergTypes';
import SchemaTypeEditor from './SchemaTypeEditor.vue';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  // Both are unused since creation moved to the catalog: no browser-side
  // storage access means no storage validation. Kept so existing callers keep
  // type-checking.
  catalogUrl?: string;
  storageType?: string;
}>();

const emit = defineEmits<{
  (e: 'created', tableName: string): void;
}>();

const config = inject<any>('appConfig', { enabledAuthentication: false });
const functions = useFunctions();
// Only to invalidate DuckDB's cached metadata after a create — creation itself
// no longer goes through the engine.
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });

const dialog = ref(false);
const formatTab = ref<'iceberg' | 'generic'>('iceberg');
const tableName = ref('');
const warehouseName = ref<string>('');
const allowedFormatVersions = ref<number[]>([]);
const defaultFormatVersion = ref<number | null>(null);

/** The version chosen for this table; sent as the `format-version` property. */
const formatVersion = ref<number>(2);

/** What the warehouse permits. Empty means it never said, so don't offer a choice. */
const selectableFormatVersions = computed(() => [...allowedFormatVersions.value].sort());

/**
 * The version to preselect: the warehouse default, else v2 when allowed, else
 * the highest allowed. Mirrors the server's own resolution, so the preselected
 * value matches what a table would have got before this picker existed.
 */
function resolveDefaultVersion(): number {
  if (defaultFormatVersion.value) return defaultFormatVersion.value;
  const allowed = allowedFormatVersions.value;
  if (!allowed.length) return 2;
  return allowed.includes(2) ? 2 : Math.max(...allowed);
}

const icebergDataTypes = computed(() => [
  ...V2_PRIMITIVE_TYPES,
  ...(formatVersion.value >= 3 ? V3_PRIMITIVE_TYPES : []),
]);

/**
 * v3-only primitives left somewhere in the tree after the version was lowered.
 * Reported rather than rewritten, so lowering the version cannot quietly change
 * a column's type.
 */
const unsupportedForVersion = computed(() =>
  unsupportedPrimitives(fields.value, formatVersion.value),
);

/** Every field needs a name, including nested ones. */
function fieldsNamed(list: SchemaField[]): boolean {
  return list.every((f) => {
    if (!f.name.trim()) return false;
    return typeNamed(f.type);
  });
}

function typeNamed(node: TypeNode): boolean {
  if (node.kind === 'struct') return node.fields.length > 0 && fieldsNamed(node.fields);
  if (node.kind === 'list') return typeNamed(node.element);
  if (node.kind === 'map') return typeNamed(node.key) && typeNamed(node.value);
  return true;
}
const fields = ref<SchemaField[]>([]);
const isCreating = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  validIdentifier: (v: string) => v.trim().length > 0 || 'Identifier cannot be empty',
};

// Creation no longer touches storage from the browser, so the only bar is a
// valid schema.
const canCreate = computed(() => {
  return (
    tableName.value.trim() !== '' &&
    fields.value.length > 0 &&
    fieldsNamed(fields.value) &&
    unsupportedForVersion.value.length === 0
  );
});

const requestPreview = computed(() => {
  if (!tableName.value || fields.value.length === 0) return '';
  return JSON.stringify(buildCreateRequest(), null, 2);
});

function buildCreateRequest() {
  return {
    name: tableName.value.trim(),
    schema: buildSchema(fields.value),
    // No `location`: let the warehouse apply its own layout rules.
    properties: { 'format-version': String(formatVersion.value) },
  };
}
// Methods
// The body scrolls now, so a field appended below the fold would otherwise be
// added out of sight.
const icebergBodyRef = ref<{ $el?: HTMLElement } | null>(null);

async function addField() {
  fields.value.push(newSchemaField());
  await nextTick();
  const body = icebergBodyRef.value?.$el;
  if (body) body.scrollTop = body.scrollHeight;
}

function removeField(index: number) {
  fields.value.splice(index, 1);
}

function resetForm() {
  tableName.value = '';
  fields.value = [];
  error.value = null;
  success.value = false;
  formatTab.value = 'iceberg';
}

function closeDialog() {
  if (!isCreating.value) {
    dialog.value = false;
    setTimeout(resetForm, 300); // Reset after transition
  }
}

async function createTable() {
  if (!canCreate.value) return;

  isCreating.value = true;
  error.value = null;
  success.value = false;

  try {
    await functions.createIcebergTable(props.warehouseId, props.namespaceId, buildCreateRequest());

    // DuckDB caches Iceberg metadata, and attach is idempotent — so a session
    // that already holds this catalog would not see the new table. No-ops when
    // the engine was never initialised.
    await loqe.refreshMetadata().catch(() => {
      /* a stale query cache must not fail the create */
    });

    success.value = true;
    emit('created', tableName.value);

    // Close dialog after short delay
    setTimeout(() => {
      closeDialog();
    }, 1500);
  } catch (err: any) {
    console.error('Failed to create table:', err);
    error.value = err.message || 'Unknown error occurred';
  } finally {
    isCreating.value = false;
  }
}

// Load warehouse name when dialog opens
watch(dialog, async (newVal) => {
  if (newVal) {
    try {
      const wh: any = await functions.getWarehouse(props.warehouseId);
      warehouseName.value = wh.name;
      allowedFormatVersions.value = wh['allowed-format-versions'] ?? [];
      defaultFormatVersion.value = wh['default-format-version'] ?? null;
      formatVersion.value = resolveDefaultVersion();
    } catch (err) {
      console.error('Failed to load warehouse:', err);
    }
  }
});
</script>

<style scoped>
.border {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>

<style scoped>
/* VWindow inserts its own container between the window and the pane, so the flex
   chain has to be re-established through it or the inner overflow never engages. */
.create-table-window {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
.create-table-window :deep(.v-window__container) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
.create-table-pane {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
