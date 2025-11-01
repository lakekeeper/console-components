<template>
  <v-dialog v-model="dialog" max-width="900px" persistent>
    <template #activator="{ props: dialogProps }">
      <v-btn
        v-bind="dialogProps"
        size="small"
        color="primary"
        variant="elevated"
        prepend-icon="mdi-table-plus">
        Add Table
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span class="text-h5">Create Table</span>
        <v-btn icon="mdi-close" variant="text" @click="closeDialog"></v-btn>
      </v-card-title>

      <v-card-text>
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
            <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="addField">
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
                    icon="mdi-delete"
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
              <pre class="bg-grey-lighten-4 pa-3 rounded text-caption">{{ sqlPreview }}</pre>
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

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="closeDialog" :disabled="isCreating">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          @click="createTable"
          :disabled="!canCreate || isCreating"
          :loading="isCreating">
          Create Table
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useUserStore } from '@/stores/user';
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';
import { useStorageValidation } from '@/composables/useStorageValidation';

interface Props {
  warehouseId: string;
  namespaceId: string;
  catalogUrl: string;
  storageType?: string; // Storage type: s3, adls, gcs, etc.
}

interface Field {
  name: string;
  type: string;
  nullable: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'created', tableName: string): void;
}>();

const functions = useFunctions();
const userStore = useUserStore();
const icebergDB = useIcebergDuckDB();
const storageValidation = useStorageValidation(
  toRef(() => props.storageType),
  toRef(() => props.catalogUrl),
);

// Iceberg primitive types
const icebergDataTypes = [
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
  'timestamp_ns',
  'timestamptz_ns',
  'string',
  'uuid',
  'fixed(16)',
  'binary',
];

const dialog = ref(false);
const tableName = ref('');
const warehouseName = ref<string>('');
const fields = ref<Field[]>([]);
const isCreating = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  validIdentifier: (v: string) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v) ||
    'Must be a valid identifier (letters, numbers, underscore)',
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

  // For Iceberg, use simple dot-separated unquoted identifiers
  // DuckDB Iceberg expects: catalog.namespace.table
  const fullTablePath = `"${warehouseName.value}"."${props.namespaceId}"."${tableName.value}"`;

  return `CREATE TABLE ${fullTablePath} (
${fieldDefinitions}
);`;
});
// Methods
function addField() {
  fields.value.push({
    name: '',
    type: 'string',
    nullable: true,
  });
}

function removeField(index: number) {
  fields.value.splice(index, 1);
}

function resetForm() {
  tableName.value = '';
  fields.value = [];
  error.value = null;
  success.value = false;
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

    // Configure Iceberg catalog
    await icebergDB.configureCatalog({
      catalogName: warehouseName.value,
      restUri: props.catalogUrl,
      accessToken: userStore.user.access_token,
    });

    // Build CREATE TABLE SQL with ATTACH
    const createTableSQL = sqlPreview.value;
    const query = `
      -- Attach catalog on this connection
      ATTACH IF NOT EXISTS '${warehouseName.value}' AS ${warehouseName.value} (
        TYPE iceberg,
        SECRET iceberg_secret,
        ENDPOINT '${props.catalogUrl}'
      );
      
      -- Create the table
      ${createTableSQL}
    `;

    await icebergDB.executeQuery(query);

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
      const wh = await functions.getWarehouse(props.warehouseId);
      warehouseName.value = wh.name;
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
