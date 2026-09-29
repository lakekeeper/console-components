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
        <!-- Only reachable with `confirmHandler`: the server refused, and the
             dialog stayed open because it carries the remedy. -->
        <v-alert v-if="errorMsg" type="error" variant="tonal" density="compact" class="mb-3">
          <div>{{ errorMsg }}</div>
          <div v-if="props.forceLabel && !force" class="text-caption mt-1">
            Tick "{{ props.forceLabel }}" below, then confirm again.
          </div>
        </v-alert>
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

        <v-btn variant="text" :disabled="submitting" text="Cancel" @click="reject"></v-btn>
        <v-btn
          color="error"
          variant="flat"
          :disabled="deleteName != $props.name || submitting"
          :loading="submitting"
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
  /**
   * Opt-in async delete. Given one, the dialog awaits it and — when it rejects —
   * stays open and shows why, instead of closing and leaving the explanation to
   * a snackbar. That matters where the remedy is inside the dialog: a role that
   * holds grants is refused until `force` is ticked, and a closed dialog makes
   * the user retype the name to reach the checkbox.
   *
   * Callers that emit `confirmed` instead keep the old fire-and-close behaviour.
   */
  confirmHandler?: (force: boolean) => Promise<unknown>;
}>();

// Emitted with the force choice. Existing callers bind inline handlers that
// ignore the payload, so they keep their old behaviour untouched.
const emit = defineEmits<{
  (e: 'confirmed', force: boolean): void;
  (e: 'rejected'): void;
}>();

const isDialogActive = ref(false);
const force = ref(false);
const submitting = ref(false);
const errorMsg = ref('');

// A reopened dialog starts from scratch: neither the typed name, a ticked force
// box nor a previous refusal should survive a cancel and arm the next deletion.
watch(isDialogActive, (open) => {
  if (!open) {
    deleteName.value = '';
    force.value = false;
    errorMsg.value = '';
  }
});

// Ticking force is the answer to the refusal, so the complaint goes away as soon
// as the user acts on it rather than sitting above a form they already fixed.
watch(force, () => {
  errorMsg.value = '';
});

/** Lakekeeper errors arrive as `{ error: { message } }`; anything else is a throw. */
function messageOf(error: any): string {
  return error?.error?.message ?? error?.message ?? 'Deletion failed.';
}

async function confirm() {
  if (!props.confirmHandler) {
    emit('confirmed', force.value);
    isDialogActive.value = false;
    return;
  }
  submitting.value = true;
  errorMsg.value = '';
  try {
    await props.confirmHandler(force.value);
    isDialogActive.value = false;
  } catch (error: any) {
    errorMsg.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}
function reject() {
  isDialogActive.value = false;
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
</script>
