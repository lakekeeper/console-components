<template>
  <v-card class="pa-4">
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-matrix</v-icon>
        Permission Matrix
        <v-tooltip location="top" max-width="400">
          <template #activator="{ props: tooltipProps }">
            <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
              mdi-information-outline
            </v-icon>
          </template>
          <span>
            Batch permission check across multiple users/roles and resources. Green indicates
            allowed, red indicates denied.
          </span>
        </v-tooltip>
      </div>
      <v-btn
        variant="text"
        icon="mdi-refresh"
        @click="loadMatrix"
        :loading="loading"
        class="ml-2 mr-2"></v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Configuration Section -->
      <v-expansion-panels v-model="configPanel" class="mb-4">
        <v-expansion-panel>
          <v-expansion-panel-title>
            <v-icon class="mr-2">mdi-cog</v-icon>
            Configuration
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row>
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-3">
                  <v-card-subtitle class="pa-0 mb-2">
                    <v-icon size="small" class="mr-1">mdi-account-group</v-icon>
                    Identities to Check
                  </v-card-subtitle>
                  <v-select
                    v-model="selectedIdentityType"
                    :items="identityTypes"
                    item-title="label"
                    item-value="value"
                    label="Identity Type"
                    density="compact"
                    @update:model-value="onIdentityTypeChange"></v-select>

                  <v-autocomplete
                    v-if="selectedIdentityType === 'user'"
                    v-model="selectedUsers"
                    :items="availableUsers"
                    item-title="name"
                    item-value="id"
                    label="Select Users"
                    multiple
                    chips
                    closable-chips
                    density="compact"
                    :loading="loadingUsers">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-account</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-autocomplete>

                  <v-autocomplete
                    v-if="selectedIdentityType === 'role'"
                    v-model="selectedRoles"
                    :items="availableRoles"
                    item-title="name"
                    item-value="id"
                    label="Select Roles"
                    multiple
                    chips
                    closable-chips
                    density="compact"
                    :loading="loadingRoles">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-shield-account</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-autocomplete>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-3">
                  <v-card-subtitle class="pa-0 mb-2">
                    <v-icon size="small" class="mr-1">mdi-database</v-icon>
                    Resources to Check
                  </v-card-subtitle>
                  <v-select
                    v-model="selectedResourceType"
                    :items="resourceTypes"
                    item-title="label"
                    item-value="value"
                    label="Resource Type"
                    density="compact"
                    @update:model-value="onResourceTypeChange"></v-select>

                  <v-autocomplete
                    v-if="selectedResourceType === 'warehouse'"
                    v-model="selectedWarehouses"
                    :items="availableWarehouses"
                    item-title="name"
                    item-value="id"
                    label="Select Warehouses"
                    multiple
                    chips
                    closable-chips
                    density="compact"
                    :loading="loadingWarehouses">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-warehouse</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-autocomplete>

                  <v-combobox
                    v-if="selectedResourceType === 'namespace'"
                    v-model="selectedNamespaces"
                    :items="availableNamespaces"
                    item-title="name"
                    item-value="name"
                    label="Enter Namespace Names (e.g., my_schema)"
                    hint="Type namespace names manually"
                    persistent-hint
                    multiple
                    chips
                    closable-chips
                    density="compact">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-folder-outline</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-combobox>

                  <v-combobox
                    v-if="selectedResourceType === 'table'"
                    v-model="selectedTables"
                    :items="availableTables"
                    item-title="name"
                    item-value="name"
                    label="Enter Table Names (e.g., my_schema.my_table)"
                    hint="Type fully qualified table names (namespace.table)"
                    persistent-hint
                    multiple
                    chips
                    closable-chips
                    density="compact">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-table</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-combobox>

                  <v-combobox
                    v-if="selectedResourceType === 'view'"
                    v-model="selectedViews"
                    :items="availableViews"
                    item-title="name"
                    item-value="name"
                    label="Enter View Names (e.g., my_schema.my_view)"
                    hint="Type fully qualified view names (namespace.view)"
                    persistent-hint
                    multiple
                    chips
                    closable-chips
                    density="compact">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">
                        <v-icon start size="small">mdi-eye-outline</v-icon>
                        {{ item.title }}
                      </v-chip>
                    </template>
                  </v-combobox>

                  <v-select
                    v-model="selectedActions"
                    :items="availableActions"
                    label="Actions to Check"
                    multiple
                    chips
                    closable-chips
                    density="compact">
                    <template #chip="{ props: chipProps, item }">
                      <v-chip v-bind="chipProps" size="small">{{ item.title }}</v-chip>
                    </template>
                  </v-select>
                </v-card>
              </v-col>
            </v-row>

            <v-row class="mt-2">
              <v-col>
                <v-btn
                  color="primary"
                  prepend-icon="mdi-matrix"
                  :disabled="!canRunMatrix"
                  :loading="loading"
                  @click="loadMatrix">
                  Run Permission Check
                </v-btn>
                <v-btn variant="text" class="ml-2" @click="clearSelection">Clear</v-btn>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Results Section -->
      <div v-if="matrixResults.length > 0" class="mt-4">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          Showing {{ matrixResults.length }} permission checks. Checked
          {{ totalChecks }} permissions in {{ checkDuration }}ms.
        </v-alert>

        <!-- Matrix Table -->
        <v-card variant="outlined">
          <div class="table-wrapper" style="overflow-x: auto">
            <table class="permission-matrix-table">
              <thead>
                <tr>
                  <th class="sticky-col">
                    <div class="header-cell">Identity</div>
                  </th>
                  <th v-for="resource in uniqueResources" :key="resource" class="resource-header">
                    <div class="header-cell">
                      <v-icon size="small" class="mr-1">{{ getResourceIcon(resource) }}</v-icon>
                      <div class="text-truncate" style="max-width: 150px">{{ resource }}</div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="identity in uniqueIdentities" :key="identity">
                  <td class="sticky-col identity-cell">
                    <div class="d-flex align-center">
                      <v-icon size="small" class="mr-2">{{ getIdentityIcon(identity) }}</v-icon>
                      <span class="text-truncate" style="max-width: 200px">{{ identity }}</span>
                    </div>
                  </td>
                  <td
                    v-for="resource in uniqueResources"
                    :key="`${identity}-${resource}`"
                    class="permission-cell">
                    <div class="permission-grid">
                      <v-tooltip
                        v-for="result in getPermissionResults(identity, resource)"
                        :key="result.action"
                        location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-chip
                            v-bind="tooltipProps"
                            :color="result.allowed ? 'success' : 'error'"
                            size="x-small"
                            class="ma-1">
                            <v-icon size="x-small" start>
                              {{ result.allowed ? 'mdi-check' : 'mdi-close' }}
                            </v-icon>
                            {{ result.action }}
                          </v-chip>
                        </template>
                        <span>
                          {{ result.action }}: {{ result.allowed ? 'Allowed' : 'Denied' }}
                        </span>
                      </v-tooltip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card>

        <!-- Summary Statistics -->
        <v-row class="mt-4">
          <v-col cols="12" md="4">
            <v-card variant="outlined">
              <v-card-text class="text-center">
                <v-icon size="large" color="success">mdi-check-circle</v-icon>
                <div class="text-h4 mt-2">{{ allowedCount }}</div>
                <div class="text-caption">Allowed</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" md="4">
            <v-card variant="outlined">
              <v-card-text class="text-center">
                <v-icon size="large" color="error">mdi-close-circle</v-icon>
                <div class="text-h4 mt-2">{{ deniedCount }}</div>
                <div class="text-caption">Denied</div>
              </v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" md="4">
            <v-card variant="outlined">
              <v-card-text class="text-center">
                <v-icon size="large" color="primary">mdi-percent</v-icon>
                <div class="text-h4 mt-2">{{ allowedPercentage }}%</div>
                <div class="text-caption">Access Rate</div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <v-alert v-else-if="!loading" type="info" variant="tonal" class="mt-4">
        Configure identities, resources, and actions above, then click "Run Permission Check" to
        generate the matrix.
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue';
import type { User, Role } from '@/gen/management/types.gen';

