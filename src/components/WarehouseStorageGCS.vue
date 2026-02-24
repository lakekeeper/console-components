<template>
  <v-form @submit.prevent="handleSubmit">
    <!-- Storage Credentials Section -->
    <v-card class="mb-4" variant="outlined">
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-key-variant</v-icon>
        Storage Credentials
        <v-tooltip location="top">
          <template #activator="{ props: tooltipProps }">
            <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
              mdi-information-outline
            </v-icon>
          </template>
          <span>Choose how Lakekeeper authenticates to your Google Cloud Storage</span>
        </v-tooltip>
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="credentialType === 'service-account-key'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4">
          <strong>Service Account Key:</strong>
          Use a GCP service account JSON key file. Recommended for most use cases.
        </v-alert>
        <v-alert
          v-if="credentialType === 'gcp-system-identity'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4">
          <strong>GCP System Identity:</strong>
          Use workload identity from the Lakekeeper server. Most secure for GCP-hosted deployments.
        </v-alert>

        <v-radio-group v-model="credentialType" row>
          <v-row>
            <v-col>
              <span class="text-subtitle-2 text-grey-darken-1">Select Credential Type:</span>
            </v-col>
          </v-row>
          <v-row>
            <v-radio value="service-account-key" color="primary">
              <template #label>
                <div>
                  <v-icon color="primary">mdi-account-key</v-icon>
                  Service Account Key
                </div>
              </template>
            </v-radio>
            <v-radio value="gcp-system-identity" color="primary">
              <template #label>
                <div>
                  <v-icon color="primary">mdi-shield-key</v-icon>
                  GCP System Identity
                </div>
              </template>
            </v-radio>
          </v-row>
        </v-radio-group>

        <div v-if="credentialType === 'service-account-key'">
          <v-switch
            v-model="useFileInput"
            color="primary"
            :label="!useFileInput ? 'Upload JSON File' : 'Paste JSON Text'"></v-switch>

          <v-file-input
            v-if="useFileInput"
            accept="application/json"
            label="Service Account Key (JSON) *"
            prepend-icon="mdi-file-code"
            hint="Upload your service account key JSON file from GCP"
            persistent-hint
            :rules="[rules.required]"
            @change="handleFileInput"></v-file-input>
          <v-textarea
            v-else
            v-model="keyString"
            label="Service Account Key (JSON) *"
            placeholder='{"type": "service_account", "project_id": "...", ...}'
            hint="Paste the contents of your service account key JSON file"
            persistent-hint
            rows="6"
            :rules="[rules.required, rules.validJson]"
            @update:model-value="verifyKeyJson"></v-textarea>
          <v-btn
            v-if="props.objectType === ObjectType.STORAGE_CREDENTIAL"
            color="success"
            :disabled="!keyStringValid"
            @click="emitNewCredentials">
            Update Credentials
          </v-btn>
        </div>

        <div v-else-if="credentialType === 'gcp-system-identity'">
          <v-alert type="info" variant="tonal" density="compact" class="my-4">
            No additional credentials required. The system will use the workload identity configured
            on the Lakekeeper server.
          </v-alert>
        </div>
      </v-card-text>
    </v-card>

    <!-- Storage Profile Section -->
    <v-card
      v-if="
        props.objectType === ObjectType.STORAGE_PROFILE ||
        (props.intent === Intent.CREATE && props.objectType === ObjectType.WAREHOUSE)
      "
      class="mb-4"
      variant="outlined">
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-database-cog</v-icon>
        Storage Profile
        <v-tooltip location="top">
          <template #activator="{ props: tooltipProps }">
            <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
              mdi-information-outline
            </v-icon>
          </template>
          <span>Configure Google Cloud Storage bucket settings</span>
        </v-tooltip>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="warehouseObjectData['storage-profile'].bucket"
          label="Bucket Name *"
          placeholder="my-bucket"
          hint="The GCS bucket where table data will be stored"
          persistent-hint
          :rules="[rules.required]"
          :error="isBucketInvalid"
          :color="isBucketInvalid ? 'error' : 'primary'"
          :style="isBucketInvalid ? 'color: rgb(var(--v-theme-error));' : ''"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['key-prefix']"
          label="Key Prefix"
          placeholder="path/to/warehouse"
          hint="Optional: Subdirectory path within the bucket for warehouse data"></v-text-field>

        <!-- Advanced Options -->
        <v-expansion-panels class="mb-4" variant="accordion">
          <v-expansion-panel elevation="1" bg-color="grey-lighten-5">
            <v-expansion-panel-title>
              <div class="d-flex align-center">
                <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
                <div>
                  <div class="text-subtitle-1 font-weight-medium">Advanced Options</div>
                  <div class="text-caption text-medium-emphasis">
                    Optional: Storage layout and other advanced settings
                  </div>
                </div>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <h4 class="text-subtitle-2 mb-2 d-flex align-center">
                Storage Layout
                <a
                  href="https://docs.lakekeeper.io/docs/nightly/storage/#storage-layout"
                  target="_blank"
                  rel="noopener noreferrer">
                  <v-icon class="ml-2" size="small" color="info">mdi-information-outline</v-icon>
                  <v-tooltip activator="parent" location="top">
                    More docs on Storage Layout
                  </v-tooltip>
                </a>
              </h4>
              <v-alert
                v-if="storageLayoutType !== 'default'"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-4">
                <strong>
                  Always include
                  <code>{uuid}</code>
                  in templates.
                </strong>
                Storage paths are assigned once at creation time and are never updated when a table
                or namespace is renamed. If a template relies solely on
                <code>{name}</code>
                and an object is later renamed and re-created with the same name, Lakekeeper will
                reject the creation because the path is already in use. Using
                <code>{uuid}</code>
                (alone or combined with
                <code>{name}</code>
                ) guarantees each object always has a distinct, collision-free storage path.
              </v-alert>
              <v-select
                v-model="storageLayoutType"
                :items="storageLayoutOptions"
                item-title="name"
                item-value="code"
                label="Layout Type"
                :hint="storageLayoutType !== 'default' ? 'How directories are organized under the warehouse base location' : ''"
                :persistent-hint="storageLayoutType !== 'default'">
                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" :subtitle="item.raw.description"></v-list-item>
                </template>
              </v-select>

              <v-text-field
                v-if="storageLayoutType === 'table-only'"
                v-model="storageLayoutTable"
                label="Table Template"
                placeholder="tabular-{name}-{uuid}"
                hint="Template for table path segments."
                persistent-hint
                class="mt-4"></v-text-field>
              <v-alert
                v-if="storageLayoutType === 'table-only' && !storageLayoutTable.includes('{uuid}')"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2">
                Template does not contain
                <code>{uuid}</code>
                . This may cause collisions if tables are renamed and re-created.
              </v-alert>
              <v-alert
                v-if="storageLayoutType === 'table-only'"
                type="info"
                variant="tonal"
                density="compact"
                class="mt-3">
                <strong>Example path</strong>
                (table "customer"):
                <br />
                <code class="mt-1 d-block">{{ storageLayoutExample }}</code>
              </v-alert>

              <template v-if="storageLayoutType === 'full-hierarchy'">
                <v-text-field
                  v-model="storageLayoutNamespace"
                  label="Namespace Template"
                  placeholder="ns-{name}-{uuid}"
                  hint="Applied to every namespace level. Path: base/<ns1>/<ns2>/…/<table-segment>"
                  persistent-hint
                  class="mt-4"></v-text-field>
                <v-text-field
                  v-model="storageLayoutTable"
                  label="Table Template"
                  placeholder="tabular-{name}-{uuid}"
                  hint="Template for the table directory."
                  persistent-hint
                  class="mt-2"></v-text-field>
                <v-alert
                  v-if="!storageLayoutTable.includes('{uuid}')"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  class="mt-2">
                  Table template does not contain
                  <code>{uuid}</code>
                  . This may cause collisions if tables are renamed and re-created.
                </v-alert>
                <v-alert type="info" variant="tonal" density="compact" class="mt-3">
                  <strong>Example path</strong>
                  (namespace "marketing", table "customer"):
                  <br />
                  <code class="mt-1 d-block">{{ storageLayoutExample }}</code>
                </v-alert>
              </template>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-divider class="my-4"></v-divider>

        <!-- Credential Vending Options -->
        <h4 class="text-subtitle-1 mb-3 d-flex align-center">
          Credential Vending Options
          <v-tooltip location="top" max-width="400">
            <template #activator="{ props: tooltipProps }">
              <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
                mdi-information-outline
              </v-icon>
            </template>
            <span>
              Enable clients to request temporary credentials directly from Lakekeeper instead of
              using static credentials
            </span>
          </v-tooltip>
        </h4>

        <v-switch
          v-model="warehouseObjectData['storage-profile']['sts-enabled']"
          color="primary"
          :label="
            warehouseObjectData['storage-profile']['sts-enabled']
              ? `STS Enabled`
              : `Enable STS (Security Token Service)`
          ">
          <template #append>
            <v-tooltip location="top" max-width="400">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="info">
                  mdi-help-circle-outline
                </v-icon>
              </template>
              <span>
                Enables vending of temporary GCP credentials to clients. Provides time-limited
                access to GCS without sharing long-term service account keys.
              </span>
            </v-tooltip>
          </template>
        </v-switch>

        <v-btn-group
          v-if="props.intent === Intent.CREATE && props.objectType === ObjectType.WAREHOUSE"
          divided>
          <v-btn
            color="success"
            :disabled="
              (credentialType === 'service-account-key' && !keyStringValid) ||
              warehouseObjectData['storage-profile'].bucket == ''
            "
            type="submit">
            Create
          </v-btn>
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                color="success"
                v-bind="menuProps"
                icon="mdi-menu-down"
                size="small"
                :disabled="
                  (credentialType === 'service-account-key' && !keyStringValid) ||
                  warehouseObjectData['storage-profile'].bucket == ''
                "></v-btn>
            </template>
            <v-list>
              <v-list-item @click="handleSubmit">
                <template #prepend>
                  <v-icon>mdi-check</v-icon>
                </template>
                <v-list-item-title>Create</v-list-item-title>
              </v-list-item>
              <v-list-item @click="saveAsJson">
                <template #prepend>
                  <v-icon>mdi-download</v-icon>
                </template>
                <v-list-item-title>& save config</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-btn-group>

        <v-btn
          v-if="props.intent === Intent.UPDATE && props.objectType === ObjectType.STORAGE_PROFILE"
          color="success"
          :disabled="!warehouseObjectData['storage-profile'].bucket"
          @click="emitNewProfile">
          Update Profile
        </v-btn>
      </v-card-text>
    </v-card>
  </v-form>
