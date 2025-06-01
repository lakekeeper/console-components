<template>
  <v-dialog v-model="isDialogActive" max-width="500">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-bind="activatorProps"
          color="info"
          size="small"
          text="Add Project"
          variant="flat"></v-btn>
      </slot>
    </template>

    <v-card title="Add Project">
      <v-card-text>
        <v-text-field
          v-model="projectName"
          label="Project Name"
          placeholder="my-project"
          :rules="[projectRule]"></v-text-field>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="success" :disabled="!isValid" @click="handleSubmit">Add</v-btn>
        <v-btn color="error" @click="handleCancel">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export interface ProjectData {
  name: string;
}

const emit = defineEmits<{
  submit: [data: ProjectData];
  cancel: [];
}>();

const isDialogActive = ref(false);
const projectName = ref('');

const isValid = computed(() => {
  return projectName.value.trim().length > 0;
});

const projectRule = (value: string) => {
  return value.trim().length > 0 || 'Project name is required';
};

function handleSubmit() {
  if (isValid.value) {
    emit('submit', { name: projectName.value.trim() });
    resetDialog();
  }
}

function handleCancel() {
  emit('cancel');
  resetDialog();
}

function resetDialog() {
  isDialogActive.value = false;
  projectName.value = '';
}

watch(isDialogActive, (isOpen) => {
  if (isOpen) {
    projectName.value = '';
  }
});
</script>
