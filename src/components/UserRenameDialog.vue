<template>
  <v-dialog v-model="isDialogActive" max-width="440">
    <template #activator="{ props: activatorProps }">
      <!-- Inline next to the name it renames, so rows without the action keep
           their remaining buttons aligned with every other row. -->
      <v-btn
        v-if="props.iconOnly"
        v-bind="activatorProps"
        icon="mdi-pencil-outline"
        size="x-small"
        variant="text"
        title="Rename"></v-btn>
      <v-btn v-else v-bind="activatorProps" size="small" text="Rename" variant="outlined"></v-btn>
    </template>

    <v-card title="New user name">
      <v-card-text>
        <v-text-field
          v-model="newName"
          label="New user name"
          placeholder="user name"
          @keyup.enter="
            props.name !== newName && newName !== '' && emmitNewUserName()
          "></v-text-field>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>

        <v-btn variant="text" text="Cancel" @click="cancelRoleInput"></v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="props.name === newName || newName === ''"
          @click="emmitNewUserName">
          submit
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import { StatusIntent } from '../common/enums';

const isDialogActive = ref(false);
const newName = ref('');
const emit = defineEmits<{
  (e: 'renameUserName', user: { name: string; id: string }): void;
}>();

const props = defineProps<{
  name: string;
  id: string;
  status: StatusIntent;
  iconOnly?: boolean;
}>();

function emmitNewUserName() {
  emit('renameUserName', { name: newName.value, id: props.id });
}
function cancelRoleInput() {
  isDialogActive.value = false;
}

onMounted(() => {
  newName.value = props.name;
});

watch(
  () => props.status,
  (newVal) => {
    if (newVal === StatusIntent.SUCCESS) {
      isDialogActive.value = false;
    }
  },
);
</script>
