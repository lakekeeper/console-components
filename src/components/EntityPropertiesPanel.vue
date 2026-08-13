<template>
  <!-- The editor without a dialog around it: the table settings modal renders it
       as a pane, where the save button belongs to the pane rather than a footer. -->
  <div class="d-flex flex-column" :style="{ height }">
    <div style="flex: 1 1 auto; overflow-y: auto; min-height: 0">
      <div class="pa-1">
        <v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="mb-4">
          {{ loadError }}
        </v-alert>

        <div v-if="loading" class="d-flex flex-column align-center pa-8">
          <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
          <span class="mt-4 text-body-2 text-medium-emphasis">Loading properties…</span>
        </div>

        <template v-else>
          <div class="d-flex align-center flex-wrap mb-3" style="gap: 8px">
            <v-checkbox-btn
              v-if="canEdit && visibleProperties.length"
              class="prop-check"
              :model-value="allVisibleSelected"
              :indeterminate="someVisibleSelected && !allVisibleSelected"
              density="compact"
              color="primary"
              @update:model-value="toggleSelectAll"></v-checkbox-btn>
            <span class="text-subtitle-2">
              {{ selectionLabel }}
            </span>
            <!-- Adding sits with the count on the left, in the same size and
                 shape as the other row actions rather than a style of its own. -->
            <v-btn
              v-if="canEdit"
              color="primary"
              size="small"
              variant="text"
              prepend-icon="mdi-plus"
              @click="addProperty">
              Add property
            </v-btn>
            <!-- Bulk removal appears only once rows are ticked. -->
            <v-btn
              v-if="canEdit && selected.length"
              color="error"
              size="small"
              variant="text"
              prepend-icon="mdi-delete-outline"
              @click="requestRemoveMany">
              Delete selected
            </v-btn>
            <v-spacer></v-spacer>
            <v-switch
              v-if="systemCount > 0"
              v-model="hideSystem"
              color="primary"
              density="compact"
              hide-details
              :label="`Hide system (${systemCount})`"></v-switch>
          </div>

          <!-- Read-only view when no edit permission -->
          <v-table v-if="!canEdit" density="compact">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ prop } in visibleProperties" :key="prop.originalKey || prop.key">
                <td class="text-body-2">{{ prop.key }}</td>
                <td class="text-body-2">{{ prop.value }}</td>
              </tr>
              <tr v-if="visibleProperties.length === 0">
                <td colspan="2" class="text-center text-medium-emphasis py-4">No properties set</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Editable view -->
          <template v-else>
            <!-- Active properties -->
            <div
              v-for="{ prop, index } in visibleProperties"
              :key="index"
              class="d-flex align-center ga-2 mb-2">
              <v-checkbox-btn
                class="prop-check"
                :model-value="selected.includes(index)"
                density="compact"
                color="primary"
                @update:model-value="toggleSelect(index)"></v-checkbox-btn>
              <!-- A repeated key silently overwrites the earlier one when the
                   rows collapse into a single map, so it is called out here. -->
              <v-text-field
                v-model="prop.key"
                density="compact"
                hide-details="auto"
                label="Key"
                placeholder="key"
                variant="outlined"
                :readonly="prop.isExisting"
                :error="isDuplicateKey(prop) || missingKey(prop)"
                :error-messages="keyError(prop)"></v-text-field>
              <v-text-field
                v-model="prop.value"
                density="compact"
                hide-details="auto"
                label="Value"
                placeholder="value"
                variant="outlined"></v-text-field>
              <v-btn
                color="error"
                density="compact"
                icon="mdi-close"
                size="small"
                variant="text"
                @click="requestRemove(index)">
                <v-icon></v-icon>
                <v-tooltip activator="parent" location="bottom">Remove</v-tooltip>
              </v-btn>
            </div>

            <div
              v-if="visibleProperties.length === 0"
              class="text-center text-medium-emphasis py-4">
              No properties set. Use “Add property” to create one.
            </div>

            <v-alert
              v-if="hasDuplicateKeys"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3">
              Two rows use the same key. Each key can appear once — rename or remove one of them
              before saving.
            </v-alert>
          </template>
        </template>
      </div>
    </div>

    <!-- Removal is confirmed here rather than as a step in front of Save: the
         click that removes a property is the one worth questioning. -->
    <v-dialog v-model="confirmOpen" max-width="480">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="error">mdi-delete-outline</v-icon>
          Remove propert{{ pendingKeys.length === 1 ? 'y' : 'ies' }}
        </v-card-title>
        <v-card-text>
          <p class="mb-3">
            {{
              pendingKeys.length === 1
                ? 'This property is removed straight away.'
                : `These ${pendingKeys.length} properties are removed straight away.`
            }}
          </p>
          <div class="mb-3" style="max-height: 180px; overflow-y: auto">
            <v-chip
              v-for="key in pendingKeys"
              :key="key"
              size="small"
              variant="tonal"
              class="mr-1 mb-1">
              {{ key }}
            </v-chip>
          </div>
          <v-text-field
            v-model="confirmInput"
            density="compact"
            variant="outlined"
            autocomplete="off"
            :label="confirmLabel"
            :error="confirmInput.length > 0 && !confirmed"
            @keyup.enter="confirmed && applyRemoval()"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" text="Cancel" @click="confirmOpen = false"></v-btn>
          <v-btn
            color="error"
            variant="flat"
            text="Remove"
            :disabled="!confirmed"
            :loading="removing"
            @click="applyRemoval"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <div class="d-flex align-center flex-shrink-0 pt-3">
      <v-btn
        size="small"
        variant="outlined"
        prepend-icon="mdi-restore"
        :disabled="!hasChanges || saving"
        @click="loadProperties">
        Reset
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn
        v-if="canEdit"
        size="small"
        color="primary"
        :variant="canSave ? 'flat' : 'outlined'"
        :disabled="!canSave"
        :loading="saving"
        @click="executeSave">
        Save properties
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { helix } from 'ldrs';
import { useFunctions, handleError } from '@/plugins/functions';

