<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="Table actions"></v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <v-list-item
        prepend-icon="mdi-cog-outline"
        :title="`${label[0].toUpperCase()}${label.slice(1)} settings`"
        subtitle="Rename · delete protection"
        @click="openSettings" />
      <v-list-item
        prepend-icon="mdi-download-outline"
        title="Download metadata.json"
        @click="downloadJson" />

      <template v-if="canDrop">
        <v-divider class="my-1"></v-divider>
        <v-list-item
          base-color="error"
          prepend-icon="mdi-delete-outline"
          :title="`Delete ${label}`"
          @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- Table settings: rename + deletion protection -->
  <v-dialog v-model="settingsOpen" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
        {{ label[0].toUpperCase() + label.slice(1) }} Settings
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="settingsOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-text-field
          v-model="nameInput"
          :label="`${label[0].toUpperCase()}${label.slice(1)} name`"
          prepend-inner-icon="mdi-rename-outline"
          :rules="[
            (v) => !!v?.trim() || 'Required',
            (v) => !v.includes('/') || 'Cannot contain “/”',
          ]"
          :disabled="!canRename"
          class="mb-2"></v-text-field>

        <v-switch
          :model-value="protectedPending"
          color="primary"
          hide-details
          density="compact"
          :disabled="!canSetProtection"
          :prepend-icon="protectedPending ? 'mdi-lock' : 'mdi-lock-open-variant-outline'"
          :label="protectedPending ? 'Deletion protected' : 'Deletion protection off'"
          @update:model-value="protectedPending = $event === true"></v-switch>
        <div class="text-caption text-medium-emphasis ml-10">
          Prevent this {{ label }} from being deleted.
        </div>

        <v-alert v-if="settingsError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ settingsError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="saving" @click="settingsOpen = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!settingsDirty"
          @click="saveSettings">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
        Delete {{ label }}
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the {{ label }}
          <strong class="font-mono">{{ tableName }}</strong>
          from the catalog.
          <span class="text-error font-weight-bold">This cannot be undone.</span>
        </p>
        <v-text-field
          v-model="confirmName"
          class="mt-1"
          density="compact"
          variant="outlined"
          autocomplete="off"
          :label="`Type “${tableName}” to confirm`"
          :error="confirmName.length > 0 && !deleteConfirmed"></v-text-field>
        <v-alert v-if="deleteError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ deleteError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="deleting" @click="deleteOpen = false">Cancel</v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="deleting"
          :disabled="!deleteConfirmed"
          @click="confirmDelete">
          Delete {{ label }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useGenericTablePermissions, useConfig } from '@/composables/useCatalogPermissions';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
  entityLabel?: string;
}>();

const label = computed(() => props.entityLabel ?? 'table');

const emit = defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const config = useConfig();

const menuOpen = ref(false);
const settingsOpen = ref(false);
const saving = ref(false);
const settingsError = ref<string | null>(null);

const genericTable = ref<Record<string, any> | null>(null);
const tableId = ref('');
const protectedState = ref(false);
const nameInput = ref(props.tableName);
const protectedPending = ref(false);

const { canSetProtection, canDrop, hasPermission } = useGenericTablePermissions(
  tableId,
  props.warehouseId,
);
const canRename = computed(
  () =>
    hasPermission('rename') ||
    !config.enabledAuthentication.value ||
    !config.enabledPermissions.value,
);

const settingsDirty = computed(
  () =>
    (nameInput.value.trim() !== props.tableName && !!nameInput.value.trim()) ||
    protectedPending.value !== protectedState.value,
);

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const confirmName = ref('');
const deleteConfirmed = computed(() => confirmName.value.trim() === props.tableName);

async function load() {
  try {
    const response = await functions.loadGenericTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
      false,
    );
    genericTable.value = response.table ?? null;
    protectedState.value = !!response.table?.protected;
    protectedPending.value = protectedState.value;
    // loadGenericTable does not return the id; resolve it via listGenericTables
    // for the permission/protection lookups which are keyed by generic_table_id.
    const list = await functions.listGenericTables(
      props.warehouseId,
      props.namespaceId,
      undefined,
      false,
    );
    const match = (list.identifiers ?? []).find(
      (g: { name: string }) => g.name === props.tableName,
    );
    tableId.value = match?.id ?? '';
  } catch (e) {
    console.error('[GenericTableActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(
  () => [props.warehouseId, props.namespaceId, props.tableName],
  () => {
    nameInput.value = props.tableName;
    load();
  },
);

function openSettings() {
  menuOpen.value = false;
  nameInput.value = props.tableName;
  protectedPending.value = protectedState.value;
  settingsError.value = null;
  settingsOpen.value = true;
}

async function saveSettings() {
  saving.value = true;
  settingsError.value = null;
  try {
    if (protectedPending.value !== protectedState.value) {
      await functions.setGenericTableProtection(
        props.warehouseId,
        tableId.value,
        protectedPending.value,
        true,
      );
      protectedState.value = protectedPending.value;
    }
    const newName = nameInput.value.trim();
    if (newName && newName !== props.tableName && !newName.includes('/')) {
      await functions.renameGenericTable(
        props.warehouseId,
        props.namespaceId,
        props.tableName,
        props.namespaceId,
        newName,
        true,
      );
      settingsOpen.value = false;
      await router.replace({
        name: route.name as any,
        params: { ...route.params, tid: newName },
        query: route.query,
      });
      return;
    }
    settingsOpen.value = false;
    emit('updated');
  } catch (e: any) {
    settingsError.value = e?.error?.message || e?.message || 'Failed to save table settings';
  } finally {
    saving.value = false;
  }
}

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  confirmName.value = '';
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropGenericTable(props.warehouseId, props.namespaceId, props.tableName, true);
    deleteOpen.value = false;
    // Table is gone — leave the table route for its namespace.
    await router.replace({
      path: route.path.replace(/\/(generic-table|dataset)\/[^/]+$/, ''),
      query: { tab: label.value === 'dataset' ? 'datasets' : 'tables' },
    });
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete table';
  } finally {
    deleting.value = false;
  }
}

function downloadJson() {
  menuOpen.value = false;
  if (!genericTable.value) return;
  const blob = new Blob([JSON.stringify(genericTable.value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.tableName || 'generic-table'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>
