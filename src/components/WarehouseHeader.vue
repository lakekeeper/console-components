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

    <template #chips>
      <!-- In place of the chips a refused read cannot fill: without it the row
           would describe an active, unprotected warehouse. -->
      <span v-if="readError" class="text-caption text-medium-emphasis">
        <v-icon size="12">mdi-lock-outline</v-icon>
        {{ readError }}
      </span>
    </template>

    <template #actions>
      <!-- Settings edits what was read; with nothing read there is nothing to
           show or change, unless the app adds maintenance entries of its own. -->
      <WarehouseActionsMenu
        v-if="!readError || slots.maintenance"
        :process-status="processStatus"
        :readable="!readError"
        :save-errors="saveErrors"
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
import { ref, reactive, watch, onMounted, computed, inject, useSlots } from 'vue';
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
import { isForbiddenError, logError } from '@/common/errorUtils';
import { tagRefusal } from '@/composables/useTagRights';

const props = defineProps<{
  warehouseId: string;
}>();

const slots = useSlots();
const functions = useFunctions();
const visual = useVisualStore();
const appConfig = inject<{ baseUrlPrefix?: string }>('appConfig', {});
const loqe = useLoQE({ baseUrlPrefix: appConfig.baseUrlPrefix ?? '' });
const processStatus = ref('starting');
// Why the configuration is not shown, when it is not.
const readError = ref('');
// Save refusals, handed to the settings dialog so each is said beside the pane
// it came from rather than as a snackbar at the edge of the screen.
const saveErrors = reactive({ name: '', settings: '', storage: '' });

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

// The route's id when nothing was read: it is the one being asked about.
const warehouseUuid = computed(() =>
  readError.value ? props.warehouseId : warehouse['warehouse-id'] || warehouse.id || '',
);

// Only the facts that change how the warehouse behaves. A chip per field would
// turn the identity row into the overview tab it sits above.
const chips = computed<IdentityChip[]>(() => {
  const out: IdentityChip[] = [];
  // Nothing was read, so the defaults would only invent facts.
  if (readError.value) return out;
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
    // Silent: the details tab asks for the same warehouse, and each says a
    // refusal in place.
    const whResponse = await functions.getWarehouse(props.warehouseId, false);
    if (whResponse) {
      Object.assign(warehouse, whResponse);
      visual.wahrehouseName = whResponse.name;
      visual.whId = whResponse.id;
      readError.value = '';
    }
  } catch (error) {
    if (!isForbiddenError(error)) {
      readError.value = tagRefusal(error, "read this warehouse's configuration");
      return;
    }
    readError.value = "You are not allowed to read this warehouse's configuration.";
    // Listing a warehouse is a separate right from reading it: the listing that
    // brought the reader here still names it. Asked every time, so a previously
    // shown warehouse's name does not linger on this one.
    try {
      const listed = (await functions.listWarehouses(false))?.warehouses?.find(
        (w: any) => (w['warehouse-id'] ?? w.id) === props.warehouseId,
      );
      warehouse.name = listed?.name ?? '';
    } catch (e) {
      warehouse.name = '';
      logError('WarehouseHeader.loadWarehouse.list', e);
    }
  }
}

async function renameWarehouse(name: string) {
  const previousName = warehouse.name;
  saveErrors.name = '';
  try {
    // Errors silent: the dialog shows them under the name field.
    await functions.renameWarehouse(props.warehouseId, name, false);
    // The wrapper confirms only when notifying, which would also snackbar a refusal.
    visual.setSnackbarMsg({
      function: 'renameWarehouse',
      text: `Warehouse renamed to '${name}'`,
      ttl: 3000,
      ts: Date.now(),
      type: Type.SUCCESS,
    });
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
    saveErrors.name = tagRefusal(error, 'rename this warehouse');
  }
}

async function updateCredentials(credentials: StorageCredential) {
  processStatus.value = 'running';
  saveErrors.storage = '';
  try {
    await functions.updateStorageCredential(props.warehouseId, credentials, true);
    // Reload before reporting success: the settings dialog re-seeds its panes from
    // `warehouse` when it sees 'success', and would otherwise re-read stale values.
    await loadWarehouse();
    processStatus.value = 'success';
  } catch (error) {
    processStatus.value = 'error';
    saveErrors.storage = tagRefusal(error, 'update the storage credentials');
  }
}

async function updateProfile(newProfile: {
  profile: StorageProfile;
  // Omitted when the user changed only the profile: the endpoint then keeps the
  // credential already stored, and sending an empty one would be rejected.
  credentials?: StorageCredential;
}) {
  processStatus.value = 'running';
  saveErrors.storage = '';
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
    saveErrors.storage = tagRefusal(error, 'update the storage profile');
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
  saveErrors.settings = '';
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
    labels.push('managed-by setting');
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

  // Said in the settings pane, one sentence per part that did not land; the
  // parts that did are already reloaded above.
  saveErrors.settings = failures
    .map((f) => tagRefusal((f.r as PromiseRejectedResult).reason, `change the ${f.label}`))
    .join(' ');
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
