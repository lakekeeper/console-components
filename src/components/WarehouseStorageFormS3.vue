<template>
  <div>
    <!-- 1. Where is the data? -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile.bucket"
          :hint="lockLocation ? lockedHint : `Bucket holding this warehouse's table data`"
          persistent-hint
          label="Bucket *"
          placeholder="my-bucket"
          :readonly="lockLocation"
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

    <!-- 2. How do we reach it? Only what this flavour actually needs. -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-combobox
          density="compact"
          v-model="profile.region"
          hint="Region the bucket lives in"
          persistent-hint
          :items="regions"
          :label="regionRequired ? 'Region *' : 'Region'"
          :error="regionRequired && !profile.region"
          placeholder="eu-central-1"
          :rules="regionRequired ? [rules.required] : []"></v-combobox>
      </v-col>
      <v-col v-if="needsEndpoint" cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile.endpoint"
          :label="endpointRequired ? 'Endpoint *' : 'Endpoint'"
          :error="endpointRequired && !profile.endpoint"
          placeholder="https://minio.internal:9000"
          :hint="
            endpointRequired
              ? 'Required — without it requests resolve to AWS'
              : 'Optional — only when the bucket is not reached at the default endpoint'
          "
          persistent-hint
          :rules="endpointRequired ? [rules.required] : []"></v-text-field>
      </v-col>
    </v-row>

    <!-- 3. How does Lakekeeper authenticate? Only the chosen mode's fields. -->
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

    <template v-if="authMode === 'access-key' || authMode === 'aliyun-oss'">
      <v-row dense class="mb-3">
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['access-key-id']"
            hint="Static key Lakekeeper uses to reach the bucket"
            persistent-hint
            label="Access Key ID *"
            autocomplete="username"
            :error="!credential['access-key-id']"
            :rules="[rules.required]"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['secret-access-key']"
            hint="Stored encrypted; never returned by the API"
            persistent-hint
            label="Secret Access Key *"
            autocomplete="current-password"
            :error="!credential['secret-access-key']"
            :type="showSecret ? 'text' : 'password'"
            :append-inner-icon="showSecret ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            :rules="[rules.required]"
            @click:append-inner="showSecret = !showSecret"></v-text-field>
        </v-col>
      </v-row>
    </template>

    <template v-else-if="authMode === 'cloudflare-r2'">
      <v-row dense class="mb-3">
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['access-key-id']"
            label="Access Key ID *"
            :error="!credential['access-key-id']"
            :rules="[rules.required]"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['secret-access-key']"
            label="Secret Access Key *"
            :error="!credential['secret-access-key']"
            :type="showSecret ? 'text' : 'password'"
            :append-inner-icon="showSecret ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            :rules="[rules.required]"
            @click:append-inner="showSecret = !showSecret"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential.token"
            hint="R2 API token with read/write on the bucket"
            persistent-hint
            label="Token *"
            :error="!credential.token"
            :type="showSecret ? 'text' : 'password'"
            :rules="[rules.required]"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="credential['account-id']"
            hint="Cloudflare account that owns the bucket"
            persistent-hint
            label="Account ID *"
            :error="!credential['account-id']"
            :rules="[rules.required]"></v-text-field>
        </v-col>
      </v-row>
    </template>

    <v-alert v-else type="info" variant="tonal" density="compact" class="mb-2">
      Uses the IAM role attached to the Lakekeeper server. No credentials to enter.
    </v-alert>

    <v-text-field
      density="compact"
      v-if="authMode !== 'cloudflare-r2'"
      v-model="profile['assume-role-arn']"
      label="Assume role ARN"
      placeholder="arn:aws:iam::123456789012:role/my-role"
      hint="Optional — assume this role for storage access"></v-text-field>
    <v-text-field
      density="compact"
      v-if="authMode !== 'cloudflare-r2'"
      v-model="credential['external-id']"
      label="External ID"
      :type="showSecret ? 'text' : 'password'"
      hint="Optional — required by some role trust policies"></v-text-field>

    <!-- 4. What do query engines get? One exclusive choice, not two switches. -->
    <div class="text-subtitle-2 mt-6 mb-2">Client access</div>
    <div class="text-caption text-medium-emphasis mb-2">
      How engines like Spark or Trino reach the data.
    </div>
    <v-radio-group v-model="clientAccess" hide-details class="mb-2">
      <v-radio value="remote-signing" color="primary" class="mb-4">
        <template #label>
          <div>
            <div>Remote signing</div>
            <div class="text-caption text-medium-emphasis">
              Lakekeeper signs each request; nothing is handed to the client.
            </div>
          </div>
        </template>
      </v-radio>
      <v-radio value="sts" color="primary" class="mb-4">
        <template #label>
          <div>
            <div>Vended credentials (STS)</div>
            <div class="text-caption text-medium-emphasis">
              Clients receive short-lived credentials scoped to the table.
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

    <div v-if="clientAccess === 'sts'" class="mt-3">
      <v-text-field
        density="compact"
        v-model="profile['sts-role-arn']"
        hint="Role assumed when issuing vended credentials"
        persistent-hint
        :label="stsArnRequired ? 'STS role ARN *' : 'STS role ARN'"
        :error="stsArnRequired && !profile['sts-role-arn']"
        placeholder="arn:aws:iam::123456789012:role/vending"
        :rules="stsArnRequired ? [rules.required] : []"></v-text-field>
      <v-row dense class="mb-3">
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model="profile['sts-endpoint']"
            label="STS endpoint"
            hint="Defaults to the S3 endpoint"></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            density="compact"
            v-model.number="profile['sts-token-validity-seconds']"
            hint="Default 3600 (1 hour)"
            persistent-hint
            label="Token validity (seconds)"
            type="number"
            placeholder="3600"></v-text-field>
        </v-col>
      </v-row>
      <v-text-field
        density="compact"
        v-model="profile['aws-kms-key-arn']"
        label="KMS key ARN"
        hint="Optional — encrypt written objects with this key"></v-text-field>

      <div class="text-caption text-medium-emphasis mt-3 mb-1">
        Session tags — passed when assuming the STS role
      </div>
      <v-row v-for="(tag, i) in sessionTags" :key="i" dense align="center">
        <v-col cols="5">
          <v-text-field v-model="tag.key" label="Key" density="compact" hide-details />
        </v-col>
        <v-col cols="5">
          <v-text-field v-model="tag.value" label="Value" density="compact" hide-details />
        </v-col>
        <v-col cols="2">
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            size="small"
            color="error"
            @click="sessionTags.splice(i, 1)"></v-btn>
        </v-col>
      </v-row>
      <v-btn
        prepend-icon="mdi-plus"
        variant="text"
        size="small"
        class="mt-1"
        @click="sessionTags.push({ key: '', value: '' })">
        Session tag
      </v-btn>
    </div>

    <v-select
      density="compact"
      v-if="clientAccess === 'remote-signing'"
      v-model="profile['remote-signing-url-style']"
      :items="urlStyles"
      item-title="name"
      item-value="code"
      label="Remote signing URL style"
      clearable
      placeholder="Auto-detect"
      class="mt-3"></v-select>

    <!-- Everything below has a working default; unlike `endpoint`, none of it is
         required to get connected. -->
    <v-expansion-panels variant="accordion" flat class="mt-6">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon class="mr-2" color="primary">mdi-tune</v-icon>
          Layout &amp; options
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row dense class="mb-3">
            <v-col cols="12" md="6">
              <v-switch
                v-model="profile['path-style-access']"
                color="primary"
                density="compact"
                hide-details
                label="Path style access"></v-switch>
              <div class="text-caption text-medium-emphasis mt-1">
                Use bucket-in-path URLs instead of virtual-host style. Needed by most S3-compatible
                storage.
              </div>
            </v-col>
            <v-col cols="12" md="6">
              <v-switch
                v-model="profile['push-s3-delete-disabled']"
                color="primary"
                density="compact"
                hide-details
                label="Disable push S3 delete"></v-switch>
              <div class="text-caption text-medium-emphasis mt-1">
                Stop Lakekeeper issuing S3 deletes; leave clean-up to a bucket lifecycle rule.
              </div>
            </v-col>
            <v-col cols="12" md="6">
              <v-switch
                v-model="profile['allow-alternative-protocols']"
                color="primary"
                density="compact"
                hide-details
                label="Allow s3a / s3n protocols"></v-switch>
              <div class="text-caption text-medium-emphasis mt-1">
                Accept s3a:// and s3n:// locations in addition to s3://.
              </div>
            </v-col>
            <v-col cols="12" md="6">
              <v-switch
                v-model="profile['legacy-md5-behavior']"
                color="primary"
                density="compact"
                hide-details
                label="Legacy MD5 checksums"></v-switch>
              <div class="text-caption text-medium-emphasis mt-1">
                Send legacy MD5 checksums, for older S3-compatible systems that require them.
              </div>
            </v-col>
          </v-row>

          <v-select
            density="compact"
            v-model="layoutType"
            :items="layoutOptions"
            item-title="name"
            item-value="code"
            label="Storage layout"
            class="mt-4"
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
            v-if="layoutType !== 'default' && !layoutTabular.includes('{uuid}')"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-2">
            Tabular template has no
            <code>{uuid}</code>
            — paths collide if a tabular is renamed and re-created.
          </v-alert>
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

