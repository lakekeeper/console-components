<template>
  <v-menu v-model="menuOpen" location="bottom end" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <!-- Labelled rather than a bare cog: the glyph alone left people
           guessing. No tooltip — the word is already on screen, and a
           hover bubble repeating it would just say the same thing twice. -->
      <v-btn variant="text" size="small" prepend-icon="mdi-cog" v-bind="menuProps">Settings</v-btn>
    </template>

    <v-list density="compact" min-width="248">
      <!-- One entry for everything about the table itself: name, protection,
           properties and metadata — each pane saves for itself. -->
      <EntitySettingsDialog
        entity-type="table"
        :warehouse-id="warehouseId"
        :namespace-path="namespaceId"
        :entity-name="tableName"
        :entity-id="tableId"
        :metadata="table?.metadata"
        :protected-state="protectedState"
        :can-commit="canCommit"
        :can-set-protection="canSetProtection"
        @updated="$emit('updated')"
        @protection-changed="protectedState = $event">
        <!-- No menuOpen = false here: the dialog lives inside the menu content,
             so closing the menu unmounts the dialog as it opens. -->
        <template #activator="{ props: aProps }">
          <v-list-item
            v-bind="aProps"
            prepend-icon="mdi-cog-outline"
            title="Table settings"
            subtitle="Rename · protection · metadata" />
        </template>
      </EntitySettingsDialog>

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
  <v-dialog v-model="deleteOpen" max-width="440">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1 py-3">
        <v-icon class="mr-2" color="error">mdi-delete-outline</v-icon>
        Delete table
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p class="mb-3">
          This permanently deletes the table
          <strong class="font-mono">{{ tableName }}</strong>
          from the catalog.
          <span class="text-error font-weight-bold">This cannot be undone.</span>
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
        <v-text-field
          v-model="confirmName"
          class="mt-3"
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
          Delete table
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useFunctions } from '@/plugins/functions';
import { useTablePermissions } from '@/composables/useCatalogPermissions';
import EntitySettingsDialog from './EntitySettingsDialog.vue';
import type { LoadTableResult } from '@/gen/iceberg/types.gen';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  tableName: string;
}>();

defineEmits<{ (e: 'updated'): void }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();

const menuOpen = ref(false);

const table = ref<LoadTableResult | null>(null);
const tableId = ref('');
const protectedState = ref(false);

const { canCommit, canSetProtection, canDrop } = useTablePermissions(tableId, props.warehouseId);

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const purge = ref(false);
const force = ref(false);
const confirmName = ref('');
const deleteConfirmed = computed(() => confirmName.value.trim() === props.tableName);

function openDelete() {
  menuOpen.value = false;
  deleteError.value = null;
  purge.value = false;
  force.value = false;
  confirmName.value = '';
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
    await router.replace({
      path: route.path.replace(/\/table\/[^/]+$/, ''),
      query: { tab: 'tables' },
    });
  } catch (e: any) {
    deleteError.value = e?.error?.message || e?.message || 'Failed to delete table';
  } finally {
    deleting.value = false;
  }
}

// Guards against a stale response overwriting a newer one when warehouseId/
// namespaceId/tableName change again before an in-flight load() resolves.
let loadToken = 0;
async function load() {
  const token = ++loadToken;
  tableId.value = ''; // don't act on the previous table while reloading
  try {
    // Silent: the page this menu sits on reports a refused table load itself.
    const loaded = (await functions.loadTableCustomized(
      props.warehouseId,
      props.namespaceId,
      props.tableName,
      false,
    )) as LoadTableResult;
    if (token !== loadToken) return;
    table.value = loaded;
    tableId.value = table.value.metadata['table-uuid'] ?? '';
    if (tableId.value) {
      try {
        // Silent too: the overview's Protection tile says when it is not
        // visible, instead of a snackbar on every visit.
        const prot = await functions.getTableProtection(props.warehouseId, tableId.value, false);
        if (token !== loadToken) return;
        protectedState.value = prot.protected;
      } catch {
        /* protection not visible to this reader — shown on the overview tile */
      }
    }
  } catch (e) {
    if (token !== loadToken) return;
    console.error('[TableActionsMenu] load failed', e);
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespaceId, props.tableName], load);
</script>