// Registers the <l-helix> custom element. Idempotent (no-ops if another
// component, e.g. WarehouseManager, already registered it).
helix.register();

interface EditableProperty {
  key: string;
  value: string;
  originalKey: string;
  isExisting: boolean;
}

const props = defineProps<{
  /** 'table' | 'view' | 'namespace' */
  entityType: 'table' | 'view' | 'namespace';
  warehouseId: string;
  namespacePath: string;
  /** Table or view name — required for table/view, omit for namespace */
  entityName?: string;
  /** Current properties from the already-loaded metadata */
  properties?: Record<string, string>;
  canEdit?: boolean;
  /** The host bounds the panel; the property list scrolls inside it. */
  height?: string;
}>();

const emit = defineEmits<{
  updated: [];
  /** Saved and done — a hosting dialog can close on this. */
  saved: [];
  /** Unsaved edits, so a host rail can mark the pane. */
  dirty: [value: boolean];
}>();

const height = computed(() => props.height ?? '100%');

const functions = useFunctions();

const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const originalProperties = ref<Record<string, string>>({});
const editableProperties = ref<EditableProperty[]>([]);

// System/managed keys (e.g. Lakekeeper maintenance overrides) — hidden by default.
const SYSTEM_PROP_PREFIXES = ['lakekeeper.'];
const isSystemProp = (key: string) => SYSTEM_PROP_PREFIXES.some((p) => key.startsWith(p));
const hideSystem = ref(true);
const systemCount = computed(
  () => editableProperties.value.filter((p) => isSystemProp(p.originalKey || p.key)).length,
);
// Rows to render, keeping each property's original index (used by remove/undo).
const visibleProperties = computed(() =>
  editableProperties.value
    .map((prop, index) => ({ prop, index }))
    .filter(({ prop }) => !hideSystem.value || !isSystemProp(prop.originalKey || prop.key)),
);
// Selection is by row index, which is what the visible list carries; a new,
// unsaved row has no key to select by.
const selected = ref<number[]>([]);

const selectionLabel = computed(() =>
  selected.value.length
    ? `${selected.value.length} selected`
    : `${activeProperties.value.length} propert${activeProperties.value.length === 1 ? 'y' : 'ies'}`,
);