export type S3Flavor = 'aws' | 'cloudflare-r2' | 'aliyun-oss' | 's3-compat';

const props = defineProps<{
  flavor: S3Flavor;
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

const DEFAULT_CREDENTIAL_TYPE: Record<S3Flavor, string> = {
  aws: 'access-key',
  'cloudflare-r2': 'cloudflare-r2',
  'aliyun-oss': 'aliyun-oss',
  's3-compat': 'access-key',
};

// The component owns its state; the parent reads it back via getData(). Mutating
// props directly would both trip vue/no-mutating-props and alias the parent's
// object, which is how the old forms ended up impossible to reset.
const profile = reactive<Record<string, any>>({
  type: 's3',
  bucket: '',
  region: props.flavor === 's3-compat' ? 'local' : '',
  flavor: props.flavor === 'aws' ? 'aws' : 's3-compat',
  'remote-signing-enabled': true,
  'sts-enabled': props.flavor === 'cloudflare-r2' || props.flavor === 'aliyun-oss',
});

const credential = reactive<Record<string, any>>({
  type: 's3',
  'credential-type': DEFAULT_CREDENTIAL_TYPE[props.flavor],
});

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
  const tags = profile['sts-session-tags'];
  if (tags)
    sessionTags.push(
      ...Object.entries(tags).map(([key, value]) => ({ key, value: String(value) })),
    );

  baseline = JSON.stringify(getData());
});

