<template>
  <v-container fluid class="pa-0">
    <div style="display: flex; height: calc(100vh - 200px); position: relative">
      <!-- Left: Navigation Tree -->
      <Transition name="slide-x">
        <div v-if="!isNavigationCollapsed" style="display: flex; height: 100%">
          <div
            :style="{
              width: leftWidth + 'px',
              minWidth: '200px',
              maxWidth: '800px',
              height: '100%',
              overflow: 'visible',
              borderRight: '1px solid rgba(var(--v-theme-on-surface), 0.12)',
            }">
            <WarehouseNavigationTree
              v-if="warehouse.id && warehouse.name"
              :warehouse-id="warehouse.id"
              :warehouse-name="warehouse.name"
              :navigation-mode="true"
              @navigate="handleNavigate" />
            <div v-else class="pa-4 text-center text-grey">
              <v-progress-circular indeterminate size="32" class="mb-2" />
              <div class="text-caption">Loading warehouse...</div>
            </div>
          </div>

          <!-- Resizable Divider -->
          <div
            @mousedown="startResize"
            style="
              width: 5px;
              cursor: col-resize;
              user-select: none;
              flex-shrink: 0;
              transition: background 0.3s;
            "
            :style="{
              background:
                dividerHover || isResizing ? '#2196F3' : 'rgba(var(--v-theme-on-surface), 0.12)',
            }"
            @mouseenter="dividerHover = true"
            @mouseleave="dividerHover = false"></div>
        </div>
      </Transition>

      <!-- Right: Warehouse Details Content -->
      <div style="flex: 1; height: 100%; overflow-y: auto; min-width: 0">
        <v-container fluid class="pa-6">
          <div class="mb-4">
            <!-- Collapse/Expand Button -->
            <v-btn
              icon
              size="small"
              variant="text"
              @click="toggleNavigation"
              class="mr-2"
              :title="isNavigationCollapsed ? 'Show navigation tree' : 'Hide navigation tree'">
              <v-icon>
                {{ isNavigationCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left' }}
              </v-icon>
            </v-btn>
          </div>
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
import { reactive, onMounted, inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import WarehouseNavigationTree from './WarehouseNavigationTree.vue';

const props = defineProps<{
  warehouseId: string;
}>();

const router = useRouter();
const functions = inject<any>('functions')!;
const visual = inject<any>('visual')!;

// Resizable layout state
const leftWidth = ref(300); // Initial width in pixels
const dividerHover = ref(false);
const isResizing = ref(false);
const isNavigationCollapsed = ref(false);

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
    console.error('Failed to load warehouse:', error);
  }
}

function startResize(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = leftWidth.value;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    // Constrain between 200px and 800px
    leftWidth.value = Math.max(200, Math.min(800, newWidth));
  }

  function onMouseUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function toggleNavigation() {
  isNavigationCollapsed.value = !isNavigationCollapsed.value;
}

function handleNavigate(item: {
  type: string;
  warehouseId: string;
  namespaceId?: string;
  name: string;
  tab?: string;
}) {
  // Convert namespace path from dot notation to API format for routing
  const namespaceForRoute = item.namespaceId?.split('.').join('\x1F');

  if (item.type === 'namespace' && namespaceForRoute) {
    const route = `/warehouse/${item.warehouseId}/namespace/${namespaceForRoute}`;
    // Add tab as query parameter if provided
    if (item.tab) {
      router.push({ path: route, query: { tab: item.tab } });
    } else {
      router.push(route);
    }
  } else if (item.type === 'table' && namespaceForRoute) {
    router.push(`/warehouse/${item.warehouseId}/namespace/${namespaceForRoute}/table/${item.name}`);
  } else if (item.type === 'view' && namespaceForRoute) {
    router.push(`/warehouse/${item.warehouseId}/namespace/${namespaceForRoute}/view/${item.name}`);
  }
}

onMounted(loadWarehouse);

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
.slide-x-enter-active,
.slide-x-leave-active {
  transition: all 0.3s ease-out;
  overflow: hidden;
}

.slide-x-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-x-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
