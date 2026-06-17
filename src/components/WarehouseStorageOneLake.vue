<template>
  <v-form @submit.prevent="handleSubmit">
    <!-- Storage Credentials Section (Azure / OneLake uses Azure AD credentials) -->
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
          <span>Choose how Lakekeeper authenticates to Microsoft OneLake (Azure AD)</span>
        </v-tooltip>
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="credentialType === 'client-credentials'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4">
          <strong>Client Credentials:</strong>
          Use Azure Active Directory application credentials (Service Principal). Recommended for
          production environments.
        </v-alert>
        <v-alert
          v-if="credentialType === 'azure-system-identity'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4">
          <strong>Azure System Identity:</strong>
          Use managed identity from the Lakekeeper server. Most secure for Azure-hosted deployments.
        </v-alert>

        <v-radio-group v-model="credentialType" row>
          <v-row>
            <v-col>
              <span class="text-subtitle-2 text-grey-darken-1">Select Credential Type:</span>
            </v-col>
          </v-row>
          <v-row>
            <v-radio value="client-credentials" color="primary">
              <template #label>
                <div>
                  <v-icon color="primary">mdi-account-key</v-icon>
                  Client Credentials
                </div>
              </template>
            </v-radio>
            <v-radio value="azure-system-identity" color="primary">
              <template #label>
                <div>
                  <v-icon color="primary">mdi-shield-key</v-icon>
                  Azure System Identity
                </div>
              </template>
            </v-radio>
          </v-row>
        </v-radio-group>

        <template v-if="isClientCredentials(warehouseObjectData['storage-credential'])">
          <v-text-field
            v-model="warehouseObjectData['storage-credential']['client-id']"
            label="Client ID *"
            placeholder="12345678-1234-1234-1234-123456789abc"
            hint="Application (client) ID from Azure AD"
            :rules="[rules.required]"
            :error="isClientIdInvalid"
            :color="isClientIdInvalid ? 'error' : 'primary'" />
          <v-text-field
            v-model="warehouseObjectData['storage-credential']['client-secret']"
            :append-inner-icon="showPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            autocomplete="current-password"
            label="Client Secret *"
            placeholder="your-client-secret"
            hint="Secret value from Azure AD application"
            :rules="[rules.required]"
            :type="showPassword ? 'text' : 'password'"
            :error="isClientSecretInvalid"
            :color="isClientSecretInvalid ? 'error' : 'primary'"
            @click:append-inner="showPassword = !showPassword" />
          <v-text-field
            v-model="warehouseObjectData['storage-credential']['tenant-id']"
            label="Tenant ID *"
            placeholder="87654321-4321-4321-4321-abc987654321"
            hint="Directory (tenant) ID from Azure AD"
            :rules="[rules.required]"
            :error="isTenantIdInvalid"
            :color="isTenantIdInvalid ? 'error' : 'primary'" />
          <v-btn
            v-if="props.objectType === ObjectType.STORAGE_CREDENTIAL"
            color="success"
            :disabled="
              !warehouseObjectData['storage-credential']['client-id'] ||
              !warehouseObjectData['storage-credential']['client-secret'] ||
              !warehouseObjectData['storage-credential']['tenant-id']
            "
            @click="emitNewCredentials">
            Update Credentials
          </v-btn>
        </template>

        <template v-else-if="isAzureSystemIdentityKey(warehouseObjectData['storage-credential'])">
          <v-alert type="info" variant="tonal" density="compact" class="my-4">
            No additional credentials required. The system will use the managed identity configured
            on the Lakekeeper server.
          </v-alert>
          <v-btn
            v-if="props.objectType === ObjectType.STORAGE_CREDENTIAL"
            color="success"
            @click="emitNewCredentials">
            Update Credentials
          </v-btn>
        </template>
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
          <span>Configure the Microsoft Fabric / OneLake lakehouse</span>
        </v-tooltip>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['workspace-id']"
          label="Workspace ID *"
          placeholder="12345678-1234-1234-1234-123456789abc"
          hint="UUID of the Fabric workspace this warehouse lives in"
          persistent-hint
          :rules="[rules.required]"
          :error="isWorkspaceIdInvalid"
          :color="isWorkspaceIdInvalid ? 'error' : 'primary'"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['lakehouse-id']"
          label="Lakehouse ID *"
          placeholder="87654321-4321-4321-4321-abc987654321"
          hint="UUID of the lakehouse within the workspace"
          persistent-hint
          :rules="[rules.required]"
          :error="isLakehouseIdInvalid"
          :color="isLakehouseIdInvalid ? 'error' : 'primary'"></v-text-field>
        <v-select
          v-model="warehouseObjectData['storage-profile']['top-level-folder']"
          :items="['Files', 'Tables']"
          label="Top-level folder"
          hint="Managed folder under the lakehouse (default: Files)"
          persistent-hint></v-select>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['directory-rel-path']"
          label="Directory path"
          placeholder="warehouse"
          hint="Optional: subpath beneath the top-level folder where data is written"></v-text-field>

        <!-- Advanced Options -->
        <v-expansion-panels class="my-4" variant="accordion">
          <v-expansion-panel elevation="1">
            <v-expansion-panel-title>
              <div class="d-flex align-center">
                <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
                <div>
                  <div class="text-subtitle-1 font-weight-medium">Advanced Options</div>
                  <div class="text-caption text-medium-emphasis">
                    Endpoint, authority host and storage layout
                  </div>
                </div>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-select
                v-model="endpointModeType"
                :items="endpointModeOptions"
                item-title="name"
                item-value="code"
                label="Endpoint mode"
                hint="How Lakekeeper reaches OneLake (default: global endpoint)"
                persistent-hint
                class="mb-2"></v-select>
              <v-text-field
                v-if="endpointModeType === 'regional'"
                v-model="endpointRegion"
                label="Azure region *"
                placeholder="westus"
                hint="Azure region slug, e.g. westus, northeurope"
                class="mb-2"></v-text-field>
              <v-text-field
                v-model="warehouseObjectData['storage-profile']['authority-host']"
                label="Authority host"
                placeholder="https://login.microsoftonline.com"
                hint="Optional: AAD authority host (defaults to the public cloud)"
                class="mb-4"></v-text-field>

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
              <v-select
                v-model="storageLayoutType"
                :items="storageLayoutOptions"
                item-title="name"
                item-value="code"
                label="Layout Type">
                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" :subtitle="item.raw.description"></v-list-item>
                </template>
              </v-select>
              <v-text-field
                v-if="storageLayoutType === 'tabular-only'"
                v-model="storageLayoutTable"
                label="Tabular Template"
                placeholder="tabular-{name}-{uuid}"
                hint="Template for tabular path segments."
                persistent-hint
                class="mt-4"></v-text-field>
              <template v-if="storageLayoutType === 'full-hierarchy'">
                <v-text-field
                  v-model="storageLayoutNamespace"
                  label="Namespace Template"
                  placeholder="ns-{name}-{uuid}"
                  hint="Applied to every namespace level."
                  persistent-hint
                  class="mt-4"></v-text-field>
                <v-text-field
                  v-model="storageLayoutTable"
                  label="Tabular Template"
                  placeholder="tabular-{name}-{uuid}"
                  hint="Template for the tabular directory."
                  persistent-hint
                  class="mt-2"></v-text-field>
              </template>
              <v-alert
                v-if="storageLayoutType !== 'default' && !storageLayoutTable.includes('{uuid}')"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2">
                Template does not contain
                <code>{uuid}</code>
                — this may cause collisions if tabulars are renamed and re-created.
              </v-alert>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-divider class="my-4"></v-divider>

        <!-- Credential Vending (SAS) -->
        <h4 class="text-subtitle-1 mb-3 d-flex align-center">
          Credential Vending Options
          <v-tooltip location="top" max-width="400">
            <template #activator="{ props: tooltipProps }">
              <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
                mdi-information-outline
              </v-icon>
            </template>
            <span>Vend temporary SAS tokens to clients instead of static credentials</span>
          </v-tooltip>
        </h4>
        <v-row>
          <v-col>
            <v-switch
              v-model="warehouseObjectData['storage-profile']['sas-enabled']"
              color="primary"
              :label="
                warehouseObjectData['storage-profile']['sas-enabled']
                  ? 'SAS Enabled'
                  : 'Enable SAS (Shared Access Signature)'
              "></v-switch>
          </v-col>
        </v-row>
        <v-row v-if="warehouseObjectData['storage-profile']['sas-enabled']">
          <v-col>
            <v-text-field
              v-model.number="warehouseObjectData['storage-profile']['sas-token-validity-seconds']"
              label="SAS Token Validity (seconds)"
              placeholder="3600"
              type="number"
              :max="3600"
              hint="Duration for vended SAS tokens (default 3600; OneLake max 3600)"></v-text-field>
          </v-col>
        </v-row>

        <v-btn-group
          v-if="props.intent === Intent.CREATE && props.objectType === ObjectType.WAREHOUSE"
          divided>
          <v-btn color="success" type="submit">Create</v-btn>
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn color="success" v-bind="menuProps" icon="mdi-menu-down" size="small"></v-btn>
            </template>
            <v-list>
              <v-list-item @click="handleSubmit">
                <template #prepend><v-icon>mdi-check</v-icon></template>
                <v-list-item-title>Create</v-list-item-title>
              </v-list-item>
              <v-list-item @click="saveAsJson">
                <template #prepend><v-icon>mdi-download</v-icon></template>
                <v-list-item-title>& save config</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-btn-group>

        <v-btn
          v-if="props.intent === Intent.UPDATE && props.objectType === ObjectType.STORAGE_PROFILE"
          color="success"
          :disabled="isWorkspaceIdInvalid || isLakehouseIdInvalid"
          @click="emitNewProfile">
          Update Profile
        </v-btn>
      </v-card-text>
    </v-card>
  </v-form>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, watch, Ref, computed } from 'vue';
