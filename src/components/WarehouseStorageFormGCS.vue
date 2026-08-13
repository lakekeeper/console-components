<template>
  <div>
    <!-- 1. Where is the data? -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile.bucket"
          label="Bucket *"
          placeholder="my-bucket"
          :readonly="lockLocation"
          :hint="lockLocation ? lockedHint : `Bucket holding this warehouse's table data`"
          persistent-hint
          :error="!profile.bucket"
          :rules="[rules.required]"></v-text-field>
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile['key-prefix']"
          label="Location"
          placeholder="warehouse"
          :readonly="lockLocation"
          :hint="
            lockLocation
              ? lockedHint
              : 'Folder inside the bucket — the validation checks call this the location'
          "
          persistent-hint></v-text-field>
      </v-col>
    </v-row>

    <!-- 2. How does Lakekeeper authenticate? Only the chosen mode's fields. -->
    <div class="text-subtitle-2 mt-6 mb-2">Authentication</div>
    <v-btn-toggle
      v-if="authModes.length > 1"
      v-model="authMode"
      mandatory
      divided
      variant="outlined"
      density="comfortable"
      class="mb-3">
      <v-btn v-for="mode in authModes" :key="mode.value" :value="mode.value">
        {{ mode.title }}
      </v-btn>
    </v-btn-toggle>

    <template v-if="authMode === 'service-account-key'">
      <!-- One target: paste it, drop the file on it, or browse. No mode to pick first. -->
      <v-alert
        v-if="keyValid && !editing"
        type="success"
        variant="tonal"
        density="compact"
        class="mb-2">
        <div class="text-body-2">{{ keySummary }}</div>
        <template #append>
          <v-btn variant="text" size="small" @click="editing = true">Edit</v-btn>
        </template>
      </v-alert>

      <div
        v-else
        :class="['key-drop', dragging ? 'key-drop--active' : '']"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop">
        <v-textarea
          density="compact"
          v-model="keyString"
          label="Service account key (JSON) *"
          placeholder="Paste the JSON here, or drop the key file"
          rows="5"
          hint="Downloaded from the GCP console — paste it, drop the file, or browse"
          persistent-hint
          :error="!!keyString && !keyValid"
          :error-messages="keyString && !keyValid ? 'Not valid JSON' : []"
          @update:model-value="parseKey"></v-textarea>
        <input
          ref="fileRef"
          type="file"
          accept="application/json"
          style="display: none"
          @change="handleBrowse" />
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-file-upload-outline"
          class="mt-1"
          @click="fileRef?.click()">
          Choose file
        </v-btn>
        <v-btn
          v-if="keyValid"
          variant="text"
          size="small"
          prepend-icon="mdi-check"
          class="mt-1"
          @click="editing = false">
          Done
        </v-btn>
      </div>
    </template>

    <v-alert v-else type="info" variant="tonal" density="compact" class="mb-2">
      Uses the workload identity configured on the Lakekeeper server. No credentials to enter.
    </v-alert>

    <!-- 3. What do query engines get? GCS has no remote-signing option. -->
    <div class="text-subtitle-2 mt-6 mb-2">Client access</div>
    <div class="text-caption text-medium-emphasis mb-2">
      How engines like Spark or Trino reach the data.
    </div>
    <v-radio-group v-model="clientAccess" hide-details class="mb-2">
      <v-radio value="sts" color="primary" class="mb-4">
        <template #label>
          <div>
            <div>Vended credentials</div>
            <div class="text-caption text-medium-emphasis">
              Clients receive short-lived downscoped tokens for the table.
            </div>
          </div>
        </template>
      </v-radio>
      <v-radio value="none" color="primary">
        <template #label>
          <div>
            <div>None</div>
            <div class="text-caption text-medium-emphasis">
              Clients bring their own credentials.
            </div>
          </div>
        </template>
      </v-radio>
    </v-radio-group>

    <!-- Everything below has a working default. -->
    <v-expansion-panels variant="accordion" flat class="mt-6">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon class="mr-2" color="primary">mdi-tune</v-icon>
          Layout &amp; options
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-select
            density="compact"
            v-model="layoutType"
            :items="layoutOptions"
            item-title="name"
            item-value="code"
            label="Storage layout"
            hide-details></v-select>
          <v-alert
            v-if="layoutType !== 'default'"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3">
            Always include
            <code>{uuid}</code>
            — paths are assigned once and never rewritten, so a name-only template collides when an
            object is renamed and re-created.
          </v-alert>
          <v-text-field
            density="compact"
            v-if="layoutType === 'full-hierarchy'"
            v-model="layoutNamespace"
            label="Namespace template"
            placeholder="ns-{name}-{uuid}"
            class="mt-3"></v-text-field>
          <v-text-field
            density="compact"
            v-if="layoutType !== 'default'"
            v-model="layoutTabular"
            label="Tabular template"
            placeholder="tabular-{name}-{uuid}"
            class="mt-3"></v-text-field>
          <v-alert
            v-if="layoutType !== 'default'"
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3">
            <strong>Example path</strong>
            (namespace "marketing", tabular "customer"):
            <br />
            <code class="mt-1 d-block">{{ layoutExample }}</code>
          </v-alert>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useVisualStore } from '@/stores/visual';