</template>

<script setup lang="ts">
import {
  GcsCredential,
  GcsProfile,
  GcsServiceKey,
  StorageCredential,
  StorageLayout,
  StorageProfile,
} from '@/gen/management/types.gen';
import { Intent, ObjectType } from '@/common/enums';
import { WarehousObject } from '@/common/interfaces';
import { ref, onMounted, reactive, Ref, watch, computed } from 'vue';

const credentialType: Ref<'service-account-key' | 'gcp-system-identity'> =
  ref('service-account-key');

const keyString = ref('');
const keyStringValid = ref(false);
const useFileInput = ref(false);
const props = defineProps<{
  credentialsOnly: boolean;
  intent: Intent;
  objectType: ObjectType;
  warehouseObject: WarehousObject | null;
}>();

const emit = defineEmits<{
  (e: 'submit', warehouseObjectDataEmit: WarehousObject, shouldSaveAsJson: boolean): void;
  (e: 'updateCredentials', credentials: StorageCredential): void;
  (
    e: 'updateProfile',
    newProfile: { profile: StorageProfile; credentials: StorageCredential },
  ): void;
}>();

const key = reactive<GcsServiceKey>({
  auth_provider_x509_cert_url: '',
  auth_uri: '',
  client_email: '',
  client_id: '',
  client_x509_cert_url: '',
  private_key: '',
  private_key_id: '',
  project_id: '',
  token_uri: '',
  type: '',
  universe_domain: '',
});
const warehouseObjectData = reactive<{
  'storage-profile': GcsProfile & { type: string };
  'storage-credential': GcsCredential & { type: string };
}>({
  'storage-profile': {
    bucket: '',
    'sts-enabled': false,
    type: 'gcs',
  },
  'storage-credential': {
    'credential-type': 'service-account-key',
    key,
    type: 'gcs',
  },
});

