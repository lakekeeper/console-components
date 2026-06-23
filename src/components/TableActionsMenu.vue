<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="Table actions"></v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <v-list-item
        prepend-icon="mdi-cog-outline"
        title="Table settings"
        subtitle="Rename · delete protection"
        @click="openSettings" />
      <v-list-item
        prepend-icon="mdi-text-box-edit-outline"
        title="Change properties"
        @click="
          menuOpen = false;
          propsDialog?.open();
        " />
      <v-list-item
        prepend-icon="mdi-download-outline"
        title="Download metadata.json"
        @click="downloadJson" />

      <!-- Premium maintenance actions (schedule / advanced overrides) -->
      <slot name="maintenance" :close="() => (menuOpen = false)"></slot>

      <template v-if="canDrop">
        <v-divider class="my-1"></v-divider>
        <v-list-item
          base-color="error"
          prepend-icon="mdi-delete-outline"
          title="Delete table"
          @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="480">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
        Delete table
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the table
          <strong class="font-mono">{{ tableName }}</strong>
          from the catalog. This cannot be undone.
        </p>
        <v-checkbox
          v-model="purge"
          density="compact"
          hide-details
          color="error"
          label="Purge data files from storage"></v-checkbox>
        <v-checkbox
          v-model="force"
          density="compact"
          hide-details
          color="error"
          label="Force delete (ignore protection)"></v-checkbox>
        <v-alert v-if="deleteError" type="error" variant="tonal" density="compact" class="mt-3">
          {{ deleteError }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="deleting" @click="deleteOpen = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDelete">
          Delete table
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Table settings: rename + recursive delete protection -->
  <v-dialog v-model="settingsOpen" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
        Table Settings
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="settingsOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-text-field
          v-model="nameInput"
          label="Table name"
          prepend-inner-icon="mdi-rename-outline"
          :rules="[
            (v) => !!v?.trim() || 'Required',
            (v) => !v.includes('/') || 'Cannot contain “/”',
          ]"
          :disabled="!canCommit"
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
          Prevent this table from being deleted.
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

  <!-- Headless properties editor, opened from the menu -->
  <EntityPropertiesDialog
    ref="propsDialog"
    hide-activator
    entity-type="table"
    :warehouse-id="warehouseId"
    :namespace-path="namespaceId"
    :entity-name="tableName"
    :properties="table?.metadata?.properties"
    :can-edit="canCommit"
    @updated="$emit('updated')" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import EntityPropertiesDialog from './EntityPropertiesDialog.vue';
import type { LoadTableResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

const emit = defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();

const menuOpen = ref(false);
const settingsOpen = ref(false);
const saving = ref(false);
const settingsError = ref<string | null>(null);
const propsDialog = ref<{ open: () => void } | null>(null);

const table = ref<LoadTableResult | null>(null);
const tableId = ref('');
const protectedState = ref(false);
const nameInput = ref(props.tableName);
const protectedPending = ref(false);

const { canCommit, canSetProtection, canDrop } = useTablePermissions(tableId, props.warehouseId);

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const purge = ref(false);
const force = ref(false);

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  purge.value = false;
  force.value = false;
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropTable(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
      { purgeRequested: purge.value, force: force.value },
      true,
    );
    deleteOpen.value = false;
    // Table is gone — leave the table route for its namespace.
    await router.replace(route.path.replace(/\/table\/[^/]+$/, ''));
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete table';
  } finally {
    deleting.value = false;
  }
}

const settingsDirty = computed(
  () =>
    (nameInput.value.trim() !== props.tableName && !!nameInput.value.trim()) ||
    protectedPending.value !== protectedState.value,
);

async function load() {
  try {
    table.value = (await functions.loadTableCustomized(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
    )) as LoadTableResult;
    tableId.value = table.value.metadata['table-uuid'] ?? '';
    if (tableId.value) {
      protectedState.value = (
        await functions.getTableProtection(props.warehouseId, tableId.value)
      ).protected;
      protectedPending.value = protectedState.value;
    }
  } catch (e) {
    console.error('[TableActionsMenu] load failed', e);
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
      await functions.setTableProtection(
        props.warehouseId,
        tableId.value,
        protectedPending.value,
        true,
      );
      protectedState.value = protectedPending.value;
    }
    const newName = nameInput.value.trim();
    if (newName && newName !== props.tableName && !newName.includes('/')) {
      await functions.renameTable(
        props.warehouseId,
        props.namespaceId,
        props.tableName,
        newName,
        true,
      );
      settingsOpen.value = false;
      // Route carries the table name in `tid`; move to the renamed table.
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

function downloadJson() {
  menuOpen.value = false;
  if (!table.value?.metadata) return;
  const blob = new Blob([JSON.stringify(table.value.metadata, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.tableName || table.value.metadata['table-uuid'] || 'table'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>
