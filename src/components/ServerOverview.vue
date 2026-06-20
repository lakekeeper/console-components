<template>
  <v-container fluid class="pa-4" style="max-height: calc(100vh - 200px); overflow-y: auto">
    <!-- Export bundle (available in both OSS and Enterprise editions) -->
    <div class="d-flex justify-end ga-2 mb-3">
      <v-btn
        prepend-icon="mdi-table-arrow-down"
        variant="tonal"
        size="small"
        @click="usageDatumDialog = true">
        Usage Statistics
      </v-btn>
      <v-btn
        prepend-icon="mdi-export-variant"
        variant="tonal"
        color="primary"
        size="small"
        @click="exportDialog = true">
        {{ isEnterpriseConsole ? 'Export for Support' : 'Export for GitHub' }}
      </v-btn>
    </div>

    <SupportBundleDialog v-model="exportDialog" />
    <UsageDatumDialog v-model="usageDatumDialog" />

    <!-- Server Information + Console side by side -->
    <v-row class="mb-4">
      <v-col cols="12" :md="projectInfo.console ? 6 : 12">
        <v-card elevation="1" class="fill-height">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="primary">mdi-server</v-icon>
              Server Information
            </v-toolbar-title>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 220px">Server ID</td>
                <td>
                  {{ projectInfo['server-id'] || 'N/A' }}
                  <v-btn
                    v-if="projectInfo['server-id']"
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(projectInfo['server-id'])"></v-btn>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Lakekeeper Version</td>
                <td>
                  {{ projectInfo['lakekeeper-version'] || 'N/A' }}
                  <template v-if="projectInfo['lakekeeper-commit-sha']">
                    <v-tooltip :text="projectInfo['lakekeeper-commit-sha']" location="top">
                      <template #activator="{ props }">
                        <code v-bind="props" class="ml-2">
                          {{ shortSha(projectInfo['lakekeeper-commit-sha']) }}
                        </code>
                      </template>
                    </v-tooltip>
                    <v-btn
                      icon="mdi-content-copy"
                      size="x-small"
                      variant="text"
                      @click="copyToClipboard(projectInfo['lakekeeper-commit-sha']!)"></v-btn>
                  </template>
                </td>
              </tr>
              <tr v-if="isEnterpriseConsole && projectInfo['lakekeeper-enterprise-version']">
                <td class="font-weight-medium">Enterprise Version</td>
                <td>
                  {{ projectInfo['lakekeeper-enterprise-version'] || 'N/A' }}
                  <template v-if="projectInfo['lakekeeper-enterprise-commit-sha']">
                    <v-tooltip
                      :text="projectInfo['lakekeeper-enterprise-commit-sha']"
                      location="top">
                      <template #activator="{ props }">
                        <code v-bind="props" class="ml-2">
                          {{ shortSha(projectInfo['lakekeeper-enterprise-commit-sha']) }}
                        </code>
                      </template>
                    </v-tooltip>
                    <v-btn
                      icon="mdi-content-copy"
                      size="x-small"
                      variant="text"
                      @click="
                        copyToClipboard(projectInfo['lakekeeper-enterprise-commit-sha']!)
                      "></v-btn>
                  </template>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Bootstrap Status</td>
                <td>
                  <v-chip
                    :color="projectInfo.bootstrapped ? 'success' : 'warning'"
                    size="small"
                    variant="flat">
                    <v-icon start>
                      {{ projectInfo.bootstrapped ? 'mdi-check' : 'mdi-alert' }}
                    </v-icon>
                    {{ projectInfo.bootstrapped ? 'Bootstrapped' : 'Not Bootstrapped' }}
                  </v-chip>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Default Project ID</td>
                <td>
                  {{ projectInfo['default-project-id'] || 'N/A' }}
                  <v-btn
                    v-if="projectInfo['default-project-id']"
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(projectInfo['default-project-id'])"></v-btn>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Authorization Backend</td>
                <td>
                  <v-chip size="small" color="info">
                    {{ projectInfo['authz-backend'] || 'N/A' }}
                  </v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <!-- Console -->
      <v-col v-if="projectInfo.console" cols="12" md="6">
        <v-card elevation="1" class="fill-height">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="primary">mdi-monitor-dashboard</v-icon>
              Console
            </v-toolbar-title>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 220px">Edition</td>
                <td>
                  <v-chip size="small" color="info">{{ projectInfo.console.edition }}</v-chip>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">Version</td>
                <td>{{ projectInfo.console.version || 'N/A' }}</td>
              </tr>
              <tr v-if="projectInfo.console['commit-sha']">
                <td class="font-weight-medium">Commit SHA</td>
                <td>
                  <v-tooltip :text="projectInfo.console['commit-sha']" location="top">
                    <template #activator="{ props }">
                      <code v-bind="props">{{ shortSha(projectInfo.console['commit-sha']) }}</code>
                    </template>
                  </v-tooltip>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(projectInfo.console['commit-sha']!)"></v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- License & Cloud Identities side by side -->
    <v-row class="mb-4">
      <v-col cols="12" md="6">
        <v-card elevation="1" class="fill-height">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="success">mdi-license</v-icon>
              License
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip
              v-if="projectInfo['license-status']"
              :color="projectInfo['license-status']['valid'] ? 'success' : 'error'"
              size="small"
              variant="outlined"
              class="mr-2">
              {{ projectInfo['license-status']['valid'] ? 'Valid' : 'Invalid' }}
            </v-chip>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table v-if="projectInfo['license-status']" density="compact">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 160px">Type</td>
                <td>
                  <v-chip
                    :color="getLicenseTypeColor(projectInfo['license-status']['license-type'])"
                    size="small">
                    {{ projectInfo['license-status']['license-type'] || 'N/A' }}
                  </v-chip>
                </td>
              </tr>
              <tr v-if="projectInfo['license-status']['license-id']">
                <td class="font-weight-medium">License ID</td>
                <td>
                  <span
                    class="text-truncate d-inline-block"
                    style="max-width: 200px; vertical-align: middle">
                    {{ projectInfo['license-status']['license-id'] }}
                  </span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    @click="copyToClipboard(projectInfo['license-status']['license-id'])"></v-btn>
                </td>
              </tr>
              <tr v-if="projectInfo['license-status']['customer']">
                <td class="font-weight-medium">Customer</td>
                <td>{{ projectInfo['license-status']['customer'] }}</td>
              </tr>
              <tr v-if="projectInfo['license-status']['issuer']">
                <td class="font-weight-medium">Issuer</td>
                <td>{{ projectInfo['license-status']['issuer'] }}</td>
              </tr>
              <tr>
                <td class="font-weight-medium">Expiration</td>
                <td>
                  <template v-if="projectInfo['license-status']['expiration']">
                    <v-chip
                      :color="getExpirationColor(projectInfo['license-status']['expiration'])"
                      size="small">
                      {{ formatDate(projectInfo['license-status']['expiration']) }}
                    </v-chip>
                  </template>
                  <v-chip v-else size="small" color="success">Perpetual</v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-card-text v-else>
            <v-alert type="info" variant="tonal" density="compact">
              No license information available
            </v-alert>
          </v-card-text>
          <v-alert
            v-if="projectInfo['license-status']?.['error']"
            type="error"
            variant="tonal"
            density="compact"
            class="ma-3">
            {{ projectInfo['license-status']['error'] }}
          </v-alert>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card elevation="1" class="fill-height">
          <v-toolbar color="transparent" density="compact" flat>
            <v-toolbar-title class="text-subtitle-1">
              <v-icon class="mr-2" color="info">mdi-cloud-lock</v-icon>
              Cloud Identities
            </v-toolbar-title>
          </v-toolbar>
          <v-divider></v-divider>
          <v-table density="compact">
            <tbody>
              <tr>
                <td class="font-weight-medium" style="width: 160px">
                  <v-icon class="mr-1" size="small">mdi-aws</v-icon>
                  AWS
                </td>
                <td>
                  <v-chip
                    :color="projectInfo['aws-system-identities-enabled'] ? 'success' : 'grey'"
                    size="small"
                    variant="flat">
                    {{ projectInfo['aws-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
                  </v-chip>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">
                  <v-icon class="mr-1" size="small">mdi-microsoft-azure</v-icon>
                  Azure
                </td>
                <td>
                  <v-chip
                    :color="projectInfo['azure-system-identities-enabled'] ? 'success' : 'grey'"
                    size="small"
                    variant="flat">
                    {{ projectInfo['azure-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
                  </v-chip>
                </td>
              </tr>
              <tr>
                <td class="font-weight-medium">
                  <v-icon class="mr-1" size="small">mdi-google-cloud</v-icon>
                  GCP
                </td>
                <td>
                  <v-chip
                    :color="projectInfo['gcp-system-identities-enabled'] ? 'success' : 'grey'"
                    size="small"
                    variant="flat">
                    {{ projectInfo['gcp-system-identities-enabled'] ? 'Enabled' : 'Disabled' }}
                  </v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- Queues (only if any exist) -->
    <v-card v-if="projectInfo.queues && projectInfo.queues.length > 0" class="mb-4" elevation="1">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="warning">mdi-format-list-checks</v-icon>
          Active Queues
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-chip size="small" color="warning" variant="outlined" class="mr-2">
          {{ projectInfo.queues.length }}
        </v-chip>
      </v-toolbar>
      <v-divider></v-divider>
      <v-card-text class="py-2">
        <v-chip
          v-for="(queue, index) in projectInfo.queues"
          :key="index"
          size="small"
          variant="outlined"
          class="mr-2 mb-1">
          {{ queue }}
        </v-chip>
      </v-card-text>
    </v-card>

    <!-- UI Configuration -->
    <v-card elevation="1">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
          UI Configuration
        </v-toolbar-title>
      </v-toolbar>
      <v-divider></v-divider>
      <v-table density="compact">
        <tbody>
          <tr>
            <td class="font-weight-medium" style="width: 220px">Lakekeeper URL</td>
            <td>
              <code>
                {{ functions ? functions.icebergCatalogUrl() : '(auto-detected from browser)' }}
              </code>
              <v-btn
                v-if="functions"
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                @click="copyToClipboard(functions.icebergCatalogUrl())"></v-btn>
            </td>
          </tr>
          <tr>
            <td class="font-weight-medium">Catalog URL</td>
            <td>
              <code>
                {{ functions ? functions.icebergCatalogUrlSuffixed() : '(not available)' }}
              </code>
              <v-btn
                v-if="functions"
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                @click="copyToClipboard(functions.icebergCatalogUrlSuffixed())"></v-btn>
            </td>
          </tr>
          <tr>
            <td class="font-weight-medium">Base URL Prefix</td>
            <td>
              <code>{{ appConfig.baseUrlPrefix || '(none)' }}</code>
            </td>
          </tr>
          <tr v-if="appConfig.enabledUserSurveys !== undefined">
            <td class="font-weight-medium">User Surveys</td>
            <td>
              <v-chip
                :color="appConfig.enabledUserSurveys ? 'success' : 'grey'"
                size="small"
                variant="flat">
                {{ appConfig.enabledUserSurveys ? 'Enabled' : 'Disabled' }}
              </v-chip>
            </td>
          </tr>
          <tr>
            <td class="font-weight-medium">Authentication</td>
            <td>
              <v-chip
                :color="appConfig.enabledAuthentication ? 'success' : 'warning'"
                size="small"
                variant="flat">
                {{ appConfig.enabledAuthentication ? 'Enabled' : 'Disabled' }}
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
              <td class="font-weight-medium">IdP Logout Redirect</td>
              <td>
                <code>{{ appConfig.idpLogoutRedirectPath || '(not set)' }}</code>
              </td>
            </tr>
          </template>
        </tbody>
      </v-table>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed, inject } from 'vue';
import type { ServerInfo } from '@/gen/management/types.gen';
import SupportBundleDialog from './SupportBundleDialog.vue';
import UsageDatumDialog from './UsageDatumDialog.vue';

const functions = inject<any>('functions');
const appConfig = inject<any>('appConfig', {});
const projectInfo = ref<Partial<ServerInfo>>({});

const isEnterpriseConsole = computed(() => appConfig?.edition === 'enterprise');

const exportDialog = ref(false);
const usageDatumDialog = ref(false);

async function copyToClipboard(text: string) {
  if (functions?.copyToClipboard) {
    await functions.copyToClipboard(text);
  }
}

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '';
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