const shouldSaveAsJson = ref(false);

// Storage Layout management
const storageLayoutOptions = [
  {
    name: 'Default',
    code: 'default',
    description: 'Uses {uuid} segments for namespace and table directories',
  },
  {
    name: 'Table Only',
    code: 'table-only',
    description: 'No namespace directories; tables directly under base location',
  },
  {
    name: 'Full Hierarchy',
    code: 'full-hierarchy',
    description:
      'base/<ns1-segment>/<ns2-segment>/…/<table-segment> — every namespace level becomes a directory',
  },
];

const storageLayoutType = ref<'default' | 'table-only' | 'full-hierarchy'>('default');
const storageLayoutTable = ref('tabular-{name}-{uuid}');
const storageLayoutNamespace = ref('ns-{name}-{uuid}');

const exampleUuid = '00000000-0000-0000-0000-000000000000';
const renderTemplate = (tpl: string, name: string) =>
  tpl.replace(/\{name\}/g, name).replace(/\{uuid\}/g, exampleUuid);

const storageLayoutExample = computed(() => {
  const nsTpl = storageLayoutNamespace.value || 'ns-{name}-{uuid}';
  const tblTpl = storageLayoutTable.value || 'tabular-{name}-{uuid}';
  if (storageLayoutType.value === 'table-only') {
    return renderTemplate(tblTpl, 'customer');
  }
  if (storageLayoutType.value === 'full-hierarchy') {
    return renderTemplate(nsTpl, 'marketing') + '/' + renderTemplate(tblTpl, 'customer');
  }
  return '';
});

