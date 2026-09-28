<template>
  <v-dialog v-model="isDialogActive" max-width="440">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :disabled="props.disabled"
        color="error"
        size="small"
        :text="'Delete'"
        :variant="'text'"></v-btn>
    </template>

    <v-card :title="`Confirm deletion of ${props.type}`">
      <v-card-text>
        <div class="ma-2">Please enter the name "{{ props.name }}" to confirm the deletion</div>
        <v-text-field
          v-model="deleteName"
          :label="`${capitalize(props.type)} Name`"
          maxlength="500"
          :placeholder="$props.name"
          @keyup.enter="deleteName === $props.name && confirm()"></v-text-field>

        <!-- Opt-in, and only where the server actually offers it: the dialog is
             shared, so a caller that passes no label gets the plain confirm it
             had before. -->
        <v-checkbox
          v-if="props.forceLabel"
          v-model="force"
          density="compact"
          hide-details
          color="error"
          :label="props.forceLabel"></v-checkbox>
        <div
          v-if="props.forceLabel && props.forceHint"
          class="text-caption text-medium-emphasis ml-2">
          {{ props.forceHint }}
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn variant="text" text="Cancel" @click="reject"></v-btn>
        <v-btn
          color="error"
          variant="flat"
          :disabled="deleteName != $props.name"
          text="Confirm"
          @click="confirm"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';

const deleteName = ref('');

const props = defineProps<{
  type: string;
  name: string;
  disabled?: boolean;
  /** Label for an optional force checkbox. Omitted, no checkbox is shown. */
  forceLabel?: string;
  /** What force actually does, in one line under the checkbox. */
  forceHint?: string;
}>();

// Emitted with the force choice. Existing callers bind inline handlers that
// ignore the payload, so they keep their old behaviour untouched.
const emit = defineEmits<{
  (e: 'confirmed', force: boolean): void;
  (e: 'rejected'): void;
}>();

const isDialogActive = ref(false);
const force = ref(false);

// A reopened dialog starts from scratch: neither the typed name nor a ticked
// force box should survive a cancel and arm the next deletion.
watch(isDialogActive, (open) => {
  if (!open) {
    deleteName.value = '';
    force.value = false;
  }
});

function confirm() {
  emit('confirmed', force.value);
  isDialogActive.value = false;
}
function reject() {
  isDialogActive.value = false;
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
</script>
