<template>
  <v-container fluid>
    <v-tabs v-model="activeTab" color="primary" class="mb-4">
      <v-tab value="overview">
        <v-icon start>mdi-information-outline</v-icon>
        Overview
      </v-tab>
      <v-tab value="permissions">
        <v-icon start>mdi-matrix</v-icon>
        Permission Matrix
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- Overview Tab -->
      <v-window-item value="overview">
        <v-row>
          <!-- Main Server Info Card -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2" color="primary">mdi-server</v-icon>
                Server Information
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-identifier</v-icon>
                    </template>
                    <v-list-item-title>Server ID</v-list-item-title>
                    <v-list-item-subtitle class="text-wrap">
                      {{ projectInfo['server-id'] || 'N/A' }}
                      <v-btn
                        v-if="projectInfo['server-id']"
                        icon="mdi-content-copy"
                        size="x-small"
                        variant="text"
                        @click="copyToClipboard(projectInfo['server-id'])"></v-btn>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-tag</v-icon>
                    </template>
                    <v-list-item-title>Version</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip size="small" color="primary">
                        {{ projectInfo.version || 'N/A' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-check-circle</v-icon>
                    </template>
                    <v-list-item-title>Bootstrap Status</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="projectInfo.bootstrapped ? 'success' : 'warning'"
                        size="small"
                        variant="flat">
                        <v-icon start>
                          {{ projectInfo.bootstrapped ? 'mdi-check' : 'mdi-alert' }}
                        </v-icon>
                        {{ projectInfo.bootstrapped ? 'Bootstrapped' : 'Not Bootstrapped' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-folder-key</v-icon>
                    </template>
                    <v-list-item-title>Default Project ID</v-list-item-title>
                    <v-list-item-subtitle class="text-wrap">
                      {{ projectInfo['default-project-id'] || 'N/A' }}
                      <v-btn
                        v-if="projectInfo['default-project-id']"
                        icon="mdi-content-copy"
                        size="x-small"
                        variant="text"
                        @click="copyToClipboard(projectInfo['default-project-id'])"></v-btn>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-shield-lock</v-icon>
                    </template>
                    <v-list-item-title>Authorization Backend</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip size="small" color="info">
                        {{ projectInfo['authz-backend'] || 'N/A' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- License Info Card -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2" color="success">mdi-license</v-icon>
                License Information
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-list v-if="projectInfo['license-status']" density="compact">
                  <!-- Validity Status - Most Important -->
                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-check-decagram</v-icon>
                    </template>
                    <v-list-item-title>Validity Status</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="projectInfo['license-status']['valid'] ? 'success' : 'error'"
                        size="small"
                        variant="flat">
                        <v-icon start>
                          {{
                            projectInfo['license-status']['valid']
                              ? 'mdi-check-circle'
                              : 'mdi-alert-circle'
                          }}
                        </v-icon>
                        {{ projectInfo['license-status']['valid'] ? 'Valid' : 'Invalid' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- License Type -->
                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-file-certificate</v-icon>
                    </template>
                    <v-list-item-title>License Type</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="getLicenseTypeColor(projectInfo['license-status']['license-type'])"
                        size="small">
                        {{ projectInfo['license-status']['license-type'] || 'N/A' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- License ID -->
                  <v-list-item v-if="projectInfo['license-status']['license-id']">
                    <template #prepend>
                      <v-icon>mdi-key-variant</v-icon>
                    </template>
                    <v-list-item-title>License ID</v-list-item-title>
                    <v-list-item-subtitle class="text-wrap">
                      {{ projectInfo['license-status']['license-id'] }}
                      <v-btn
                        icon="mdi-content-copy"
                        size="x-small"
                        variant="text"
                        @click="
                          copyToClipboard(projectInfo['license-status']['license-id'])
                        "></v-btn>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- Customer -->
                  <v-list-item v-if="projectInfo['license-status']['customer']">
                    <template #prepend>
                      <v-icon>mdi-account-tie</v-icon>
                    </template>
                    <v-list-item-title>Customer</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ projectInfo['license-status']['customer'] }}
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- Audience -->
                  <v-list-item v-if="projectInfo['license-status']['audience']">
                    <template #prepend>
                      <v-icon>mdi-account-group</v-icon>
                    </template>
                    <v-list-item-title>Audience</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ projectInfo['license-status']['audience'] }}
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- Issuer -->
                  <v-list-item v-if="projectInfo['license-status']['issuer']">
                    <template #prepend>
                      <v-icon>mdi-domain</v-icon>
                    </template>
                    <v-list-item-title>Issuer</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ projectInfo['license-status']['issuer'] }}
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- Expiration -->
                  <v-list-item v-if="projectInfo['license-status']['expiration']">
                    <template #prepend>
                      <v-icon>mdi-calendar-clock</v-icon>
                    </template>
                    <v-list-item-title>Expiration Date</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="getExpirationColor(projectInfo['license-status']['expiration'])"
                        size="small">
                        {{ formatDate(projectInfo['license-status']['expiration']) }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item v-else>
                    <template #prepend>
                      <v-icon>mdi-infinity</v-icon>
                    </template>
                    <v-list-item-title>Expiration Date</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip size="small" color="success">Perpetual</v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <!-- Error Message -->
                  <v-list-item v-if="projectInfo['license-status']['error']">
                    <v-alert type="error" variant="tonal" density="compact" class="mt-2">
                      <template #prepend>
                        <v-icon>mdi-alert-circle</v-icon>
                      </template>
                      {{ projectInfo['license-status']['error'] }}
                    </v-alert>
                  </v-list-item>
                </v-list>
                <v-alert v-else type="info" variant="tonal">
                  No license information available
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- System Identities Card -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2" color="info">mdi-cloud-lock</v-icon>
                Cloud System Identities
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-list density="compact">
                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-aws</v-icon>
                    </template>
                    <v-list-item-title>AWS System Identities</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="projectInfo['aws-system-identities-enabled'] ? 'success' : 'grey'"
                        size="small"
                        variant="flat">
                        {{ projectInfo['aws-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-microsoft-azure</v-icon>
                    </template>
                    <v-list-item-title>Azure System Identities</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="projectInfo['azure-system-identities-enabled'] ? 'success' : 'grey'"
                        size="small"
                        variant="flat">
                        {{
                          projectInfo['azure-system-identities-enabled'] ? 'Enabled' : 'Disabled'
                        }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>

                  <v-list-item>
                    <template #prepend>
                      <v-icon>mdi-google-cloud</v-icon>
                    </template>
                    <v-list-item-title>GCP System Identities</v-list-item-title>
                    <v-list-item-subtitle>
                      <v-chip
                        :color="projectInfo['gcp-system-identities-enabled'] ? 'success' : 'grey'"
                        size="small"
                        variant="flat">
                        {{ projectInfo['gcp-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
                      </v-chip>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>

                <v-alert
                  v-if="
                    !projectInfo['aws-system-identities-enabled'] &&
                    !projectInfo['azure-system-identities-enabled'] &&
                    !projectInfo['gcp-system-identities-enabled']
                  "
                  class="mt-3"
                  type="info"
                  variant="tonal"
                  density="compact">
                  No cloud system identities are enabled
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Queues Card -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2" color="warning">mdi-format-list-checks</v-icon>
                Active Queues
              </v-card-title>
              <v-divider></v-divider>
              <v-card-text>
                <v-list
                  v-if="projectInfo.queues && projectInfo.queues.length > 0"
                  density="compact">
                  <v-list-item v-for="(queue, index) in projectInfo.queues" :key="index">
                    <template #prepend>
                      <v-icon>mdi-playlist-check</v-icon>
                    </template>
                    <v-list-item-title>
                      <v-chip size="small" variant="outlined">{{ queue }}</v-chip>
                    </v-list-item-title>
                  </v-list-item>
                </v-list>
                <v-alert v-else type="info" variant="tonal">No active queues</v-alert>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <!-- Permission Matrix Tab -->
      <v-window-item value="permissions">
        <v-card class="pa-6">
          <v-card-title class="d-flex align-center mb-4">
            <v-icon color="primary" class="mr-2">mdi-shield-check</v-icon>
            Permission Evaluation
            <v-tooltip location="top" max-width="400">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" class="ml-2" size="small" color="info">
                  mdi-information-outline
                </v-icon>
              </template>
              <span>
                Use the permission matrix to evaluate access rights across multiple users, roles,
                and resources in a single batch check.
              </span>
            </v-tooltip>
          </v-card-title>

          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4">
              <div class="d-flex align-center">
                <v-icon start>mdi-information</v-icon>
                <div>
                  <strong>Batch Permission Evaluation</strong>
                  <div class="text-body-2 mt-1">
                    The Permission Matrix allows you to check multiple permissions simultaneously.
                    You can evaluate access across users, roles, warehouses, namespaces, tables,
                    views, and more. Results show which actions are allowed (green) or denied (red)
                    for each identity-resource combination.
                  </div>
                </div>
              </div>
            </v-alert>

            <div class="text-center">
              <PermissionMatrixDialog />
              <div class="text-caption text-medium-emphasis mt-3">
                Click the button above to open the permission evaluation tool
              </div>
            </div>

            <!-- Quick Info Cards -->
            <v-row class="mt-6">
              <v-col cols="12" md="4">
                <v-card variant="outlined">
                  <v-card-text class="text-center">
                    <v-icon size="large" color="primary">mdi-account-group</v-icon>
                    <div class="text-h6 mt-2">Check Users & Roles</div>
                    <div class="text-caption mt-1">
                      Evaluate permissions for multiple users or roles at once
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
              <v-col cols="12" md="4">
                <v-card variant="outlined">
                  <v-card-text class="text-center">
                    <v-icon size="large" color="primary">mdi-database</v-icon>
                    <div class="text-h6 mt-2">Multiple Resources</div>
                    <div class="text-caption mt-1">
                      Check warehouses, namespaces, tables, views, and more
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
              <v-col cols="12" md="4">
                <v-card variant="outlined">
                  <v-card-text class="text-center">
                    <v-icon size="large" color="primary">mdi-lightning-bolt</v-icon>
                    <div class="text-h6 mt-2">Fast Batch Checks</div>
                    <div class="text-caption mt-1">
                      Single API call checks hundreds of permissions efficiently
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script lang="ts" setup>
import { onMounted, ref, inject } from 'vue';
import PermissionMatrixDialog from './PermissionMatrixDialog.vue';

const functions = inject<any>('functions');
const activeTab = ref('overview');
const projectInfo = ref<any>({});

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    if (functions && functions.showSnackbar) {
      functions.showSnackbar('Copied to clipboard', 'success');
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

function getLicenseTypeColor(licenseType: string): string {
  if (!licenseType) return 'grey';
  if (licenseType.includes('Apache') || licenseType.includes('MIT')) return 'success';
  if (licenseType.includes('Enterprise')) return 'primary';
  if (licenseType.includes('Trial')) return 'warning';
  return 'info';
}

function getExpirationColor(expirationDate: string): string {
  if (!expirationDate) return 'success';
  const expDate = new Date(expirationDate);
  const now = new Date();
  const daysUntilExpiration = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiration < 0) return 'error'; // Expired
  if (daysUntilExpiration < 30) return 'warning'; // Less than 30 days
  if (daysUntilExpiration < 90) return 'orange'; // Less than 90 days
  return 'success'; // More than 90 days
}

function formatDate(dateString: string): string {
  if (!dateString) return 'Never';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

onMounted(async () => {
  if (functions) {
    projectInfo.value = await functions.getServerInfo();
  }
});
</script>
