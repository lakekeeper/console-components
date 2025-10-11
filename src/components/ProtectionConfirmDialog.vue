<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title class="text-h5">
        {{ title }}
      </v-card-title>
      <v-card-text>
        {{ message }}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey" variant="text" @click="cancel">Cancel</v-btn>
        <v-btn :color="confirmColor" variant="elevated" @click="confirm">Confirm</v-btn>
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
