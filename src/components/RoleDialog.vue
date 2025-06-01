<template>
  <v-dialog v-model="isDialogActive" max-width="500">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-bind="activatorProps"
          :color="actionType === 'add' ? 'info' : 'warning'"
          size="small"
          :text="`${actionType} Role`"
          :variant="actionType === 'add' ? 'flat' : 'outlined'"></v-btn>
      </slot>
    </template>

    <v-card :title="actionType === 'add' ? 'New Role' : 'Edit Role'">
      <v-card-text>
        <v-text-field
          v-model="roleData.name"
          label="Role Name"
          placeholder="my-role"
          :rules="[roleRule]"
          :disabled="actionType === 'edit'"></v-text-field>
        <v-textarea
          v-model="roleData.description"
          label="Role description"
          maxlength="500"
          placeholder="my role description"
          :rules="[roleRule]"></v-textarea>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn color="success" :disabled="!isValid" @click="handleSubmit">
          {{ actionType === 'add' ? 'Add' : 'Update' }}
        </v-btn>
        <v-btn color="error" @click="handleCancel">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';

export interface RoleData {
  id: string;
  name: string;
  description: string;
}

interface Props {
  actionType: 'add' | 'edit';
  existingRole?: RoleData;
}

const props = withDefaults(defineProps<Props>(), {
  existingRole: () => ({ id: '', name: '', description: '' }),
});

const emit = defineEmits<{
  submit: [data: RoleData];
  cancel: [];
}>();

const isDialogActive = ref(false);
const roleData = reactive<RoleData>({
  id: '',
  name: '',
  description: '',
});

const isValid = computed(() => {
  return roleData.name.trim().length > 0 && roleData.description.trim().length > 0;
});

const roleRule = (value: string) => {
  return value.trim().length > 0 || 'This field is required';
};

function handleSubmit() {
  if (isValid.value) {
    emit('submit', {
      id: roleData.id,
      name: roleData.name.trim(),
      description: roleData.description.trim(),
    });
    resetDialog();
  }
}

function handleCancel() {
  emit('cancel');
  resetDialog();
}

function resetDialog() {
  isDialogActive.value = false;
  roleData.id = '';
  roleData.name = '';
  roleData.description = '';
}

// Load existing role data when dialog opens or props change
watch([isDialogActive, () => props.existingRole], ([isOpen, existingRole]) => {
  if (isOpen && existingRole) {
    roleData.id = existingRole.id || '';
    roleData.name = existingRole.name || '';
    roleData.description = existingRole.description || '';
  } else if (isOpen) {
    roleData.id = '';
    roleData.name = '';
    roleData.description = '';
  }
});
</script>
