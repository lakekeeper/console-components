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

      <!-- The version is the warehouse's to decide: this dialog creates through
           DuckDB's CREATE TABLE, which carries no table properties. Saying so
           explains why the nanosecond types come and go. -->
      <div v-if="warehouseName" class="d-flex align-center ga-2 px-4 pt-2">
        <v-chip size="x-small" variant="tonal">
          Iceberg v{{ effectiveFormatVersion }}
          <v-tooltip activator="parent" location="bottom" max-width="360">
            <template v-if="effectiveFormatVersion >= 3">
              This warehouse creates v3 tables, so v3-only types ({{ V3_DATA_TYPES.join(', ') }})
              are available.
            </template>
            <template v-else>
              This warehouse creates v{{ effectiveFormatVersion }} tables, so v3-only types ({{
                V3_DATA_TYPES.join(', ')
              }}) are not offered. Change the warehouse's format-version policy to allow them.
            </template>
          </v-tooltip>
        </v-chip>
        <span class="text-caption text-medium-emphasis">set by the warehouse policy</span>
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

            <!-- S3/GCS + HTTP Warning -->
            <v-alert v-if="showS3HttpWarning" type="warning" variant="tonal" class="mb-4" closable>
              <div class="text-body-1 font-weight-bold mb-2">Security Warning</div>
              <div class="text-body-2">
                {{ storageValidation.httpWarningMessage }}
              </div>
            </v-alert>

            <!-- Table Creation Not Available Warning -->
            <v-alert
              v-if="!isCreateAvailable.available"
              type="warning"
              variant="tonal"
              prominent
              class="mb-4">
              <div class="text-body-1 font-weight-bold mb-2">
                <v-icon class="mr-2">mdi-alert</v-icon>
                Table Creation Not Available
              </div>
              <div class="text-body-2">{{ isCreateAvailable.reason }}</div>
              <div class="text-body-2 mt-3">
                <strong>Requirements for DuckDB WASM:</strong>
                <ul class="mt-2">
                  <li>{{ storageValidation.requirementsText.value.storageRequirement }}</li>
                  <li>{{ storageValidation.requirementsText.value.protocolRequirement }}</li>
                </ul>
              </div>
            </v-alert>
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

                    <!-- Field Type -->
                    <v-col cols="12" sm="4">
                      <v-select
                        v-model="field.type"
                        :items="icebergDataTypes"
                        label="Data Type"
                        variant="outlined"
                        density="compact"
                        :rules="[rules.required]"
                        no-data-text="No data types available"
                        hide-details="auto"></v-select>
                    </v-col>

                    <!-- Nullable + Delete -->
                    <v-col cols="12" sm="4" class="d-flex align-center">
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
                  </v-row>
                </v-list-item>
              </v-list>
            </div>

            <!-- SQL Preview -->
            <v-expansion-panels v-if="sqlPreview" class="mb-4">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <v-icon class="mr-2">mdi-code-braces</v-icon>
                  SQL Preview
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="bg-surface-light pa-3 rounded text-caption">{{ sqlPreview }}</pre>
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
import { ref, computed, watch, toRef, inject, nextTick } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useLoQE } from '@/composables/useLoQE';
import { useStorageValidation } from '@/composables/useStorageValidation';
import icebergIcon from '@/assets/iceberg.svg';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  catalogUrl: string;
  storageType?: string; // Storage type: s3, adls, gcs, etc.
}>();

interface Field {
  name: string;
  type: string;
  nullable: boolean;
}
const emit = defineEmits<{
  (e: 'created', tableName: string): void;
}>();

const config = inject<any>('appConfig', { enabledAuthentication: false });
const functions = useFunctions();
const userStore = useUserStore();
const loqe = useLoQE({ baseUrlPrefix: config.baseUrlPrefix });
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
);

// Namespace display: convert \x1F separators to dots for DuckDB SQL
const namespaceDisplay = computed(() => {
  const ns = props.namespaceId;
  if (ns.includes('\x1F')) return ns.split('\x1F').join('.');
  return ns;
});

