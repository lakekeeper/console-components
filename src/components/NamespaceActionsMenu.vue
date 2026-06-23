<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <v-btn icon="mdi-cog" variant="text" v-bind="menuProps" title="Namespace actions"></v-btn>
    </template>

    <v-list density="compact" min-width="240">
      <v-list-item
        prepend-icon="mdi-text-box-edit-outline"
        title="Change properties"
        @click="
          menuOpen = false;
          propsDialog?.open();
        " />

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

  <!-- Headless properties editor, opened from the menu -->
  <EntityPropertiesDialog
    ref="propsDialog"
    hide-activator
    entity-type="namespace"
    :warehouse-id="warehouseId"
    :namespace-path="namespacePath"
    :properties="namespaceProps"
    :can-edit="canUpdateProperties"
    @updated="$emit('updated')" />

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteOpen" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-alert-outline</v-icon>
        Delete namespace
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This deletes the namespace
          <strong class="font-mono">{{ displayName }}</strong>
          from the catalog. This cannot be undone.
        </p>
        <v-checkbox
          v-model="recursive"
          density="compact"
          hide-details
          color="error"
          label="Recursive (also delete contained tables, views and namespaces)"></v-checkbox>
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
import EntityPropertiesDialog from './EntityPropertiesDialog.vue';
import type { GetNamespaceResponse } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const emit = defineEmits<{ (e: 'updated'): void }>();

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
const force = ref(false);
const propsDialog = ref<{ open: () => void } | null>(null);

const namespaceId = ref('');
const namespaceProps = ref<Record<string, string>>({});

const { canUpdateProperties, hasPermission } = useNamespacePermissions(
  namespaceId,
  computed(() => props.warehouseId),
);
const canDelete = computed(
  () => hasPermission('delete') || !config.enabledAuthentication || !config.enabledPermissions,
);

const displayName = computed(() => props.namespacePath.split('\x1F').join('.'));

async function load() {
  try {
    const meta = (await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    )) as GetNamespaceResponse;
    namespaceProps.value = (meta.properties ?? {}) as Record<string, string>;
    namespaceId.value = meta.properties?.namespace_id || (meta as any)['namespace-uuid'] || '';
  } catch (e) {
    console.error('[NamespaceActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  recursive.value = false;
  force.value = false;
  deleteOpen.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await functions.dropNamespace(
      props.warehouseId,
      props.namespacePath,
      { recursive: recursive.value, force: force.value } as any,
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