import {
  AzCredential,
  EndpointMode,
  OneLakeProfile,
  StorageCredential,
  StorageLayout,
  StorageProfile,
} from '@/gen/management/types.gen';
import { Intent, ObjectType } from '@/common/enums';
import { WarehousObject } from '@/common/interfaces';

const showPassword = ref(false);
const credentialType: Ref<'client-credentials' | 'azure-system-identity'> =
  ref('client-credentials');

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

const warehouseObjectData = reactive<{
  'storage-profile': OneLakeProfile & { type: string };
  'storage-credential': AzCredential & { type: string };
}>({
  'storage-profile': {
    'workspace-id': '',
    'lakehouse-id': '',
    'top-level-folder': 'Files',
    'sas-enabled': true,
    type: 'onelake',
  },
  'storage-credential': {
    'client-id': '',
    'client-secret': '',
    'credential-type': 'client-credentials',
    'tenant-id': '',
    type: 'az',
  },
});

const shouldSaveAsJson = ref(false);

// --- Endpoint mode ----------------------------------------------------------
const endpointModeOptions = [
  { name: 'Default (global endpoint)', code: 'default' },
  { name: 'Regional', code: 'regional' },
  { name: 'Workspace private link', code: 'workspace-private-link' },
];
const endpointModeType = ref<'default' | 'regional' | 'workspace-private-link'>('default');
const endpointRegion = ref('');
function syncEndpointMode() {
  let mode: EndpointMode;
  if (endpointModeType.value === 'regional') {
    mode = { type: 'regional', region: endpointRegion.value };
  } else if (endpointModeType.value === 'workspace-private-link') {
    mode = { type: 'workspace-private-link' };
  } else {
    mode = { type: 'default' };
  }
  warehouseObjectData['storage-profile']['endpoint-mode'] = mode;
}
watch([endpointModeType, endpointRegion], syncEndpointMode);

