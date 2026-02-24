<template>
  <v-container fluid>
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
                    @click="copyToClipboard(projectInfo['license-status']['license-id'])"></v-btn>
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
            <v-alert v-else type="info" variant="tonal">No license information available</v-alert>
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
                    {{ projectInfo['azure-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
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
            <v-list v-if="projectInfo.queues && projectInfo.queues.length > 0" density="compact">
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

      <!-- UI Configuration Card — always rendered, no auth or server needed -->
      <v-col cols="12">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
            UI Configuration
          </v-card-title>
          <v-divider></v-divider>
          <v-card-text>
            <v-table density="compact">
              <thead>
                <tr>
                  <th class="text-left" style="width: 280px">Setting</th>
                  <th class="text-left">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="font-weight-medium">Lakekeeper URL</td>
                  <td>
                    <code>{{ appConfig.icebergCatalogUrl || '(auto-detected from browser)' }}</code>
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-medium">Base URL Prefix</td>
                  <td>
                    <code>{{ appConfig.baseUrlPrefix || '(none)' }}</code>
                  </td>
                </tr>
                <tr>
                  <td class="font-weight-medium">Authentication Enabled</td>
                  <td>
                    <v-chip
                      :color="appConfig.enabledAuthentication ? 'success' : 'warning'"
                      size="small"
                      variant="flat">
                      {{ appConfig.enabledAuthentication ? 'Yes' : 'No' }}
                    </v-chip>
                  </td>
                </tr>
                <template v-if="appConfig.enabledAuthentication">
                  <tr>
                    <td class="font-weight-medium">IdP Authority</td>
                    <td>
                      <code>{{ appConfig.idpAuthority || '(not set)' }}</code>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">IdP Client ID</td>
                    <td>
                      <code>{{ appConfig.idpClientId || '(not set)' }}</code>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">IdP Scope</td>
                    <td>
                      <code>{{ appConfig.idpScope || '(not set)' }}</code>
                    </td>
                  </tr>
                  <tr v-if="appConfig.idpResource">
                    <td class="font-weight-medium">IdP Resource</td>
                    <td>
                      <code>{{ appConfig.idpResource }}</code>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">IdP Token Type</td>
                    <td>
                      <code>{{ appConfig.idpTokenType || 'access_token' }}</code>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">IdP Redirect Path</td>
                    <td>
                      <code>{{ appConfig.idpRedirectPath || '(not set)' }}</code>
                    </td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">IdP Logout Redirect Path</td>
                    <td>
                      <code>{{ appConfig.idpLogoutRedirectPath || '(not set)' }}</code>
                    </td>
                  </tr>
                </template>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { onMounted, ref, inject } from 'vue';

const functions = inject<any>('functions');
const appConfig = inject<any>('appConfig', {});
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
    try {
      projectInfo.value = await functions.getServerInfo();
    } catch {
      // Server info may fail if unauthenticated or server is down — that's OK,
      // the UI Configuration section still renders.
    }
  }
});
</script>
