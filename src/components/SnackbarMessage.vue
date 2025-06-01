<template>
  <v-snackbar
    v-for="(msg, index) in messages"
    :key="msg.id"
    v-model="msg.visible"
    variant="outlined"
    location="top"
    :timeout="msg.timeout"
    :color="getSnackbarColor(msg.type)"
    :style="{ transform: `translateY(${index * 60}px)` }">
    {{ msg.text }}
    <template #actions>
      <v-btn :color="msg.type" @click="removeMessage(msg.id)">Close</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export type MessageType = 'success' | 'error' | 'warning' | 'info';

export interface SnackbarMessage {
  text: string;
  type: MessageType;
  timeout?: number;
  visible?: boolean;
  id?: string;
}

interface Props {
  message?: SnackbarMessage | null;
}

const props = defineProps<Props>();

const messages = ref<Array<SnackbarMessage & { visible: boolean; id: string }>>([]);

const emit = defineEmits<{
  messageDismissed: [id: string];
  close: [id: string];
}>();

function getSnackbarColor(type: MessageType): string {
  switch (type) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
    default:
      return 'info';
  }
}

function addMessage(message: SnackbarMessage) {
  const id = `msg-${Date.now()}-${Math.random()}`;
  const newMessage = {
    ...message,
    visible: true,
    timeout: message.timeout || 5000,
    id,
  };

  messages.value.push(newMessage);

  // Auto-remove after timeout
  setTimeout(() => {
    removeMessage(id);
  }, newMessage.timeout);
}

function removeMessage(id: string) {
  const index = messages.value.findIndex((msg) => msg.id === id);
  if (index > -1) {
    messages.value.splice(index, 1);
    emit('messageDismissed', id);
    emit('close', id);
  }
}

// Watch for new messages from props
watch(
  () => props.message,
  (newMessage) => {
    if (newMessage) {
      addMessage(newMessage);
    }
  },
  { immediate: true },
);

// Expose methods for programmatic control
defineExpose({
  addMessage,
  removeMessage,
  clearAll: () => {
    messages.value.splice(0);
  },
});
</script>
