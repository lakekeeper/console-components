<template>
  <v-dialog v-model="isDialogActive" max-width="1000">
    <template #activator="{ props: activatorProps }">
      <v-list-item
        v-bind="activatorProps"
        v-if="creatingWarehouse || props.objectType === ObjectType.WAREHOUSE">
        <v-list-item-title>
          <v-btn color="info" size="small" text="Add Warehouse" variant="flat"></v-btn>
        </v-list-item-title>
      </v-list-item>
      <v-list-item
        prepend-icon="mdi-key-change"
        v-bind="activatorProps"
        v-else-if="props.objectType === ObjectType.STORAGE_CREDENTIAL">
        <v-list-item-title>
          <span class="text-subtitle-2" v-bind="activatorProps">Update Credentials</span>
        </v-list-item-title>
      </v-list-item>
      <v-list-item
        prepend-icon="mdi-playlist-edit"
        v-bind="activatorProps"
        v-else-if="props.objectType === ObjectType.STORAGE_PROFILE">
        <v-list-item-title>
          <span class="text-subtitle-2">Update Profile</span>
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        prepend-icon="mdi-update"
        v-bind="activatorProps"
        v-else-if="props.objectType === ObjectType.DELETION_PROFILE">
        <v-list-item-title>
          <span class="text-subtitle-2">Change Deletion</span>
        </v-list-item-title>
      </v-list-item>
    </template>
    <v-card style="max-height: 90vh; overflow-y: auto; min-width: 850px; width: 100%">
      <v-card-title v-if="props.objectType === ObjectType.WAREHOUSE" class="mt-8">
        <v-row align="center">
          <v-col cols="8" class="ml-2">Add new warehouse</v-col>
          <v-col class="d-flex justify-end">
            <input
              ref="fileInputRef"
              type="file"
              accept="application/json"
              style="display: none"
              @change="handleFileImport" />
            <v-btn
              color="info"
              prepend-icon="mdi-upload"
              size="small"
              variant="outlined"
              @click="fileInputRef?.click()">
              Import Warehouse
            </v-btn>
          </v-col>
        </v-row>
      </v-card-title>
      <v-card-title v-else>Updating Warehouse</v-card-title>
      <span v-if="creatingWarehouse || props.processStatus == 'running'">
        <v-card-text style="min-height: 25vh">
          <v-row justify="center">
            <v-progress-circular
              class="mt-4"
              color="info"
              indeterminate
              :size="126"></v-progress-circular>
          </v-row>
        </v-card-text>
      </span>
      <span v-else-if="creatingWarehouse || props.processStatus == 'success'">
        <v-card-text style="min-height: 25vh">
          <v-row class="mt-6" justify="center">
            <div v-if="props.objectType == ObjectType.STORAGE_PROFILE" class="text-h4">
              Your Warehouse Profile was successfully updated!
            </div>
            <div v-else class="text-h4">Your Credentials were successfully updated!</div>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="success"
            @click="
              isDialogActive = false;
              $emit('close');
            ">
            Close
          </v-btn>
        </v-card-actions>
      </span>
      <span v-else>
        <v-card-text>
          <v-row c>
            <v-col cols="auto">
              <span>Configuration Parameters:</span>
              <v-icon
                class="ml-2"
                color="info"
                style="cursor: pointer"
                @click="expanded = !expanded">
                mdi-information-box-outline
              </v-icon>
            </v-col>
            <v-col class="text-left">
              <!-- Ensures text is aligned to the left -->
              <span v-if="expanded" class="mt-2">
                More information
                <a
                  href="https://docs.lakekeeper.io/docs/nightly/storage/#configuration-parameters"
                  target="_blank"
                  style="color: inherit">
                  here
                </a>
              </span>
            </v-col>
          </v-row>
          <v-form>
            <v-text-field
              v-if="emptyWarehouse"
              v-model="warehouseName"
              label="Warehouse Name *"
              placeholder="my-warehouse"
              :rules="[rules.required, rules.noSlash]"
              :error="isWarehouseNameInvalid"
              :color="isWarehouseNameInvalid ? 'error' : 'primary'"
              :style="
                isWarehouseNameInvalid ? 'color: rgb(var(--v-theme-error));' : ''
              "></v-text-field>
            <v-row justify="center">
              <v-col
                v-if="
                  props.objectType === ObjectType.WAREHOUSE ||
                  props.objectType === ObjectType.DELETION_PROFILE
                ">
                <v-switch
                  v-model="delProfileSoftActive"
                  color="primary"
                  :label="
                    delProfileSoftActive ? `Soft Deletion is enabled` : `Enable Soft Deletion`
                  "></v-switch>
              </v-col>
              <v-col class="d-flex justify-center">
                <v-slider
                  v-if="delProfileSoftActive"
                  v-model="slider"
                  class="align-center"
                  hide-details
                  label="Define number of Days"
                  :max="max"
                  :min="min"
                  :step="1">
                  <template #append>
                    <v-text-field
                      v-model="slider"
                      density="compact"
                      hide-details
                      single-line
                      style="width: 100px"
                      type="number"></v-text-field>
                  </template>
                </v-slider>
              </v-col>
            </v-row>
            <v-row v-if="props.objectType === ObjectType.DELETION_PROFILE">
              <v-col>
                <v-btn
                  color="success"
                  :disabled="
                    slider === loadedDeltionSeconds &&
                    delProfileSoftActive === loadedDelProfileSoftActive
                  "
                  @click="emitDeletionProfile">
                  Change Deletion
                </v-btn>
              </v-col>
            </v-row>

            <span v-if="props.objectType !== ObjectType.DELETION_PROFILE">
              <v-tabs v-model="storageCredentialType" color="primary" :disabled="!emptyWarehouse">
                <v-tab value="S3">
                  <v-icon start color="orange">mdi-aws</v-icon>
                  AWS S3
                </v-tab>
                <v-tab value="GCS">
                  <v-icon start color="info">mdi-google-cloud</v-icon>
                  GCS
                </v-tab>
                <v-tab value="AZURE">
                  <v-icon start color="primary">mdi-microsoft-azure</v-icon>
                  Azure
                </v-tab>
                <v-tab value="R2">
                  <v-img :src="cfIcon" width="20" height="20" class="mr-2" />
                  R2
                </v-tab>
                <v-tab value="S3_COMPAT">
                  <v-icon start color="primary">mdi-bucket-outline</v-icon>
                  S3 Compatible
                </v-tab>
              </v-tabs>

              <v-tabs-window v-model="storageCredentialType" class="mt-4" style="min-height: 600px">
                <v-tabs-window-item value="S3">
                  <WarehouseStorageS3
                    :key="importKey"
                    :credentials-only="emptyWarehouse"
                    :intent="intent"
                    :object-type="objectType"
                    s3-variant="aws"
                    :warehouse-object="warehouseObjectS3"
                    @submit="createWarehouse"
                    @update-credentials="newCredentials"
                    @update-profile="newProfile"></WarehouseStorageS3>
                </v-tabs-window-item>

                <v-tabs-window-item value="GCS">
                  <WarehouseStorageGCS
                    :key="importKey"
                    :credentials-only="emptyWarehouse"
                    :intent="intent"
                    :object-type="objectType"
                    :warehouse-object="warehouseObjectGCS"
                    @submit="createWarehouse"
                    @update-credentials="newCredentials"
                    @update-profile="newProfile"></WarehouseStorageGCS>
                </v-tabs-window-item>

                <v-tabs-window-item value="AZURE">
                  <WarehouseStorageAzure
                    :key="importKey"
                    :credentials-only="emptyWarehouse"
                    :intent="intent"
                    :object-type="objectType"
                    :warehouse-object="warehouseObjectAz"
                    @submit="createWarehouse"
                    @update-credentials="newCredentials"
                    @update-profile="newProfile"></WarehouseStorageAzure>
                </v-tabs-window-item>

                <v-tabs-window-item value="R2">
                  <WarehouseStorageS3
                    :key="importKey"
                    :credentials-only="emptyWarehouse"
                    :intent="intent"
                    :object-type="objectType"
                    s3-variant="cloudflare-r2"
                    :warehouse-object="warehouseObjectR2"
                    @submit="createWarehouse"
                    @update-credentials="newCredentials"
                    @update-profile="newProfile"></WarehouseStorageS3>
                </v-tabs-window-item>

                <v-tabs-window-item value="S3_COMPAT">
                  <WarehouseStorageS3
                    :key="importKey"
                    :credentials-only="emptyWarehouse"
                    :intent="intent"
                    :object-type="objectType"
                    s3-variant="s3-compat"
                    :warehouse-object="warehouseObjectS3Compat"
                    @submit="createWarehouse"
                    @update-credentials="newCredentials"
                    @update-profile="newProfile"></WarehouseStorageS3>
                </v-tabs-window-item>
              </v-tabs-window>
            </span>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="error"
            @click="
              isDialogActive = false;
              $emit('cancel');
            ">
            Cancel
          </v-btn>
        </v-card-actions>
      </span>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { reactive, ref, watch, computed, onMounted } from 'vue';