const buildStorageLayout = (): StorageLayout | null => {
  if (storageLayoutType.value === 'default') return { type: 'default' };
  if (storageLayoutType.value === 'table-only') {
    return { type: 'table-only', table: storageLayoutTable.value || 'tabular-{name}-{uuid}' };
  }
  if (storageLayoutType.value === 'full-hierarchy') {
    return {
      type: 'full-hierarchy',
      namespace: storageLayoutNamespace.value || 'ns-{name}-{uuid}',
      table: storageLayoutTable.value || 'tabular-{name}-{uuid}',
    };
  }
  return null;
};

watch(storageLayoutType, () => {
  syncStorageLayoutToProfile();
});

watch(storageLayoutTable, () => {
  syncStorageLayoutToProfile();
});

watch(storageLayoutNamespace, () => {
  syncStorageLayoutToProfile();
});

const syncStorageLayoutToProfile = () => {
  const layout = buildStorageLayout();
  if (layout) {
    warehouseObjectData['storage-profile']['storage-layout'] = layout;
  } else {
    warehouseObjectData['storage-profile']['storage-layout'] = undefined;
  }
};

watch(credentialType, (newValue) => {
  warehouseObjectData['storage-credential']['credential-type'] = newValue;
  if (newValue === 'service-account-key') {
    warehouseObjectData['storage-credential'] = {
      'credential-type': 'service-account-key',
      key,
      type: 'gcs',
    };
  } else if (newValue === 'gcp-system-identity') {
    warehouseObjectData['storage-credential'] = {
      'credential-type': 'gcp-system-identity',
      type: 'gcs',
    };
  }
});

