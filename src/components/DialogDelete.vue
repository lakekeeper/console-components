<template>
  <v-dialog v-model="isDialogActive" max-width="500">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps">
        <v-btn
          v-bind="activatorProps"
          color="error"
          size="small"
          :text="`Delete ${capitalize(itemType)}`"
          variant="outlined"></v-btn>
      </slot>
    </template>

    <v-card :title="`Delete ${capitalize(itemType)}`">
      <v-card-text>
        <p>Are you sure you want to delete this {{ itemType }}?</p>

        <v-text-field
          v-model="deleteName"
          :label="`Type '${itemName}' to confirm`"
          placeholder="Confirm deletion"
          variant="outlined"
          class="mt-4"></v-text-field>

        <v-row v-if="documentationUrl" align="center" class="mt-2">
          <v-col cols="auto">
            <v-icon color="info" size="small" @click="expanded = !expanded">
              mdi-information-box-outline
            </v-icon>
          </v-col>
          <v-col class="text-left">
            <span v-if="expanded" class="mt-2">
              More information
              <a v-if="documentationUrl" :href="documentationUrl" target="_blank">here</a>
            </span>
          </v-col>
        </v-row>

        <v-row v-if="showDeleteOptions && expanded">
          <v-col>
            <v-checkbox
              v-model="purgeRequested"
              :disabled="!allowPurge"
              :label="purgeLabel"
              :messages="purgeMessage"></v-checkbox>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="error" :disabled="!isDeleteEnabled" @click="confirmDelete">Delete</v-btn>
        <v-btn color="grey" @click="cancelDelete">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  itemType: string;
  itemName: string;
  showDeleteOptions?: boolean;
  allowPurge?: boolean;
  purgeLabel?: string;
  purgeMessage?: string;
  documentationUrl?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showDeleteOptions: false,
  allowPurge: false,
  purgeLabel: 'Purge permanently',
  purgeMessage: 'This action cannot be undone',
  documentationUrl: '',
});

const emit = defineEmits<{
  delete: [options: { purge: boolean }];
  cancel: [];
}>();

const isDialogActive = ref(false);
const deleteName = ref('');
const expanded = ref(false);
const purgeRequested = ref(false);

const isDeleteEnabled = computed(() => {
  return deleteName.value === props.itemName;
});

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function confirmDelete() {
  emit('delete', { purge: purgeRequested.value });
  resetDialog();
}

function cancelDelete() {
  emit('cancel');
  resetDialog();
}

function resetDialog() {
  isDialogActive.value = false;
  deleteName.value = '';
  expanded.value = false;
  purgeRequested.value = false;
}

// Reset form when dialog opens
watch(isDialogActive, (newValue) => {
  if (newValue) {
    deleteName.value = '';
    expanded.value = false;
    purgeRequested.value = false;
  }
});
</script>