// --- Storage layout (same as other storage backends) ------------------------
const storageLayoutOptions = [
  { name: 'Default', code: 'default', description: 'Uses {uuid} segments for directories' },
  {
    name: 'Tabular Only',
    code: 'tabular-only',
    description: 'No namespace directories; tabulars directly under base location',
  },
  {
    name: 'Full Hierarchy',
    code: 'full-hierarchy',
    description: 'Every namespace level becomes a directory',
  },
];
const storageLayoutType = ref<'default' | 'tabular-only' | 'full-hierarchy'>('default');
const storageLayoutTable = ref('tabular-{name}-{uuid}');
const storageLayoutNamespace = ref('ns-{name}-{uuid}');

function buildStorageLayout(): StorageLayout | null {
  if (storageLayoutType.value === 'default') return { type: 'default' };
  if (storageLayoutType.value === 'tabular-only') {
    return { type: 'tabular-only', tabular: storageLayoutTable.value || 'tabular-{name}-{uuid}' };
  }
  if (storageLayoutType.value === 'full-hierarchy') {
    return {
      type: 'full-hierarchy',
      namespace: storageLayoutNamespace.value || 'ns-{name}-{uuid}',
      tabular: storageLayoutTable.value || 'tabular-{name}-{uuid}',
    };
  }
  return null;
}
function syncStorageLayoutToProfile() {
  const layout = buildStorageLayout();
  warehouseObjectData['storage-profile']['storage-layout'] = layout ?? undefined;
}
watch([storageLayoutType, storageLayoutTable, storageLayoutNamespace], syncStorageLayoutToProfile);

