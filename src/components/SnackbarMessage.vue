<template>
  <v-snackbar
    v-for="(msg, index) in snackbarMsgs"
    :key="msg.id"
    v-model="msg.visible"
    location="top"
    :timeout="msg.ttl"
    :timer="getTimerColor(msg)"
    :style="{ top: `${20 + index * 70}px` }"
    class="stacked-snackbar">
    {{ msg.text }}
    <template #actions>
      <v-btn :color="msg.type" @click="msg.visible = false">Close</v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { useVisualStore } from '@/stores/visual';
import { SnackbarMsg } from '@/common/interfaces';
import { Type } from '@/common/enums';

const visual = useVisualStore();
const snackbarMsgs = ref<
  Array<{ id: number; text: string; ttl: number; visible: boolean; type: Type }>
>([]);
let msgIdCounter = 0;

const snackbarMsg = computed<SnackbarMsg>(() => {
  const obj: SnackbarMsg = visual.getSnackbarMsg();
  return obj;
});

watch(
  () => snackbarMsg.value.ts,
  (newVal) => {
    if (newVal) {
      // Check if the same message already exists in the snackbar
      const isDuplicate = snackbarMsgs.value.some(
        (msg) => msg.text === snackbarMsg.value.text && msg.visible,
      );

      if (isDuplicate) {
        // Skip adding duplicate message
        return;
      }

      const currentMsgId = msgIdCounter++;
      snackbarMsgs.value.push({
        id: currentMsgId,
        text: snackbarMsg.value.text,
        ttl: snackbarMsg.value.ttl,
        visible: true,
        type: snackbarMsg.value.type,
      });

      // Remove the message after it times out
      setTimeout(() => {
        const index = snackbarMsgs.value.findIndex((m) => m.id === currentMsgId);
        if (index > -1) {
          snackbarMsgs.value.splice(index, 1);
        }
      }, snackbarMsg.value.ttl);
    }
  },
);

function getTimerColor(msg: { type: Type }): string {
  // Cover over types Success and Info and colors
  switch (msg.type) {
    case Type.ERROR:
      return 'red';
    case Type.WARNING:
      return 'orange';
    case Type.INFO:
      return 'blue';
    case Type.SUCCESS:
      return 'green';
    default:
      return 'grey';
  }
}
</script>

<style scoped>
.stacked-snackbar {
  position: fixed !important;
}
</style>
