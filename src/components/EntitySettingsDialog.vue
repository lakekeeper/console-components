<template>
  <!-- Same shape as the warehouse settings modal: fixed toolbar and action row,
       a rail of panes, and each pane saving for itself — there is no
       cross-endpoint transaction, so one global Save could half-succeed. -->
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-cog-outline</v-icon>
          {{ labelCap }} settings
          <span class="font-weight-medium">— {{ entityName }}</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <!-- Downloading the metadata is a one-shot action, not a place to go, so
             it sits in the toolbar rather than earning a pane. -->
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-download-outline"
          class="mr-2"
          :disabled="!metadata"
          @click="downloadJson">
          Download metadata.json
        </v-btn>
      </v-toolbar>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <v-card-text style="padding: 0; display: flex; min-height: 0; flex: 1 1 auto">
          <div class="d-flex align-stretch" style="flex: 1 1 auto; min-height: 0">
            <v-tabs
              v-model="pane"
              direction="vertical"
              color="primary"
              class="flex-shrink-0"
              style="min-width: 240px; align-self: stretch; overflow-y: auto">
              <div class="text-caption text-medium-emphasis px-4 pt-2 pb-1">
                {{ labelCap.toUpperCase() }}
              </div>
              <v-tab value="SETTINGS">
                <v-icon size="20" class="mr-3">mdi-tune-variant</v-icon>
                Settings
                <v-icon v-if="settingsDirty" color="primary" size="10" class="ml-2">
                  mdi-circle
                </v-icon>
              </v-tab>
              <v-tab v-if="hasProperties" value="PROPERTIES">
                <v-icon size="20" class="mr-3">mdi-text-box-multiple-outline</v-icon>
                Properties
              </v-tab>
            </v-tabs>

            <!-- The scroller is the wrapper, not the form: the pane is capped and
                 a scrollbar on it would sit in the middle of the modal. -->
            <div
              class="flex-grow-1"
              style="min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden">
              <div style="max-width: 1000px; padding: 16px 24px">
                <div v-show="pane === 'SETTINGS'">
                  <v-text-field
                    v-model="nameInput"
                    :label="`${labelCap} name`"
                    prepend-inner-icon="mdi-rename-outline"
                    :hint="canCommit ? `Renaming moves this ${label} within its namespace` : ''"
                    persistent-hint
                    :rules="[
                      (v: string) => !!v?.trim() || 'Required',
                      (v: string) => !v.includes('/') || 'Cannot contain “/”',
                    ]"
                    :error="!nameInput.trim()"
                    :disabled="!canCommit"
                    class="mb-4"></v-text-field>

                  <v-card variant="flat" class="mb-4">
                    <v-card-item class="pb-1">
                      <template #prepend>
                        <v-icon color="primary">mdi-shield-lock-outline</v-icon>
                      </template>
                      <v-card-title class="text-subtitle-1 font-weight-medium">
                        Access &amp; protection
                      </v-card-title>
                      <v-card-subtitle>Deletion safety for this {{ label }}</v-card-subtitle>
                    </v-card-item>
                    <v-card-text>
                      <v-switch
                        :model-value="protectedPending"
                        color="primary"
                        hide-details
                        density="compact"
                        :disabled="!canSetProtection"
                        :prepend-icon="
                          protectedPending ? 'mdi-lock' : 'mdi-lock-open-variant-outline'
                        "
                        :label="protectedPending ? 'Deletion protected' : 'Deletion protection off'"
                        @update:model-value="protectedPending = $event === true"></v-switch>
                      <div class="text-caption text-medium-emphasis ml-10">
                        Prevent this {{ label }} from being deleted.
                      </div>
                    </v-card-text>
                  </v-card>

                  <v-alert
                    v-if="settingsError"
                    type="error"
                    variant="tonal"
                    density="compact"
                    class="mb-4">
                    {{ settingsError }}
                  </v-alert>

                  <div class="d-flex align-center">
                    <v-btn
                      size="small"
                      variant="outlined"
                      prepend-icon="mdi-restore"
                      :disabled="!settingsDirty || saving"
                      @click="resetSettings">
                      Reset
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-btn
                      color="primary"
                      :variant="canSaveSettings ? 'flat' : 'outlined'"
                      prepend-icon="mdi-content-save-outline"
                      :loading="saving"
                      :disabled="!canSaveSettings"
                      @click="saveSettings">
                      Save settings
                    </v-btn>
                  </div>
                </div>

                <div v-show="pane === 'PROPERTIES'">
                  <EntityPropertiesPanel
                    v-if="dialogOpen && hasProperties"
                    ref="propsPanel"
                    :entity-type="entityType === 'view' ? 'view' : 'table'"
                    :warehouse-id="warehouseId"
                    :namespace-path="namespacePath"
                    :entity-name="entityName"
                    :can-edit="canCommit"
                    height="auto"
                    @updated="emit('updated')" />
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">Each pane saves on its own.</span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import EntityPropertiesPanel from './EntityPropertiesPanel.vue';
const props = defineProps<{
  /** Tables, views and generic tables differ only in which endpoints apply. */
  entityType: 'table' | 'view' | 'generic-table';
  warehouseId: string;
  namespacePath: string;
  entityName: string;
  entityId: string;
  /** Iceberg metadata, when the entity has any to show or download. */
  metadata?: Record<string, any> | null;
  /** Server-side protection state, already loaded by the caller. */
  protectedState: boolean;
  canCommit?: boolean;
  canSetProtection?: boolean;
  /** Overrides the noun in labels — generic tables call themselves datasets. */
  entityLabel?: string;
}>();

