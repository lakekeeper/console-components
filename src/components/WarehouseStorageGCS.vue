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
          :rules="[rules.required]"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['key-prefix']"
          label="Key Prefix"
          placeholder="path/to/warehouse"
          hint="Optional: Subdirectory path within the bucket for warehouse data"></v-text-field>

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
  StorageProfile,
} from '@/gen/management/types.gen';
import { Intent, ObjectType } from '@/common/enums';
import { WarehousObject } from '@/common/interfaces';
import { ref, onMounted, reactive, Ref, watch } from 'vue';

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
