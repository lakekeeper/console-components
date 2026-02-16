<template>
  <v-dialog v-model="dialog" max-width="900px" persistent>
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
        <span class="text-h5">Register Tables</span>
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

        <!-- Import from file -->
        <div class="d-flex align-center mb-4 ga-2">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-upload"
            @click="triggerFileUpload"
            :disabled="isRegistering">
            Import from CSV / JSON
          </v-btn>
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                size="small"
                variant="tonal"
                prepend-icon="mdi-download"
                :disabled="isRegistering">
                Download Template
              </v-btn>
            </template>
            <v-list density="compact">
              <v-list-item @click="downloadTemplate('csv')" prepend-icon="mdi-file-delimited">
                <v-list-item-title>CSV Template</v-list-item-title>
              </v-list-item>
              <v-list-item @click="downloadTemplate('json')" prepend-icon="mdi-code-json">
                <v-list-item-title>JSON Template</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,.json"
            style="display: none"
            @change="handleFileUpload" />
          <v-chip
            v-if="importError"
            color="error"
            size="small"
            closable
            @click:close="importError = ''">
            {{ importError }}
          </v-chip>
        </div>

        <!-- Table entries list -->
        <div
          v-for="(entry, index) in tableEntries"
          :key="index"
          class="d-flex align-center ga-2 mb-2">
          <v-text-field
            v-model="entry.name"
            label="Table Name"
            placeholder="my_table"
            variant="outlined"
            density="compact"
            :rules="[rules.required, rules.validIdentifier]"
            :disabled="isRegistering"
            hide-details="auto"
            style="flex: 1"></v-text-field>

          <v-text-field
            v-model="entry.metadataLocation"
            label="Metadata Location"
            placeholder="s3://bucket/path/to/metadata/v1.metadata.json"
            variant="outlined"
            density="compact"
            :rules="[rules.required, rules.validUrl]"
            :disabled="isRegistering"
            hide-details="auto"
            style="flex: 2"></v-text-field>

          <!-- Status indicator -->
          <v-icon v-if="entry.status === 'success'" color="success" size="small" title="Registered">
            mdi-check-circle
          </v-icon>
          <v-tooltip v-else-if="entry.status === 'error'" location="top" max-width="400">
            <template #activator="{ props: tooltipProps }">
              <v-icon v-bind="tooltipProps" color="error" size="small">mdi-alert-circle</v-icon>
            </template>
            <span>{{ entry.errorMessage }}</span>
          </v-tooltip>
          <v-progress-circular
            v-else-if="entry.status === 'loading'"
            indeterminate
            size="20"
            width="2"
            color="primary"></v-progress-circular>
          <div v-else style="width: 20px"></div>

          <v-btn
            icon="mdi-close"
            size="x-small"
            variant="text"
            color="error"
            :disabled="isRegistering || tableEntries.length <= 1"
            @click="removeEntry(index)"></v-btn>
        </div>

        <!-- Add row button -->
        <v-btn
          size="small"
          variant="text"
          color="primary"
          prepend-icon="mdi-plus"
          @click="addEntry"
          :disabled="isRegistering"
          class="mb-4">
          Add Table
        </v-btn>

        <!-- Overwrite Toggle -->
        <v-checkbox
          v-model="overwrite"
          density="compact"
          color="warning"
          :disabled="isRegistering"
          class="mb-2"
          hide-details>
          <template #label>
            <span>Overwrite tables if they already exist</span>
            <v-tooltip location="top" max-width="400">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="info" class="ml-2">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>
                If enabled, tables will be re-registered even if a table with the same name already
                exists in the namespace.
              </span>
            </v-tooltip>
          </template>
        </v-checkbox>

        <!-- Results summary after registration -->
        <v-alert
          v-if="registrationDone && failedEntries.length > 0"
          type="warning"
          variant="tonal"
          class="mt-4">
          <div class="text-body-2">
            <strong>
              {{ succeededCount }} of {{ totalAttempted }} table(s) registered successfully.
            </strong>
            <div class="mt-2">
              <div v-for="entry in failedEntries" :key="entry.name" class="d-flex align-center">
                <v-icon size="x-small" color="error" class="mr-1">mdi-close-circle</v-icon>
                <strong>{{ entry.name }}:</strong>
                &nbsp;{{ entry.errorMessage }}
              </div>
            </div>
          </div>
        </v-alert>
        <v-alert
          v-else-if="registrationDone && failedEntries.length === 0"
          type="success"
          variant="tonal"
          class="mt-4">
          All {{ totalAttempted }} table(s) registered successfully.
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="closeDialog" :disabled="isRegistering">
          {{ registrationDone ? 'Close' : 'Cancel' }}
        </v-btn>
        <v-btn
          v-if="!registrationDone"
          color="secondary"
          variant="elevated"
          @click="registerTables"
          :disabled="!canRegister || isRegistering"
          :loading="isRegistering">
          Register {{ validEntries.length }} Table{{ validEntries.length !== 1 ? 's' : '' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

interface TableEntry {
  name: string;
  metadataLocation: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string;
}

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
}>();

const emit = defineEmits<{
  (e: 'registered', tableName: string): void;
}>();

const functions = useFunctions();

const dialog = ref(false);
const overwrite = ref(false);
const warehouseName = ref<string>('');
const isRegistering = ref(false);
const registrationDone = ref(false);
const totalAttempted = ref(0);
const succeededCount = ref(0);
const importError = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const tableEntries = ref<TableEntry[]>([createEmptyEntry()]);

function createEmptyEntry(): TableEntry {
  return { name: '', metadataLocation: '', status: 'idle', errorMessage: '' };
}

// Validation rules
const rules = {
  required: (v: string) => !!v || 'Required',
  validIdentifier: (v: string) => v.trim().length > 0 || 'Identifier cannot be empty',
  validUrl: (v: string) => {
    if (!v) return 'Required';
    const urlPattern = /^(s3[a-z]*|gs|abfss?|wasbs?|https?):\/\/.+/i;
    return urlPattern.test(v.trim()) || 'Must be a valid cloud storage URL';
  },
};

// Computed properties
const displayNamespace = computed(() => {
  return props.namespaceId.split(String.fromCharCode(0x1f)).join('.');
});

const validEntries = computed(() => {
  return tableEntries.value.filter(
    (e) =>
      e.name.trim() !== '' &&
      e.metadataLocation.trim() !== '' &&
      rules.validUrl(e.metadataLocation) === true,
  );
});

const failedEntries = computed(() => {
  return tableEntries.value.filter((e) => e.status === 'error');
});

const canRegister = computed(() => {
  return validEntries.value.length > 0;
});

// Methods
function addEntry() {
  tableEntries.value.push(createEmptyEntry());
}

function removeEntry(index: number) {
  if (tableEntries.value.length > 1) {
    tableEntries.value.splice(index, 1);
  }
}

function triggerFileUpload() {
  fileInput.value?.click();
}

function downloadTemplate(format: 'csv' | 'json') {
  let content: string;
  let filename: string;
  let mimeType: string;

  if (format === 'csv') {
    content = [
      'name,metadata_location',
      'orders,s3://my-bucket/warehouse/orders/metadata/v1.metadata.json',
      'customers,s3://my-bucket/warehouse/customers/metadata/v1.metadata.json',
    ].join('\n');
    filename = 'register_tables_template.csv';
    mimeType = 'text/csv';
  } else {
    content = JSON.stringify(
      [
        {
          name: 'orders',
          metadata_location: 's3://my-bucket/warehouse/orders/metadata/v1.metadata.json',
        },
        {
          name: 'customers',
          metadata_location: 's3://my-bucket/warehouse/customers/metadata/v1.metadata.json',
        },
      ],
      null,
      2,
    );
    filename = 'register_tables_template.json';
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  importError.value = '';
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      let entries: { name: string; metadata_location: string }[] = [];

      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        entries = Array.isArray(parsed) ? parsed : [parsed];
      } else if (file.name.endsWith('.csv')) {
        entries = parseCsv(content);
      } else {
        importError.value = 'Unsupported file type. Use .csv or .json';
        return;
      }

      if (entries.length === 0) {
        importError.value = 'No valid entries found in file';
        return;
      }

      // Validate and add entries
      const newEntries: TableEntry[] = entries
        .filter((e) => e.name && e.metadata_location)
        .map((e) => ({
          name: e.name.trim(),
          metadataLocation: e.metadata_location.trim(),
          status: 'idle' as const,
          errorMessage: '',
        }));

      if (newEntries.length === 0) {
        importError.value = 'No entries with both name and metadata_location found';
        return;
      }

      // Replace the empty first row or append
      if (tableEntries.value.length === 1 && tableEntries.value[0].name === '') {
        tableEntries.value = newEntries;
      } else {
        tableEntries.value.push(...newEntries);
      }
    } catch (err: any) {
      importError.value = `Failed to parse file: ${err.message}`;
    }
  };

  reader.readAsText(file);
  // Reset input so same file can be re-uploaded
  target.value = '';
}

