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
          v-model="displayToken"
          readonly
          auto-grow
          rows="6"
          variant="outlined"
          class="token-textarea"
          @focus="selectAll">
          <template #append-inner>
            <v-btn
              :icon="showToken ? 'mdi-eye-off' : 'mdi-eye'"
              variant="text"
              size="small"
              @click="toggleTokenVisibility"
              title="Toggle token visibility"></v-btn>
          </template>
        </v-textarea>
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
import { ref, computed } from 'vue';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';

const visual = useVisualStore();

const dialog = ref(false);
const token = ref('');
const expiresAt = ref('');
const tokenTextarea = ref<any>(null);
const showToken = ref(false);

const displayToken = computed(() => {
  if (showToken.value) {
    return token.value;
  }
  // Mask the token with dots
  return '•'.repeat(token.value.length);
});

function show(accessToken: string, expirationTime: string) {
  token.value = accessToken;
  expiresAt.value = expirationTime;
  showToken.value = false; // Reset to hidden when showing dialog
  dialog.value = true;
}

function toggleTokenVisibility() {
  showToken.value = !showToken.value;
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
  // Copy the actual token, not the masked version
  const actualToken = token.value;

  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(actualToken)
      .then(() => {
        visual.setSnackbarMsg({
          function: 'copyToken',
          text: 'Token copied to clipboard!',
          ttl: 3000,
          ts: Date.now(),
          type: Type.SUCCESS,
        });
        dialog.value = false;
      })
      .catch(() => {
        // Fallback to execCommand
        copyWithExecCommand(actualToken);
      });
  } else {
    copyWithExecCommand(actualToken);
  }
}

function copyWithExecCommand(text: string) {
  // Create a temporary textarea with the actual token
  const tempTextarea = document.createElement('textarea');
  tempTextarea.value = text;
  tempTextarea.style.position = 'absolute';
  tempTextarea.style.left = '-9999px';
  document.body.appendChild(tempTextarea);
  tempTextarea.select();

  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(tempTextarea);

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
        text: 'Copy failed. Please click the eye icon to reveal and copy manually (Cmd+C or Ctrl+C)',
        ttl: 5000,
        ts: Date.now(),
        type: Type.WARNING,
      });
    }
  } catch (err) {
    console.error('Copy failed:', err);
    document.body.removeChild(tempTextarea);
    visual.setSnackbarMsg({
      function: 'copyToken',
      text: 'Copy failed. Please click the eye icon to reveal and copy manually (Cmd+C or Ctrl+C)',
      ttl: 5000,
      ts: Date.now(),
      type: Type.WARNING,
    });
  }
}

function closeDialog() {
  dialog.value = false;
  showToken.value = false; // Hide token when closing
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
