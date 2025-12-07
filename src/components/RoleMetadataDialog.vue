<template>
  <v-dialog v-model="dialog" max-width="600px">
    <template #activator="{ props: activatorProps }">
      <v-list-item
        prepend-icon="mdi-information-outline"
        title="View Metadata"
        v-bind="activatorProps"></v-list-item>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center bg-primary">
        <v-icon icon="mdi-information-outline" class="mr-2"></v-icon>
        Role Metadata
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="dialog = false"></v-btn>
      </v-card-title>

      <v-card-text class="pt-4">
        <v-row v-if="loading" class="justify-center">
          <v-col cols="auto">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
          </v-col>
        </v-row>

        <v-row v-else-if="metadata" dense>
          <v-col cols="12">
            <div class="text-overline text-medium-emphasis">Role ID</div>
            <div class="d-flex align-center mt-2">
              <v-chip size="small" variant="outlined" class="mr-2">{{ metadata.id }}</v-chip>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="flat"
                @click="copyToClipboard(metadata.id)"></v-btn>
            </div>
          </v-col>

          <v-col cols="12">
            <div class="text-overline text-medium-emphasis">Role Name</div>
            <div class="text-body-1 mt-2">{{ metadata.name }}</div>
          </v-col>

          <v-col cols="12">
            <div class="text-overline text-medium-emphasis">Project ID</div>
            <div class="d-flex align-center mt-2">
              <v-chip size="small" variant="outlined" class="mr-2">
                {{ metadata['project-id'] }}
              </v-chip>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="flat"
                @click="copyToClipboard(metadata['project-id'])"></v-btn>
            </div>
          </v-col>

          <v-col cols="12">
            <v-divider class="my-4"></v-divider>
          </v-col>

          <v-col cols="12">
            <div class="text-overline text-medium-emphasis">Source System ID</div>
            <div v-if="!editingSource" class="d-flex align-center mt-2">
              <v-chip size="small" variant="tonal" class="mr-2">
                {{ sourceSystemId || 'Not set' }}
              </v-chip>
              <v-btn
                v-if="canUpdateSourceSystem"
                icon="mdi-pencil"
                size="x-small"
                variant="flat"
                @click="startEditingSource"></v-btn>
            </div>
            <div v-else class="mt-2">
              <v-text-field
                v-model="sourceSystemIdEdit"
                density="compact"
                variant="outlined"
                placeholder="Enter source system ID"
                hide-details>
                <template #append>
                  <v-btn
                    icon="mdi-check"
                    size="x-small"
                    color="success"
                    variant="flat"
                    @click="saveSourceSystem"></v-btn>
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    variant="flat"
                    @click="cancelEditingSource"></v-btn>
                </template>
              </v-text-field>
            </div>
          </v-col>
        </v-row>

        <v-alert v-else type="error" variant="tonal" class="mt-4">
          Failed to load role metadata
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" @click="dialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import type { RoleMetadata } from '../gen/management/types.gen';

const props = defineProps<{
  roleId: string;
  canUpdateSourceSystem?: boolean;
}>();

const functions = useFunctions();
const dialog = ref(false);
const loading = ref(false);
const metadata = ref<RoleMetadata | null>(null);
const sourceSystemId = ref<string>('');
const editingSource = ref(false);
const sourceSystemIdEdit = ref('');

watch(dialog, async (newVal) => {
  if (newVal) {
    await loadMetadata();
  }
});

async function loadMetadata() {
  loading.value = true;
  try {
    metadata.value = await functions.getRoleMetadata(props.roleId);
    // Source system ID would need to be added to the RoleMetadata type or fetched separately
    // For now, we'll leave it empty
    sourceSystemId.value = '';
  } catch (error) {
    console.error('Failed to load role metadata:', error);
    metadata.value = null;
  } finally {
    loading.value = false;
  }
}

function startEditingSource() {
  sourceSystemIdEdit.value = sourceSystemId.value;
  editingSource.value = true;
}

function cancelEditingSource() {
  editingSource.value = false;
  sourceSystemIdEdit.value = '';
}

async function saveSourceSystem() {
  try {
    await functions.updateRoleSourceSystem(props.roleId, sourceSystemIdEdit.value, true);
    sourceSystemId.value = sourceSystemIdEdit.value;
    editingSource.value = false;
  } catch (error) {
    console.error('Failed to update source system:', error);
  }
}

function copyToClipboard(text: string) {
  functions.copyToClipboard(text);
}
</script>
