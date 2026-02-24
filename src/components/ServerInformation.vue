<template>
  <v-card class="ml-2 mb-4">
    <v-list-item class="mb-12" two-line>
      <div class="text-overline mb-4">Server Information</div>
      <v-list-item-title class="text-h7 mb-1">
        Server ID: {{ projectInfo['server-id'] }}
      </v-list-item-title>
      <v-list-item-subtitle>
        <div>Server Version: {{ projectInfo.version }}</div>
        <div>Bootstraped: {{ projectInfo.bootstrapped }}</div>
        <div>Authenticated by: {{ projectInfo['authz-backend'] }}</div>
        <div v-if="projectInfo['aws-system-identities-enabled']">
          AWS system identities:
          {{ projectInfo['aws-system-identities-enabled'] ? 'enabled' : 'disabled' }}
        </div>

        <div v-if="projectInfo['azure-system-identities-enabled']">
          Azure system identities:
          {{ projectInfo['azure-system-identities-enabled'] ? 'enabled' : 'disabled' }}
        </div>
        <div v-if="projectInfo['gcp-system-identities-enabled']">
          GCP system identities:
          {{ projectInfo['gcp-system-identities-enabled'] ? 'enabled' : 'disabled' }}
        </div>
        <div
          v-if="
            !projectInfo['aws-system-identities-enabled'] &&
            !projectInfo['azure-system-identities-enabled'] &&
            !projectInfo['gcp-system-identities-enabled']
          ">
          No system identities are used
        </div>
      </v-list-item-subtitle>
    </v-list-item>
  </v-card>

  <!-- UI Configuration — always rendered, no auth or server needed -->
  <v-card class="ml-2">
    <v-card-title class="d-flex align-center">
      <v-icon color="primary" class="mr-2">mdi-cog-outline</v-icon>
      UI Configuration
    </v-card-title>
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
</template>

<script lang="ts" setup>
import { inject, onMounted, ref } from 'vue';
import { useFunctions } from '@/plugins/functions';

const functions = useFunctions();
const projectInfo = ref<any>({});
const appConfig = inject<any>('appConfig', {});

onMounted(async () => {
  try {
    projectInfo.value = await functions.getServerInfo();
  } catch {
    // Server info may fail if unauthenticated or server is down — that's OK,
    // the UI Configuration section still renders.
  }
});
</script>
