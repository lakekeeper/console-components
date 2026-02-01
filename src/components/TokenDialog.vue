<template>
  <v-dialog v-model="dialog" max-width="600px" persistent>
    <v-card>
      <v-card-title class="text-h6">
        <v-icon class="mr-2">mdi-key-variant</v-icon>
        Access Token
      </v-card-title>
      <v-card-text>
        <p class="mb-4">Your access token (expires: {{ expiresAt }}):</p>
        <v-textarea
          ref="tokenTextarea"
          v-model="token"
          readonly
          auto-grow
          rows="6"
          variant="outlined"
          class="token-textarea"
          @focus="selectAll"></v-textarea>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" @click="copyToken">
          <v-icon class="mr-2">mdi-content-copy</v-icon>
          Copy to Clipboard
        </v-btn>
        <v-btn color="secondary" variant="text" @click="closeDialog">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';

const visual = useVisualStore();

const dialog = ref(false);
const token = ref('');
const expiresAt = ref('');
const tokenTextarea = ref<any>(null);

function show(accessToken: string, expirationTime: string) {
  token.value = accessToken;
  expiresAt.value = expirationTime;
  dialog.value = true;
}

function selectAll() {
  if (tokenTextarea.value && tokenTextarea.value.$el) {
    const textarea = tokenTextarea.value.$el.querySelector('textarea');
    if (textarea) {
      textarea.select();
    }
  }
}

function copyToken() {
  // Use the synchronous copy function which works better in dialogs
  if (tokenTextarea.value && tokenTextarea.value.$el) {
    const textarea = tokenTextarea.value.$el.querySelector('textarea');
    if (textarea) {
      textarea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          visual.setSnackbarMsg({
            function: 'copyToken',
            text: 'Token copied to clipboard!',
            ttl: 3000,
            ts: Date.now(),
            type: Type.SUCCESS,
          });
          dialog.value = false;
        } else {
          visual.setSnackbarMsg({
            function: 'copyToken',
            text: 'Please select the text and copy manually (Cmd+C or Ctrl+C)',
            ttl: 5000,
            ts: Date.now(),
            type: Type.WARNING,
          });
        }
      } catch (err) {
        console.error('Copy failed:', err);
        visual.setSnackbarMsg({
          function: 'copyToken',
          text: 'Please select the text and copy manually (Cmd+C or Ctrl+C)',
          ttl: 5000,
          ts: Date.now(),
          type: Type.WARNING,
        });
      }
    }
  }
}

function closeDialog() {
  dialog.value = false;
}

defineExpose({
  show,
});
</script>

<style scoped>
.token-textarea {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
}
</style>