const props = defineProps<{
  // Seed values, e.g. from an imported config or an existing warehouse.
  initial?: { 'storage-profile'?: any; 'storage-credential'?: any } | null;
  // An existing warehouse cannot move: the backend rejects a profile update that
  // changes the location, so those fields are read-only instead of silently failing.
  lockLocation?: boolean;
}>();

// The parent needs to know whether anything was edited — to gate "Update
// profile", to mark the pane, and (in the create flow) to lock the other
// providers once one has been touched.
const emit = defineEmits<{ (e: 'dirty', value: boolean): void }>();

const visualStore = useVisualStore();

// Hidden only when the server explicitly reports the identity as disabled;
// older builds omit the flag, and absence must not be read as "disabled".
const gcpSystemIdentityEnabled = computed(
  () => (visualStore.getServerInfo() as any)?.['gcp-system-identities-enabled'] !== false,
);

const rules = { required: (v: any) => !!v || 'Required.' };

const lockedHint = 'Fixed after creation — a profile update must keep the same location';

// The component owns its state; the parent reads it back via getData().
const profile = reactive<Record<string, any>>({
  type: 'gcs',
  bucket: '',
  'sts-enabled': true,
});

const credential = reactive<Record<string, any>>({
  type: 'gcs',
  'credential-type': 'service-account-key',
});

const keyString = ref('');
const keyValid = ref(false);
const dragging = ref(false);
const editing = ref(false);
const fileRef = ref<HTMLInputElement | null>(null);

// Confirm what was actually parsed rather than showing the raw blob back.
const keySummary = computed(() => {
  const key = credential.key ?? {};
  return (
    [key.client_email, key.project_id ? `project ${key.project_id}` : '']
      .filter(Boolean)
      .join(' · ') || 'Service account key loaded'
  );
});

const authModes = computed(() => [
  { value: 'service-account-key', title: 'Service account key' },
  ...(gcpSystemIdentityEnabled.value
    ? [{ value: 'gcp-system-identity', title: 'System identity' }]
    : []),
]);

const authMode = computed({
  get: () => (credential['credential-type'] as string) || authModes.value[0].value,
  set: (value: string) => {
    credential['credential-type'] = value;
  },
});

// A seeded or imported config may name a mode this server cannot serve.
watch(
  authModes,
  (modes) => {
    if (!modes.some((mode) => mode.value === credential['credential-type'])) {
      credential['credential-type'] = modes[0].value;
    }
  },
  { immediate: true },
);

// An empty GcsServiceKey object is seeded upstream, so "is an object" is not
// enough — a key only counts once it carries something identifying.
function isRealKey(key: any): boolean {
  return !!key && (!!key.client_email || !!key.private_key || !!key.project_id);
}

function parseKey() {
  try {
    const parsed = JSON.parse(keyString.value);
    keyValid.value = isRealKey(parsed);
    credential.key = keyValid.value ? parsed : undefined;
  } catch {
    keyValid.value = false;
  }
}

