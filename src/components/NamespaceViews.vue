<template>
  <v-alert v-if="forbidden" type="warning" variant="tonal" class="ma-4">
    You do not have permission to list views in this namespace.
  </v-alert>
  <v-data-table
    v-else
    v-model="selected"
    items-per-page="50"
    height="65vh"
    :search="searchView"
    fixed-header
    show-select
    return-object
    item-value="name"
    :headers="headers"
    hover
    :items="loadedViews"
    :sort-by="[{ key: 'name', order: 'asc' }]"
    :items-per-page-options="[
      { title: '50 items', value: 50 },
      { title: '100 items', value: 100 },
    ]"
    @update:options="paginationCheck($event)">
    <template #item.name="{ item }">
      <td @click="routeToView(item)" style="cursor: pointer !important">
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2">mdi-view-grid-outline</v-icon>
          {{ item.name }}
        </span>
      </td>
    </template>
    <template #top>
      <v-toolbar color="transparent" density="compact" flat>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="searchView"
          label="Filter results"
          prepend-inner-icon="mdi-filter"
          variant="underlined"
          hide-details
          clearable></v-text-field>
      </v-toolbar>
      <v-toolbar v-if="selected.length" color="primary" density="compact" flat class="px-2">
        <span class="text-body-2 font-weight-medium">{{ selected.length }} selected</span>
        <v-spacer></v-spacer>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-delete-outline"
          @click="openBulkDelete">
          Delete ({{ selected.length }})
        </v-btn>
        <v-btn size="small" variant="text" icon="mdi-close" @click="selected = []"></v-btn>
      </v-toolbar>
    </template>
    <template #item.actions="{ item }">
      <div class="d-flex justify-end align-center">
        <v-btn
          v-if="item.type === 'view'"
          rounded="pill"
          variant="flat"
          @click="openRenameDialog(item)">
          <v-icon color="primary">mdi-pencil-outline</v-icon>
        </v-btn>
        <DeleteDialog
          v-if="item.type === 'view'"
          :type="item.type"
          :name="item.name"
          @delete-view-with-options="deleteViewWithOptions($event, item)"></DeleteDialog>
      </div>
    </template>
    <template #no-data>
      <div>No views in this namespace</div>
    </template>
  </v-data-table>

  <!-- Rename dialog -->
  <v-dialog v-model="renameDialog" max-width="500" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-pencil-outline</v-icon>
        Rename View
      </v-card-title>
      <v-card-text>
        <template v-if="isDefaultLayout">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            Rename view
            <strong>"{{ renameOldName }}"</strong>
            within the same namespace.
          </v-alert>
          <v-text-field
            v-model="renameNewName"
            label="New view name"
            density="compact"
            hide-details="auto"
            variant="outlined"
            :rules="[
              (v: string) => !!v || 'Required',
              (v: string) => !/\s/.test(v) || 'No spaces allowed',
              (v: string) => v !== renameOldName || 'Must be different from current name',
            ]"
            :placeholder="renameOldName"></v-text-field>
        </template>
        <v-alert v-else type="warning" variant="tonal" density="compact">
          Renaming is not available because the warehouse uses a non-default storage layout. View
          locations are derived from the view name, so renaming would break the storage path.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          v-if="isDefaultLayout"
          color="primary"
          :disabled="
            !renameNewName ||
            /\s/.test(renameNewName) ||
            renameNewName === renameOldName ||
            renameLoading
          "
          :loading="renameLoading"
          @click="executeRename">
          Rename
        </v-btn>
        <v-btn @click="closeRenameDialog">{{ isDefaultLayout ? 'Cancel' : 'Close' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Bulk delete -->
  <v-dialog v-model="bulkDeleteDialog" max-width="540" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="error" class="mr-2">mdi-delete-alert-outline</v-icon>
        Delete {{ selected.length }} {{ selected.length === 1 ? 'view' : 'views' }}?
      </v-card-title>
      <v-card-text>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
          This permanently removes the selected views and cannot be undone.
          {{ bulkForce ? '' : 'Delete-protected views will be skipped.' }}
        </v-alert>
        <v-switch v-model="bulkForce" color="info" density="compact">
          <template #label>
            <div>
              <span>{{ bulkForce ? 'Force activated' : 'Force deactivated' }}</span>
              <div v-if="bulkForce" class="text-caption text-error">
                Bypass Protection and Skip Soft-Deletion
              </div>
            </div>
          </template>
        </v-switch>
        <v-list v-if="bulkResults.length" density="compact" class="mt-2" max-height="220">
          <v-list-item v-for="r in bulkResults" :key="r.name">
            <template #prepend>
              <v-icon :color="r.ok ? 'success' : 'error'" size="small">
                {{ r.ok ? 'mdi-check-circle' : 'mdi-alert-circle' }}
              </v-icon>
            </template>
            <v-list-item-title class="text-body-2">{{ r.name }}</v-list-item-title>
            <v-list-item-subtitle v-if="!r.ok" class="text-error">{{ r.reason }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn :disabled="bulkDeleting" @click="bulkDeleteDialog = false">
          {{ bulkDone ? 'Close' : 'Cancel' }}
        </v-btn>
        <v-btn
          v-if="!bulkDone"
          color="error"
          variant="flat"
          :loading="bulkDeleting"
          @click="confirmBulkDelete">
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';
import type { Header, Options } from '../common/interfaces';
import type { TableIdentifier } from '../gen/iceberg/types.gen';
import { isForbiddenError } from '../common/errorUtils';

export type ViewIdentifierExtended = TableIdentifier & {
  actions: string[];
  id: string;
  type: string;
};

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
  storageLayout?: string;
}>();

const router = useRouter();
const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const isDefaultLayout = computed(() => !props.storageLayout || props.storageLayout === 'default');

const searchView = ref('');
const forbidden = ref(false);
const loadedViews: ViewIdentifierExtended[] = reactive([]);
const paginationToken = ref('');

// Rename state
const renameDialog = ref(false);
const renameOldName = ref('');
const renameNewName = ref('');
const renameLoading = ref(false);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

onMounted(loadViews);
watch(() => props.namespacePath, loadViews);

async function loadViews() {
  forbidden.value = false;
  try {
    const loadedViewsTmp: ViewIdentifierExtended[] = [];
    const data = await functions.listViews(
      props.warehouseId,
      props.namespacePath,
      undefined,
      false,
    );
    Object.assign(loadedViewsTmp, data.identifiers);
    paginationToken.value = data['next-page-token'] || '';

    loadedViewsTmp.forEach((view) => {
      view.actions = ['delete'];
      view.type = 'view';
    });

    loadedViews.splice(0, loadedViews.length);
    Object.assign(loadedViews, loadedViewsTmp);
  } catch (error) {
    if (isForbiddenError(error)) {
      forbidden.value = true;
      return;
    }
    functions.handleError(error, 'listViews');
  }
}

async function paginationCheck(option: Options) {
  if (loadedViews.length >= 10000) return;

  if (option.page * option.itemsPerPage == loadedViews.length && paginationToken.value != '') {
    try {
      const loadedViewsTmp: ViewIdentifierExtended[] = [];
      const data = await functions.listViews(
        props.warehouseId,
        props.namespacePath,
        paginationToken.value,
      );
      Object.assign(loadedViewsTmp, data.identifiers);
      paginationToken.value = data['next-page-token'] || '';
      loadedViewsTmp.forEach((view) => {
        view.actions = ['delete'];
        view.type = 'view';
      });

      loadedViews.push(...loadedViewsTmp.flat());
    } catch (error) {
      if (isForbiddenError(error)) {
        forbidden.value = true;
        return;
      }
      functions.handleError(error, 'listViews');
    }
  }
}

async function deleteViewWithOptions(e: any, item: ViewIdentifierExtended) {
  try {
    await functions.dropView(props.warehouseId, props.namespacePath, item.name, e, notify);
    await loadViews();
  } catch (error) {
    console.error(`Failed to drop view-${item.name}`, error);
  }
}

// --- Bulk selection / delete ------------------------------------------------
const selected = ref<ViewIdentifierExtended[]>([]);
const bulkDeleteDialog = ref(false);
const bulkForce = ref(false);
const bulkDeleting = ref(false);
const bulkDone = ref(false);
const bulkResults = ref<Array<{ name: string; ok: boolean; reason?: string }>>([]);

function openBulkDelete() {
  bulkForce.value = false;
  bulkDone.value = false;
  bulkResults.value = [];
  bulkDeleteDialog.value = true;
}

async function confirmBulkDelete() {
  bulkDeleting.value = true;
  bulkResults.value = [];
  for (const view of [...selected.value]) {
    try {
      await functions.dropView(
        props.warehouseId,
        props.namespacePath,
        view.name,
        { force: bulkForce.value },
        false,
      );
      bulkResults.value.push({ name: view.name, ok: true });
    } catch (error: any) {
      bulkResults.value.push({
        name: view.name,
        ok: false,
        reason: error?.error?.message || error?.message || 'Failed to delete',
      });
    }
  }
  bulkDeleting.value = false;
  bulkDone.value = true;
  const ok = bulkResults.value.filter((r) => r.ok).length;
  const failed = bulkResults.value.length - ok;
  visual.setSnackbarMsg({
    function: 'bulkDeleteViews',
    text: `${ok} deleted${failed ? `, ${failed} failed` : ''}.`,
    ttl: 5000,
    ts: Date.now(),
    type: failed ? Type.WARNING : Type.SUCCESS,
  });
  selected.value = [];
  await loadViews();
}

async function routeToView(item: ViewIdentifierExtended) {
  try {
    await functions.loadView(props.warehouseId, props.namespacePath, item.name, false);
  } catch (error: any) {
    const code = error?.error?.code || error?.status || error?.response?.status || 0;
    const message = error?.error?.message || error?.message || 'An unknown error occurred';
    if (code === 403 || code === 404) {
      visual.setSnackbarMsg({
        function: 'routeToView',
        text: `Access denied: view "${item.name}"`,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    } else {
      visual.setSnackbarMsg({
        function: 'routeToView',
        text: message,
        ttl: 3000,
        ts: Date.now(),
        type: Type.ERROR,
      });
    }
    return;
  }
  router.push(
    `/warehouse/${props.warehouseId}/namespace/${props.namespacePath}/view/${encodeURIComponent(item.name)}`,
  );
}

function openRenameDialog(item: ViewIdentifierExtended) {
  renameOldName.value = item.name;
  renameNewName.value = '';
  renameDialog.value = true;
}

function closeRenameDialog() {
  renameDialog.value = false;
  renameOldName.value = '';
  renameNewName.value = '';
}

async function executeRename() {
  if (!renameNewName.value) return;

  renameLoading.value = true;
  try {
    await functions.renameView(
      props.warehouseId,
      props.namespacePath,
      renameOldName.value,
      renameNewName.value,
      notify,
    );
    closeRenameDialog();
    await loadViews();
  } catch {
    // error handled by functions plugin
  } finally {
    renameLoading.value = false;
  }
}

defineExpose({
  loadViews,
});
</script>