import { useFunctions, handleError } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import WarehouseStorageS3 from './WarehouseStorageS3.vue';
import WarehouseStorageAzure from './WarehouseStorageAzure.vue';
import WarehouseStorageGCS from './WarehouseStorageGCS.vue';
import cfIcon from '@/assets/cf.svg';

import {
  CreateWarehouseRequest,
  CreateWarehouseResponse,
  GcsServiceKey,
  GetWarehouseResponse,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
} from '../gen/management/types.gen';
import { Intent, ObjectType } from '../common/enums';
import { WarehousObject } from '@/common/interfaces';

const visual = useVisualStore();
const projectId = computed(() => {
  return visual.projectSelected['project-id'];
});
const expanded = ref(false);

const creatingWarehouse = ref(false);
const loadedDeltionSeconds = ref(0);
const loadedDelProfileSoftActive = ref(false);

const delProfileSoftActive = ref(false);
const isDialogActive = ref(false);

const emit = defineEmits<{
  (e: 'addedWarehouse'): void;
  (e: 'cancel'): void;
  (e: 'close'): void;
  (e: 'updateCredentials', credentials: StorageCredential): void;
  (
    e: 'updateProfile',
    newProfile: { profile: StorageProfile; credentials: StorageCredential },
  ): void;
  (e: 'updateDeletionProfile', profile: TabularDeleteProfile): void;
}>();