function readFile(file?: File | null) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    keyString.value = String(e.target?.result ?? '');
    parseKey();
    if (keyValid.value) editing.value = false;
  };
  reader.readAsText(file);
}

function handleBrowse(event: Event) {
  readFile((event.target as HTMLInputElement)?.files?.[0]);
}

function handleDrop(event: DragEvent) {
  dragging.value = false;
  readFile(event.dataTransfer?.files?.[0]);
}

const clientAccess = computed({
  get: () => (profile['sts-enabled'] ? 'sts' : 'none'),
  set: (value: string) => {
    profile['sts-enabled'] = value === 'sts';
  },
});

const layoutType = ref<'default' | 'tabular-only' | 'full-hierarchy'>('default');
const layoutTabular = ref('tabular-{name}-{uuid}');
const layoutNamespace = ref('ns-{name}-{uuid}');
const layoutOptions = [
  { name: 'Default — {uuid} segments', code: 'default' },
  { name: 'Tabular only — no namespace directories', code: 'tabular-only' },
  { name: 'Full hierarchy — a directory per namespace level', code: 'full-hierarchy' },
];

const EXAMPLE_UUID = '00000000-0000-0000-0000-000000000000';
const renderTemplate = (tpl: string, name: string) =>
  tpl.replace(/\{name\}/g, name).replace(/\{uuid\}/g, EXAMPLE_UUID);

const layoutExample = computed(() => {
  const tabular = layoutTabular.value || 'tabular-{name}-{uuid}';
  if (layoutType.value === 'tabular-only') return renderTemplate(tabular, 'customer');
  if (layoutType.value === 'full-hierarchy')
    return (
      renderTemplate(layoutNamespace.value || 'ns-{name}-{uuid}', 'marketing') +
      '/' +
      renderTemplate(tabular, 'customer')
    );
  return '';
});

function buildLayout() {
  if (layoutType.value === 'tabular-only')
    return { type: 'tabular-only', tabular: layoutTabular.value };
  if (layoutType.value === 'full-hierarchy')
    return {
      type: 'full-hierarchy',
      namespace: layoutNamespace.value,
      tabular: layoutTabular.value,
    };
  return { type: 'default' };
}

onMounted(() => {
  if (props.initial?.['storage-profile']) Object.assign(profile, props.initial['storage-profile']);
  if (props.initial?.['storage-credential'])
    Object.assign(credential, props.initial['storage-credential']);

  if (isRealKey(credential.key)) {
    keyString.value = JSON.stringify(credential.key, null, 2);
    keyValid.value = true;
  } else {
    credential.key = undefined;
  }

  const layout = profile['storage-layout'];
  if (layout?.type) {
    layoutType.value = layout.type;
    if (layout.tabular) layoutTabular.value = layout.tabular;
    if (layout.namespace) layoutNamespace.value = layout.namespace;
  }

  baseline = JSON.stringify(getData());
});

// Dirty is measured against what was seeded, not against "has been typed in", so
// editing a field and undoing it reports clean again.
let baseline = '';
watch(
  [profile, credential, layoutType, layoutTabular, layoutNamespace],
  () => {
    if (baseline) emit('dirty', JSON.stringify(getData()) !== baseline);
  },
  { deep: true },
);

// Drop keys that do not belong to the selected mode.
function getData() {
  const cleanProfile: Record<string, any> = { ...profile };
  cleanProfile['storage-layout'] = buildLayout();

  const type = credential['credential-type'];
  const cleanCredential: Record<string, any> = { type: 'gcs', 'credential-type': type };
  if (type === 'service-account-key' && credential.key) cleanCredential.key = credential.key;

  return { 'storage-profile': cleanProfile, 'storage-credential': cleanCredential };
}

defineExpose({ getData });
</script>

<style scoped>
.key-drop {
  border: 1px dashed transparent;
  border-radius: 4px;
  transition: border-color 0.15s;
}
.key-drop--active {
  border-color: rgb(var(--v-theme-primary));
}
</style>
