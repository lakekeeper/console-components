<template>
  <v-dialog v-model="isDialogActive" max-width="650" scrollable>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        color="info"
        size="small"
        variant="text"
        prepend-icon="mdi-cog">
        Properties
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

        <!-- Confirm removal step -->
        <template v-else-if="confirmingRemovals">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            You are about to remove {{ pendingRemovals.length }} propert{{
              pendingRemovals.length === 1 ? 'y' : 'ies'
            }}. Type each key name to confirm.
          </v-alert>

          <div v-for="key in pendingRemovals" :key="key" class="mb-3">
            <div class="text-body-2 mb-1">
              Type
              <strong>"{{ key }}"</strong>
              to confirm removal:
            </div>
            <v-text-field
              v-model="removalConfirmations[key]"
              density="compact"
              hide-details
              :placeholder="key"
              variant="outlined"
              :color="removalConfirmations[key] === key ? 'success' : undefined"></v-text-field>
          </div>
        </template>

        <template v-else>
          <div class="d-flex align-center mb-3">
            <span class="text-subtitle-2">
              {{ activeProperties.length }} propert{{ activeProperties.length === 1 ? 'y' : 'ies' }}
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
            <!-- Active properties -->
            <div
              v-for="(prop, index) in editableProperties"
              :key="index"
              class="d-flex align-center ga-2 mb-2"
              :class="{ 'opacity-50': prop.markedForRemoval }">
              <v-text-field
                v-model="prop.key"
                density="compact"
                hide-details
                label="Key"
                placeholder="key"
                variant="outlined"
                :readonly="prop.isExisting"
                :disabled="prop.markedForRemoval"></v-text-field>
              <v-text-field
                v-model="prop.value"
                density="compact"
                hide-details
                label="Value"
                placeholder="value"
                variant="outlined"
                :disabled="prop.markedForRemoval"></v-text-field>
              <v-btn
                v-if="!prop.markedForRemoval"
                color="error"
                density="compact"
                icon="mdi-close"
                size="small"
                variant="text"
                @click="markForRemoval(index)">
                <v-icon>mdi-close</v-icon>
                <v-tooltip activator="parent" location="bottom">Remove</v-tooltip>
              </v-btn>
              <v-btn
                v-else
                color="info"
                density="compact"
                icon="mdi-undo"
                size="small"
                variant="text"
                @click="unmarkRemoval(index)">
                <v-icon>mdi-undo</v-icon>
                <v-tooltip activator="parent" location="bottom">Undo removal</v-tooltip>
              </v-btn>
            </div>

            <div
              v-if="editableProperties.length === 0"
              class="text-center text-medium-emphasis py-4">
              No properties set. Click "Add Property" to create one.
            </div>

            <!-- Removal summary -->
            <v-alert
              v-if="markedCount > 0"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3">
              {{ markedCount }} propert{{ markedCount === 1 ? 'y' : 'ies' }} marked for removal. You
              will need to confirm before saving.
            </v-alert>
          </template>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <template v-if="confirmingRemovals">
          <v-btn
            color="success"
            :disabled="!allRemovalsConfirmed || saving"
            :loading="saving"
            @click="executeSave">
            Confirm &amp; Save
          </v-btn>
          <v-btn color="error" @click="confirmingRemovals = false">Back</v-btn>
        </template>
        <template v-else>
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
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';

interface EditableProperty {
  key: string;
  value: string;
  originalKey: string;
  isExisting: boolean;
  markedForRemoval: boolean;
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
const confirmingRemovals = ref(false);
const originalProperties = ref<Record<string, string>>({});
const editableProperties = ref<EditableProperty[]>([]);
const removalConfirmations = reactive<Record<string, string>>({});

const activeProperties = computed(() =>
  editableProperties.value.filter((p) => !p.markedForRemoval),
);

const markedCount = computed(
  () => editableProperties.value.filter((p) => p.markedForRemoval && p.isExisting).length,
);

const pendingRemovals = computed(() =>
  editableProperties.value
    .filter((p) => p.markedForRemoval && p.isExisting)
    .map((p) => p.originalKey),
);

const allRemovalsConfirmed = computed(() =>
  pendingRemovals.value.every((key) => removalConfirmations[key] === key),
);

const hasChanges = computed(() => {
  const current: Record<string, string> = {};
  for (const prop of editableProperties.value) {
    if (prop.markedForRemoval) continue;
    const key = prop.key.trim();
    if (key) {
      current[key] = prop.value;
    }
  }

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
    markedForRemoval: false,
  });
}

function markForRemoval(index: number) {
  const prop = editableProperties.value[index];
  if (prop.isExisting) {
    prop.markedForRemoval = true;
  } else {
    // New (unsaved) properties can be removed immediately
    editableProperties.value.splice(index, 1);
  }
}

function unmarkRemoval(index: number) {
  editableProperties.value[index].markedForRemoval = false;
}

async function loadProperties() {
  loading.value = true;
  loadError.value = '';
  confirmingRemovals.value = false;

  try {
    const metadata = await functions.loadNamespaceMetadata(props.warehouseId, props.namespacePath);

    const serverProps = metadata.properties || {};
    originalProperties.value = { ...serverProps };
    editableProperties.value = Object.entries(serverProps).map(([key, value]) => ({
      key,
      value,
      originalKey: key,
      isExisting: true,
      markedForRemoval: false,
    }));
  } catch (error: any) {
    loadError.value = error?.message || 'Failed to load namespace properties';
    console.error('Failed to load namespace properties:', error);
  } finally {
    loading.value = false;
  }
}

function saveChanges() {
  // If there are existing properties marked for removal, require confirmation
  if (markedCount.value > 0) {
    // Reset confirmations
    for (const key in removalConfirmations) {
      delete removalConfirmations[key];
    }
    confirmingRemovals.value = true;
    return;
  }

  executeSave();
}

async function executeSave() {
  saving.value = true;

  try {
    const updates: Record<string, string> = {};
    const removals: string[] = [];

    const currentKeys = new Set<string>();
    for (const prop of editableProperties.value) {
      if (prop.markedForRemoval) continue;
      const key = prop.key.trim();
      if (key) {
        currentKeys.add(key);
        updates[key] = prop.value;
      }
    }

    for (const origKey of Object.keys(originalProperties.value)) {
      if (!currentKeys.has(origKey)) {
        removals.push(origKey);
      }
    }

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
  confirmingRemovals.value = false;
}

watch(isDialogActive, (isOpen) => {
  if (isOpen) {
    loadProperties();
  }
});
</script>
