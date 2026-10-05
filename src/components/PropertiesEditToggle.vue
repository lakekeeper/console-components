<template>
  <!-- Switches a Properties section between its read-only table and the editor,
       in place. Leaving with unsaved edits asks first, next to the control that
       would drop them, rather than losing them or opening a dialog. -->
  <v-btn
    v-if="!editing"
    size="small"
    variant="text"
    color="secondary"
    prepend-icon="mdi-pencil-outline"
    @click="emit('update:editing', true)">
    Edit
  </v-btn>
  <v-menu
    v-else
    v-model="confirmOpen"
    :disabled="!dirty"
    location="bottom end"
    :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="dirty ? menuProps : {}"
        size="small"
        variant="text"
        prepend-icon="mdi-close"
        @click="!dirty && emit('update:editing', false)">
        {{ dirty ? 'Cancel' : 'Done' }}
      </v-btn>
    </template>
    <v-card min-width="260" class="pa-3">
      <div class="text-body-2 mb-3">Discard your unsaved property changes?</div>
      <div class="d-flex justify-end ga-2">
        <v-btn size="small" variant="text" @click="confirmOpen = false">Keep editing</v-btn>
        <v-btn size="small" color="error" variant="flat" @click="discard">Discard</v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  editing: boolean;
  // Unsaved edits in the editor, as its `dirty` event reports them.
  dirty?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:editing', value: boolean): void }>();

const confirmOpen = ref(false);

function discard() {
  confirmOpen.value = false;
  emit('update:editing', false);
}

// Closing the browser tab with unsaved edits gets the browser's own warning.
function beforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
}
watch(
  () => !!(props.editing && props.dirty),
  (pending) => {
    if (pending) window.addEventListener('beforeunload', beforeUnload);
    else window.removeEventListener('beforeunload', beforeUnload);
  },
);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
