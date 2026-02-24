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
          <span>Choose how Lakekeeper authenticates to your Azure storage</span>
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
          v-if="credentialType === 'shared-access-key'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4">
          <strong>Shared Access Key:</strong>
          Use storage account access key. Simpler but less secure than service principals.
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
            <v-radio value="shared-access-key" color="primary">
              <template #label>
                <div>
                  <v-icon color="primary">mdi-key</v-icon>
                  Shared Access Key
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
            :color="isClientIdInvalid ? 'error' : 'primary'"
            :style="isClientIdInvalid ? 'color: rgb(var(--v-theme-error));' : ''" />

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
            :style="isClientSecretInvalid ? 'color: rgb(var(--v-theme-error));' : ''"
            @click:append-inner="showPassword = !showPassword" />
          <v-text-field
            v-model="warehouseObjectData['storage-credential']['tenant-id']"
            label="Tenant ID *"
            placeholder="87654321-4321-4321-4321-abc987654321"
            hint="Directory (tenant) ID from Azure AD"
            :rules="[rules.required]"
            :error="isTenantIdInvalid"
            :color="isTenantIdInvalid ? 'error' : 'primary'"
            :style="isTenantIdInvalid ? 'color: rgb(var(--v-theme-error));' : ''" />

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

        <template v-else-if="isSharedAccessKey(warehouseObjectData['storage-credential'])">
          <v-text-field
            v-model="warehouseObjectData['storage-credential']['key']"
            :append-inner-icon="showPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            label="Shared Access Key *"
            placeholder="your-access-key"
            hint="Storage account access key from Azure portal"
            :rules="[rules.required]"
            :type="showPassword ? 'text' : 'password'"
            :error="isSharedKeyInvalid"
            :color="isSharedKeyInvalid ? 'error' : 'primary'"
            :style="isSharedKeyInvalid ? 'color: rgb(var(--v-theme-error));' : ''"
            @click:append-inner="showPassword = !showPassword" />
          <v-btn
            v-if="props.objectType === ObjectType.STORAGE_CREDENTIAL"
            color="success"
            :disabled="!warehouseObjectData['storage-credential']['key']"
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
          <span>Configure Azure Data Lake Storage Gen2 settings</span>
        </v-tooltip>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['account-name']"
          label="Account Name *"
          placeholder="mystorageaccount"
          hint="Name of the Azure storage account"
          persistent-hint
          :rules="[rules.required]"
          :error="isAccountNameInvalid"
          :color="isAccountNameInvalid ? 'error' : 'primary'"
          :style="isAccountNameInvalid ? 'color: rgb(var(--v-theme-error));' : ''"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['filesystem']"
          label="Filesystem (Container) *"
          placeholder="my-filesystem"
          hint="ADLS Gen2 filesystem name (also known as container in blob storage)"
          persistent-hint
          :rules="[rules.required, rules.noSlash]"
          :error="isFilesystemInvalid"
          :color="isFilesystemInvalid ? 'error' : 'primary'"
          :style="isFilesystemInvalid ? 'color: rgb(var(--v-theme-error));' : ''"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['host']"
          label="Host"
          placeholder="dfs.core.windows.net"
          hint="Optional: Custom host for the storage account (defaults to dfs.core.windows.net)"></v-text-field>
        <v-text-field
          v-model="warehouseObjectData['storage-profile']['key-prefix']"
          label="Key Prefix"
          placeholder="path/to/warehouse"
          hint="Optional: Subdirectory path within the filesystem for warehouse data"></v-text-field>

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
                hint="How directories are organized under the warehouse base location"
                persistent-hint>
                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps" :subtitle="item.raw.description"></v-list-item>
                </template>
              </v-select>

              <v-text-field
                v-if="storageLayoutType === 'table-only'"
                v-model="storageLayoutTable"
                label="Table Template"
                placeholder="{uuid}"
                hint="Template for table path segments."
                persistent-hint
                class="mt-4"></v-text-field>
              <v-alert
                v-if="storageLayoutType === 'table-only' && !storageLayoutTable.includes('{uuid}')"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2">
                Template does not contain <code>{uuid}</code>. This may cause collisions if tables
                are renamed and re-created.
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
                  placeholder="namespace-{name}-{uuid}"
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
                  Table template does not contain <code>{uuid}</code>. This may cause collisions if
                  tables are renamed and re-created.
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

        <v-row>
          <v-col>
            <v-switch
              v-model="warehouseObjectData['storage-profile']['sas-enabled']"
              color="primary"
              :label="
                warehouseObjectData['storage-profile']['sas-enabled']
                  ? `SAS Enabled`
                  : `Enable SAS (Shared Access Signature)`
              ">
              <template #append>
                <v-tooltip location="top" max-width="400">
                  <template #activator="{ props: tooltipProps }">
                    <v-icon v-bind="tooltipProps" size="small" color="info">
                      mdi-help-circle-outline
                    </v-icon>
                  </template>
                  <span>
                    Enables vending of temporary Azure SAS tokens to clients. Provides time-limited
                    access to storage without sharing long-term credentials.
                  </span>
                </v-tooltip>
              </template>
            </v-switch>
          </v-col>
        </v-row>

        <v-row v-if="warehouseObjectData['storage-profile']['sas-enabled']">
          <v-col>
            <v-text-field
              v-model="warehouseObjectData['storage-profile']['sas-token-validity-seconds']"
              label="SAS Token Validity (seconds)"
              placeholder="3600"
              hint="Optional: Duration for vended SAS tokens (default: 3600 seconds / 1 hour)"
              type="number"></v-text-field>
          </v-col>
        </v-row>

        <v-row>
          <v-col>
            <v-switch
              v-model="warehouseObjectData['storage-profile']['allow-alternative-protocols']"
              color="primary"
              :label="
                warehouseObjectData['storage-profile']['allow-alternative-protocols']
                  ? 'Alternative Protocols Enabled'
                  : 'Enable Alternative Protocols'
              ">
              <template #append>
                <v-tooltip location="top" max-width="400">
                  <template #activator="{ props: tooltipProps }">
                    <v-icon v-bind="tooltipProps" size="small" color="info">
                      mdi-help-circle-outline
                    </v-icon>
                  </template>
                  <span>
                    Allow legacy protocols like wasbs:// in locations. Not recommended except for
                    migrating old tables.
                  </span>
                </v-tooltip>
              </template>
            </v-switch>
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
          :disabled="
            !warehouseObjectData['storage-profile']['account-name'] ||
            !warehouseObjectData['storage-profile']['filesystem'] ||
            (isClientCredentials(warehouseObjectData['storage-credential']) &&
              (!warehouseObjectData['storage-credential']['client-id'] ||
                !warehouseObjectData['storage-credential']['client-secret'] ||
                !warehouseObjectData['storage-credential']['tenant-id'])) ||
            (isSharedAccessKey(warehouseObjectData['storage-credential']) &&
              !warehouseObjectData['storage-credential']['key'])
          "
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
  AdlsProfile,
  AzCredential,
  StorageCredential,
  StorageLayout,
  StorageProfile,
} from '@/gen/management/types.gen';
import { Intent, ObjectType } from '@/common/enums';
import { WarehousObject } from '@/common/interfaces';

