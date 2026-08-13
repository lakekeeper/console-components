<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="View actions"></v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <!-- One entry for everything about the view itself: name, protection,
           properties and metadata — each pane saves for itself. -->
      <EntitySettingsDialog
        entity-type="view"
        :warehouse-id="warehouseId"
        :namespace-path="namespaceId"
        :entity-name="viewName"
        :entity-id="viewId"
        :metadata="view?.metadata"
        :protected-state="protectedState"
        :can-commit="canCommit"
        :can-set-protection="canSetProtection"
        @updated="$emit('updated')"
        @protection-changed="protectedState = $event">
        <template #activator="{ props: aProps }">
          <v-list-item
            v-bind="aProps"
            prepend-icon="mdi-cog-outline"
            title="View settings"
            subtitle="Rename · protection · properties · metadata" />
        </template>
      </EntitySettingsDialog>

      <template v-if="canManageTags && viewId">
        <v-divider class="my-1"></v-divider>
        <v-list-subheader class="text-uppercase">Governance</v-list-subheader>
        <EntityTagsManageDialog
          scope="view"
          :warehouse-id="warehouseId"
          :entity-id="viewId"
          :entity-name="viewName">
          <template #activator="{ props: aProps }">
            <v-list-item
              v-bind="aProps"
              prepend-icon="mdi-tag-multiple-outline"
              title="Manage tags" />
          </template>
        </EntityTagsManageDialog>
      </template>

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

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="440">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
        Delete view
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the view
          <strong class="font-mono">{{ viewName }}</strong>
          from the catalog.
          <span class="text-error font-weight-bold">This cannot be undone.</span>
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
import EntitySettingsDialog from './EntitySettingsDialog.vue';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';
import type { LoadViewResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  viewName: string;
}>();

defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();

const menuOpen = ref(false);

const view = ref<LoadViewResult | null>(null);
const viewId = ref('');
const protectedState = ref(false);

const { canCommit, canSetProtection, canDrop, canManageTags } = useViewPermissions(
  viewId,
  props.warehouseId,
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
    }
  } catch (e) {
    console.error('[ViewActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.viewName], load);

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
    await router.replace({
      path: route.path.replace(/\/view\/[^/]+$/, ''),
      query: { tab: 'views' },
    });
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete view';
  } finally {
    deleting.value = false;
  }
}
</script>
