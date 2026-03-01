<template>
  <v-dialog v-model="isDialogActive" max-width="600">
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

        <v-divider class="my-4"></v-divider>

        <div class="d-flex align-center mb-2">
          <span class="text-subtitle-2">Properties</span>
          <v-spacer></v-spacer>
          <v-btn color="info" density="compact" size="small" variant="text" @click="addProperty">
            <v-icon start>mdi-plus</v-icon>
            Add Property
          </v-btn>
        </div>

        <div v-for="(prop, index) in properties" :key="index" class="d-flex align-center ga-2 mb-2">
          <v-text-field
            v-model="prop.key"
            density="compact"
            hide-details
            label="Key"
            placeholder="key"
            variant="outlined"></v-text-field>
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
            @click="removeProperty(index)"></v-btn>
        </div>
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
import { computed, ref, reactive, watch } from 'vue';

interface PropertyEntry {
  key: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    parentPath?: string;
    pathSeparator?: string;
    displaySeparator?: string;
  }>(),
  {
    parentPath: '',
    pathSeparator: '\x1f',
    displaySeparator: '.',
  },
);

const emit = defineEmits<{
  addNamespace: [namespacePath: string[], properties: Record<string, string>];
  cancel: [];
}>();

const isDialogActive = ref(false);
const namespaceName = ref('');
const properties = reactive<PropertyEntry[]>([]);

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

function addProperty() {
  properties.push({ key: '', value: '' });
}

function removeProperty(index: number) {
  properties.splice(index, 1);
}

function buildProperties(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const prop of properties) {
    const key = prop.key.trim();
    if (key) {
      result[key] = prop.value;
    }
  }
  return result;
}

function handleAddNamespace() {
  if (isValid.value) {
    const namespacePath = props.parentPath
      ? [...props.parentPath.split(props.pathSeparator), namespaceName.value.trim()]
      : [namespaceName.value.trim()];

    emit('addNamespace', namespacePath, buildProperties());
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
  properties.splice(0, properties.length);
}

// Reset form when dialog opens
watch(isDialogActive, (isOpen) => {
  if (isOpen) {
    namespaceName.value = '';
    properties.splice(0, properties.length);
  }
});
</script>