const emit = defineEmits<{
  updated: [];
  /** Protection changed, so the caller can refresh its own copy. */
  protectionChanged: [value: boolean];
}>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();

const label = computed(() => props.entityLabel ?? props.entityType.replace('-', ' '));
const labelCap = computed(() => label.value.charAt(0).toUpperCase() + label.value.slice(1));
// Only Iceberg tables and views carry editable properties; a generic table has
// no properties endpoint, so that pane does not exist for it.
const hasProperties = computed(() => props.entityType !== 'generic-table');
// The route names the entity differently depending on what it is.
const routeParam = computed(() => (props.entityType === 'view' ? 'vid' : 'tid'));

const dialogOpen = ref(false);
const pane = ref('SETTINGS');
const nameInput = ref(props.entityName);
const protectedPending = ref(props.protectedState);
const settingsError = ref<string | null>(null);
const saving = ref(false);
const propsPanel = ref<{ reload: () => void } | null>(null);

const settingsDirty = computed(
  () =>
    (nameInput.value.trim() !== props.entityName && !!nameInput.value.trim()) ||
    protectedPending.value !== props.protectedState,
);
const canSaveSettings = computed(
  () => settingsDirty.value && !!nameInput.value.trim() && !nameInput.value.includes('/'),
);

function resetSettings() {
  nameInput.value = props.entityName;
  protectedPending.value = props.protectedState;
  settingsError.value = null;
}

// Seed on open rather than on mount: the menu keeps this component alive, so a
// rename or a protection change elsewhere would otherwise show stale values.
watch(dialogOpen, (open) => {
  if (open) {
    resetSettings();
    pane.value = 'SETTINGS';
  }
});
watch(
  () => [props.entityName, props.protectedState],
  () => {
    if (!settingsDirty.value) resetSettings();
  },
);

// Three entity types, three pairs of endpoints; everything else about this
// modal is the same for all of them.
async function setProtection(value: boolean) {
  if (props.entityType === 'view') {
    await functions.setViewProtection(props.warehouseId, props.entityId, value, true);
  } else if (props.entityType === 'generic-table') {
    await functions.setGenericTableProtection(props.warehouseId, props.entityId, value, true);
  } else {
    await functions.setTableProtection(props.warehouseId, props.entityId, value, true);
  }
}

async function rename(newName: string) {
  if (props.entityType === 'view') {
    await functions.renameView(
      props.warehouseId,
      props.namespacePath,
      props.entityName,
      newName,
      true,
    );
  } else if (props.entityType === 'generic-table') {
    await functions.renameGenericTable(
      props.warehouseId,
      props.namespacePath,
      props.entityName,
      props.namespacePath,
      newName,
      true,
    );
  } else {
    await functions.renameTable(
      props.warehouseId,
      props.namespacePath,
      props.entityName,
      newName,
      true,
    );
  }
}

async function saveSettings() {
  saving.value = true;
  settingsError.value = null;
  try {
    if (protectedPending.value !== props.protectedState) {
      await setProtection(protectedPending.value);
      emit('protectionChanged', protectedPending.value);
    }
    const newName = nameInput.value.trim();
    if (newName && newName !== props.entityName && !newName.includes('/')) {
      await rename(newName);
      dialogOpen.value = false;
      // The route carries the entity name (`tid` or `vid`); follow the rename.
      await router.replace({
        name: route.name as any,
        params: { ...route.params, [routeParam.value]: newName },
        query: route.query,
      });
      return;
    }
    emit('updated');
  } catch (e: any) {
    settingsError.value =
      e?.error?.message || e?.message || `Failed to save ${label.value} settings`;
  } finally {
    saving.value = false;
  }
}

// ---- metadata --------------------------------------------------------------
function downloadJson() {
  const meta = props.metadata;
  if (!meta) return;
  const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.entityName || 'metadata'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

defineExpose({ open: () => (dialogOpen.value = true) });
</script>