/**
 * Iceberg primitive types available in v2 and earlier.
 */
const V2_DATA_TYPES = [
  'boolean',
  'int',
  'long',
  'float',
  'double',
  'decimal(10,2)',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'string',
  'uuid',
  'fixed(16)',
  'binary',
];

/**
 * Types the Iceberg spec introduced in v3. Offering them on a v2 table produces
 * a table the catalog refuses, so they appear only when the warehouse will
 * actually create v3.
 */
const V3_DATA_TYPES = ['timestamp_ns', 'timestamptz_ns'];

const dialog = ref(false);
const formatTab = ref<'iceberg' | 'generic'>('iceberg');
const tableName = ref('');
const warehouseName = ref<string>('');
const allowedFormatVersions = ref<number[]>([]);
const defaultFormatVersion = ref<number | null>(null);

/**
 * The version this table will actually be created as.
 *
 * The dialog creates through DuckDB's `CREATE TABLE`, which carries no table
 * properties, so the version is entirely the warehouse's to decide. Mirrors the
 * server's own resolution: the configured default, else v2 when allowed, else
 * the highest allowed version.
 */
const effectiveFormatVersion = computed(() => {
  if (defaultFormatVersion.value) return defaultFormatVersion.value;
  const allowed = allowedFormatVersions.value;
  if (!allowed.length) return 2;
  return allowed.includes(2) ? 2 : Math.max(...allowed);
});

const icebergDataTypes = computed(() =>
  effectiveFormatVersion.value >= 3 ? [...V2_DATA_TYPES, ...V3_DATA_TYPES] : [...V2_DATA_TYPES],
);
const fields = ref<Field[]>([]);
const isCreating = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  validIdentifier: (v: string) => v.trim().length > 0 || 'Identifier cannot be empty',
};

// Computed properties
const canCreate = computed(() => {
  return (
    isCreateAvailable.value.available &&
    tableName.value.trim() !== '' &&
    fields.value.length > 0 &&
    fields.value.every((f) => f.name.trim() !== '' && f.type.trim() !== '')
  );
});

const isCreateAvailable = computed(() => ({
  available: storageValidation.isOperationAvailable.value.available,
  reason: storageValidation.isOperationAvailable.value.reason,
}));

// Check if we should show S3/GCS + HTTP warning
const showS3HttpWarning = storageValidation.shouldShowHttpWarning;

const sqlPreview = computed(() => {
  if (!tableName.value || fields.value.length === 0) return '';

  const fieldDefinitions = fields.value
    .map((f) => {
      const nullable = f.nullable ? '' : ' NOT NULL';
      return `  ${f.name} ${f.type}${nullable}`;
    })
    .join(',\n');

  // For Iceberg, DuckDB expects the full namespace as a single quoted identifier
  // DuckDB Iceberg expects: "catalog"."namespace.with.dots"."table"
  const fullTablePath = `"${warehouseName.value}"."${namespaceDisplay.value}"."${tableName.value}"`;

  return `CREATE TABLE ${fullTablePath} (
${fieldDefinitions}
);`;
});
// Methods
// The body scrolls now, so a field appended below the fold would otherwise be
// added out of sight.
const icebergBodyRef = ref<{ $el?: HTMLElement } | null>(null);

async function addField() {
  fields.value.push({
    name: '',
    type: 'string',
    nullable: true,
  });
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
    // Load warehouse to get name
    const wh = await functions.getWarehouse(props.warehouseId);
    warehouseName.value = wh.name;

    // Attach Iceberg catalog via LoQE (handles secret + ATTACH)
    await loqe.attachCatalog({
      catalogName: warehouseName.value,
      projectId: wh['project-id'],
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
    });

    // Create the table
    await loqe.query(sqlPreview.value);

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
      // A field left on a v3 type would silently produce a table the catalog
      // rejects, so it falls back rather than being carried into the SQL.
      if (effectiveFormatVersion.value < 3) {
        for (const f of fields.value) {
          if (V3_DATA_TYPES.includes(f.type)) f.type = 'timestamp';
        }
      }
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
