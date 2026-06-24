<template>
  <v-btn prepend-icon="mdi-plus" variant="tonal" color="primary" @click="open = true">
    New Dataset
  </v-btn>

  <v-dialog v-model="open" max-width="500" @after-leave="resetForm">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="amber-darken-2">mdi-folder-multiple-outline</v-icon>
        Create Dataset
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-text-field
          v-model="name"
          label="Name"
          prepend-inner-icon="mdi-rename-outline"
          :rules="[(v) => !!v?.trim() || 'Required']"
          class="mb-2"
          autofocus></v-text-field>

        <v-textarea
          v-model="description"
          label="Description"
          prepend-inner-icon="mdi-text"
          :rows="2"
          auto-grow></v-textarea>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="loading" @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="!name.trim()"
          @click="submit">
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFunctions } from '@/plugins/functions';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const emit = defineEmits<{
  (e: 'created', name: string): void;
}>();

const functions = useFunctions();

const open = ref(false);
const name = ref('');
const description = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

function resetForm() {
  name.value = '';
  description.value = '';
  error.value = null;
}

async function submit() {
  if (!name.value.trim()) return;

  loading.value = true;
  error.value = null;

  try {
    await functions.createGenericTable(
      props.warehouseId,
      props.namespacePath,
      {
        format: 'dataset',
        name: name.value.trim(),
        ...(description.value.trim() ? { doc: description.value.trim() } : {}),
      },
      true,
    );
    const createdName = name.value.trim();
    open.value = false;
    emit('created', createdName);
  } catch (e: any) {
    error.value = e?.error?.message || e?.message || 'Failed to create dataset';
    functions.handleError(e, 'createGenericTable');
  } finally {
    loading.value = false;
  }
}
</script>
