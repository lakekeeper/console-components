<template>
  <v-container fluid class="pa-0">
    <div style="display: flex; height: calc(100vh - 160px); position: relative">
      <!-- Right: Warehouse Details Content -->
      <div style="flex: 1; height: 100%; overflow-y: auto; min-width: 0">
        <v-container fluid class="pa-6">
          <v-row>
            <!-- General Information Section -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="mb-4">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-information-outline" class="mr-2" color="primary"></v-icon>
                  General Information
                </v-card-title>
                <v-card-text>
                  <v-row dense>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Warehouse ID</div>
                      <div class="d-flex align-center mt-2">
                        <v-chip size="small" variant="outlined" class="mr-2">
                          {{ warehouse.id }}
                        </v-chip>
                        <v-btn
                          icon="mdi-content-copy"
                          size="x-small"
                          variant="flat"
                          @click="copyToClipboard(warehouse.id)"></v-btn>
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Project ID</div>
                      <div class="d-flex align-center mt-2">
                        <v-chip size="small" variant="outlined" class="mr-2">
                          {{ warehouse['project-id'] }}
                        </v-chip>
                        <v-btn
                          icon="mdi-content-copy"
                          size="x-small"
                          variant="flat"
                          @click="copyToClipboard(warehouse['project-id'])"></v-btn>
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Status</div>
                      <div class="mt-2 d-flex align-center gap-2">
                        <v-chip
                          :color="warehouse.status === 'active' ? 'success' : 'warning'"
                          size="small"
                          :prepend-icon="
                            warehouse.status === 'active' ? 'mdi-check-circle' : 'mdi-pause-circle'
                          ">
                          {{ warehouse.status }}
                        </v-chip>
                        <!--v-btn
                    v-if="warehouse.status === 'active' && canDeactivate"
                    size="x-small"
                    color="warning"
                    variant="outlined"
                    prepend-icon="mdi-pause"
                    @click="deactivateWarehouse">
                    Deactivate
                  </v-btn>
                  <v-btn
                    v-if="warehouse.status === 'inactive' && canActivate"
                    size="x-small"
                    color="success"
                    variant="outlined"
                    prepend-icon="mdi-play"
                    @click="activateWarehouse">
                    Activate
                  </v-btn-->
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Delete Protection</div>
                      <div class="mt-2">
                        <v-chip
                          :color="warehouse.protected ? 'success' : 'default'"
                          size="small"
                          :prepend-icon="
                            warehouse.protected ? 'mdi-lock' : 'mdi-lock-open-outline'
                          ">
                          {{ warehouse.protected ? 'Enabled' : 'Disabled' }}
                        </v-chip>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Format Version Policy Section -->
              <v-card variant="outlined" class="mb-4">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-format-list-numbered" class="mr-2" color="primary"></v-icon>
                  Iceberg Format Version Policy
                </v-card-title>
                <v-card-text>
                  <div class="text-overline text-medium-emphasis">Allowed versions</div>
                  <v-btn-toggle
                    v-model="policyAllowed"
                    multiple
                    mandatory
                    density="compact"
                    variant="outlined"
                    color="primary"
                    class="mt-2 mb-3"
                    :disabled="!canSetFormatVersionPolicy || policySaving">
                    <v-btn :value="1" size="small">v1</v-btn>
                    <v-btn :value="2" size="small">v2</v-btn>
                    <v-btn :value="3" size="small">v3</v-btn>
                  </v-btn-toggle>

                  <div class="text-overline text-medium-emphasis">Default version</div>
                  <v-select
                    v-model="policyDefault"
                    :items="policyDefaultItems"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    class="mt-2"
                    :disabled="!canSetFormatVersionPolicy || policySaving"
                    :hint="
                      policyDefault === null
                        ? 'Falls back to v2 if allowed, otherwise the highest allowed version.'
                        : ''
                    "
                    persistent-hint />

                  <div v-if="policyDirty" class="d-flex justify-end mt-3">
                    <v-btn
                      variant="text"
                      size="small"
                      :disabled="policySaving"
                      @click="resetPolicy">
                      Cancel
                    </v-btn>
                    <v-btn
                      color="primary"
                      size="small"
                      class="ml-2"
                      :loading="policySaving"
                      :disabled="policyAllowed.length === 0"
                      @click="savePolicy">
                      Save policy
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>

              <!-- Deletion Profile Section -->
              <v-card variant="outlined" class="mb-4">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-delete-outline" class="mr-2" color="error"></v-icon>
                  Deletion Profile
                </v-card-title>
                <v-card-text>
                  <v-row dense>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Type</div>
                      <div class="mt-2">
                        <v-chip
                          :color="warehouse['delete-profile'].type === 'hard' ? 'error' : 'info'"
                          size="small">
                          {{ warehouse['delete-profile'].type }}
                        </v-chip>
                      </div>
                    </v-col>
                    <v-col v-if="warehouse['delete-profile'].type === 'soft'" cols="12">
                      <div class="text-overline text-medium-emphasis">Expiration</div>
                      <div class="text-body-1 mt-2">
                        {{ formatSeconds(warehouse['delete-profile']['expiration-seconds']) }}
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Storage Profile Section -->
            <v-col cols="12" md="6">
              <!-- S3 Storage -->
              <v-card v-if="warehouse['storage-profile'].type === 's3'" variant="outlined">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-aws" class="mr-2" color="orange"></v-icon>
                  Amazon S3 Storage Configuration
                </v-card-title>
                <v-card-text>
                  <v-row dense>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Bucket</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile'].bucket }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Key Prefix</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Region</div>
                      <div class="mt-2">
                        <v-chip size="small" variant="tonal">
                          {{ warehouse['storage-profile'].region }}
                        </v-chip>
                      </div>
                    </v-col>
                    <v-col cols="12" v-if="warehouse['storage-profile'].endpoint">
                      <div class="text-overline text-medium-emphasis">Endpoint</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile'].endpoint }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Assume Role ARN</div>
                      <div class="text-body-2 text-mono mt-2">
                        {{ warehouse['storage-profile']['assume-role-arn'] || '-' }}
                      </div>
                    </v-col>
                    <v-col cols="12" v-if="warehouse['storage-profile']['sts-enabled']">
                      <div class="text-overline text-medium-emphasis">STS Role ARN</div>
                      <div class="text-body-2 text-mono mt-2">
                        {{ warehouse['storage-profile']['sts-role-arn'] || '-' }}
                      </div>
                    </v-col>
                    <v-col cols="12" v-if="warehouse['storage-profile']['sts-enabled']">
                      <div class="text-overline text-medium-emphasis">STS Endpoint</div>
                      <div class="text-body-2 text-mono mt-2">
                        {{ warehouse['storage-profile']['sts-endpoint'] || 'Same as S3 endpoint' }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Path Style Access</div>
                      <div class="mt-2">
                        <v-icon
                          :icon="
                            warehouse['storage-profile']['path-style-access']
                              ? 'mdi-check-circle'
                              : 'mdi-close-circle'
                          "
                          :color="
                            warehouse['storage-profile']['path-style-access']
                              ? 'success'
                              : 'default'
                          "
                          size="small"></v-icon>
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">STS Enabled</div>
                      <div class="mt-2">
                        <v-icon
                          :icon="
                            warehouse['storage-profile']['sts-enabled']
                              ? 'mdi-check-circle'
                              : 'mdi-close-circle'
                          "
                          :color="
                            warehouse['storage-profile']['sts-enabled'] ? 'success' : 'default'
                          "
                          size="small"></v-icon>
                      </div>
                    </v-col>
                    <v-col cols="12" v-if="warehouse['storage-profile'].flavor">
                      <div class="text-overline text-medium-emphasis">Flavor</div>
                      <div class="text-body-1 mt-2">{{ warehouse['storage-profile'].flavor }}</div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">
                        Alternative Protocols (s3a)
                      </div>
                      <div class="mt-2">
                        <v-icon
                          :icon="
                            warehouse['storage-profile']['allow-alternative-protocols']
                              ? 'mdi-check-circle'
                              : 'mdi-close-circle'
                          "
                          :color="
                            warehouse['storage-profile']['allow-alternative-protocols']
                              ? 'success'
                              : 'default'
                          "
                          size="small"></v-icon>
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- Azure ADLS Storage -->
              <v-card v-if="warehouse['storage-profile'].type === 'adls'" variant="outlined">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-microsoft-azure" class="mr-2" color="blue"></v-icon>
                  Azure Data Lake Storage Configuration
                </v-card-title>
                <v-card-text>
                  <v-row dense>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Account Name</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile']['account-name'] }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Filesystem</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile'].filesystem }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Key Prefix</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>

              <!-- GCS Storage -->
              <v-card v-if="warehouse['storage-profile'].type === 'gcs'" variant="outlined">
                <v-card-title class="bg-surface-light d-flex align-center">
                  <v-icon icon="mdi-google-cloud" class="mr-2" color="blue"></v-icon>
                  Google Cloud Storage Configuration
                </v-card-title>
                <v-card-text>
                  <v-row dense>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Bucket</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile'].bucket }}
                      </div>
                    </v-col>
                    <v-col cols="12">
                      <div class="text-overline text-medium-emphasis">Key Prefix</div>
                      <div class="text-body-1 text-mono mt-2">
                        {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                      </div>
                    </v-col>
                  </v-row>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch, inject } from 'vue';