const functions = inject<any>('functions');

// State
const loading = ref(false);
const loadingUsers = ref(false);
const loadingRoles = ref(false);
const loadingWarehouses = ref(false);
const configPanel = ref([0]); // Open by default

// Identity selection
const selectedIdentityType = ref<'user' | 'role'>('user');
const selectedUsers = ref<string[]>([]);
const selectedRoles = ref<string[]>([]);
const availableUsers = ref<User[]>([]);
const availableRoles = ref<Role[]>([]);

// Resource selection
const selectedResourceType = ref<
  'warehouse' | 'namespace' | 'table' | 'view' | 'server' | 'project'
>('warehouse');
const selectedWarehouses = ref<string[]>([]);
const availableWarehouses = ref<Array<{ id: string; name: string }>>([]);
const selectedNamespaces = ref<string[]>([]);
const availableNamespaces = ref<Array<{ name: string }>>([]);
const selectedTables = ref<string[]>([]);
const availableTables = ref<Array<{ name: string; namespace: string }>>([]);
const selectedViews = ref<string[]>([]);
const availableViews = ref<Array<{ name: string; namespace: string }>>([]);
const selectedActions = ref<string[]>([]);

// Results
const matrixResults = ref<
  Array<{
    identity: string;
    identityType: 'user' | 'role';
    resource: string;
    resourceType: string;
    action: string;
    allowed: boolean;
  }>
