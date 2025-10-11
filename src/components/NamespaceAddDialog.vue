<template>
  <v-dialog v-model="isDialogActive" max-width="500">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-bind="activatorProps"
          color="info"
          size="small"
          text="Add Namespace"
          variant="flat"></v-btn>
      </slot>
    </template>

    <v-card :subtitle="parentPathDisplay" title="New Namespace">
      <v-card-text>
        <v-text-field
          v-model="namespaceName"
          label="Namespace Name"
          placeholder="my-namespace"
          :rules="[namespaceRule]"></v-text-field>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn color="success" :disabled="!isValid" @click="handleAddNamespace">
          Add Namespace
        </v-btn>
        <v-btn color="error" @click="handleCancel">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  parentPath?: string;
  pathSeparator?: string;
  displaySeparator?: string;
}

const props = withDefaults(defineProps<Props>(), {
  parentPath: '',
  pathSeparator: '\x1f', // Default to unit separator character
  displaySeparator: '.',
});

const emit = defineEmits<{
  addNamespace: [namespacePath: string[]];
  cancel: [];
}>();

const isDialogActive = ref(false);
const namespaceName = ref('');

const isValid = computed(() => {
  return namespaceName.value.trim().length > 0;
});

const parentPathDisplay = computed(() => {
  if (!props.parentPath) return '';
  return props.parentPath.split(props.pathSeparator).join(props.displaySeparator);
});

const namespaceRule = (value: string) => {
  return value.trim().length > 0 || 'Namespace name is required';
};

function handleAddNamespace() {
  if (isValid.value) {
    const namespacePath = props.parentPath
      ? [...props.parentPath.split(props.pathSeparator), namespaceName.value.trim()]
      : [namespaceName.value.trim()];

    emit('addNamespace', namespacePath);
    resetDialog();
  }
}

function handleCancel() {
  emit('cancel');
  resetDialog();
}

function resetDialog() {
  isDialogActive.value = false;
  namespaceName.value = '';
}

// Reset form when dialog opens
watch(isDialogActive, (isOpen) => {
  if (isOpen) {
    namespaceName.value = '';
  }
});
</script>
