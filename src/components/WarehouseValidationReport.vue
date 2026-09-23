<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2" :color="overallColor">{{ overallIcon }}</v-icon>
      Storage Validation
      <v-spacer></v-spacer>
      <v-chip v-if="report" :color="overallColor" size="small" variant="flat">
        {{ report.valid ? 'Valid' : 'Invalid' }}
      </v-chip>
    </v-card-title>
    <v-divider></v-divider>
    <v-card-text style="max-height: 60vh; overflow-y: auto">
      <div v-if="loading" class="d-flex flex-column align-center pa-8">
        <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
        <span class="mt-4 text-body-2 text-medium-emphasis">Running validation checks…</span>
      </div>
      <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
        {{ error }}
      </v-alert>
      <template v-else-if="report">
        <v-expansion-panels variant="accordion" flat>
          <v-expansion-panel v-for="check in reportedChecks" :key="check.name">
            <v-expansion-panel-title class="py-2">
              <div class="d-flex align-center flex-grow-1">
                <v-icon :color="check.color" size="small" class="mr-3">{{ check.icon }}</v-icon>
                <div class="flex-grow-1 text-body-2 font-weight-medium">{{ check.label }}</div>
                <v-chip :color="check.color" size="x-small" variant="flat" class="ml-2 mr-2">
                  {{ check.status }}
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text v-if="check.detail">
              <div class="text-body-2 text-medium-emphasis">{{ check.detail }}</div>
              <div v-if="check.showCors" class="mt-3">
                <CorsConfigDialog />
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Skipped checks are not verdicts, so they are collected out of the way
             at the bottom, collapsed by default. -->
        <v-expansion-panels v-if="skippedChecks.length" variant="accordion" flat class="mt-2">
          <v-expansion-panel>
            <v-expansion-panel-title class="py-2">
              <div class="d-flex align-center flex-grow-1">
                <v-icon color="grey" size="small" class="mr-3">mdi-minus-circle-outline</v-icon>
                <div class="flex-grow-1 text-body-2 font-weight-medium text-medium-emphasis">
                  Skipped
                </div>
                <v-chip color="grey" size="x-small" variant="flat" class="ml-2 mr-2">
                  {{ skippedChecks.length }}
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div v-for="check in skippedChecks" :key="check.name" class="mb-3">
                <div class="text-body-2">{{ check.label }}</div>
                <div v-if="check.detail" class="text-caption text-medium-emphasis">
                  {{ check.detail }}
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </template>
      <div v-else class="text-body-2 text-medium-emphasis pa-4">No validation run yet.</div>
    </v-card-text>
    <v-card-actions v-if="!hideClose">
      <v-spacer></v-spacer>
      <v-btn variant="text" @click="$emit('close')">Close</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { helix } from 'ldrs';
import { ValidateWarehouseResponse, ValidationCheckName } from '@/gen/management/types.gen';
import type { BrowserStorageCheck } from '@/common/browserStorageReachability';
import CorsConfigDialog from './CorsConfigDialog.vue';

// Registers the <l-helix> custom element. Idempotent (no-ops if another
// component, e.g. WarehouseManager, already registered it) — don't rely on
// load order between components that both use <l-helix>.
helix.register();

const props = defineProps<{
  report: ValidateWarehouseResponse | null;
  loading: boolean;
  error?: string | null;
  /** Rendered as a pane rather than a dialog: there is nothing to close. */
  hideClose?: boolean;
  /**
   * The client-side browser-reachability verdict, when the caller ran one. It is
   * not part of `report`: the API cannot produce it (CORS is decided in the
   * browser, against this console's origin), so it arrives separately and is
   * merged in for display only — see `browserStorageReachability`.
   */
  browserCheck?: BrowserStorageCheck | null;
  /** The browser probe is still running; it outlives the API call. */
  browserCheckLoading?: boolean;
}>();

defineEmits<{ (e: 'close'): void }>();

