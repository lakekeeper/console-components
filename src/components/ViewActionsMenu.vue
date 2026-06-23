<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="View actions"></v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <v-list-item
        prepend-icon="mdi-cog-outline"
        title="View settings"
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

      <template v-if="canDrop">
        <v-divider class="my-1"></v-divider>
        <v-list-item
          base-color="error"
          prepend-icon="mdi-delete-outline"
          title="Delete view"
          @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- View settings: rename + deletion protection -->
  <v-dialog v-model="settingsOpen" max-width="520">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
        View Settings
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="settingsOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-text-field
          v-model="nameInput"
          label="View name"
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
          Prevent this view from being deleted.
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
    entity-type="view"
    :warehouse-id="warehouseId"
    :namespace-path="namespaceId"
    :entity-name="viewName"
    :properties="view?.metadata?.properties"
    :can-edit="canCommit"
    @updated="$emit('updated')" />

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="560">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
        Delete view
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the view
          <strong class="font-mono">{{ viewName }}</strong>
          from the catalog. This cannot be undone.
        </p>
        <v-checkbox
          v-model="force"
          density="compact"
          hide-details
          color="error"
          label="Force delete (ignore protection)"></v-checkbox>
        <v-text-field
          v-model="confirmName"
          class="mt-3"
          density="compact"
          variant="outlined"
          autocomplete="off"
          :label="`Type “${viewName}” to confirm`"
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
          Delete view
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useViewPermissions } from '@/composables/useCatalogPermissions';
import EntityPropertiesDialog from './EntityPropertiesDialog.vue';
import type { LoadViewResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  viewName: string;
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

const view = ref<LoadViewResult | null>(null);
const viewId = ref('');
const protectedState = ref(false);
const nameInput = ref(props.viewName);
const protectedPending = ref(false);

const { canCommit, canSetProtection, canDrop } = useViewPermissions(viewId, props.warehouseId);

const settingsDirty = computed(
  () =>
    (nameInput.value.trim() !== props.viewName && !!nameInput.value.trim()) ||
    protectedPending.value !== protectedState.value,
);

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const force = ref(false);
const confirmName = ref('');
const deleteConfirmed = computed(() => confirmName.value.trim() === props.viewName);

async function load() {
  try {
    view.value = (await functions.loadView(
      props.warehouseId,
      props.namespaceId,
      props.viewName,
    )) as LoadViewResult;
    viewId.value = view.value.metadata['view-uuid'] ?? '';
    if (viewId.value) {
      protectedState.value = (
        await functions.getViewProtection(props.warehouseId, viewId.value)
      ).protected;
      protectedPending.value = protectedState.value;
    }
  } catch (e) {
    console.error('[ViewActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(
  () => [props.warehouseId, props.namespaceId, props.viewName],
  () => {
    nameInput.value = props.viewName;
    load();
  },
);

function openSettings() {
  menuOpen.value = false;
  nameInput.value = props.viewName;
  protectedPending.value = protectedState.value;
  settingsError.value = null;
  settingsOpen.value = true;
}

async function saveSettings() {
  saving.value = true;
  settingsError.value = null;
  try {
    if (protectedPending.value !== protectedState.value) {
      await functions.setViewProtection(
        props.warehouseId,
        viewId.value,
        protectedPending.value,
        true,
      );
      protectedState.value = protectedPending.value;
    }
    const newName = nameInput.value.trim();
    if (newName && newName !== props.viewName && !newName.includes('/')) {
      await functions.renameView(
        props.warehouseId,
        props.namespaceId,
        props.viewName,
        newName,
        true,
      );
      settingsOpen.value = false;
      await router.replace({
        name: route.name as any,
        params: { ...route.params, vid: newName },
        query: route.query,
      });
      return;
    }
    settingsOpen.value = false;
    emit('updated');
  } catch (e: any) {
    settingsError.value = e?.error?.message || e?.message || 'Failed to save view settings';
  } finally {
    saving.value = false;
  }
}

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  force.value = false;
  confirmName.value = '';
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropView(
      props.warehouseId,
      props.namespaceId,
      props.viewName,
      { force: force.value },
      true,
    );
    deleteOpen.value = false;
    await router.replace(route.path.replace(/\/view\/[^/]+$/, ''));
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete view';
  } finally {
    deleting.value = false;
  }
}

function downloadJson() {
  menuOpen.value = false;
  if (!view.value?.metadata) return;
  const blob = new Blob([JSON.stringify(view.value.metadata, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.viewName || view.value.metadata['view-uuid'] || 'view'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
</script>
