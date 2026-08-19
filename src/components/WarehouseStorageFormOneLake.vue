<template>
  <div>
    <!-- 1. Where is the data? -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile['workspace-id']"
          label="Workspace ID *"
          placeholder="12345678-1234-1234-1234-123456789abc"
          :readonly="lockLocation"
          :hint="lockLocation ? lockedHint : 'UUID of the Fabric workspace this warehouse lives in'"
          persistent-hint
          :error="!profile['workspace-id']"
          :rules="[rules.required]"></v-text-field>
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile['lakehouse-id']"
          label="Lakehouse ID *"
          placeholder="87654321-4321-4321-4321-abc987654321"
          :readonly="lockLocation"
          :hint="lockLocation ? lockedHint : 'UUID of the lakehouse within the workspace'"
          persistent-hint
          :error="!profile['lakehouse-id']"
          :rules="[rules.required]"></v-text-field>
      </v-col>
    </v-row>

    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile['directory-rel-path']"
          label="Location"
          placeholder="warehouse"
          :readonly="lockLocation"
          :hint="
            lockLocation
              ? lockedHint
              : 'Folder inside the lakehouse — the validation checks call this the location'
          "
          persistent-hint></v-text-field>
      </v-col>
      <v-col cols="12" md="6">
        <v-select
          density="compact"
          v-model="profile['top-level-folder']"
          :items="['Files', 'Tables']"
          label="Top-level folder"
          :readonly="lockLocation"
          :hint="lockLocation ? lockedHint : 'Where inside the lakehouse the warehouse is rooted'"
          persistent-hint></v-select>
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

    <template v-if="authMode === 'client-credentials'">
      <v-row dense class="mb-3">
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['client-id']"
            label="Client ID *"
            placeholder="12345678-1234-1234-1234-123456789abc"
            hint="Application (client) ID from Entra ID"
            persistent-hint
            :error="!credential['client-id']"
            :rules="[rules.required]"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['client-secret']"
            label="Client secret *"
            :type="showSecret ? 'text' : 'password'"
            :append-inner-icon="showSecret ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            hint="Stored encrypted; never returned by the API"
            persistent-hint
            :error="!credential['client-secret']"
            :rules="[rules.required]"
            @click:append-inner="showSecret = !showSecret"></v-text-field>
        </v-col>
      </v-row>
      <v-text-field
        density="compact"
        v-model="credential['tenant-id']"
        label="Tenant ID *"
        placeholder="87654321-4321-4321-4321-abc987654321"
        hint="Directory (tenant) ID from Entra ID"
        persistent-hint
        :error="!credential['tenant-id']"
        :rules="[rules.required]"></v-text-field>
    </template>

    <v-alert v-else type="info" variant="tonal" density="compact" class="mb-2">
      Uses the managed identity configured on the Lakekeeper server. No credentials to enter.
    </v-alert>

    <!-- 3. What do query engines get? Azure vends SAS tokens rather than STS. -->
    <div class="text-subtitle-2 mt-6 mb-2">Client access</div>
    <div class="text-caption text-medium-emphasis mb-2">
      How engines like Spark or Trino reach the data.
    </div>
    <v-radio-group v-model="clientAccess" hide-details class="mb-2">
      <v-radio value="sas" color="primary" class="mb-4">
        <template #label>
          <div>
            <div>Vended credentials (SAS)</div>
            <div class="text-caption text-medium-emphasis">
              Clients receive short-lived SAS tokens scoped to the table.
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

    <v-text-field
      v-if="clientAccess === 'sas'"
      density="compact"
      v-model="profile['sas-token-validity-seconds']"
      label="Token validity (seconds)"
      type="number"
      placeholder="3600"
      hint="Default 3600 (1 hour)"
      persistent-hint
      class="mt-3"></v-text-field>

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
const azureSystemIdentityEnabled = computed(
  () => (visualStore.getServerInfo() as any)?.['azure-system-identities-enabled'] !== false,
);

const rules = { required: (v: any) => !!v || 'Required.' };
const showSecret = ref(false);

const lockedHint = 'Fixed after creation — a profile update must keep the same location';

const profile = reactive<Record<string, any>>({
  type: 'onelake',
  'workspace-id': '',
  'lakehouse-id': '',
  'top-level-folder': 'Files',
  'sas-enabled': true,
});

const credential = reactive<Record<string, any>>({
  type: 'az',
  'credential-type': 'client-credentials',
});

const authModes = computed(() => [
  { value: 'client-credentials', title: 'Client credentials' },
  ...(azureSystemIdentityEnabled.value
    ? [{ value: 'azure-system-identity', title: 'System identity' }]
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

const clientAccess = computed({
  get: () => (profile['sas-enabled'] ? 'sas' : 'none'),
  set: (value: string) => {
    profile['sas-enabled'] = value === 'sas';
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

// v-model on a Vuetify field always yields a string, so numeric fields have to be
// coerced before they go to the API — the backend rejects "3600" for a u64.
function toNumberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Drop keys that do not belong to the selected mode.
function getData() {
  const cleanProfile: Record<string, any> = { ...profile };
  cleanProfile['storage-layout'] = buildLayout();
  if (clientAccess.value !== 'sas') delete cleanProfile['sas-token-validity-seconds'];
  else
    cleanProfile['sas-token-validity-seconds'] = toNumberOrUndefined(
      cleanProfile['sas-token-validity-seconds'],
    );

  const type = credential['credential-type'];
  const keep: Record<string, string[]> = {
    'client-credentials': ['client-id', 'client-secret', 'tenant-id'],
    'azure-system-identity': [],
  };
  const cleanCredential: Record<string, any> = { type: 'az', 'credential-type': type };
  for (const k of keep[type] ?? []) {
    if (credential[k] !== undefined && credential[k] !== '') cleanCredential[k] = credential[k];
  }
  return { 'storage-profile': cleanProfile, 'storage-credential': cleanCredential };
}

defineExpose({ getData });
</script>
