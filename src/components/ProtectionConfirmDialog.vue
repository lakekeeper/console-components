<template>
  <v-dialog v-model="dialog" max-width="440">
    <v-card>
      <v-card-title class="text-subtitle-1 d-flex align-center py-3">
        {{ title }}
      </v-card-title>
      <v-card-text>
        {{ message }}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn :color="confirmColor" variant="flat" @click="confirm">Confirm</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  title: string;
  message: string;
  confirmColor?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const dialog = ref(props.modelValue);

watch(
  () => props.modelValue,
  (newValue) => {
    dialog.value = newValue;
  },
);

watch(dialog, (newValue) => {
  emit('update:modelValue', newValue);
});

function confirm() {
  emit('confirm');
  dialog.value = false;
}

function cancel() {
  emit('cancel');
  dialog.value = false;
}
</script>