import { logError } from '@/common/errorUtils';
import { useWarehousePermissions } from '@/composables/useCatalogPermissions';

const props = defineProps<{
  warehouseId: string;
}>();

// const router = useRouter();
const functions = inject<any>('functions')!;
const visual = inject<any>('visual')!;

const { canSetFormatVersionPolicy } = useWarehousePermissions(
  computed(() => props.warehouseId),
);

const warehouse = reactive<any>({
  'delete-profile': { type: 'hard' },
  id: '',
  name: '',
  'project-id': '',
  status: 'active',
  'storage-profile': {
    type: 's3',
    bucket: '',
    'key-prefix': '',
    'assume-role-arn': '',
    endpoint: '',
    region: '',
    'path-style-access': null,
    'sts-role-arn': '',
    'sts-enabled': false,
    flavor: undefined,
  },
  protected: false,
});

async function loadWarehouse() {
  try {
    const whResponse = await functions.getWarehouse(props.warehouseId);
    if (whResponse) {
      Object.assign(warehouse, whResponse);
      visual.wahrehouseName = whResponse.name;
      visual.whId = whResponse.id;
      resetPolicy();
    }
  } catch (error) {
    logError('WarehouseDetails.loadWarehouse', error);
  }
}

// --- Format version policy state ---
const policyAllowed = ref<number[]>([1, 2, 3]);
const policyDefault = ref<number | null>(null);
const policySaving = ref(false);

