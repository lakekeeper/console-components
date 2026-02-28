<template>
  <v-dialog v-model="dialogVisible" max-width="620">
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        size="x-small"
        variant="outlined"
        color="warning"
        prepend-icon="mdi-cog-outline">
        Configure CORS
      </v-btn>
    </template>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="warning">mdi-shield-lock-outline</v-icon>
        CORS Configuration
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="text-body-2">
        <p class="mb-3">
          To allow DuckDB in the browser to read Iceberg metadata files directly from
          object storage, the storage bucket must have a CORS policy that permits
          requests from your console origin.
        </p>
        <p class="mb-3 font-weight-medium">
          Add this CORS configuration to your bucket (S3 / GCS / MinIO / R2):
        </p>
        <div class="position-relative">
          <vue-json-pretty
            :data="corsConfigData"
            :deep="3"
            :theme="jsonTheme"
            :showLineNumber="false"
            :virtual="false" />
          <v-btn
            :icon="copied ? 'mdi-check' : 'mdi-content-copy'"
            :color="copied ? 'success' : 'default'"
            size="x-small"
            variant="text"
            style="position: absolute; top: 4px; right: 4px;"
            @click="copyConfig"></v-btn>
        </div>
        <v-table density="compact" class="mt-3">
          <thead>
            <tr>
              <th>Field</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>AllowedOrigins</code></td>
              <td>Your console origin — where the browser request comes from</td>
            </tr>
            <tr>
              <td><code>GET, HEAD</code></td>
              <td>Read manifest &amp; metadata files (no writes needed)</td>
            </tr>
            <tr>
              <td><code>Range</code></td>
              <td>DuckDB uses byte-range requests to read Parquet/Avro chunks</td>
            </tr>
            <tr>
              <td><code>Authorization</code></td>
              <td>Pass vended credentials (SigV4 / bearer token)</td>
            </tr>
            <tr>
              <td><code>ExposeHeaders</code></td>
              <td>Let the browser read Content-Length, ETag etc. from responses</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogVisible = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="showSnackbar" :timeout="2000" color="success" location="bottom">
    <v-icon class="mr-2">mdi-check-circle</v-icon>
    CORS configuration copied to clipboard
  </v-snackbar>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useVisualStore } from '../stores/visual';

const visual = useVisualStore();

const dialogVisible = ref(false);
const copied = ref(false);
const showSnackbar = ref(false);

const jsonTheme = computed(() => (visual.themeLight ? 'light' : 'dark'));

const corsConfigData = computed(() => {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://your-console.example.com';
  return [
    {
      AllowedOrigins: [origin],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['Range', 'Authorization', 'Content-Type'],
      ExposeHeaders: ['Content-Length', 'Content-Range', 'ETag', 'x-amz-request-id'],
      MaxAgeSeconds: 3600,
    },
  ];
});

const corsConfigJson = computed(() => JSON.stringify(corsConfigData.value, null, 2));

function copyConfig() {
  navigator.clipboard.writeText(corsConfigJson.value).then(() => {
    copied.value = true;
    showSnackbar.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>
