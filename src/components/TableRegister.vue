<template>
  <v-dialog v-model="dialog" max-width="800px" persistent>
    <template #activator="{ props: dialogProps }">
      <v-btn
        v-bind="dialogProps"
        size="small"
        color="secondary"
        variant="elevated"
        prepend-icon="mdi-table-arrow-down">
        Register Table
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span class="text-h5">Register Existing Table</span>
        <v-btn icon="mdi-close" variant="text" @click="closeDialog"></v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Namespace Info -->
        <v-alert type="info" variant="tonal" class="mb-4">
          <div class="text-body-2">
            <strong>Catalog:</strong>
            {{ warehouseName }}
            <br />
            <strong>Namespace:</strong>
            {{ displayNamespace }}
          </div>
        </v-alert>

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

        <!-- Metadata Location -->
        <v-text-field
          v-model="metadataLocation"
          label="Metadata Location"
          placeholder="s3://bucket/path/to/metadata/v1.metadata.json"
          variant="outlined"
          density="comfortable"
          :rules="[rules.required, rules.validUrl]"
          class="mb-4"
          hint="Full path to the Iceberg metadata JSON file"
          persistent-hint></v-text-field>

        <!-- Overwrite Toggle -->
        <v-checkbox
          v-model="overwrite"
          label="Overwrite table if it already exists"
          density="compact"
          color="warning"
          class="mb-4"
          hide-details>
          <template #label>
            <span>Overwrite table if it already exists</span>
            <v-tooltip location="top" max-width="400">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="info" class="ml-2">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>
                If enabled, the table will be re-registered even if a table with this name already
                exists in the namespace.
              </span>
            </v-tooltip>
          </template>
        </v-checkbox>

        <!-- Error Message -->
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
        </v-alert>

        <!-- Loading State -->
        <v-alert v-if="isRegistering" type="info" variant="tonal" class="mb-4">
          <v-progress-circular indeterminate size="24" class="mr-2"></v-progress-circular>
          Registering table...
        </v-alert>

        <!-- Success Message -->
        <v-alert v-if="success" type="success" variant="tonal" class="mb-4">
          Table registered successfully!
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="closeDialog" :disabled="isRegistering">Cancel</v-btn>
        <v-btn
          color="secondary"
          variant="elevated"
          @click="registerTable"
          :disabled="!canRegister || isRegistering"
          :loading="isRegistering">
          Register Table
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
}>();

const emit = defineEmits<{
  (e: 'registered', tableName: string): void;
}>();

const functions = useFunctions();

const dialog = ref(false);
const tableName = ref('');
const metadataLocation = ref('');
const overwrite = ref(false);
const warehouseName = ref<string>('');
const isRegistering = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  validIdentifier: (v: string) => v.trim().length > 0 || 'Identifier cannot be empty',
  validUrl: (v: string) => {
    if (!v) return 'Required';
    // Basic validation for cloud storage URLs
    const urlPattern = /^(s3[a-z]*|gs|abfss?|wasbs?|https?):\/\/.+/i;
    return urlPattern.test(v.trim()) || 'Must be a valid cloud storage URL';
  },
};

// Computed properties
const displayNamespace = computed(() => {
  // Convert unit separator to dots for display
  return props.namespaceId.split(String.fromCharCode(0x1f)).join('.');
});

const canRegister = computed(() => {
  return (
    tableName.value.trim() !== '' &&
    metadataLocation.value.trim() !== '' &&
    rules.validUrl(metadataLocation.value) === true
  );
});

// Methods
function resetForm() {
  tableName.value = '';
  metadataLocation.value = '';
  overwrite.value = false;
  error.value = null;
  success.value = false;
}

function closeDialog() {
  if (!isRegistering.value) {
    dialog.value = false;
    setTimeout(resetForm, 300); // Reset after transition
  }
}

async function registerTable() {
  if (!canRegister.value) return;

  isRegistering.value = true;
  error.value = null;
  success.value = false;

  try {
    // Ensure namespace uses unit separator (0x1F) not dots
    // The API expects namespace parts to be separated by the unit separator character
    let namespaceForApi = props.namespaceId;

    // If the namespace contains dots but no unit separators, it's in display format
    // and needs to be converted to API format
    if (namespaceForApi.includes('.') && !namespaceForApi.includes(String.fromCharCode(0x1f))) {
      namespaceForApi = namespaceForApi.split('.').join(String.fromCharCode(0x1f));
    }

    await functions.registerTable(
      props.warehouseId,
      namespaceForApi,
      tableName.value.trim(),
      metadataLocation.value.trim(),
      overwrite.value,
      true, // notify
    );

    success.value = true;
    emit('registered', tableName.value);

    // Close dialog after short delay
    setTimeout(() => {
      closeDialog();
    }, 1500);
  } catch (err: any) {
    console.error('Failed to register table:', err);
    error.value = err.message || 'Unknown error occurred';
  } finally {
    isRegistering.value = false;
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
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