function toggleSelect(index: number) {
  selected.value = selected.value.includes(index)
    ? selected.value.filter((i) => i !== index)
    : [...selected.value, index];
}

const allVisibleSelected = computed(
  () =>
    visibleProperties.value.length > 0 &&
    visibleProperties.value.every(({ index }) => selected.value.includes(index)),
);
const someVisibleSelected = computed(() =>
  visibleProperties.value.some(({ index }) => selected.value.includes(index)),
);

function toggleSelectAll(value: boolean | null) {
  selected.value = value ? visibleProperties.value.map(({ index }) => index) : [];
}

// ---- removal ---------------------------------------------------------------
// Confirming removes: the dialog is the decision point, so the property is gone
// from the server when it closes, not queued behind an unrelated Save.
const confirmOpen = ref(false);
const removing = ref(false);
const confirmInput = ref('');
const pendingIndexes = ref<number[]>([]);

const pendingKeys = computed(() =>
  pendingIndexes.value
    .map((i) => editableProperties.value[i])
    .filter(Boolean)
    .map((p) => p.originalKey || p.key || '(unnamed)'),
);

// One property is named to confirm it, the way a single tag or table is; a batch
// has no single name, so it asks for a word instead.
const confirmLabel = computed(() =>
  pendingKeys.value.length === 1
    ? `Type “${pendingKeys.value[0]}” to confirm`
    : 'Type REMOVE to confirm',
);
const confirmed = computed(() =>
  pendingKeys.value.length === 1
    ? confirmInput.value.trim() === pendingKeys.value[0]
    : confirmInput.value.trim() === 'REMOVE',
);

function openConfirm(indexes: number[]) {
  // A row that was never saved has nothing to confirm — it just goes.
  const existing = indexes.filter((i) => editableProperties.value[i]?.isExisting);
  const fresh = indexes.filter((i) => !editableProperties.value[i]?.isExisting);
  if (fresh.length) {
    for (const i of [...fresh].sort((a, b) => b - a)) editableProperties.value.splice(i, 1);
    selected.value = [];
  }
  if (!existing.length) return;
  pendingIndexes.value = existing;
  confirmInput.value = '';
  confirmOpen.value = true;
}

function requestRemove(index: number) {
  openConfirm([index]);
}

function requestRemoveMany() {
  openConfirm([...selected.value]);
}

async function applyRemoval() {
  if (!confirmed.value) return;
  const keys = [...pendingKeys.value];
  removing.value = true;
  try {
    await commit({}, keys);
    selected.value = [];
    pendingIndexes.value = [];
    confirmOpen.value = false;
    // Re-read rather than patch the local list: the write already happened, so
    // the server is the only honest account of what is left.
    // The functions layer already raises a snackbar for the write itself.
    await loadProperties();
    emit('updated');
  } catch (error) {
    handleError(error, 'removeProperties');
  } finally {
    removing.value = false;
  }
}

const activeProperties = computed(() => editableProperties.value);

// Rows collapse into one map on save, so a key used twice would quietly keep only
// the last value. Counting them lets the row say so instead.
const keyCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const prop of editableProperties.value) {
    const key = prop.key.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
});

function isDuplicateKey(prop: EditableProperty): boolean {
  const key = prop.key.trim();
  return !!key && (keyCounts.value.get(key) ?? 0) > 1;
}

// A value with no key is dropped on save; saying so beats losing it silently.
function missingKey(prop: EditableProperty): boolean {
  return !prop.key.trim() && !!prop.value.trim();
}

function keyError(prop: EditableProperty): string[] {
  if (isDuplicateKey(prop)) return ['Key already used'];
  if (missingKey(prop)) return ['Key is required'];
  return [];
}

const hasDuplicateKeys = computed(() => [...keyCounts.value.values()].some((n) => n > 1));
const hasMissingKeys = computed(() => editableProperties.value.some((p) => missingKey(p)));

const hasChanges = computed(() => {
  const current: Record<string, string> = {};
  for (const prop of editableProperties.value) {
    const key = prop.key.trim();
    if (key) {
      current[key] = prop.value;
    }
  }

  const origKeys = Object.keys(originalProperties.value);
  const currKeys = Object.keys(current);

  if (origKeys.length !== currKeys.length) return true;

  for (const key of origKeys) {
    if (current[key] !== originalProperties.value[key]) return true;
  }
  for (const key of currKeys) {
    if (!(key in originalProperties.value)) return true;
  }

  return false;
});

