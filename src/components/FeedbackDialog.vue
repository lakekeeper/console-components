<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="600">
    <v-card>
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-message-text</v-icon>
          Share Your Feedback
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          @click="$emit('update:modelValue', false)"></v-btn>
      </v-toolbar>
      <v-divider></v-divider>
      <v-card-text>
        <p class="text-body-2 mb-4">
          Help us improve Lakekeeper. Your answers will be inserted into an email draft — review and
          edit before sending.
        </p>

        <div class="mb-5">
          <div class="text-body-2 mb-1">
            How is your experience with Lakekeeper?
            <strong class="ml-1">{{ rating }}/10</strong>
          </div>
          <v-slider
            v-model="rating"
            :min="1"
            :max="10"
            :step="1"
            thumb-label
            show-ticks="always"
            tick-size="3"
            hide-details></v-slider>
        </div>

        <v-select
          v-model="discovery"
          label="How did you find Lakekeeper? *"
          :items="discoveryOptions"
          :rules="[(v) => !!v || 'Required']"
          density="compact"
          variant="outlined"
          class="mb-2"></v-select>

        <v-text-field
          v-if="discovery === 'Other'"
          v-model="discoveryOther"
          label="Please specify *"
          :rules="[(v) => !!v.trim() || 'Required']"
          density="compact"
          variant="outlined"
          class="mb-2"></v-text-field>

        <v-textarea
          v-model="improvements"
          label="What improvements would you like to propose? *"
          :counter="2000"
          maxlength="2000"
          :rules="[(v) => !!v.trim() || 'Required']"
          density="compact"
          variant="outlined"
          rows="5"></v-textarea>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-email-fast"
          :disabled="!isValid"
          @click="sendFeedback">
          Send Feedback
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const FEEDBACK_EMAIL = 'info@vakamo.com';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const rating = ref(8);
const discovery = ref<string | null>(null);
const discoveryOther = ref('');
const improvements = ref('');

const isValid = computed(() => {
  if (!discovery.value) return false;
  if (discovery.value === 'Other' && !discoveryOther.value.trim()) return false;
  if (!improvements.value.trim()) return false;
  return true;
});

const discoveryOptions = [
  'GitHub',
  'Reddit / Hacker News',
  'Blog post',
  'Conference / Meetup',
  'Word of mouth',
  'Search engine',
  'Other',
];

function sendFeedback() {
  const discoveryLabel =
    discovery.value === 'Other'
      ? `Other: ${discoveryOther.value || '(not specified)'}`
      : (discovery.value ?? '(not specified)');

  const lines = [
    'Hello Lakekeeper Team,',
    '',
    'Here is my feedback:',
    '',
    `Rating: ${rating.value}/10`,
    `Discovery: ${discoveryLabel}`,
    '',
    'Improvements:',
    improvements.value || '(none)',
  ];
  const body = lines.join('\n');

  const mailto =
    `mailto:${FEEDBACK_EMAIL}` +
    `?subject=${encodeURIComponent('Lakekeeper Feedback')}` +
    `&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
  emit('update:modelValue', false);
}
</script>
