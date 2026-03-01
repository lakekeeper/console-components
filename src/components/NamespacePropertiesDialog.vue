<template>
  <v-dialog v-model="isDialogActive" max-width="650" scrollable>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        icon
        size="small"
        variant="text"
        :title="'Namespace Properties'">
        <v-icon size="small">mdi-cog</v-icon>
        <v-tooltip activator="parent" location="bottom">Properties</v-tooltip>
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-text-box-multiple-outline</v-icon>
        Namespace Properties
      </v-card-title>

      <v-card-text>
        <v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="mb-4">
          {{ loadError }}
        </v-alert>

        <v-skeleton-loader v-if="loading" type="table-row@3"></v-skeleton-loader>

        <template v-else>
          <div class="d-flex align-center mb-3">
            <span class="text-subtitle-2">
              {{ editableProperties.length }} propert{{
                editableProperties.length === 1 ? 'y' : 'ies'
              }}
            </span>
            <v-spacer></v-spacer>
            <v-btn
              v-if="canEdit"
              color="info"
              density="compact"
              size="small"
              variant="text"
              @click="addProperty">
              <v-icon start>mdi-plus</v-icon>
              Add Property
            </v-btn>
          </div>

          <!-- Read-only view when no edit permission -->
          <v-table v-if="!canEdit" density="compact">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prop in editableProperties" :key="prop.originalKey">
                <td class="text-body-2">{{ prop.key }}</td>
                <td class="text-body-2">{{ prop.value }}</td>
              </tr>
              <tr v-if="editableProperties.length === 0">
                <td colspan="2" class="text-center text-medium-emphasis py-4">No properties set</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Editable view -->
          <template v-else>
            <div
              v-for="(prop, index) in editableProperties"
              :key="index"
              class="d-flex align-center ga-2 mb-2">
              <v-text-field
                v-model="prop.key"
                density="compact"
                hide-details
                label="Key"
                placeholder="key"
                variant="outlined"
                :readonly="prop.isExisting"></v-text-field>
              <v-text-field
                v-model="prop.value"
                density="compact"
                hide-details
                label="Value"
                placeholder="value"
                variant="outlined"></v-text-field>
              <v-btn
                color="error"
                density="compact"
                icon="mdi-close"
                size="small"
                variant="text"
                @click="removeProperty(index)">
                <v-icon>mdi-close</v-icon>
                <v-tooltip activator="parent" location="bottom">Remove</v-tooltip>
              </v-btn>
            </div>

            <div
              v-if="editableProperties.length === 0"
              class="text-center text-medium-emphasis py-4">
              No properties set. Click "Add Property" to create one.
            </div>
          </template>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          v-if="canEdit"
          color="success"
          :disabled="!hasChanges || saving"
          :loading="saving"
          @click="saveChanges">
          Save
        </v-btn>
        <v-btn color="error" @click="close">
          {{ canEdit ? 'Cancel' : 'Close' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

interface EditableProperty {
  key: string;
  value: string;
  originalKey: string;
  isExisting: boolean;
}

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const functions = useFunctions();

const isDialogActive = ref(false);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const originalProperties = ref<Record<string, string>>({});
const editableProperties = ref<EditableProperty[]>([]);

const hasChanges = computed(() => {
  // Build current state
  const current: Record<string, string> = {};
  for (const prop of editableProperties.value) {
    const key = prop.key.trim();
    if (key) {
      current[key] = prop.value;
    }
  }

  // Compare with original
  const origKeys = Object.keys(originalProperties.value);
  const currKeys = Object.keys(current);

  if (origKeys.length !== currKeys.length) return true;

  for (const key of origKeys) {
    if (current[key] !== originalProperties.value[key]) return true;
  }
  for (const key of currKeys) {
    if (!(key in originalProperties.value)) return true;
  }

  return false;
});

function addProperty() {
  editableProperties.value.push({
    key: '',
    value: '',
    originalKey: '',
    isExisting: false,
  });
}

function removeProperty(index: number) {
  editableProperties.value.splice(index, 1);
}

async function loadProperties() {
  loading.value = true;
  loadError.value = '';

  try {
    const metadata = await functions.loadNamespaceMetadata(props.warehouseId, props.namespacePath);

    const serverProps = metadata.properties || {};
    originalProperties.value = { ...serverProps };
    editableProperties.value = Object.entries(serverProps).map(([key, value]) => ({
      key,
      value,
      originalKey: key,
      isExisting: true,
    }));
  } catch (error: any) {
    loadError.value = error?.message || 'Failed to load namespace properties';
    console.error('Failed to load namespace properties:', error);
  } finally {
    loading.value = false;
  }
}

async function saveChanges() {
  saving.value = true;

  try {
    // Build updates and removals
    const updates: Record<string, string> = {};
    const removals: string[] = [];

    // Current keys
    const currentKeys = new Set<string>();
    for (const prop of editableProperties.value) {
      const key = prop.key.trim();
      if (key) {
        currentKeys.add(key);
        updates[key] = prop.value;
      }
    }

    // Find removed keys
    for (const origKey of Object.keys(originalProperties.value)) {
      if (!currentKeys.has(origKey)) {
        removals.push(origKey);
      }
    }

    // Only include updates that actually changed or are new
    const filteredUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (originalProperties.value[key] !== value || !(key in originalProperties.value)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0 && removals.length === 0) {
      close();
      return;
    }

    await functions.updateNamespaceProperties(
      props.warehouseId,
      props.namespacePath,
      filteredUpdates,
      removals,
      true,
    );

    emit('updated');
    close();
  } catch (error: any) {
    console.error('Failed to update namespace properties:', error);
  } finally {
    saving.value = false;
  }
}

function close() {
  isDialogActive.value = false;
}

// Load properties when dialog opens
watch(isDialogActive, (isOpen) => {
  if (isOpen) {
    loadProperties();
  }
});
</script>