const props = defineProps<{
  warehouse: GetWarehouseResponse | undefined;
  intent: Intent;
  objectType: ObjectType;
  processStatus: string;
}>();

const importKey = ref(0);

const min = ref(0);
const max = ref(90);
const slider = ref(7);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleFileImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      preloadWarehouseJSON(JSON.parse(e.target?.result as string));
    } catch (err) {
      console.error('Error parsing JSON:', err);
    }
  };
  reader.readAsText(file);
  (event.target as HTMLInputElement).value = '';
}

// const storageCredentialTypes = ref(['S3', 'GCS', 'AZURE']);
const storageCredentialType = ref('');
const warehouseName = ref('');
const functions = useFunctions();
const rules = {
  required: (value: any) => !!value || 'Required.',
  noSlash: (value: string) => !value.includes('/') || 'Cannot contain "/"',
};

// Computed property for warehouse name validation (show red border when required but empty)
const isWarehouseNameInvalid = computed(() => {
  return emptyWarehouse.value && !warehouseName.value;
});

const emptyWarehouse = ref(true);
const warehouseObjectS3 = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: '',
    'remote-signing-enabled': true,
    'sts-enabled': false,
    flavor: 'aws',
  },
  'storage-credential': {
    type: 's3',
    'access-key-id': '',
    'secret-access-key': '',
    'credential-type': 'access-key',
  },
});

const warehouseObjectR2 = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: '',
    'remote-signing-enabled': true,
    'sts-enabled': true,
    flavor: 's3-compat',
  },
  'storage-credential': {
    type: 's3',
    'credential-type': 'cloudflare-r2',
    'access-key-id': '',
    'secret-access-key': '',
    'account-id': '',
    token: '',
  },
});