// Each backend check name is a stable wire identifier (see ValidationCheckName); this
// maps it to the human-readable claim the check makes, for display in the report.
const checkLabels: Record<ValidationCheckName, string> = {
  'profile-well-formed': 'Storage profile is well-formed',
  'profile-compatible': 'Storage profile is compatible with the existing configuration',
  'warehouse-name-valid': 'Warehouse name is valid and unique',
  // Advisory only: the check looks at the caller's own project, while warehouse
  // IDs are unique instance-wide, so create can still refuse one it cleared.
  'warehouse-id-available': 'Requested warehouse ID is not already taken',
  'location-exclusive': 'Storage location is not used by another warehouse',
  'spec-mutable': 'Requested spec change is allowed',
  'format-version-policy-consistent': 'Format-version policy is consistent',
  'managed-by-allowed': 'Managed-by setting is allowed',
  'storage-client-initialized': 'Storage client can be initialized',
  'lakekeeper-read-write': 'Lakekeeper can read and write to storage',
  'vended-credentials-issued': 'Vended credentials can be issued',
  'vended-credentials-read-write': 'Vended credentials can read and write to storage',
  'vended-credentials-scope-enforced': 'Vended credentials are scoped to the table location',
  cleanup: 'Test artifacts were cleaned up',
};

/**
 * Not a `ValidationCheckName`: the wire enum is the API's, and this check is the
 * console's own. Worded as the same kind of claim so it reads as one report.
 */
const BROWSER_CHECK_LABEL = 'Storage is reachable from this browser';

function statusColor(status: string): string {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'warning') return 'warning';
  return 'grey';
}

function statusIcon(status: string): string {
  if (status === 'passed') return 'mdi-check-circle';
  if (status === 'failed') return 'mdi-close-circle';
  if (status === 'warning') return 'mdi-alert-circle';
  return 'mdi-minus-circle-outline';
}

// Most severe first. The API emits only passed/failed/skipped; `warning` and
// `running` come from the client-side browser check merged in below, and are
// ranked here so both slot in correctly — `running` sits with the unresolved
// rather than below the passes, so a probe still in flight stays visible.
const STATUS_RANK: Record<string, number> = {
  failed: 0,
  warning: 1,
  running: 2,
  passed: 3,
  skipped: 4,
};

/**
 * The browser check never reports `failed`, so it cannot make a report invalid —
 * `overallColor` and the header chip stay driven purely by `report.valid`. A
 * warehouse that no browser can read is still a correct warehouse.
 */
const browserCheckRow = computed(() => {
  if (props.browserCheckLoading) {
    return {
      name: 'browser-storage-reachable',
      label: BROWSER_CHECK_LABEL,
      status: 'running',
      color: 'grey',
      icon: 'mdi-timer-sand',
      detail: 'Contacting the storage endpoint from this browser…',
      showCors: false,
    };
  }
  const check = props.browserCheck;
  if (!check) return null;
  const detailParts: string[] = [];
  if (check.durationMs != null) detailParts.push(`Duration: ${check.durationMs}ms`);
  return {
    name: 'browser-storage-reachable',
    label: BROWSER_CHECK_LABEL,
    status: check.status,
    color: statusColor(check.status),
    icon: statusIcon(check.status),
    detail: [check.detail, ...detailParts].join(' · '),
    // The bucket's CORS rule is a credible cause, so the snippet that fixes it
    // belongs in the row. Withheld for every verdict that proves the request
    // never reached the storage — a blocked port is not fixed by a CORS rule.
    showCors: check.corsLikely,
  };
});

const checks = computed(() => {
  if (!props.report) return [];
  const backend = props.report.checks.map((check) => {
    const detailParts: string[] = [];
    if (check['duration-ms'] != null) detailParts.push(`Duration: ${check['duration-ms']}ms`);
    if (check.status === 'skipped' && check.reason) detailParts.push(`Skipped: ${check.reason}`);
    if (check.status === 'failed' && check.error) detailParts.push(check.error.message);
    return {
      name: check.name,
      label: checkLabels[check.name] ?? check.name,
      status: check.status,
      color: statusColor(check.status),
      icon: statusIcon(check.status),
      detail: detailParts.join(' · '),
      showCors: false,
    };
  });
  const browser = browserCheckRow.value;
  return browser ? [...backend, browser] : backend;
});

// Most severe first (failed → warning → passed); sort is stable, so checks of the
// same status keep their execution order. Skipped are pulled out into their own
// collapsed group at the bottom of the report.
const reportedChecks = computed(() =>
  checks.value
    .filter((c) => c.status !== 'skipped')
    .sort((a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)),
);
const skippedChecks = computed(() => checks.value.filter((c) => c.status === 'skipped'));

const overallColor = computed(() => {
  if (props.error) return 'error';
  if (!props.report) return 'grey';
  return props.report.valid ? 'success' : 'error';
});

const overallIcon = computed(() => {
  if (props.error) return 'mdi-shield-alert-outline';
  if (!props.report) return 'mdi-shield-search';
  return props.report.valid ? 'mdi-shield-check-outline' : 'mdi-shield-alert-outline';
});
</script>
