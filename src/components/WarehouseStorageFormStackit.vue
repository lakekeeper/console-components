<template>
  <div>
    <!-- 1. Where is the data? -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <!-- Name only. The field next to it takes the path and every other
             storage form in the console takes a URI somewhere, so `s3://` is the
             obvious wrong guess — it is rejected here rather than accepted and
             turned into a bucket that does not exist. -->
        <v-text-field
          density="compact"
          v-model="profile.bucket"
          :hint="lockLocation ? lockedHint : 'Bucket name only — e.g. customer360, not s3://…'"
          persistent-hint
          label="Bucket *"
          placeholder="customer360"
          :readonly="lockLocation"
          :error="!profile.bucket || dottedBucket || !!bucketShapeError"
          :rules="[rules.required, rules.nameOnly, rules.noDot]"></v-text-field>
      </v-col>
      <v-col cols="12" md="6">
        <!-- The example carries the point the label cannot: this is a path inside
             the bucket, not a URI. It lives in the hint rather than the placeholder
             because Vuetify only reveals a placeholder once the field has focus. -->
        <v-text-field
          density="compact"
          v-model="profile['key-prefix']"
          label="Location"
          placeholder="marketing/customer360-wh"
          :readonly="lockLocation"
          :hint="
            lockLocation ? lockedHint : 'Folder inside the bucket — e.g. marketing/customer360-wh'
          "
          persistent-hint></v-text-field>
      </v-col>
    </v-row>

    <!-- 2. How do we reach it? The endpoint is derived from the region, so the
         region is the only reachability field most warehouses need. -->
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-combobox
          density="compact"
          v-model="profile.region"
          hint="STACKIT region the bucket lives in — the endpoint is derived from it"
          persistent-hint
          :items="regions"
          label="Region *"
          :error="!profile.region"
          placeholder="eu01"
          :readonly="lockLocation"
          :rules="[rules.required]"></v-combobox>
      </v-col>
      <!-- Normally left empty: the endpoint follows from the region. It stays on
           the surface anyway because it is fixed once the warehouse exists — a
           custom endpoint is a distinct storage tenant, not another route to the
           same bucket — so a customer who needs it and cannot find it has to
           recreate the warehouse to correct the mistake. -->
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="profile.endpoint"
          label="Endpoint override"
          placeholder="https://object.storage.eu01.onstackit.cloud"
          :readonly="lockLocation"
          :hint="
            lockLocation
              ? lockedHint
              : 'Optional — only for a per-customer endpoint outside the public naming scheme'
          "
          persistent-hint></v-text-field>
      </v-col>
    </v-row>

    <!-- 3. How does Lakekeeper authenticate? STACKIT issues access keys inside a
         credentials group; there is no system identity to fall back on.
         No example values here on purpose: STACKIT publishes no format for either
         field, and a made-up sample invites people to check their real key
         against it. The hints name the source instead, which is the part that
         actually gets confused with a service-account key. -->
    <div class="text-subtitle-2 mt-6 mb-2">Authentication</div>
    <v-row dense class="mb-3">
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="credential['access-key-id']"
          hint="The Access key ID from the credentials group — not a STACKIT service-account key"
          persistent-hint
          label="Access Key ID *"
          autocomplete="username"
          :error="!credential['access-key-id']"
          :rules="[rules.accessKeyId]"></v-text-field>
      </v-col>
      <v-col cols="12" md="6">
        <v-text-field
          density="compact"
          v-model="credential['secret-access-key']"
          hint="The Secret access key shown with it — STACKIT shows it once, at creation"
          persistent-hint
          label="Secret Access Key *"
          autocomplete="current-password"
          :error="!credential['secret-access-key']"
          :type="showSecret ? 'text' : 'password'"
          :append-inner-icon="showSecret ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
          :rules="[rules.secretAccessKey]"
          @click:append-inner="showSecret = !showSecret"></v-text-field>
      </v-col>
    </v-row>

    <!-- 4. What do query engines get? Both paths are on by default and are not
         exclusive: remote signing stays available while STS vends credentials, and
         is the only path left when vending is off.
         One row per path, with each path's own fields beside its switch — the
         URN belongs to STS, and reading it under a Remote signing toggle would
         suggest otherwise. The halves match the md="6" grid every row above uses,
         so the fields keep one left edge down the whole pane. -->
    <div class="text-subtitle-2 mt-6 mb-2">Client access</div>
    <div class="text-caption text-medium-emphasis mb-3">
      How engines like Spark or Trino reach the data.
    </div>
    <v-row dense>
      <v-col cols="12" md="6">
        <v-switch
          v-model="profile['sts-enabled']"
          color="primary"
          density="compact"
          hide-details
          label="Vended credentials (STS)"></v-switch>
        <div class="text-caption text-medium-emphasis mt-1">
          Clients receive short-lived credentials scoped to the table. Needs a credentials group
          whose trust policy allows
          <code>sts:AssumeRole</code>
          .
        </div>
      </v-col>
      <!-- Both fields belong to STS alone: the URN is the group that gets assumed,
           so without vending there is nothing to assume and nothing to ask for.
           The hint says where to find it rather than warning it is "not
           derivable": the failure mode is someone assembling a plausible URN from
           their project id, which this form would accept and vending would then
           reject at query time. -->
      <v-col cols="12" md="6" v-if="profile['sts-enabled']">
        <v-text-field
          density="compact"
          v-model="profile['credentials-group-urn']"
          label="Credentials group URN *"
          :error="!profile['credentials-group-urn']"
          placeholder="urn:sgws:identity::87066461224079950546:group/credentials-group-a1b2c3"
          hint="e.g. urn:sgws:identity::<account>:group/credentials-group-<id> — paste it from the credentials group"
          persistent-hint
          :rules="[rules.required]"></v-text-field>
        <v-text-field
          density="compact"
          class="mt-3"
          v-model="profile['sts-token-validity-seconds']"
          hint="Default 3600 (1 hour)"
          persistent-hint
          label="Token validity (seconds)"
          type="number"
          placeholder="3600"></v-text-field>
      </v-col>
    </v-row>

    <v-row dense class="mt-2">
      <v-col cols="12" md="6">
        <v-switch
          v-model="profile['remote-signing-enabled']"
          color="primary"
          density="compact"
          hide-details
          label="Remote signing"></v-switch>
        <div class="text-caption text-medium-emphasis mt-1">
          Lakekeeper signs each request; nothing is handed to the client.
        </div>
      </v-col>
    </v-row>

    <v-alert
      v-if="!profile['sts-enabled'] && !profile['remote-signing-enabled']"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3">
      With both off, clients have to bring their own credentials — Lakekeeper hands out neither
      signatures nor tokens.
    </v-alert>

    <!-- Everything below has a working default; none of it is required to get
         connected. -->
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
                v-model="profile['push-s3-delete-disabled']"
                color="primary"
                density="compact"
                hide-details
                label="Push s3.delete-enabled=false"></v-switch>
              <div class="text-caption text-medium-emphasis mt-1">
                Discourage engines from deleting files directly and bypassing soft-deletion.
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