// Dirty is measured against what was seeded, not against "has been typed in", so
// editing a field and undoing it reports clean again. The watcher itself is
// registered at the bottom of this file, once everything it reads exists.
let baseline = '';

const sessionTags = reactive<{ key: string; value: string }[]>([]);

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

// Shows what the templates actually resolve to — the placeholders are otherwise
// hard to reason about.
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

// Drop keys that do not belong to the selected mode, so the payload matches what
// the user actually chose rather than everything the form ever touched.
function getData() {
  const cleanProfile: Record<string, any> = { ...profile };
  if (clientAccess.value !== 'sts') {
    for (const k of [
      'sts-role-arn',
      'sts-endpoint',
      'sts-token-validity-seconds',
      'sts-session-tags',
      'aws-kms-key-arn',
    ])
      delete cleanProfile[k];
  }
  if (clientAccess.value !== 'remote-signing') delete cleanProfile['remote-signing-url-style'];

  cleanProfile['storage-layout'] = buildLayout();
  if (clientAccess.value === 'sts') {
    const tags = sessionTags.filter((t) => t.key.trim() && t.value.trim());
    cleanProfile['sts-session-tags'] = tags.length
      ? Object.fromEntries(tags.map((t) => [t.key.trim(), t.value.trim()]))
      : undefined;
  }

  const type = credential['credential-type'];
  const keep: Record<string, string[]> = {
    'access-key': ['access-key-id', 'secret-access-key', 'external-id'],
    'aliyun-oss': ['access-key-id', 'secret-access-key', 'external-id'],
    'aws-system-identity': ['external-id'],
    'cloudflare-r2': ['access-key-id', 'secret-access-key', 'token', 'account-id'],
  };
  const cleanCredential: Record<string, any> = { type: 's3', 'credential-type': type };
  for (const k of keep[type] ?? []) {
    if (credential[k] !== undefined && credential[k] !== '') cleanCredential[k] = credential[k];
  }
  return { 'storage-profile': cleanProfile, 'storage-credential': cleanCredential };
}

