<template>
  <v-snackbar
    v-for="(msg, index) in snackbarMsgs"
    :key="msg.id"
    v-model="msg.visible"
    location="top"
    :timeout="-1"
    :style="{ top: `${20 + index * 70}px` }"
    class="stacked-snackbar"
    @mouseenter="pause(msg)"
    @mouseleave="resume(msg)">
    {{ msg.text }}
    <template #actions>
      <v-btn :color="msg.type" @click="close(msg)">Close</v-btn>
    </template>
    <div class="v-snackbar__timer">
      <v-progress-linear
        :model-value="(msg.remaining / msg.ttl) * 100"
        :color="msg.type"
        height="4"></v-progress-linear>
    </div>
  </v-snackbar>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue';

import { useVisualStore } from '@/stores/visual';
import { SnackbarMsg } from '@/common/interfaces';
import { Type } from '@/common/enums';

const visual = useVisualStore();
const snackbarMsgs = ref<
  Array<{
    id: number;
    text: string;
    ttl: number;
    remaining: number;
    paused: boolean;
    visible: boolean;
    type: Type;
  }>
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

      snackbarMsgs.value.push({
        id: msgIdCounter++,
        text: snackbarMsg.value.text,
        ttl: snackbarMsg.value.ttl,
        remaining: snackbarMsg.value.ttl,
        paused: false,
        visible: true,
        type: snackbarMsg.value.type,
      });
    }
  },
);

// A single tick drives every snackbar's countdown so hovering one message
// (which sets `paused`) never affects the others. Messages are only removed
// here — never via a standalone setTimeout — so a hovered message can never
// be dismissed behind the user's back while its countdown is paused.
const TICK_MS = 100;
const tickInterval = window.setInterval(() => {
  for (let i = snackbarMsgs.value.length - 1; i >= 0; i--) {
    const msg = snackbarMsgs.value[i];
    if (msg.paused) continue;
    msg.remaining -= TICK_MS;
    if (msg.remaining <= 0) {
      msg.visible = false;
      snackbarMsgs.value.splice(i, 1);
    }
  }
}, TICK_MS);

onUnmounted(() => window.clearInterval(tickInterval));

function pause(msg: { paused: boolean }) {
  msg.paused = true;
}

function resume(msg: { paused: boolean }) {
  msg.paused = false;
}

function close(msg: { id: number; visible: boolean }) {
  msg.visible = false;
  const index = snackbarMsgs.value.findIndex((m) => m.id === msg.id);
  if (index > -1) snackbarMsgs.value.splice(index, 1);
}
</script>

<style scoped>
.stacked-snackbar {
  position: fixed !important;
}

.v-snackbar__timer {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}
</style>