const canSave = computed(
  () => hasChanges.value && !saving.value && !hasDuplicateKeys.value && !hasMissingKeys.value,
);

// The host shows this on its rail; the pane itself already has its Save button.
watch(hasChanges, (value) => emit('dirty', value));

function addProperty() {
  editableProperties.value.push({
    key: '',
    value: '',
    originalKey: '',
    isExisting: false,
  });
}

function initFromProperties(serverProps: Record<string, string>) {
  originalProperties.value = { ...serverProps };
  editableProperties.value = Object.entries(serverProps).map(([key, value]) => ({
    key,
    value,
    originalKey: key,
    isExisting: true,
  }));
}

async function loadProperties() {
  loading.value = true;
  loadError.value = '';

  try {
    // Always fetch fresh from the server so the dialog never shows a stale
    // snapshot from when the parent last loaded.
    if (props.entityType === 'namespace') {
      const metadata = await functions.loadNamespaceMetadata(
        props.warehouseId,
        props.namespacePath,
      );
      initFromProperties(metadata.properties || {});
    } else if (props.entityType === 'view') {
      const v = await functions.loadView(props.warehouseId, props.namespacePath, props.entityName!);
      initFromProperties(v?.metadata?.properties || {});
    } else {
      const t = await functions.loadTable(
        props.warehouseId,
        props.namespacePath,
        props.entityName!,
      );
      initFromProperties(t?.metadata?.properties || {});
    }
  } catch (error: any) {
    loadError.value = error?.message || `Failed to load ${props.entityType} properties`;
    console.error(`Failed to load ${props.entityType} properties:`, error);
  } finally {
    loading.value = false;
  }
}

// The one place that writes: an entity-type dispatch shared by Save and by the
// removal dialog, which commits on its own rather than waiting for Save.
async function commit(updates: Record<string, string>, removals: string[]) {
  if (props.entityType === 'table') {
    if (!props.entityName) throw new Error('entityName is required for table properties');
    await functions.updateTableProperties(
      props.warehouseId,
      props.namespacePath,
      props.entityName,
      updates,
      removals,
      true,
    );
  } else if (props.entityType === 'view') {
    if (!props.entityName) throw new Error('entityName is required for view properties');
    await functions.updateViewProperties(
      props.warehouseId,
      props.namespacePath,
      props.entityName,
      updates,
      removals,
      true,
    );
  } else {
    await functions.updateNamespaceProperties(
      props.warehouseId,
      props.namespacePath,
      updates,
      removals,
      true,
    );
  }
}

async function executeSave() {
  saving.value = true;

  try {
    const updates: Record<string, string> = {};
    const removals: string[] = [];

    const currentKeys = new Set<string>();
    for (const prop of editableProperties.value) {
      const key = prop.key.trim();
      if (key) {
        currentKeys.add(key);
        updates[key] = prop.value;
      }
    }

    for (const origKey of Object.keys(originalProperties.value)) {
      if (!currentKeys.has(origKey)) {
        removals.push(origKey);
      }
    }

    const filteredUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (originalProperties.value[key] !== value || !(key in originalProperties.value)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0 && removals.length === 0) {
      close();
      return;
    }

    await commit(filteredUpdates, removals);

    await loadProperties();
    emit('updated');
    close();
  } catch (error: any) {
    handleError(error, 'executeSave');
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('saved');
}

defineExpose({ reload: loadProperties });

onMounted(loadProperties);
watch(
  () => [props.entityType, props.warehouseId, props.namespacePath, props.entityName],
  loadProperties,
);
</script>

<style scoped>
/* The selection control grows and pads itself by default, which would push the
   key field out of line. */
.prop-check {
  flex: 0 0 auto;
}
.prop-check :deep(.v-selection-control) {
  flex: 0 0 auto;
  min-height: 0;
}
.prop-check :deep(.v-selection-control__wrapper),
.prop-check :deep(.v-selection-control__input) {
  width: 24px;
  height: 24px;
}
</style>
