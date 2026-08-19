<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="useForm ? 740 : 600"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-email-outline</v-icon>
          Contact Vakamo
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          @click="$emit('update:modelValue', false)"></v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <!-- Online: the same Zoho form vakamo.com uses, so enquiries land in the
           usual place instead of an inbox. -->
      <template v-if="useForm">
        <v-card-text class="pa-3">
          <iframe
            aria-label="Contact us"
            frameborder="0"
            class="contact-form-frame"
            :src="ZOHO_FORM_URL"></iframe>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="flex-wrap ga-1">
          <!-- The form cannot be prefilled from here, but support still wants
               these details — so they are one click from the clipboard. -->
          <v-btn size="small" variant="text" prepend-icon="mdi-content-copy" @click="copyContext">
            Copy deployment details
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn size="small" variant="text" @click="preferEmail = true">Email instead</v-btn>
        </v-card-actions>
      </template>

      <!-- Offline, or by choice: a mailto draft. The only path that works in an
           air-gapped deployment. -->
      <template v-else>
        <v-card-text>
          <p class="text-body-2 mb-4">
            Vakamo builds and maintains Lakekeeper. Your answers will be inserted into an email
            draft — review and edit before sending.
          </p>

          <v-select
            v-model="topicValue"
            label="What is this about? *"
            :items="topicOptions"
            density="compact"
            variant="outlined"
            hide-details="auto"
            class="mb-2"></v-select>

          <v-textarea
            v-model="message"
            label="Your message *"
            :counter="2000"
            maxlength="2000"
            :rules="[(v: string) => !!v.trim() || 'Required']"
            density="compact"
            variant="outlined"
            hide-details="auto"
            rows="5"
            class="mb-3"></v-textarea>

          <v-checkbox
            v-model="includeContext"
            density="compact"
            hide-details
            color="primary"
            class="mb-1">
            <template #label>
              <span class="text-body-2">Include deployment details</span>
            </template>
          </v-checkbox>
          <div v-if="includeContext" class="text-caption text-medium-emphasis ml-8 mb-2">
            <div v-for="line in contextLines" :key="line">{{ line }}</div>
          </div>

          <!-- A mailto: needs a configured mail client, which a locked-down
               browser may not have. The plain address always works. -->
          <v-divider class="my-3"></v-divider>
          <div class="d-flex align-center text-caption text-medium-emphasis">
            <span class="mr-2">Or email us directly:</span>
            <v-chip size="small" variant="outlined" @click="copyAddress">
              {{ CONTACT_EMAIL }}
              <v-icon end size="x-small">mdi-content-copy</v-icon>
            </v-chip>
          </div>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
          <v-btn v-if="isOnline" size="small" variant="text" @click="preferEmail = false">
            Use the form
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-email-fast"
            :disabled="!isValid"
            @click="sendMessage">
            Open email
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useVisualStore } from '@/stores/visual';
import { useFunctions } from '@/plugins/functions';
import { useConnectivity } from '@/composables/useConnectivity';

const CONTACT_EMAIL = 'info@vakamo.com';
/** The same form embedded across vakamo.com. */
const ZOHO_FORM_URL =
  'https://forms.zohopublic.com/supportvak1/form/Contactus/formperma/lTpraap5Nwq1DckVGakAqP0NPo1qWTu3JxPZ9bP07CQ';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Preselects the email topic when opened from a specific surface. */
    topic?: string;
    /** Seeds the subject line so replies land in the right thread. */
    subject?: string;
  }>(),
  { topic: undefined, subject: undefined },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const visual = useVisualStore();
const functions = useFunctions();
const { isOnline } = useConnectivity();

const topicOptions = [
  'Lakekeeper+ evaluation',
  'Enterprise support',
  'Managed / cloud offering',
  'Partnership',
  'Other',
];

const topicValue = ref(props.topic ?? topicOptions[0]);
const message = ref('');
const includeContext = ref(true);
const preferEmail = ref(false);

// The embedded form needs the network; air-gapped deployments get the mailto
// draft instead, and anyone can switch to it deliberately.
const useForm = computed(() => isOnline.value && !preferEmail.value);

const isValid = computed(() => !!topicValue.value && !!message.value.trim());

const contextLines = computed(() => {
  const info = visual.getServerInfo();
  return [
    `Lakekeeper version: ${info['lakekeeper-version'] || info.version}`,
    `Server ID: ${info['server-id']}`,
    `Authorization backend: ${info['authz-backend']}`,
    `Edition: ${info['license-status']?.valid ? 'Lakekeeper+' : 'Open Source'}`,
  ];
});

function copyAddress() {
  functions.copyToClipboard(CONTACT_EMAIL);
}

function copyContext() {
  functions.copyToClipboard(contextLines.value.join('\n'));
}

function sendMessage() {
  const lines = ['Hello Vakamo Team,', '', `Topic: ${topicValue.value}`, '', message.value.trim()];

  if (includeContext.value) {
    lines.push('', '---', 'Deployment details:', ...contextLines.value);
  }

  const mailto =
    `mailto:${CONTACT_EMAIL}` +
    `?subject=${encodeURIComponent(props.subject ?? `Lakekeeper — ${topicValue.value}`)}` +
    `&body=${encodeURIComponent(lines.join('\n'))}`;
  window.location.href = mailto;
  emit('update:modelValue', false);
}
</script>

<style scoped>
.contact-form-frame {
  height: 760px;
  width: 100%;
  border: none;
  border-radius: 12px;
}
</style>