const rules = {
  required: (value: any) => !!value || 'Required.',
  noSlash: (value: string) => !value.includes('/') || 'Cannot contain "/"',
  validJson: (value: string) => {
    try {
      JSON.parse(value);
      verifyKeyJson();
      return true;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return 'Invalid JSON';
    }
  },
};

// Computed properties for field validation states (show red border when required but empty)
const isBucketInvalid = computed(() => {
  return !warehouseObjectData['storage-profile'].bucket;
});

const handleSubmit = () => {
  shouldSaveAsJson.value = false;
  emit('submit', warehouseObjectData, shouldSaveAsJson.value);
};

const saveAsJson = () => {
  shouldSaveAsJson.value = true;
  emit('submit', warehouseObjectData, shouldSaveAsJson.value);
};

const emitNewCredentials = () => {
  const credentials = {
    type: 'gcs',
    'credential-type': 'service-account-key',
    key:
      warehouseObjectData['storage-credential']['credential-type'] === 'service-account-key'
        ? warehouseObjectData['storage-credential'].key
        : undefined,
  } as StorageCredential;

  emit('updateCredentials', credentials);
};

const emitNewProfile = () => {
  const newProfile = {
    profile: warehouseObjectData['storage-profile'],
    credentials: {
      type: 'gcs',
      'credential-type': 'service-account-key',
      key:
        warehouseObjectData['storage-credential']['credential-type'] === 'service-account-key'
          ? warehouseObjectData['storage-credential'].key
          : undefined,
    } as StorageCredential,
  } as { profile: StorageProfile; credentials: StorageCredential };
  emit('updateProfile', newProfile);
};

onMounted(() => {
  if (props.warehouseObject) {
    Object.assign(warehouseObjectData, props.warehouseObject);
    keyString.value = JSON.stringify(
      warehouseObjectData['storage-credential']['credential-type'] === 'service-account-key'
        ? warehouseObjectData['storage-credential'].key
        : undefined,
      null,
      2,
    );

    // Initialize storage layout from existing data
    const existingLayout = warehouseObjectData['storage-profile']['storage-layout'];
    if (existingLayout) {
      // Map deprecated parent-namespace-and-table to full-hierarchy
      storageLayoutType.value =
        existingLayout.type === 'parent-namespace-and-table'
          ? 'full-hierarchy'
          : existingLayout.type;
      if (existingLayout.type === 'table-only') {
        storageLayoutTable.value = existingLayout.table || '{uuid}';
      } else if (
        existingLayout.type === 'parent-namespace-and-table' ||
        existingLayout.type === 'full-hierarchy'
      ) {
        storageLayoutNamespace.value = existingLayout.namespace || '{uuid}';
        storageLayoutTable.value = existingLayout.table || '{uuid}';
      }
    }
  }
});

function handleFileInput(event: any) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (e.target && e.target.result) {
          const json = JSON.parse(e.target.result as string);

          if (
            warehouseObjectData['storage-credential']['credential-type'] === 'service-account-key'
          ) {
            warehouseObjectData['storage-credential'].key = json;
          }
          keyStringValid.value = true;
        }
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    };
    reader.readAsText(file);
  }
}

function verifyKeyJson() {
  try {
    if (keyString.value !== '') {
      const keyJson = JSON.parse(keyString.value);

      if (warehouseObjectData['storage-credential']['credential-type'] === 'service-account-key') {
        warehouseObjectData['storage-credential'].key = keyJson;
      }
      keyStringValid.value = true;
    }
  } catch (error) {
    console.error('Error parsing JSON:', error);
  }
}
</script>