const warehouseObjectS3Compat = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: 'local',
    'remote-signing-enabled': true,
    'sts-enabled': false,
    flavor: 's3-compat',
  },
  'storage-credential': {
    type: 's3',
    'access-key-id': '',
    'secret-access-key': '',
    'credential-type': 'access-key',
  },
});

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
const warehouseObjectGCS = reactive<WarehousObject>({
  'storage-profile': {
    type: 'gcs',
    bucket: '',
    'sts-enabled': true,
  },
  'storage-credential': {
    type: 'gcs',
    'credential-type': 'service-account-key',
    key,
  },
});

const warehouseObjectAz = reactive<WarehousObject>({
  'storage-profile': {
    'account-name': '',
    filesystem: '',
    'sas-enabled': true,
    type: 'adls',
  },
  'storage-credential': {
    'client-id': '',
    'client-secret': '',
    'credential-type': 'client-credentials',
    'tenant-id': '',
    type: 'az',
  },
});

async function createWarehouse(
  warehouseObject: WarehousObject,
  shouldDownloadJson: boolean = false,
) {
  try {
    if (warehouseObject['storage-profile'].type === 'gcs')
      Object.assign(warehouseObjectGCS, warehouseObject);
    if (warehouseObject['storage-profile'].type === 's3') {
      if (storageCredentialType.value === 'R2') {
        Object.assign(warehouseObjectR2, warehouseObject);
      } else if (storageCredentialType.value === 'S3_COMPAT') {
        Object.assign(warehouseObjectS3Compat, warehouseObject);
      } else {
        Object.assign(warehouseObjectS3, warehouseObject);
      }
    }
    if (warehouseObject['storage-profile'].type === 'az')
      Object.assign(warehouseObjectAz, warehouseObject);

    creatingWarehouse.value = true;

    const delProfileSoft = reactive<TabularDeleteProfile>({
      type: 'soft',
      'expiration-seconds': Math.round(slider.value * 86400),
    });

    const delProfileHard = reactive<TabularDeleteProfile>({
      type: 'hard',
    });

    const delProfile = computed(() => {
      return delProfileSoftActive.value ? delProfileSoft : delProfileHard;
    });

    const wh = reactive<CreateWarehouseRequest>({
      'delete-profile': delProfile.value,
      'warehouse-name': warehouseName.value,
      'project-id': projectId.value,
      'storage-credential': warehouseObject['storage-credential'] as StorageCredential,
      'storage-profile': warehouseObject['storage-profile'] as StorageProfile,
    });

    const res: CreateWarehouseResponse = await functions.createWarehouse(wh, true);

    // Download JSON if requested
    if (shouldDownloadJson) {
      const jsonString = JSON.stringify(wh, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `warehouse-${warehouseName.value}-${res['warehouse-id']}-config.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    emit('addedWarehouse');
    creatingWarehouse.value = false;
    isDialogActive.value = false;
  } catch (error) {
    creatingWarehouse.value = false;
    handleError(error, 'createWarehouse', true);
  }
}

async function preloadWarehouseJSON(wh: CreateWarehouseRequest) {
  try {
    warehouseName.value = wh['warehouse-name'];
    const type = wh['storage-profile'].type;
    if (type === 'adls') {
      storageCredentialType.value = 'AZURE';
    } else if (type === 's3') {
      const credType = wh['storage-credential']?.['credential-type'];
      const flavor = wh['storage-profile']?.flavor;
      if (credType === 'cloudflare-r2') {
        storageCredentialType.value = 'R2';
      } else if (flavor === 's3-compat') {
        storageCredentialType.value = 'S3_COMPAT';
      } else {
        storageCredentialType.value = 'S3';
      }
    } else {
      storageCredentialType.value = type.toUpperCase();
    }
    if (wh['storage-profile'].type === 'gcs')
      Object.assign(warehouseObjectGCS, {
        'storage-profile': wh['storage-profile'],
        'storage-credential': wh['storage-credential'],
      });
    if (wh['storage-profile'].type === 's3') {
      const credType = wh['storage-credential']?.['credential-type'];
      const flavor = wh['storage-profile']?.flavor;
      const data = {
        'storage-profile': wh['storage-profile'],
        'storage-credential': wh['storage-credential'],
      };
      if (credType === 'cloudflare-r2') {
        Object.assign(warehouseObjectR2, data);
      } else if (flavor === 's3-compat') {
        Object.assign(warehouseObjectS3Compat, data);
      } else {
        Object.assign(warehouseObjectS3, data);
      }
    }
    if (wh['storage-profile'].type === 'adls')
      Object.assign(warehouseObjectAz, {
        'storage-profile': wh['storage-profile'],
        'storage-credential': wh['storage-credential'],
      });
    importKey.value++;
  } catch (error) {
    console.error(error);
  }
}

function emitDeletionProfile() {
  const delProfileSoft = reactive<TabularDeleteProfile>({
    type: 'soft',
    'expiration-seconds': Math.round(slider.value * 86400),
  });

  const delProfileHard = reactive<TabularDeleteProfile>({
    type: 'hard',
  });

  const delProfile = computed(() => {
    return delProfileSoftActive.value ? delProfileSoft : delProfileHard;
  });

  emit('updateDeletionProfile', delProfile.value);
}

function newCredentials(credentials: StorageCredential) {
  emit('updateCredentials', credentials);
}

function newProfile(item: { profile: StorageProfile; credentials: StorageCredential }) {
  emit('updateProfile', item);
}

onMounted(() => {
  if (props.warehouse) {
    emptyWarehouse.value = false;
    const credType = props.warehouse['storage-credential-type'];

    if (props.warehouse['storage-profile'].type === 's3') {
      const s3CredType = credType && credType.type === 's3' ? credType['credential-type'] : null;

      if (s3CredType === 'cloudflare-r2') {
        storageCredentialType.value = 'R2';
        Object.assign(warehouseObjectR2, props.warehouse);
        warehouseObjectR2['storage-credential']['credential-type'] = 'cloudflare-r2';
      } else if (
        s3CredType === 'access-key' &&
        props.warehouse['storage-profile'].flavor === 's3-compat'
      ) {
        storageCredentialType.value = 'S3_COMPAT';
        Object.assign(warehouseObjectS3Compat, props.warehouse);
        warehouseObjectS3Compat['storage-credential']['credential-type'] = 'access-key';
      } else {
        storageCredentialType.value = 'S3';
        Object.assign(warehouseObjectS3, props.warehouse);
        if (s3CredType) {
          warehouseObjectS3['storage-credential']['credential-type'] = s3CredType;
        }
      }
    }

    if (props.warehouse['storage-profile'].type === 'adls') {
      storageCredentialType.value = 'AZURE';
      Object.assign(warehouseObjectAz, props.warehouse);
      if (credType && credType.type === 'az') {
        warehouseObjectAz['storage-credential']['credential-type'] = credType['credential-type'];
      }
    }

    if (props.warehouse['storage-profile'].type === 'gcs') {
      storageCredentialType.value = 'GCS';
      Object.assign(warehouseObjectGCS, props.warehouse);
      if (credType && credType.type === 'gcs') {
        warehouseObjectGCS['storage-credential']['credential-type'] = credType['credential-type'];
      }
    }
    if (
      props.objectType === ObjectType.DELETION_PROFILE &&
      props.warehouse['delete-profile'].type === 'soft'
    ) {
      slider.value = Math.round(props.warehouse['delete-profile']['expiration-seconds'] / 86400);
      loadedDeltionSeconds.value = slider.value;

      delProfileSoftActive.value = true;
    }
    loadedDelProfileSoftActive.value = delProfileSoftActive.value;
  }
});

watch(
  () => props.processStatus,
  (old, newVal) => {
    if (newVal === 'success') {
      isDialogActive.value = false;
      emit('cancel');
    }
  },
  {
    immediate: true,
  },
);
</script>