// --- Credentials (identical to Azure) ---------------------------------------
watch(credentialType, (newValue) => {
  if (newValue === 'client-credentials') {
    warehouseObjectData['storage-credential'] = {
      'client-id': '',
      'client-secret': '',
      'credential-type': 'client-credentials',
      'tenant-id': '',
      type: 'az',
    };
  } else {
    warehouseObjectData['storage-credential'] = {
      'credential-type': 'azure-system-identity',
      type: 'az',
    } as AzCredential & { type: string };
  }
});

function isClientCredentials(credential: AzCredential): credential is {
  'client-id': string;
  'client-secret': string;
  'credential-type': 'client-credentials';
  'tenant-id': string;
} {
  return credential['credential-type'] === 'client-credentials';
}
function isAzureSystemIdentityKey(credential: AzCredential): credential is {
  'credential-type': 'azure-system-identity';
  key: string;
} {
  return credential['credential-type'] === 'azure-system-identity';
}

const rules = {
  required: (value: any) => !!value || 'Required.',
};

const isClientIdInvalid = computed(
  () =>
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['client-id'],
);
const isClientSecretInvalid = computed(
  () =>
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['client-secret'],
);
const isTenantIdInvalid = computed(
  () =>
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['tenant-id'],
);
const isWorkspaceIdInvalid = computed(
  () => !warehouseObjectData['storage-profile']['workspace-id'],
);
const isLakehouseIdInvalid = computed(
  () => !warehouseObjectData['storage-profile']['lakehouse-id'],
);

// Only the create-warehouse flow submits; in update modes the form's submit
// event (e.g. Enter in a field) must not route to the parent's createWarehouse.
const isCreateFlow = () =>
  props.intent === Intent.CREATE && props.objectType === ObjectType.WAREHOUSE;

const handleSubmit = () => {
  if (!isCreateFlow()) return;
  shouldSaveAsJson.value = false;
  emit('submit', warehouseObjectData, shouldSaveAsJson.value);
};
const saveAsJson = () => {
  shouldSaveAsJson.value = true;
  emit('submit', warehouseObjectData, shouldSaveAsJson.value);
};

function buildCredential(): StorageCredential {
  const c = warehouseObjectData['storage-credential'];
  if (isClientCredentials(c)) {
    return {
      type: 'az',
      'credential-type': 'client-credentials',
      'client-id': c['client-id'],
      'client-secret': c['client-secret'],
      'tenant-id': c['tenant-id'],
    } as StorageCredential;
  }
  return { type: 'az', 'credential-type': 'azure-system-identity' } as StorageCredential;
}

const emitNewCredentials = () => emit('updateCredentials', buildCredential());

const emitNewProfile = () => {
  emit('updateProfile', {
    profile: warehouseObjectData['storage-profile'] as unknown as StorageProfile,
    credentials: buildCredential(),
  });
};

onMounted(() => {
  if (props.warehouseObject) Object.assign(warehouseObjectData, props.warehouseObject);
  credentialType.value =
    warehouseObjectData['storage-credential']['credential-type'] === 'azure-system-identity'
      ? 'azure-system-identity'
      : 'client-credentials';

  const mode = warehouseObjectData['storage-profile']['endpoint-mode'];
  if (mode) {
    endpointModeType.value = mode.type;
    if (mode.type === 'regional') endpointRegion.value = (mode as any).region || '';
  }

  const existingLayout = warehouseObjectData['storage-profile']['storage-layout'];
  if (existingLayout) {
    storageLayoutType.value = existingLayout.type;
    if (existingLayout.type === 'tabular-only') {
      storageLayoutTable.value = (existingLayout as any).tabular || 'tabular-{name}-{uuid}';
    } else if (existingLayout.type === 'full-hierarchy') {
      storageLayoutNamespace.value = (existingLayout as any).namespace || 'ns-{name}-{uuid}';
      storageLayoutTable.value = (existingLayout as any).tabular || 'tabular-{name}-{uuid}';
    }
  }
});
</script>