// The component owns its state; the parent reads it back via getData(). Mutating
// props directly would both trip vue/no-mutating-props and alias the parent's
// object.
const profile = reactive<Record<string, any>>({
  type: 'stackit',
  bucket: '',
  region: 'eu01',
  'remote-signing-enabled': true,
  'sts-enabled': true,
  'push-s3-delete-disabled': true,
});

// STACKIT keeps its own credential enum rather than reusing the S3 one, so the
// wire type is `stackit` on both halves of the pair.
const credential = reactive<Record<string, any>>({
  type: 'stackit',
  'credential-type': 'access-key',
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

  baseline = JSON.stringify(getData());
});

// Dirty is measured against what was seeded, not against "has been typed in", so
// editing a field and undoing it reports clean again. The watcher itself is
// registered at the bottom of this file, once everything it reads exists.
let baseline = '';

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

// v-model on a Vuetify field always yields a string, so numeric fields have to be
// coerced before they go to the API — the backend rejects "3600" for a u64.
function toNumberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getData() {
  const cleanProfile: Record<string, any> = { ...profile };

  // An empty string is not an omitted value: `endpoint` is typed as a URI and
  // the URN is validated whenever present, so blanks have to be dropped rather
  // than sent.
  for (const k of ['endpoint', 'key-prefix', 'credentials-group-urn']) {
    if (cleanProfile[k] === '' || cleanProfile[k] === null) delete cleanProfile[k];
  }

  cleanProfile['storage-layout'] = buildLayout();
  // The STS keys are hidden when vending is off, and a hidden field that still
  // reaches the API is how a form lies about what it submitted.
  if (profile['sts-enabled']) {
    cleanProfile['sts-token-validity-seconds'] = toNumberOrUndefined(
      cleanProfile['sts-token-validity-seconds'],
    );
  } else {
    delete cleanProfile['sts-token-validity-seconds'];
    delete cleanProfile['credentials-group-urn'];
  }

  const cleanCredential: Record<string, any> = {
    type: 'stackit',
    'credential-type': 'access-key',
  };
  for (const k of ['access-key-id', 'secret-access-key']) {
    if (credential[k] !== undefined && credential[k] !== '') cleanCredential[k] = credential[k];
  }
  return { 'storage-profile': cleanProfile, 'storage-credential': cleanCredential };
}