function parseCsv(content: string): { name: string; metadata_location: string }[] {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const locIdx = header.findIndex(
    (h) => h === 'metadata_location' || h === 'metadata-location' || h === 'metadatalocation',
  );

  if (nameIdx === -1 || locIdx === -1) {
    importError.value = 'CSV must have "name" and "metadata_location" columns';
    return [];
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return { name: cols[nameIdx] || '', metadata_location: cols[locIdx] || '' };
  });
}

function resetForm() {
  tableEntries.value = [createEmptyEntry()];
  overwrite.value = false;
  registrationDone.value = false;
  totalAttempted.value = 0;
  succeededCount.value = 0;
  importError.value = '';
}

function closeDialog() {
  if (!isRegistering.value) {
    dialog.value = false;
    setTimeout(resetForm, 300);
  }
}

async function registerTables() {
  if (!canRegister.value) return;

  isRegistering.value = true;
  registrationDone.value = false;

  let namespaceForApi = props.namespaceId;
  if (namespaceForApi.includes('.') && !namespaceForApi.includes(String.fromCharCode(0x1f))) {
    namespaceForApi = namespaceForApi.split('.').join(String.fromCharCode(0x1f));
  }

  const toRegister = validEntries.value;
  totalAttempted.value = toRegister.length;
  succeededCount.value = 0;

  for (const entry of toRegister) {
    entry.status = 'loading';
    entry.errorMessage = '';

    try {
      await functions.registerTable(
        props.warehouseId,
        namespaceForApi,
        entry.name.trim(),
        entry.metadataLocation.trim(),
        overwrite.value,
        false, // don't notify per-table — we show results in the dialog
      );

      entry.status = 'success';
      succeededCount.value++;
      emit('registered', entry.name);
    } catch (err: any) {
      entry.status = 'error';
      entry.errorMessage =
        err?.error?.message || err?.message || err?.toString() || 'Registration failed';
    }
  }

  registrationDone.value = true;
  isRegistering.value = false;
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
