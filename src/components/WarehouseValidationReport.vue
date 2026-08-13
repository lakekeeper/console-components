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
}>();

defineEmits<{ (e: 'close'): void }>();

// Each backend check name is a stable wire identifier (see ValidationCheckName); this
// maps it to the human-readable claim the check makes, for display in the report.
const checkLabels: Record<ValidationCheckName, string> = {
  'profile-well-formed': 'Storage profile is well-formed',
  'profile-compatible': 'Storage profile is compatible with the existing configuration',
  'warehouse-name-valid': 'Warehouse name is valid and unique',
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

// Most severe first. `warning` is not currently emitted by the API
// (ValidationCheckStatus is passed/failed/skipped) but is ranked here so it slots
// in correctly if the backend adds it.
const STATUS_RANK: Record<string, number> = {
  failed: 0,
  warning: 1,
  passed: 2,
  skipped: 3,
};

const checks = computed(() => {
  if (!props.report) return [];
  return props.report.checks.map((check) => {
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
    };
  });
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
