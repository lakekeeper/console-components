<template>
  <v-list-item class="mb-12" two-line>
    <div class="text-overline mb-4">Server Information</div>
    <v-list-item-title class="text-h7 mb-1">
      Server ID: {{ props.projectInfo['server-id'] }}
    </v-list-item-title>
    <v-list-item-subtitle>
      <div>Server Version: {{ props.projectInfo.version }}</div>
      <div>Bootstraped: {{ props.projectInfo.bootstrapped }}</div>
      <div>Authenticated by: {{ props.projectInfo['authz-backend'] }}</div>
      <div v-if="props.projectInfo['aws-system-identities-enabled']">
        AWS system identities:
        {{ props.projectInfo['aws-system-identities-enabled'] ? 'enabled' : 'disabled' }}
      </div>

      <div v-if="props.projectInfo['azure-system-identities-enabled']">
        Azure system identities:
        {{ props.projectInfo['azure-system-identities-enabled'] ? 'enabled' : 'disabled' }}
      </div>
      <div v-if="props.projectInfo['gcp-system-identities-enabled']">
        GCP system identities:
        {{ props.projectInfo['gcp-system-identities-enabled'] ? 'enabled' : 'disabled' }}
      </div>
      <div
        v-if="
          !props.projectInfo['aws-system-identities-enabled'] &&
          !props.projectInfo['azure-system-identities-enabled'] &&
          !props.projectInfo['gcp-system-identities-enabled']
        ">
        No system identities are used
      </div>
    </v-list-item-subtitle>
  </v-list-item>
</template>
<script lang="ts" setup>
import { ServerInfo } from '../gen/management/types.gen';

const props = defineProps<{
  projectInfo: ServerInfo;
}>();
</script>