defineExpose({ getData });

const visual = useVisualStore();
const showSecret = ref(false);

const rules = {
  required: (v: any) => !!v || 'Required.',
};

const lockedHint = 'Fixed after creation — a profile update must keep the same location';

// --- 2. Reachability ---------------------------------------------------------
// s3-compat has no AWS default to fall back on: without an endpoint the client
// silently resolves to AWS, so it is required rather than "advanced".
const endpointRequired = computed(() => props.flavor === 's3-compat');
const needsEndpoint = computed(() => props.flavor !== 'cloudflare-r2');
const regionRequired = computed(() => props.flavor !== 's3-compat');

// --- 3. Authentication -------------------------------------------------------
// Hidden only when the server explicitly reports the identity as disabled.
// Older Lakekeeper builds omit the flag entirely, and absence must not be read
// as "disabled" — that would silently drop a working option.
const awsSystemIdentityEnabled = computed(
  () => (visual.getServerInfo() as any)?.['aws-system-identities-enabled'] !== false,
);

const authModes = computed(() => {
  if (props.flavor === 'cloudflare-r2') return [{ value: 'cloudflare-r2', title: 'R2 token' }];
  if (props.flavor === 'aliyun-oss') return [{ value: 'aliyun-oss', title: 'Access key' }];
  if (props.flavor === 's3-compat') return [{ value: 'access-key', title: 'Access key' }];
  return [
    { value: 'access-key', title: 'Access key' },
    ...(awsSystemIdentityEnabled.value
      ? [{ value: 'aws-system-identity', title: 'System identity' }]
      : []),
  ];
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

const authMode = computed({
  get: () => (credential['credential-type'] as string) || authModes.value[0].value,
  set: (value: string) => {
    credential['credential-type'] = value;
  },
});

// --- 4. Client access --------------------------------------------------------
// remote-signing and sts are two booleans on the wire but one decision here.
const clientAccess = computed({
  get: () => {
    if (profile['sts-enabled']) return 'sts';
    if (profile['remote-signing-enabled']) return 'remote-signing';
    return 'none';
  },
  set: (value: string) => {
    profile['sts-enabled'] = value === 'sts';
    profile['remote-signing-enabled'] = value === 'remote-signing';
  },
});

// s3-compat storage (MinIO etc.) can vend without a role; everything else needs one.
const stsArnRequired = computed(() => props.flavor !== 's3-compat' && !profile['assume-role-arn']);

// Clearing STS-only fields keeps them out of the submitted payload.
watch(clientAccess, (value) => {
  if (value !== 'sts') {
    profile['sts-role-arn'] = undefined;
    profile['sts-endpoint'] = undefined;
    profile['sts-session-tags'] = undefined;
  }
  if (value !== 'remote-signing') profile['remote-signing-url-style'] = undefined;
});

const urlStyles = [
  { name: 'Path', code: 'path' },
  { name: 'Virtual host', code: 'virtual_host' },
  { name: 'Auto', code: 'auto' },
];

watch(
  [profile, credential, sessionTags, layoutType, layoutTabular, layoutNamespace],
  () => {
    if (baseline) emit('dirty', JSON.stringify(getData()) !== baseline);
  },
  { deep: true },
);

const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-north-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'sa-east-1',
];
</script>
