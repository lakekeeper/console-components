<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="800">
    <v-card>
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2" color="primary">mdi-export-variant</v-icon>
          {{ title }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          @click="$emit('update:modelValue', false)"></v-btn>
      </v-toolbar>
      <v-divider></v-divider>
      <v-card-text>
        <p class="text-body-2 mb-3">
          {{ description }}
        </p>
        <v-textarea
          :model-value="supportBundleJson"
          readonly
          variant="outlined"
          density="compact"
          rows="14"
          no-resize
          class="font-mono text-caption"></v-textarea>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn prepend-icon="mdi-content-copy" variant="text" @click="copySupportBundle">
          Copy to Clipboard
        </v-btn>
        <v-btn
          prepend-icon="mdi-download"
          color="primary"
          variant="tonal"
          @click="downloadSupportBundle">
          Download JSON
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { ServerInfo } from '@/gen/management/types.gen';
import { useFunctions } from '@/plugins/functions';

const props = defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const functions = useFunctions();
const appConfig = inject<any>('appConfig', {});

function sanitizedUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = new URL(window.location.href);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

const projectInfo = ref<Partial<ServerInfo>>({});

const isEnterprise = computed(() => appConfig?.edition === 'enterprise');

const title = computed(() => (isEnterprise.value ? 'Support Bundle' : 'GitHub Issue Bundle'));

const description = computed(() =>
  isEnterprise.value
    ? 'Share this bundle when contacting support. It contains server info and UI configuration; no tokens or credentials are included.'
    : 'Attach this bundle when opening a GitHub issue. It contains server info and UI configuration; no tokens or credentials are included.',
);

const supportBundleJson = computed(() =>
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      app: {
        edition: appConfig?.edition ?? 'unknown',
        url: sanitizedUrl(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      serverInfo: projectInfo.value,
      uiConfig: {
        icebergCatalogUrl: appConfig?.icebergCatalogUrl,
        baseUrlPrefix: appConfig?.baseUrlPrefix,
        enabledAuthentication: appConfig?.enabledAuthentication,
        enabledPermissions: appConfig?.enabledPermissions,
        enabledUserSurveys: appConfig?.enabledUserSurveys,
        idpAuthority: appConfig?.idpAuthority,
        idpClientId: appConfig?.idpClientId,
        idpScope: appConfig?.idpScope,
        idpResource: appConfig?.idpResource,
        idpTokenType: appConfig?.idpTokenType,
        idpRedirectPath: appConfig?.idpRedirectPath,
        idpLogoutRedirectPath: appConfig?.idpLogoutRedirectPath,
      },
    },
    null,
    2,
  ),
);

async function loadServerInfo() {
  if (!functions?.getServerInfo) return;
  try {
    projectInfo.value = await functions.getServerInfo();
  } catch (error) {
    functions?.handleError?.(error, 'loading server info', true);
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadServerInfo();
  },
);

async function copySupportBundle() {
  try {
    if (functions?.copyToClipboard) {
      functions.copyToClipboard(supportBundleJson.value);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(supportBundleJson.value);
    }
  } catch (error) {
    functions?.handleError?.(error, 'copySupportBundle', true);
  }
}

function downloadSupportBundle() {
  const blob = new Blob([supportBundleJson.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const serverId = projectInfo.value['server-id'] || 'lakekeeper';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `lakekeeper-support-${serverId}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>