const policyDefaultItems = computed(() => [
  { title: 'Auto (server-chosen)', value: null },
  ...policyAllowed.value.map((v) => ({ title: `v${v}`, value: v })),
]);

const policyDirty = computed(() => {
  const serverAllowed = (warehouse['allowed-format-versions'] ?? []) as number[];
  const serverDefault = (warehouse['default-format-version'] ?? null) as number | null;
  const allowedChanged =
    serverAllowed.length !== policyAllowed.value.length ||
    serverAllowed.some((v) => !policyAllowed.value.includes(v));
  return allowedChanged || policyDefault.value !== serverDefault;
});

// If user removes the current default from `allowed`, clear it back to auto.
watch(policyAllowed, (next) => {
  if (policyDefault.value !== null && !next.includes(policyDefault.value)) {
    policyDefault.value = null;
  }
});

function resetPolicy() {
  policyAllowed.value = [...((warehouse['allowed-format-versions'] ?? [1, 2, 3]) as number[])];
  policyDefault.value = (warehouse['default-format-version'] ?? null) as number | null;
}

async function savePolicy() {
  if (policyAllowed.value.length === 0) return;
  policySaving.value = true;
  try {
    await functions.setWarehouseFormatVersionPolicy(
      props.warehouseId,
      [...policyAllowed.value].sort((a, b) => a - b),
      policyDefault.value,
      true,
    );
    await loadWarehouse();
  } catch (error) {
    logError('WarehouseDetails.savePolicy', error);
  } finally {
    policySaving.value = false;
  }
}

onMounted(() => {
  loadWarehouse();
});

function copyToClipboard(text: string) {
  functions.copyToClipboard(text);
}

function formatSeconds(seconds?: number): string {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : `${seconds}s`;
}
</script>