defineExpose({ getData });

const showSecret = ref(false);

const rules = {
  required: (v: any) => !!v || 'Required.',
  // STACKIT publishes no length or charset for either half of an access key, so
  // there is no example to show and nothing to pattern-match. What people do get
  // wrong is *which* credential to bring, so the empty-field message names the
  // source instead of saying "Required."
  accessKeyId: (v: any) => !!v || 'Enter the Access key ID from the credentials group',
  secretAccessKey: (v: any) => !!v || 'Enter the Secret access key shown when the key was created',
  // A URI here is the common wrong guess, and the backend would take it at face
  // value: the bucket becomes "s3:" and every request 404s against a bucket that
  // was never created. Caught while the field still has focus instead.
  nameOnly: (v: string) => {
    if (!v) return true;
    if (/^[a-z0-9]+:\/\//i.test(v)) return 'Bucket name only — drop the s3:// prefix';
    if (v.includes('/')) return 'Bucket name only — put the path in Location';
    return true;
  },
  // STACKIT addresses buckets as a subdomain of the endpoint, and its wildcard
  // certificate covers only a single label — a dot breaks TLS, not just naming.
  noDot: (v: string) => !v?.includes('.') || 'Cannot contain "." — bucket is a subdomain label',
};

const dottedBucket = computed(() => !!profile.bucket?.includes('.'));
// Mirrors `rules.nameOnly` for the red-outline state: `rules` only colour the
// field once it has been touched, and a pre-seeded or imported value never is.
const bucketShapeError = computed(() => {
  const v = profile.bucket;
  if (!v) return null;
  return /^[a-z0-9]+:\/\//i.test(v) || v.includes('/') ? 'shape' : null;
});

const lockedHint = 'Fixed after creation — a profile update must keep the same location';

watch(
  [profile, credential, layoutType, layoutTabular, layoutNamespace],
  () => {
    if (baseline) emit('dirty', JSON.stringify(getData()) !== baseline);
  },
  { deep: true },
);

// STACKIT Object Storage is offered per region; the endpoint follows the region,
// so a free-text combobox keeps new regions usable without a release.
const regions = ['eu01'];
</script>