const showPassword = ref(false);
const credentialType: Ref<'client-credentials' | 'shared-access-key' | 'azure-system-identity'> =
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
  'storage-profile': AdlsProfile & { type: string };
  'storage-credential': AzCredential & { type: string };
}>({
  'storage-profile': {
    'account-name': '',
    filesystem: '',
    'sas-enabled': false,
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
const storageLayoutTable = ref('{uuid}');
const storageLayoutNamespace = ref('{uuid}');

const exampleUuid = '00000000-0000-0000-0000-000000000000';
const renderTemplate = (tpl: string, name: string) =>
  tpl.replace(/\{name\}/g, name).replace(/\{uuid\}/g, exampleUuid);

const storageLayoutExample = computed(() => {
  const nsTpl = storageLayoutNamespace.value || '{uuid}';
  const tblTpl = storageLayoutTable.value || '{uuid}';
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
    return { type: 'table-only', table: storageLayoutTable.value || '{uuid}' };
  }
  if (storageLayoutType.value === 'full-hierarchy') {
    return {
      type: 'full-hierarchy',
      namespace: storageLayoutNamespace.value || '{uuid}',
      table: storageLayoutTable.value || '{uuid}',
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
  if (newValue === 'client-credentials') {
    warehouseObjectData['storage-credential'] = {
      'client-id': '',
      'client-secret': '',
      'credential-type': 'client-credentials',
      'tenant-id': '',

      type: 'az',
    };
  } else if (newValue === 'shared-access-key') {
    warehouseObjectData['storage-credential'] = {
      'credential-type': 'shared-access-key',
      key: '',
      type: 'az',
    };
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

function isSharedAccessKey(credential: AzCredential): credential is {
  'credential-type': 'shared-access-key';
  key: string;
} {
  return credential['credential-type'] === 'shared-access-key';
}

function isAzureSystemIdentityKey(credential: AzCredential): credential is {
  'credential-type': 'azure-system-identity';
  key: string;
} {
  return credential['credential-type'] === 'azure-system-identity';
}

const rules = {
  required: (value: any) => !!value || 'Required.',
  noSlash: (value: string) => !value.includes('/') || 'Cannot contain "/"',
};

// Computed properties for field validation states (show red border when required but empty)
const isClientIdInvalid = computed(() => {
  return (
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['client-id']
  );
});

const isClientSecretInvalid = computed(() => {
  return (
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['client-secret']
  );
});

const isTenantIdInvalid = computed(() => {
  return (
    isClientCredentials(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['tenant-id']
  );
});

const isSharedKeyInvalid = computed(() => {
  return (
    isSharedAccessKey(warehouseObjectData['storage-credential']) &&
    !warehouseObjectData['storage-credential']['key']
  );
});

const isAccountNameInvalid = computed(() => {
  return !warehouseObjectData['storage-profile']['account-name'];
});

const isFilesystemInvalid = computed(() => {
  return !warehouseObjectData['storage-profile']['filesystem'];
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
  if (isClientCredentials(warehouseObjectData['storage-credential'])) {
    emit('updateCredentials', {
      type: 'az',
      'credential-type': warehouseObjectData['storage-credential']['credential-type'],
      'client-id': warehouseObjectData['storage-credential']['client-id'],
      'client-secret': warehouseObjectData['storage-credential']['client-secret'],
      'tenant-id': warehouseObjectData['storage-credential']['tenant-id'],
    });
  } else if (isSharedAccessKey(warehouseObjectData['storage-credential'])) {
    emit('updateCredentials', {
      type: 'az',
      'credential-type': warehouseObjectData['storage-credential']['credential-type'],
      key: warehouseObjectData['storage-credential']['key'],
    });
  } else if (isAzureSystemIdentityKey(warehouseObjectData['storage-credential'])) {
    emit('updateCredentials', {
      type: 'az',
      'credential-type': warehouseObjectData['storage-credential']['credential-type'],
    });
  } else {
    throw new Error('Invalid credential type');
  }
};

const emitNewProfile = () => {
  const newProfile = {
    profile: warehouseObjectData['storage-profile'],
    credentials: {
      type: 'az',
      'credential-type': warehouseObjectData['storage-credential']['credential-type'],
      ...(isClientCredentials(warehouseObjectData['storage-credential']) && {
        'client-id': warehouseObjectData['storage-credential']['client-id'],
        'client-secret': warehouseObjectData['storage-credential']['client-secret'],
        'tenant-id': warehouseObjectData['storage-credential']['tenant-id'],
      }),
      ...(isSharedAccessKey(warehouseObjectData['storage-credential']) && {
        key: warehouseObjectData['storage-credential']['key'],
      }),
    } as StorageCredential,
  } as { profile: StorageProfile; credentials: StorageCredential };
  emit('updateProfile', newProfile);
};

onMounted(() => {
  if (props.warehouseObject) Object.assign(warehouseObjectData, props.warehouseObject);
  credentialType.value =
    warehouseObjectData['storage-credential']['credential-type'] || 'client-credentials';

  // Initialize storage layout from existing data
  const existingLayout = warehouseObjectData['storage-profile']['storage-layout'];
  if (existingLayout) {
    // Map deprecated parent-namespace-and-table to full-hierarchy
    storageLayoutType.value =
      existingLayout.type === 'parent-namespace-and-table' ? 'full-hierarchy' : existingLayout.type;
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
});
</script>