>([]);
const checkDuration = ref(0);
const totalChecks = ref(0);

// Configuration options
const identityTypes = [
  { label: 'Users', value: 'user' },
  { label: 'Roles', value: 'role' },
];

const resourceTypes = [
  { label: 'Warehouses', value: 'warehouse' },
  { label: 'Namespaces', value: 'namespace' },
  { label: 'Tables', value: 'table' },
  { label: 'Views', value: 'view' },
  { label: 'Server', value: 'server' },
  { label: 'Project', value: 'project' },
];

const warehouseActions = [
  'create_namespace',
  'delete',
  'update_storage',
  'update_storage_credential',
  'get_metadata',
  'get_config',
  'list_namespaces',
  'list_everything',
  'use',
  'include_in_list',
  'deactivate',
  'activate',
  'rename',
  'list_deleted_tabulars',
  'modify_soft_deletion',
  'get_task_queue_config',
  'modify_task_queue_config',
  'get_all_tasks',
  'control_all_tasks',
  'set_protection',
  'get_endpoint_statistics',
];

const serverActions = [
  'create_project',
  'update_users',
  'delete_users',
  'list_users',
  'provision_users',
];

const projectActions = [
  'create_warehouse',
  'delete',
  'rename',
  'get_metadata',
  'list_warehouses',
  'include_in_list',
  'create_role',
  'list_roles',
  'search_roles',
  'get_endpoint_statistics',
];

const namespaceActions = [
  'create_table',
  'create_view',
  'create_namespace',
  'delete',
  'update_properties',
  'get_metadata',
  'list_tables',
  'list_views',
  'list_namespaces',
  'list_everything',
  'set_protection',
  'include_in_list',
];

const tableActions = [
  'drop',
  'write_data',
  'read_data',
  'get_metadata',
  'commit',
  'rename',
  'include_in_list',
  'undrop',
  'get_tasks',
  'control_tasks',
  'set_protection',
];

const viewActions = [
  'drop',
  'get_metadata',
  'commit',
  'include_in_list',
  'rename',
  'undrop',
  'get_tasks',
  'control_tasks',
  'set_protection',
];

// Computed
const availableActions = computed(() => {
  if (selectedResourceType.value === 'warehouse') {
    return warehouseActions;
  } else if (selectedResourceType.value === 'namespace') {
    return namespaceActions;
  } else if (selectedResourceType.value === 'table') {
    return tableActions;
  } else if (selectedResourceType.value === 'view') {
    return viewActions;
  } else if (selectedResourceType.value === 'server') {
    return serverActions;
  } else if (selectedResourceType.value === 'project') {
    return projectActions;
  }
  return [];
});

const canRunMatrix = computed(() => {
  const hasIdentities =
    (selectedIdentityType.value === 'user' && selectedUsers.value.length > 0) ||
    (selectedIdentityType.value === 'role' && selectedRoles.value.length > 0);

  const hasResources =
    selectedResourceType.value === 'server' ||
    selectedResourceType.value === 'project' ||
    (selectedResourceType.value === 'warehouse' && selectedWarehouses.value.length > 0) ||
    (selectedResourceType.value === 'namespace' && selectedNamespaces.value.length > 0) ||
    (selectedResourceType.value === 'table' && selectedTables.value.length > 0) ||
    (selectedResourceType.value === 'view' && selectedViews.value.length > 0);

  const hasActions = selectedActions.value.length > 0;

  return hasIdentities && hasResources && hasActions;
});

