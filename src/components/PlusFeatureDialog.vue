<template>
  <v-dialog
    :model-value="modelValue"
    max-width="600"
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-subtitle-1 d-flex align-center py-3">
        <v-icon class="mr-2" color="primary">mdi-star</v-icon>
        Lakekeeper+ Feature
      </v-card-title>

      <v-divider></v-divider>

      <v-card-text class="pt-4">
        <div class="text-center mb-4">
          <v-icon size="x-large" color="primary">{{ icon }}</v-icon>
        </div>

        <div class="text-h6 text-center mb-3">{{ title }}</div>

        <div class="text-body-1 mb-3">{{ description }}</div>

        <v-list v-if="bullets.length" density="compact" class="mb-3">
          <v-list-item v-for="bullet in bullets" :key="bullet">
            <template #prepend>
              <v-icon size="small">mdi-check-circle</v-icon>
            </template>
            <v-list-item-title>{{ bullet }}</v-list-item-title>
          </v-list-item>
        </v-list>

        <v-alert type="info" variant="tonal" density="compact">
          <strong>This feature is available in Lakekeeper+.</strong>
          Upgrade to unlock advanced capabilities.
        </v-alert>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions>
        <!-- External links are hidden until connectivity is confirmed, so an
             air-gapped deployment never shows a dead link. The contact dialog
             is offline-safe and always available. -->
        <v-btn
          v-if="isOnline && docsUrl"
          variant="text"
          size="small"
          prepend-icon="mdi-file-document-check-outline"
          :href="docsUrl"
          target="_blank"
          rel="noopener noreferrer">
          Learn more
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Close</v-btn>
        <v-btn v-if="isOnline" color="secondary" variant="flat" size="small" @click="bookDemo">
          Request a demo
        </v-btn>
        <v-btn color="primary" variant="flat" size="small" @click="contactOpen = true">
          Contact us
        </v-btn>
      </v-card-actions>
    </v-card>

    <ContactVakamoDialog
      v-model="contactOpen"
      topic="Lakekeeper+ evaluation"
      :subject="`Lakekeeper+ — ${title}`" />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ContactVakamoDialog from './ContactVakamoDialog.vue';
import { useConnectivity } from '@/composables/useConnectivity';

const DEMO_URL = 'https://zcal.co/viktor-kessler/demo';

withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Feature name, e.g. "Task Configuration". */
    title: string;
    description: string;
    icon?: string;
    bullets?: string[];
    docsUrl?: string;
  }>(),
  { icon: 'mdi-star-circle', bullets: () => [], docsUrl: undefined },
);

defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const { isOnline } = useConnectivity();
const contactOpen = ref(false);

function bookDemo() {
  window.open(DEMO_URL, '_blank', 'noopener,noreferrer');
}
</script>
