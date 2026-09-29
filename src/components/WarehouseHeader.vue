<template>
  <EntityIdentityRow
    collapsible
    :name="warehouse.name"
    :id="warehouseUuid"
    id-label="Warehouse ID"
    :chips="chips">
    <template #icon>
      <component :is="storageIcon" v-if="storageIcon" />
      <v-icon v-else color="secondary" size="20">mdi-database</v-icon>
    </template>

    <template #actions>
      <WarehouseActionsMenu
        :process-status="processStatus"
        :warehouse="warehouse"
        @close="processStatus = 'starting'"
        @rename-warehouse="renameWarehouse"
        @update-credentials="updateCredentials"
        @update-catalog-settings="updateCatalogSettings"
        @update-profile="updateProfile">
        <template #maintenance="slotProps">
          <slot name="maintenance" v-bind="slotProps"></slot>
        </template>
      </WarehouseActionsMenu>
    </template>
  </EntityIdentityRow>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed, inject } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';
import { useLoQE } from '@/composables/useLoQE';
import { storageProviderIcon } from '@/common/storageIcon';
import type { IdentityChip } from '@/common/interfaces';
import EntityIdentityRow from './EntityIdentityRow.vue';
import type {
  GetWarehouseResponse,
  ManagedBy,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
} from '@/gen/management/types.gen';
import { Type } from '@/common/enums';
import { logError } from '@/common/errorUtils';

const props = defineProps<{
  warehouseId: string;
}>();

const functions = useFunctions();
const visual = useVisualStore();
const appConfig = inject<{ baseUrlPrefix?: string }>('appConfig', {});
const loqe = useLoQE({ baseUrlPrefix: appConfig.baseUrlPrefix ?? '' });
const notify = true;
const processStatus = ref('starting');

const warehouse = reactive<GetWarehouseResponse>({
  'delete-profile': { type: 'hard' },
  id: '',
  'warehouse-id': '',
  name: '',
  'project-id': '',
  status: 'active',
  'storage-profile': {
    type: 's3',
    bucket: '',
    'key-prefix': '',
    'assume-role-arn': '',
    endpoint: '',
    region: '',
    'path-style-access': null,
    'sts-role-arn': '',
    'sts-enabled': false,
    flavor: undefined,
  },
  protected: false,
  'allowed-format-versions': [1, 2, 3],
});

// Provider icon (AWS / Azure / GCS / OneLake / …) shown next to the name.
const storageIcon = computed(() => storageProviderIcon(warehouse, visual.themeLight));

const warehouseUuid = computed(() => warehouse['warehouse-id'] || warehouse.id || '');

// Only the facts that change how the warehouse behaves. A chip per field would
// turn the identity row into the overview tab it sits above.
const chips = computed<IdentityChip[]>(() => {
  const out: IdentityChip[] = [];
  if (warehouse.status && warehouse.status !== 'active') {
    out.push({
      text: warehouse.status,
      icon: 'mdi-pause-circle-outline',
      color: 'warning',
      tooltip: 'Warehouse status',
    });
  }
  if (warehouse.protected) {
    out.push({
      text: 'protected',
      icon: 'mdi-lock-outline',
      color: 'info',
      tooltip: 'Deletion protection is on',
    });
  }
  const managedBy = warehouse['managed-by'];
  if (managedBy && managedBy !== 'self-managed') {
    out.push({
      text: managedBy,
      icon: 'mdi-shield-account-outline',
      color: 'secondary',
      tooltip: 'Spec mutations are restricted to this control plane',
    });
  }
  return out;
});

async function loadWarehouse() {
  try {
    const whResponse = await functions.getWarehouse(props.warehouseId);
    if (whResponse) {
      Object.assign(warehouse, whResponse);
      visual.wahrehouseName = whResponse.name;
      visual.whId = whResponse.id;
    }
  } catch (error) {
    logError('WarehouseHeader.loadWarehouse', error);
  }
}