const uniqueIdentities = computed(() => {
  return [...new Set(matrixResults.value.map((r) => r.identity))];
});

const uniqueResources = computed(() => {
  return [...new Set(matrixResults.value.map((r) => r.resource))];
});

const allowedCount = computed(() => {
  return matrixResults.value.filter((r) => r.allowed).length;
});

const deniedCount = computed(() => {
  return matrixResults.value.filter((r) => !r.allowed).length;
});

const allowedPercentage = computed(() => {
  if (matrixResults.value.length === 0) return 0;
  return Math.round((allowedCount.value / matrixResults.value.length) * 100);
});

// Methods
function getPermissionResults(identity: string, resource: string) {
  return matrixResults.value.filter((r) => r.identity === identity && r.resource === resource);
}

function getResourceIcon(resource: string) {
  if (resource.toLowerCase().includes('warehouse')) return 'mdi-warehouse';
  if (resource.toLowerCase().includes('server')) return 'mdi-server';
  if (resource.toLowerCase().includes('project')) return 'mdi-folder';
  return 'mdi-cube-outline';
}

function getIdentityIcon(identity: string) {
  // Check if it's a role (typically has specific patterns)
  const isRole = matrixResults.value.some(
    (r) => r.identity === identity && r.identityType === 'role',
  );
  return isRole ? 'mdi-shield-account' : 'mdi-account';
}

async function onIdentityTypeChange() {
  selectedUsers.value = [];
  selectedRoles.value = [];

  if (selectedIdentityType.value === 'user') {
    await loadUsers();
  } else {
    await loadRoles();
  }
}

async function onResourceTypeChange() {
  selectedWarehouses.value = [];
  selectedNamespaces.value = [];
  selectedTables.value = [];
  selectedViews.value = [];
  selectedActions.value = [];

  if (selectedResourceType.value === 'warehouse') {
    await loadWarehouses();
  }
  // Note: Namespaces, tables, and views are entered manually via combobox
}

