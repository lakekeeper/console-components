<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="Namespace actions"></v-btn>
    </template>

    <v-list density="compact" min-width="240">
      <!-- One entry for everything about the namespace itself: protection and
           properties — each pane saves for itself. -->
      <EntitySettingsDialog
        v-if="namespaceId"
        entity-type="namespace"
        :warehouse-id="warehouseId"
        :namespace-path="namespacePath"
        :entity-name="displayName"
        :entity-id="namespaceId"
        :protected-state="protectedState"
        :can-commit="canUpdateProperties"
        :can-set-protection="canSetProtection"
        @updated="$emit('updated')"
        @protection-changed="protectedState = $event">
        <template #activator="{ props: aProps }">
          <v-list-item
            v-bind="aProps"
            prepend-icon="mdi-cog-outline"
            title="Namespace settings"
            subtitle="Protection · properties" />
        </template>
      </EntitySettingsDialog>

      <template v-if="canManageTags && namespaceId">
        <v-divider class="my-1"></v-divider>
        <v-list-subheader class="text-uppercase">Governance</v-list-subheader>
        <EntityTagsManageDialog
          scope="namespace"
          :warehouse-id="warehouseId"
          :entity-id="namespaceId"
          :entity-name="displayName">
          <template #activator="{ props: aProps }">
            <v-list-item
              v-bind="aProps"
              prepend-icon="mdi-tag-multiple-outline"
              title="Manage tags" />
          </template>
        </EntityTagsManageDialog>
      </template>

      <template v-if="canDelete">
        <v-divider class="my-1"></v-divider>
        <v-list-item
          base-color="error"
          prepend-icon="mdi-delete-outline"
          title="Delete namespace"
          @click="openDelete" />
      </template>
    </v-list>
  </v-menu>

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
        Delete namespace
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This deletes the namespace
          <strong class="font-mono">{{ confirmTarget }}</strong>
          from the catalog.
          <span class="text-error font-weight-bold">This cannot be undone.</span>
        </p>
        <v-checkbox
          v-model="recursive"
          density="compact"
          hide-details
          color="error"
          label="Recursive (also delete contained tables, views and namespaces)"></v-checkbox>
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
        <v-text-field
          v-model="confirmName"
          class="mt-3"
          density="compact"
          variant="outlined"
          autocomplete="off"
          :label="`Type “${confirmTarget}” to confirm`"
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
          Delete namespace
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useNamespacePermissions } from '@/composables/useCatalogPermissions';
import EntitySettingsDialog from './EntitySettingsDialog.vue';
import EntityTagsManageDialog from './EntityTagsManageDialog.vue';
import type { GetNamespaceResponse } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const config = inject<any>('appConfig', {
  enabledAuthentication: false,
  enabledPermissions: false,
});

const menuOpen = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const recursive = ref(false);
const purge = ref(false);
const force = ref(false);
const protectedState = ref(false);
const namespaceId = ref('');

const { canUpdateProperties, canSetProtection, hasPermission, canManageTags } =
  useNamespacePermissions(
    namespaceId,
    computed(() => props.warehouseId),
  );
const canDelete = computed(
  () => hasPermission('delete') || !config.enabledAuthentication || !config.enabledPermissions,
);

const displayName = computed(() => props.namespacePath.split('\x1F').join('.'));
const confirmTarget = computed(() => props.namespacePath.split('\x1F').pop() || displayName.value);
const confirmName = ref('');
const deleteConfirmed = computed(() => confirmName.value.trim() === confirmTarget.value);

// Guards against a stale response overwriting a newer one when warehouseId/
// namespacePath change again before an in-flight load() resolves.
let loadToken = 0;
async function load() {
  const token = ++loadToken;
  namespaceId.value = ''; // don't act on the previous namespace while reloading
  try {
    const meta = (await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    )) as GetNamespaceResponse;
    if (token !== loadToken) return;
    namespaceId.value = meta.properties?.namespace_id || (meta as any)['namespace-uuid'] || '';
    if (namespaceId.value) {
      try {
        const prot = await functions.getNamespaceProtection(props.warehouseId, namespaceId.value);
        if (token !== loadToken) return;
        protectedState.value = prot.protected;
      } catch {
        /* protection not visible to this role */
      }
    }
  } catch (e) {
    if (token !== loadToken) return;
    console.error('[NamespaceActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  recursive.value = false;
  purge.value = false;
  force.value = false;
  confirmName.value = '';
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropNamespace(
      props.warehouseId,
      props.namespacePath,
      { recursive: recursive.value, purge: purge.value, force: force.value } as any,
      true,
    );
    deleteOpen.value = false;
    // Namespace is gone — go up to the warehouse.
    await router.replace(route.path.replace(/\/namespace\/.*$/, ''));
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete namespace';
  } finally {
    deleting.value = false;
  }
}
</script>