async function renameWarehouse(name: string) {
  const previousName = warehouse.name;
  try {
    await functions.renameWarehouse(props.warehouseId, name, notify);
    await loadWarehouse();
    visual.refreshWarehouseList();
    if (previousName && previousName !== name) {
      // DuckDB ATTACHes catalogs by warehouse name; detach the stale
      // entry (and its persisted Pinia record) so it isn't re-attached
      // alongside the renamed catalog on the next preview/reload.
      // Best-effort: the rename itself already succeeded (and the
      // success snackbar fired), and a stale ATTACH at worst causes
      // one extra /catalog/v1/config request until next reload —
      // not worth bugging the user with a follow-up error snackbar.
      try {
        await loqe.detachCatalog(previousName);
      } catch (e) {
        logError(`WarehouseHeader.renameWarehouse.detach(${previousName})`, e);
      }
    }
  } catch (error) {
    console.error('Failed to rename warehouse:', error);
  }
}

async function updateCredentials(credentials: StorageCredential) {
  processStatus.value = 'running';
  try {
    await functions.updateStorageCredential(props.warehouseId, credentials, true);
    // Reload before reporting success: the settings dialog re-seeds its panes from
    // `warehouse` when it sees 'success', and would otherwise re-read stale values.
    await loadWarehouse();
    processStatus.value = 'success';
  } catch (error) {
    processStatus.value = 'error';
    console.error('Failed to update credentials:', error);
  }
}

async function updateProfile(newProfile: {
  profile: StorageProfile;
  // Omitted when the user changed only the profile: the endpoint then keeps the
  // credential already stored, and sending an empty one would be rejected.
  credentials?: StorageCredential;
}) {
  processStatus.value = 'running';
  try {
    await functions.updateStorageProfile(
      props.warehouseId,
      newProfile.credentials as StorageCredential,
      newProfile.profile,
      true,
    );
    await loadWarehouse();
    processStatus.value = 'success';
  } catch (error) {
    processStatus.value = 'error';
    console.error('Failed to update storage profile:', error);
  }
}

async function updateCatalogSettings(payload: {
  deleteProfile?: TabularDeleteProfile;
  formatPolicy?: { allowed: number[]; default: number };
  managedBy?: ManagedBy;
  protected?: boolean;
  active?: boolean;
}) {
  // Each part is independent: with Promise.all, a single rejection would skip
  // the loadWarehouse() reconciliation and leave the UI inconsistent with what
  // actually persisted. allSettled lets us report exact failures and always
  // refresh.
  const calls: Promise<unknown>[] = [];
  const labels: string[] = [];
  if (payload.deleteProfile) {
    calls.push(
      functions.updateWarehouseDeleteProfile(props.warehouseId, payload.deleteProfile, false),
    );
    labels.push('deletion profile');
  }
  if (payload.formatPolicy) {
    calls.push(
      functions.setWarehouseFormatVersionPolicy(
        props.warehouseId,
        payload.formatPolicy.allowed,
        payload.formatPolicy.default,
        false,
      ),
    );
    labels.push('format-version policy');
  }
  if (payload.managedBy !== undefined) {
    calls.push(functions.setWarehouseManagedBy(props.warehouseId, payload.managedBy, false));
    labels.push('managed-by');
  }
  if (payload.protected !== undefined) {
    calls.push(functions.setWarehouseProtection(props.warehouseId, payload.protected, false));
    labels.push('deletion protection');
  }
  if (payload.active !== undefined) {
    calls.push(
      payload.active
        ? functions.activateWarehouse(props.warehouseId, false)
        : functions.deactivateWarehouse(props.warehouseId, false),
    );
    labels.push('status');
  }

  const results = await Promise.allSettled(calls);
  const failures = results
    .map((r, i) => ({ r, label: labels[i] }))
    .filter((x) => x.r.status === 'rejected');

  try {
    await loadWarehouse();
  } catch (error) {
    functions.handleError(error, 'reloading warehouse after catalog settings update', true);
  }

  if (failures.length === 0) {
    visual.setSnackbarMsg({
      function: 'updateCatalogSettings',
      text: 'Warehouse settings updated successfully',
      ttl: 3000,
      ts: Date.now(),
      type: Type.SUCCESS,
    });
    return;
  }

  for (const f of failures) {
    functions.handleError(
      (f.r as PromiseRejectedResult).reason,
      `Failed to update ${f.label}`,
      true,
    );
  }
}

// Load warehouse and statistics on mount and when warehouse ID changes
onMounted(() => {
  loadWarehouse();
});
watch(
  () => props.warehouseId,
  () => {
    loadWarehouse();
  },
);
</script>
