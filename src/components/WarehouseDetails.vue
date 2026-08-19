<template>
  <!-- `.v-window` sets `overflow: hidden`, so the tabs window clips instead of
       letting the page scroll: every tab has to own its scroll region. Height
       comes from the tab item (the page gives it `height: 100%`), never from
       viewport arithmetic — the chrome above this is not a constant. -->
  <v-container fluid class="pa-6 details-scroll">
    <v-row>
      <!-- General Information Section -->
      <v-col cols="12">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="bg-surface-light d-flex align-center">
            <v-icon icon="mdi-information-outline" class="mr-2" color="primary"></v-icon>
            General Information
          </v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" sm="6" md="4">
                <div class="text-overline text-medium-emphasis">Warehouse ID</div>
                <div class="d-flex align-center mt-2">
                  <v-chip size="small" variant="outlined" class="mr-2">
                    {{ warehouse.id }}
                  </v-chip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(warehouse.id)"></v-btn>
                </div>
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <div class="text-overline text-medium-emphasis">Project ID</div>
                <div class="d-flex align-center mt-2">
                  <v-chip size="small" variant="outlined" class="mr-2">
                    {{ warehouse['project-id'] }}
                  </v-chip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(warehouse['project-id'])"></v-btn>
                </div>
              </v-col>
              <v-col cols="12" sm="6" md="4">
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
              <v-col cols="12" sm="6" md="4">
                <div class="text-overline text-medium-emphasis">Delete Protection</div>
                <div class="mt-2">
                  <v-chip
                    :color="warehouse.protected ? 'success' : 'default'"
                    size="small"
                    :prepend-icon="warehouse.protected ? 'mdi-lock' : 'mdi-lock-open-outline'">
                    {{ warehouse.protected ? 'Enabled' : 'Disabled' }}
                  </v-chip>
                </div>
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <div class="text-overline text-medium-emphasis">Managed by</div>
                <div class="mt-2 d-flex align-center" style="gap: 8px">
                  <v-chip
                    :color="managedBy === 'instance-admin' ? 'primary' : 'default'"
                    size="small"
                    :prepend-icon="
                      managedBy === 'instance-admin' ? 'mdi-shield-account' : 'mdi-account'
                    ">
                    {{ managedBy === 'instance-admin' ? 'Instance admin' : 'Self-managed' }}
                  </v-chip>
                </div>
                <v-alert
                  v-if="isManagedLocked"
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mt-2">
                  This warehouse is managed by an instance administrator. Spec changes (rename,
                  delete, storage, activation) are restricted to instance admins.
                </v-alert>
              </v-col>
              <v-col v-if="allowedFormatVersions.length > 0" cols="12">
                <div class="text-overline text-medium-emphasis">
                  Iceberg allowed format versions
                </div>
                <div class="mt-2 d-flex" style="gap: 6px; flex-wrap: wrap">
                  <v-chip
                    v-for="v in allowedFormatVersions"
                    :key="v"
                    size="small"
                    variant="tonal"
                    color="primary">
                    v{{ v }}
                  </v-chip>
                </div>
              </v-col>
              <v-col v-if="resolvedDefaultFormatVersion !== null" cols="12">
                <div class="text-overline text-medium-emphasis">Iceberg default format version</div>
                <div class="mt-2">
                  <v-chip size="small" variant="outlined" color="primary">
                    v{{ resolvedDefaultFormatVersion }}
                  </v-chip>
                </div>
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <div class="text-overline text-medium-emphasis">Deletion profile</div>
                <div class="mt-2 d-flex align-center" style="gap: 8px">
                  <v-chip
                    :color="warehouse['delete-profile'].type === 'hard' ? 'error' : 'info'"
                    size="small">
                    {{ warehouse['delete-profile'].type }}
                  </v-chip>
                  <span
                    v-if="warehouse['delete-profile'].type === 'soft'"
                    class="text-body-2 text-medium-emphasis">
                    expires after
                    {{ formatSeconds(warehouse['delete-profile']['expiration-seconds']) }}
                  </span>
                </div>
              </v-col>
              <v-col v-if="warehouse.id" cols="12">
                <div class="text-overline text-medium-emphasis">Tags</div>
                <div class="mt-2">
                  <EntityTagsChips
                    scope="warehouse"
                    :warehouse-id="warehouse.id"
                    :entity-id="warehouse.id" />
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Storage: one card. The provider block and the layout describe the
             same profile, and splitting them made the layout read as a
             separate subject. Full width because these rows are wide. -->
      <v-col cols="12">
        <v-card variant="outlined">
          <v-card-title class="bg-surface-light d-flex align-center">
            <template v-if="storageType === 's3'">
              <v-icon icon="mdi-aws" class="mr-2" color="orange"></v-icon>
              Amazon S3 Storage Configuration
            </template>
            <template v-else-if="storageType === 'adls'">
              <v-icon icon="mdi-microsoft-azure" class="mr-2" color="primary"></v-icon>
              Azure Data Lake Storage Configuration
            </template>
            <template v-else-if="storageType === 'onelake'">
              <v-img :src="oneLakeIcon" width="22" height="22" class="mr-2" />
              Microsoft OneLake Configuration
            </template>
            <template v-else-if="storageType === 'gcs'">
              <v-icon icon="mdi-google-cloud" class="mr-2" color="info"></v-icon>
              Google Cloud Storage Configuration
            </template>
          </v-card-title>
          <v-card-text>
            <v-row dense>
              <template v-if="storageType === 's3'">
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Bucket</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile'].bucket }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Key Prefix</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Region</div>
                  <div class="mt-2">
                    <v-chip size="small" variant="tonal">
                      {{ warehouse['storage-profile'].region }}
                    </v-chip>
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4" v-if="warehouse['storage-profile'].endpoint">
                  <div class="text-overline text-medium-emphasis">Endpoint</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile'].endpoint }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Assume Role ARN</div>
                  <div class="text-body-2 text-mono mt-2">
                    {{ warehouse['storage-profile']['assume-role-arn'] || '-' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4" v-if="warehouse['storage-profile']['sts-enabled']">
                  <div class="text-overline text-medium-emphasis">STS Role ARN</div>
                  <div class="text-body-2 text-mono mt-2">
                    {{ warehouse['storage-profile']['sts-role-arn'] || '-' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4" v-if="warehouse['storage-profile']['sts-enabled']">
                  <div class="text-overline text-medium-emphasis">STS Endpoint</div>
                  <div class="text-body-2 text-mono mt-2">
                    {{ warehouse['storage-profile']['sts-endpoint'] || 'Same as S3 endpoint' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Path Style Access</div>
                  <div class="mt-2">
                    <v-icon
                      :icon="
                        warehouse['storage-profile']['path-style-access']
                          ? 'mdi-check-circle'
                          : 'mdi-close-circle'
                      "
                      :color="
                        warehouse['storage-profile']['path-style-access'] ? 'success' : 'default'
                      "
                      size="small"></v-icon>
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">STS Enabled</div>
                  <div class="mt-2">
                    <v-icon
                      :icon="
                        warehouse['storage-profile']['sts-enabled']
                          ? 'mdi-check-circle'
                          : 'mdi-close-circle'
                      "
                      :color="warehouse['storage-profile']['sts-enabled'] ? 'success' : 'default'"
                      size="small"></v-icon>
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4" v-if="warehouse['storage-profile'].flavor">
                  <div class="text-overline text-medium-emphasis">Flavor</div>
                  <div class="text-body-1 mt-2">
                    {{ warehouse['storage-profile'].flavor }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Alternative Protocols (s3a)</div>
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
              </template>
              <template v-else-if="storageType === 'adls'">
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Account Name</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['account-name'] }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Filesystem</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile'].filesystem }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Key Prefix</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                  </div>
                </v-col>
              </template>
              <template v-else-if="storageType === 'onelake'">
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Workspace ID</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['workspace-id'] }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Lakehouse ID</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['lakehouse-id'] }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-overline text-medium-emphasis">Top-level folder</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['top-level-folder'] || 'Files' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-overline text-medium-emphasis">Directory path</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['directory-rel-path'] || '-' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-overline text-medium-emphasis">Endpoint mode</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['endpoint-mode']?.type || 'default' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-overline text-medium-emphasis">SAS enabled</div>
                  <div class="text-body-1 mt-2">
                    <v-chip
                      size="small"
                      :color="warehouse['storage-profile']['sas-enabled'] ? 'success' : 'default'"
                      variant="tonal">
                      {{ warehouse['storage-profile']['sas-enabled'] ? 'Yes' : 'No' }}
                    </v-chip>
                  </div>
                </v-col>
              </template>
              <template v-else-if="storageType === 'gcs'">
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Bucket</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile'].bucket }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <div class="text-overline text-medium-emphasis">Key Prefix</div>
                  <div class="text-body-1 text-mono mt-2">
                    {{ warehouse['storage-profile']['key-prefix'] || '-' }}
                  </div>
                </v-col>
              </template>
            </v-row>

            <v-divider class="my-5"></v-divider>

            <div class="text-overline text-medium-emphasis mb-1">Layout</div>
            <div class="text-caption text-medium-emphasis mb-3">{{ layoutDescription }}</div>
            <v-row dense>
              <v-col cols="12" md="4">
                <div class="text-overline text-medium-emphasis">Type</div>
                <div class="mt-2">
                  <v-chip size="small" variant="tonal">{{ layoutLabel }}</v-chip>
                </div>
              </v-col>
              <v-col v-if="layout.namespace" cols="12" md="4">
                <div class="text-overline text-medium-emphasis">Namespace Template</div>
                <div class="text-body-2 text-mono mt-2">{{ layout.namespace }}</div>
              </v-col>
              <v-col v-if="layout.tabular" cols="12" md="4">
                <div class="text-overline text-medium-emphasis">Tabular Template</div>
                <div class="text-body-2 text-mono mt-2">{{ layout.tabular }}</div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted, inject } from 'vue';
import { logError } from '@/common/errorUtils';
import oneLakeIcon from '@/assets/onelake.png';
import { useUserStore } from '@/stores/user';
import EntityTagsChips from './EntityTagsChips.vue';

const props = defineProps<{
  warehouseId: string;
}>();

// const router = useRouter();
const functions = inject<any>('functions')!;
const visual = inject<any>('visual')!;
const userStore = useUserStore();

// --- Storage layout ---------------------------------------------------------
// Absent means `default`: the server treats an omitted layout as the flat one,
// so the card states that rather than rendering a blank.
const layout = computed(
  () =>
    ((warehouse['storage-profile'] as any)?.['storage-layout'] as {
      type?: string;
      namespace?: string;
      tabular?: string;
    }) ?? { type: 'default' },
);

const storageType = computed(() => (warehouse['storage-profile'] as any)?.type as string);

const LAYOUT_LABELS: Record<string, string> = {
  default: 'Default (flat)',
  'tabular-only': 'Tabular only',
  'full-hierarchy': 'Full hierarchy',
  'parent-namespace-and-tabular': 'Parent namespace and tabular',
};

const LAYOUT_DESCRIPTIONS: Record<string, string> = {
  default: 'No namespace directories — every tabular sits directly under the base location.',
  'tabular-only':
    'No namespace directories; tabulars sit directly under the base location using the template below.',
  'full-hierarchy':
    'One directory per namespace level, one per tabular. Namespaces cannot change parent here: data already written keeps its location, but namespaces created afterwards would be placed outside the moved one.',
  'parent-namespace-and-tabular':
    'One directory for the direct parent namespace, one per tabular. Legacy layout — not settable through the API.',
};

const layoutLabel = computed(
  () => LAYOUT_LABELS[layout.value.type ?? 'default'] ?? layout.value.type,
);
const layoutDescription = computed(() => LAYOUT_DESCRIPTIONS[layout.value.type ?? 'default'] ?? '');

// --- Managed-by (lakekeeper#1828) -------------------------------------------
const isInstanceAdmin = computed(() => userStore.isInstanceAdmin === true);
const managedBy = computed<'self-managed' | 'instance-admin'>(
  () => (warehouse['managed-by'] as any) || 'self-managed',
);
// Spec mutations are locked for non-instance-admins on instance-admin warehouses.
// The managed-by control itself now lives in the Catalog Settings dialog.
const isManagedLocked = computed(
  () => managedBy.value === 'instance-admin' && !isInstanceAdmin.value,
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
    }
  } catch (error) {
    logError('WarehouseDetails.loadWarehouse', error);
  }
}

// Display-only: server may return null `default-format-version`; resolve to v2 if allowed,
// otherwise highest allowed version (mirrors server semantics).
const allowedFormatVersions = computed<number[]>(
  () => (warehouse['allowed-format-versions'] ?? []) as number[],
);
const resolvedDefaultFormatVersion = computed<number | null>(() => {
  const allowed = allowedFormatVersions.value;
  const serverDefault = (warehouse['default-format-version'] ?? null) as number | null;
  if (serverDefault !== null) return serverDefault;
  if (allowed.length === 0) return null;
  return allowed.includes(2) ? 2 : Math.max(...allowed);
});

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

<style scoped>
.details-scroll {
  height: 100%;
  overflow-y: auto;
}
</style>
