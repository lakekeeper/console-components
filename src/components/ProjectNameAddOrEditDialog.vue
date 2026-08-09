<template>
  <v-dialog v-model="isDialogActive" max-width="440">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        color="primary"
        size="small"
        class="me-5"
        :text="props.actionType == 'add' ? 'Add Project' : 'Rename'"
        :variant="props.actionType == 'add' ? 'flat' : 'outlined'"></v-btn>
    </template>

    <v-card :title="props.actionType == 'add' ? 'Add Project' : 'Rename'">
      <v-card-text>
        <v-text-field
          v-model="project"
          :label="props.actionType == 'add' ? 'Add Project' : 'Rename'"
          placeholder="my-project"
          @keyup.enter="
            project !== '' && (props.actionType == 'add' ? emitProjectCreate() : emitProjectName())
          "></v-text-field>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" text="Cancel" @click="isDialogActive = false"></v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="project == ''"
          @click="props.actionType == 'add' ? emitProjectCreate() : emitProjectName()">
          Submit
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { CreateProjectRequest, RenameProjectRequest } from '../gen/management/types.gen';

const isDialogActive = ref(false);

const project = ref('');

const props = defineProps<{
  actionType: 'add' | 'edit';
  name?: string;
  id: string;
}>();

const emit = defineEmits<{
  (e: 'emitProjectNewName', project: RenameProjectRequest & { 'project-id': string }): void;
  (e: 'emitProjectCreate', project: CreateProjectRequest): void;
}>();

function emitProjectName() {
  emit('emitProjectNewName', {
    'new-name': project.value,
    'project-id': props.id,
  });
  isDialogActive.value = false;
}

function emitProjectCreate() {
  emit('emitProjectCreate', {
    'project-name': project.value,
  });
  isDialogActive.value = false;
}

onMounted(() => {
  if (props.actionType === 'add') {
    project.value = '';
  } else {
    project.value = props.name || '';
  }
});
</script>