async function loadUsers() {
  if (!functions) return;
  try {
    loadingUsers.value = true;
    const result = await functions.listUser();
    availableUsers.value = result.users || [];
  } catch (error) {
    console.error('Failed to load users:', error);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadRoles() {
  if (!functions) return;
  try {
    loadingRoles.value = true;
    const result = await functions.listRoles();
    availableRoles.value = result.roles || [];
  } catch (error) {
    console.error('Failed to load roles:', error);
  } finally {
    loadingRoles.value = false;
  }
}

async function loadWarehouses() {
  if (!functions) return;
  try {
    loadingWarehouses.value = true;
    const result = await functions.listWarehouses();
    availableWarehouses.value =
      result.warehouses?.map((wh: any) => ({
        id: wh.id,
        name: wh.name,
      })) || [];
  } catch (error) {
    console.error('Failed to load warehouses:', error);
  } finally {
    loadingWarehouses.value = false;
  }
}

async function loadMatrix() {
  if (!functions || !canRunMatrix.value) return;

  try {
    loading.value = true;
    matrixResults.value = [];

    const startTime = Date.now();

    // Build batch check request
    const checks: Array<any> = [];
    let checkId = 0;

    const identities =
      selectedIdentityType.value === 'user'
        ? selectedUsers.value.map((id) => ({ type: 'user', id }))
        : selectedRoles.value.map((id) => ({ type: 'role', id }));

    let resources: Array<{ type: string; id: string; name: string; namespace?: string }> = [];

    if (selectedResourceType.value === 'server') {
      resources = [{ type: 'server', id: 'server', name: 'Server' }];
    } else if (selectedResourceType.value === 'project') {
      resources = [{ type: 'project', id: 'project', name: 'Project' }];
    } else if (selectedResourceType.value === 'warehouse') {
      resources = selectedWarehouses.value.map((id) => {
        const wh = availableWarehouses.value.find((w) => w.id === id);
        return { type: 'warehouse', id, name: wh?.name || id };
      });
    } else if (selectedResourceType.value === 'namespace') {
      resources = selectedNamespaces.value.map((name) => ({
        type: 'namespace',
        id: name,
        name: name,
      }));
    } else if (selectedResourceType.value === 'table') {
      resources = selectedTables.value.map((name) => {
        const parts = name.split('.');
        return {
          type: 'table',
          id: name,
          name: parts[parts.length - 1],
          namespace: parts.slice(0, -1).join('.'),
        };
      });
    } else if (selectedResourceType.value === 'view') {
      resources = selectedViews.value.map((name) => {
        const parts = name.split('.');
        return {
          type: 'view',
          id: name,
          name: parts[parts.length - 1],
          namespace: parts.slice(0, -1).join('.'),
        };
      });
    }

    // Create all combinations
    for (const identity of identities) {
      for (const resource of resources) {
        for (const action of selectedActions.value) {
          const check: any = {
            id: `check-${checkId++}`,
            identity:
              selectedIdentityType.value === 'user' ? { user: identity.id } : { role: identity.id },
          };

          if (resource.type === 'warehouse') {
            check.operation = {
              warehouse: {
                action,
                'warehouse-id': resource.id,
              },
            };
          } else if (resource.type === 'namespace') {
            check.operation = {
              namespace: {
                action,
                namespace: resource.name,
                'warehouse-id': null, // User should select a warehouse for namespaces
              },
            };
          } else if (resource.type === 'table') {
            check.operation = {
              table: {
                action,
                namespace: resource.namespace,
                table: resource.name,
                'warehouse-id': null, // User should select a warehouse for tables
              },
            };
          } else if (resource.type === 'view') {
            check.operation = {
              view: {
                action,
                namespace: resource.namespace,
                view: resource.name,
                'warehouse-id': null, // User should select a warehouse for views
              },
            };
          } else if (resource.type === 'server') {
            check.operation = {
              server: {
                action,
              },
            };
          } else if (resource.type === 'project') {
            check.operation = {
              project: {
                action,
                'project-id': null,
              },
            };
          }

          checks.push({
            ...check,
            _metadata: {
              identityId: identity.id,
              identityType: selectedIdentityType.value,
              resourceId: resource.id,
              resourceName: resource.name,
              resourceType: resource.type,
              action,
            },
          });
        }
      }
    }

    totalChecks.value = checks.length;

    // Execute batch check
    const results = await functions.batchCheckActions(checks, false, false);

    // Process results
    matrixResults.value = results.map((result: any, index: number) => {
      const metadata = checks[index]._metadata;
      return {
        identity: metadata.identityId,
        identityType: metadata.identityType,
        resource: metadata.resourceName,
        resourceType: metadata.resourceType,
        action: metadata.action,
        allowed: result.allowed,
      };
    });

    checkDuration.value = Date.now() - startTime;

    // Collapse config panel after successful run
    configPanel.value = [];
  } catch (error) {
    console.error('Failed to load permission matrix:', error);
    functions?.handleError(error, 'loadMatrix', true);
  } finally {
    loading.value = false;
  }
}

function clearSelection() {
  selectedUsers.value = [];
  selectedRoles.value = [];
  selectedWarehouses.value = [];
  selectedNamespaces.value = [];
  selectedTables.value = [];
  selectedViews.value = [];
  selectedActions.value = [];
  matrixResults.value = [];
}

onMounted(async () => {
  await loadUsers();
  await loadWarehouses();
});
</script>

<style scoped>
.permission-matrix-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.permission-matrix-table th,
.permission-matrix-table td {
  border: 1px solid #e0e0e0;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}

.permission-matrix-table thead th {
  background-color: #f5f5f5;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
}

.sticky-col {
  position: sticky;
  left: 0;
  background-color: #fafafa;
  z-index: 1;
  min-width: 200px;
  font-weight: 500;
}

.permission-matrix-table thead .sticky-col {
  z-index: 3;
  background-color: #f5f5f5;
}

.header-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.resource-header {
  min-width: 180px;
}

.identity-cell {
  background-color: #fafafa;
}

.permission-cell {
  min-width: 180px;
  max-width: 300px;
}

.permission-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.table-wrapper {
  max-height: 600px;
  overflow: auto;
}
</style>
