<template>
  <v-dialog v-model="isDialogActive" fullscreen transition="dialog-bottom-transition">
    <template #activator="{ props: activatorProps }">
      <v-list-item v-if="isCreateFlow" v-bind="activatorProps">
        <v-list-item-title>
          <v-btn color="primary" size="small" text="Add Warehouse" variant="flat"></v-btn>
        </v-list-item-title>
      </v-list-item>
      <!-- One entry for everything about an existing warehouse: name, retention,
           format policy, protection, credentials and profile. -->
      <v-list-item v-else prepend-icon="mdi-cog-outline" v-bind="activatorProps">
        <v-list-item-title>Warehouse settings</v-list-item-title>
      </v-list-item>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="attemptClose"></v-btn>
        <v-toolbar-title>
          <span v-if="isCreateFlow">
            Add new warehouse
            <span v-if="warehouseName.trim()" class="font-weight-medium">
              — {{ warehouseName.trim() }}
            </span>
          </span>
          <span v-else>
            Warehouse settings
            <span v-if="loadedName" class="font-weight-medium">— {{ loadedName }}</span>
          </span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <input
          ref="fileInputRef"
          type="file"
          accept="application/json"
          style="display: none"
          @change="handleFileImport" />
        <v-btn
          v-if="isCreateFlow"
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="mdi-upload"
          class="mr-2"
          @click="fileInputRef?.click()">
          Import Warehouse
        </v-btn>
      </v-toolbar>

      <div v-if="creatingWarehouse" style="flex: 1 1 auto">
        <v-card-text style="min-height: 25vh">
          <v-row justify="center">
            <v-progress-circular
              class="mt-4"
              color="primary"
              indeterminate
              size="64"></v-progress-circular>
          </v-row>
        </v-card-text>
      </div>

      <!-- Toolbar, rail and action row stay put; only the pane itself scrolls.
           Every level in between has to be a min-height:0 flex box, or the inner
           overflow never engages and the whole card grows instead. -->
      <div v-else style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <v-card-text style="padding: 0; display: flex; min-height: 0; flex: 1 1 auto">
          <div class="d-flex align-stretch" style="flex: 1 1 auto; min-height: 0">
            <v-tabs
              v-model="pane"
              direction="vertical"
              color="primary"
              class="flex-shrink-0"
              style="min-width: 240px; align-self: stretch; overflow-y: auto">
              <div class="text-caption text-medium-emphasis px-4 pt-2 pb-1">WAREHOUSE</div>
              <v-tab value="SETTINGS">
                <v-icon size="20" class="mr-3">mdi-tune-variant</v-icon>
                Settings
                <!-- Creating and renaming are both gated on a valid, unused name,
                     so flag "missing" and "taken" here rather than at the buttons. -->
                <v-icon
                  v-if="!warehouseName.trim() || nameTaken"
                  color="error"
                  size="18"
                  class="ml-2">
                  mdi-alert-circle-outline
                </v-icon>
                <v-icon
                  v-else-if="isSettingsFlow && catalogSettingsDirty"
                  color="primary"
                  size="10"
                  class="ml-2">
                  mdi-circle
                </v-icon>
              </v-tab>
              <v-divider class="my-2"></v-divider>
              <div class="text-caption text-medium-emphasis px-4 pb-1">STORAGE PROVIDER</div>
              <!-- The storage type cannot change on an existing warehouse, so the
                   settings flow shows only the provider the warehouse actually uses. -->
              <v-tab
                v-for="prov in visibleProviders"
                :key="prov.value"
                :value="prov.value"
                :disabled="
                  isCreateFlow && storageFormDirty && prov.value !== storageCredentialType
                ">
                <v-img v-if="prov.img" :src="prov.img" width="20" height="20" class="mr-3" />
                <v-icon v-else :color="prov.color" size="20" class="mr-3">{{ prov.icon }}</v-icon>
                {{ prov.title }}
                <v-icon
                  v-if="storageFormDirty && prov.value === storageCredentialType"
                  color="primary"
                  size="10"
                  class="ml-2">
                  mdi-circle
                </v-icon>
              </v-tab>
              <v-divider class="my-2"></v-divider>
              <!-- Generic on purpose: this group is where later helpers land
                   (docs, diagnostics), not just Verify and the connection strings. -->
              <div class="text-caption text-medium-emphasis px-4 pb-1">TOOLS</div>
              <v-tab value="VERIFY">
                <v-icon size="20" class="mr-3">mdi-shield-search</v-icon>
                <!-- Named for both checks it holds, so the stored-access test is
                     advertised from the rail rather than only inside the pane. -->
                {{ verifyTabTitle }}
                <v-chip
                  v-if="verifySummary"
                  :color="verifySummary.color"
                  size="x-small"
                  variant="flat"
                  class="ml-2">
                  {{ verifySummary.short }}
                </v-chip>
              </v-tab>
              <!-- Nothing to connect to until the warehouse exists. -->
              <v-tab v-if="isSettingsFlow" value="CONNECT">
                <v-icon size="20" class="mr-3">mdi-connection</v-icon>
                Connect Compute
              </v-tab>
            </v-tabs>

            <!-- The scroller is the wrapper, not the form: the form is capped at
                 1000px and a scrollbar on it would sit in the middle of the pane. -->
            <div
              class="flex-grow-1"
              style="min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden">
              <v-form style="max-width: 1000px; padding: 16px 24px">
                <div v-show="pane === 'SETTINGS'">
                  <v-text-field
                    v-if="isCreateFlow"
                    v-model="warehouseName"
                    label="Warehouse Name *"
                    placeholder="Please type the name of your warehouse"
                    :hint="
                      nameTaken
                        ? 'A warehouse with this name already exists in this project'
                        : 'Shown throughout the console and used by clients to address this warehouse'
                    "
                    persistent-hint
                    :rules="[rules.required, rules.noSlash]"
                    :error="!warehouseName || nameTaken"
                    :error-messages="nameTaken ? 'Name already taken' : []"></v-text-field>
                  <!-- Rename: editing the name here renames the warehouse on save. -->
                  <v-text-field
                    v-else
                    v-model="warehouseName"
                    label="Warehouse Name"
                    placeholder="my-warehouse"
                    prepend-inner-icon="mdi-rename-outline"
                    :hint="
                      nameTaken
                        ? 'A warehouse with this name already exists in this project'
                        : 'Shown throughout the console and used by clients to address this warehouse'
                    "
                    persistent-hint
                    :rules="[rules.required, rules.noSlash]"
                    :error="!warehouseName.trim() || nameTaken"
                    :error-messages="nameTaken ? 'Name already taken' : []"
                    class="mb-4"></v-text-field>

                  <v-card variant="flat" class="mb-4">
                    <v-card-item class="pb-1">
                      <template #prepend>
                        <v-icon color="primary">mdi-tune-variant</v-icon>
                      </template>
                      <v-card-title class="text-subtitle-1 font-weight-medium">
                        General settings
                      </v-card-title>
                      <v-card-subtitle>
                        {{
                          isSettingsFlow
                            ? 'Table format defaults, deletion safety and data retention'
                            : 'Data retention and Iceberg table format defaults'
                        }}
                      </v-card-subtitle>
                    </v-card-item>
                    <v-card-text>
                      <v-row align="start" dense>
                        <v-col cols="12" :md="isSettingsFlow ? 6 : 12">
                          <div class="text-caption text-medium-emphasis mb-2">
                            Iceberg format policy
                          </div>
                          <div class="d-flex align-center flex-wrap" style="gap: 16px">
                            <div>
                              <div class="text-caption text-medium-emphasis mb-1">Allowed</div>
                              <v-btn-toggle
                                v-model="policyAllowed"
                                multiple
                                mandatory
                                variant="outlined"
                                color="primary"
                                density="comfortable">
                                <v-btn :value="1">v1</v-btn>
                                <v-btn :value="2">v2</v-btn>
                                <v-btn :value="3">v3</v-btn>
                              </v-btn-toggle>
                            </div>
                            <div style="flex: 1; max-width: 140px">
                              <div class="text-caption text-medium-emphasis mb-1">Default</div>
                              <v-select
                                v-model="policyDefault"
                                :items="policyDefaultItems"
                                variant="outlined"
                                density="comfortable"
                                no-data-text="No format versions selected"
                                hide-details />
                            </div>
                          </div>
                        </v-col>
                        <!-- Sits beside the format policy rather than in a card of
                           its own: same weight, same row, no extra chrome. -->
                        <v-col v-if="isSettingsFlow" cols="12" md="6">
                          <div class="text-caption text-medium-emphasis mb-2">
                            Access &amp; protection
                          </div>
                          <v-switch
                            :model-value="csProtected"
                            color="primary"
                            hide-details
                            density="compact"
                            :prepend-icon="
                              csProtected ? 'mdi-lock' : 'mdi-lock-open-variant-outline'
                            "
                            :label="csProtected ? 'Deletion protected' : 'Deletion protection off'"
                            @update:model-value="csProtected = $event === true"></v-switch>
                          <div class="text-caption text-medium-emphasis ml-10">
                            Prevent this warehouse from being deleted.
                          </div>
                          <template v-if="isInstanceAdmin">
                            <v-switch
                              class="mt-3"
                              :model-value="csManagedBy === 'instance-admin'"
                              color="primary"
                              hide-details
                              density="compact"
                              :prepend-icon="
                                csManagedBy === 'instance-admin'
                                  ? 'mdi-shield-account'
                                  : 'mdi-account'
                              "
                              :label="
                                csManagedBy === 'instance-admin'
                                  ? 'Managed by instance admin'
                                  : 'Self-managed'
                              "
                              @update:model-value="
                                csManagedBy = $event === true ? 'instance-admin' : 'self-managed'
                              "></v-switch>
                            <div class="text-caption text-medium-emphasis ml-10">
                              Restrict spec changes (rename, storage, delete) to instance admins.
                            </div>
                          </template>
                        </v-col>
                        <v-col cols="12">
                          <div class="text-caption text-medium-emphasis mb-1">Soft deletion</div>
                          <v-switch
                            v-model="delProfileSoftActive"
                            color="primary"
                            hide-details
                            density="compact"
                            :label="delProfileSoftActive ? 'Enabled' : 'Disabled'"></v-switch>
                          <v-slider
                            v-if="delProfileSoftActive"
                            v-model="slider"
                            class="mt-3"
                            hide-details
                            label="Days"
                            :max="max"
                            :min="min"
                            :step="1">
                            <template #append>
                              <v-text-field
                                v-model="slider"
                                density="compact"
                                hide-details
                                single-line
                                style="width: 80px"
                                type="number"></v-text-field>
                            </template>
                          </v-slider>
                        </v-col>
                      </v-row>
                    </v-card-text>
                  </v-card>

                  <!-- One action per pane, each its own request: there is no
                     cross-endpoint transaction, so a single global Save could
                     half-succeed and leave the user guessing. -->
                  <div v-if="isSettingsFlow" class="d-flex align-center">
                    <v-btn
                      size="small"
                      variant="outlined"
                      prepend-icon="mdi-restore"
                      :disabled="!catalogSettingsDirty"
                      @click="resetSettingsPane">
                      Reset
                    </v-btn>
                    <v-spacer></v-spacer>
                    <!-- Greyed out, like Reset, until there is something to save:
                       a filled variant reads as available even when disabled. -->
                    <v-btn
                      size="small"
                      color="primary"
                      :variant="canSaveSettings ? 'flat' : 'outlined'"
                      prepend-icon="mdi-content-save-outline"
                      :disabled="!canSaveSettings"
                      @click="emitCatalogSettings">
                      Save settings
                    </v-btn>
                  </div>
                </div>

                <div v-show="isProviderPane">
                  <v-alert
                    v-if="isSettingsFlow"
                    type="info"
                    variant="tonal"
                    density="compact"
                    class="mb-4">
                    Credentials and profile are two separate endpoints, so each has its own button.
                    The new profile must keep the same location — the region may only change if an
                    endpoint is set.
                  </v-alert>

                  <WarehouseStorageFormS3
                    v-if="s3Flavor"
                    ref="storageFormRef"
                    :key="`${storageCredentialType}-${importKey}`"
                    :flavor="s3Flavor"
                    :initial="currentInitial"
                    :lock-location="isSettingsFlow"
                    @dirty="onStorageDirty"></WarehouseStorageFormS3>
                  <WarehouseStorageFormAzure
                    v-else-if="storageCredentialType === 'AZURE'"
                    ref="storageFormRef"
                    :key="`AZURE-${importKey}`"
                    :initial="currentInitial"
                    :lock-location="isSettingsFlow"
                    @dirty="onStorageDirty"></WarehouseStorageFormAzure>
                  <WarehouseStorageFormGCS
                    v-else-if="storageCredentialType === 'GCS'"
                    ref="storageFormRef"
                    :key="`GCS-${importKey}`"
                    :initial="currentInitial"
                    :lock-location="isSettingsFlow"
                    @dirty="onStorageDirty"></WarehouseStorageFormGCS>
                  <WarehouseStorageFormOneLake
                    v-else-if="storageCredentialType === 'ONELAKE'"
                    ref="storageFormRef"
                    :key="`ONELAKE-${importKey}`"
                    :initial="currentInitial"
                    :lock-location="isSettingsFlow"
                    @dirty="onStorageDirty"></WarehouseStorageFormOneLake>

                  <div
                    v-if="isSettingsFlow"
                    class="d-flex align-center flex-wrap mt-6"
                    style="gap: 8px">
                    <v-btn
                      size="small"
                      variant="outlined"
                      prepend-icon="mdi-restore"
                      :disabled="!storageFormDirty"
                      @click="resetProviderPane">
                      Reset
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-btn
                      size="small"
                      variant="outlined"
                      color="secondary"
                      prepend-icon="mdi-shield-search"
                      :loading="validationLoading"
                      @click="runVerify">
                      Verify
                    </v-btn>
                    <v-btn
                      size="small"
                      color="primary"
                      :variant="canUpdateStorage ? 'flat' : 'outlined'"
                      prepend-icon="mdi-key-change"
                      :disabled="!canUpdateStorage"
                      :loading="updating"
                      @click="submitCredentials">
                      Update credentials
                    </v-btn>
                    <v-btn
                      size="small"
                      color="primary"
                      :variant="canUpdateStorage ? 'flat' : 'outlined'"
                      prepend-icon="mdi-playlist-edit"
                      :disabled="!canUpdateStorage"
                      :loading="updating"
                      @click="submitProfile">
                      Update profile
                    </v-btn>
                  </div>
                </div>

                <div v-show="pane === 'VERIFY'">
                  <div v-if="!validationReport && !validationError && !validationLoading">
                    <!-- Do not invite an action the buttons currently refuse. -->
                    <v-alert
                      v-if="isCreateFlow && !canSubmit"
                      type="error"
                      variant="tonal"
                      density="compact">
                      {{ blockedReason }}
                      <template #append>
                        <v-btn variant="text" size="small" @click="pane = 'SETTINGS'">
                          Go to Settings
                        </v-btn>
                      </template>
                    </v-alert>
                    <div v-else class="text-body-2 text-medium-emphasis pa-4">
                      <span v-if="isCreateFlow">
                        Run
                        <strong>Verify</strong>
                        to check this configuration against your storage before creating the
                        warehouse.
                      </span>
                      <!-- Two related checks that used to be two menu entries with
                           no hint of how they differ. Spelling both out here is the
                           point of merging them. -->
                      <span v-else>
                        <strong>Verify configuration</strong>
                        checks the settings shown in the
                        <strong>{{ currentProviderTitle }}</strong>
                        pane, including edits you have not saved yet.
                        <br />
                        <strong>Test stored access</strong>
                        checks what the warehouse is actually running with right now.
                      </span>
                    </div>
                  </div>
                  <WarehouseValidationReport
                    v-else
                    class="mt-4"
                    :report="validationReport"
                    :loading="validationLoading"
                    :error="validationError"
                    hide-close></WarehouseValidationReport>

                  <!-- Only the button that was clicked spins; the other is merely
                       unavailable while a check is in flight. -->
                  <div v-if="isSettingsFlow" class="d-flex flex-wrap mt-4" style="gap: 8px">
                    <v-btn
                      size="small"
                      variant="outlined"
                      color="secondary"
                      prepend-icon="mdi-shield-search"
                      :loading="validationSource === 'config'"
                      :disabled="validationLoading"
                      @click="runVerify">
                      Verify configuration
                    </v-btn>
                    <v-btn
                      size="small"
                      variant="outlined"
                      prepend-icon="mdi-lan-check"
                      :loading="validationSource === 'stored'"
                      :disabled="validationLoading"
                      @click="runStoredAccessTest">
                      Test stored access
                    </v-btn>
                  </div>
                </div>

                <div v-show="pane === 'CONNECT'">
                  <ComputeConnectPanel
                    v-if="isSettingsFlow && props.warehouse"
                    :warehouse="props.warehouse"
                    embedded></ComputeConnectPanel>
                </div>
              </v-form>
            </div>
          </div>
        </v-card-text>
      </div>

      <v-card-actions
        v-if="isCreateFlow"
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <v-btn size="small" variant="outlined" prepend-icon="mdi-restore" @click="handleReset">
          Reset
        </v-btn>
        <v-btn size="small" variant="outlined" @click="attemptClose">Cancel</v-btn>
        <!-- The full report renders below the fold, so the verdict is repeated
             here where the buttons are. -->
        <v-chip
          v-if="verifySummary"
          :color="verifySummary.color"
          variant="flat"
          size="small"
          class="ml-4"
          link
          @click="pane = 'VERIFY'">
          <v-icon start size="small">{{ verifySummary.icon }}</v-icon>
          {{ verifySummary.text }}
        </v-chip>
        <v-spacer></v-spacer>
        <v-btn
          size="small"
          variant="outlined"
          prepend-icon="mdi-download"
          :disabled="!canSubmit"
          @click="downloadConfig">
          Download config
        </v-btn>
        <v-btn
          size="small"
          variant="outlined"
          color="secondary"
          prepend-icon="mdi-shield-search"
          :loading="validationLoading"
          :disabled="!canSubmit"
          @click="runVerify">
          Verify
        </v-btn>
        <v-btn
          size="small"
          color="primary"
          :variant="canSubmit ? 'flat' : 'outlined'"
          :disabled="!canSubmit"
          :loading="validationLoading"
          @click="verifyAndCreate">
          Verify &amp; Create
        </v-btn>
      </v-card-actions>
      <!-- The settings flow keeps its actions inside the pane they belong to, so
           this row only closes the dialog. -->
      <v-card-actions
        v-else
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <v-chip
          v-if="verifySummary"
          :color="verifySummary.color"
          variant="flat"
          size="small"
          link
          @click="pane = 'VERIFY'">
          <v-icon start size="small">{{ verifySummary.icon }}</v-icon>
          {{ verifySummary.text }}
        </v-chip>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="attemptClose">Close</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Closing with edits in flight discards them, so it is asked about rather
         than done silently. -->
    <v-dialog v-model="confirmCloseOpen" max-width="460">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="warning">mdi-alert-outline</v-icon>
          Discard unsaved changes?
        </v-card-title>
        <v-card-text class="text-body-2">
          {{ unsavedSummary }} will be lost if you close now.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="confirmCloseOpen = false">Keep editing</v-btn>
          <v-btn color="error" variant="flat" @click="discardAndClose">Discard and close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script lang="ts" setup>
import { reactive, ref, watch, computed, onMounted } from 'vue';
import { useFunctions, handleError } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import WarehouseStorageFormS3 from './WarehouseStorageFormS3.vue';
import WarehouseStorageFormAzure from './WarehouseStorageFormAzure.vue';
import WarehouseStorageFormGCS from './WarehouseStorageFormGCS.vue';
import WarehouseStorageFormOneLake from './WarehouseStorageFormOneLake.vue';
import WarehouseValidationReport from './WarehouseValidationReport.vue';
import ComputeConnectPanel from './ComputeConnectPanel.vue';
import cfIcon from '@/assets/cf.svg';
import oneLakeIcon from '@/assets/onelake.png';
import aliyunIcon from '@/assets/aliyun.svg';

import {
  CreateWarehouseRequest,
  CreateWarehouseResponse,
  GcsServiceKey,
  GetWarehouseResponse,
  ManagedBy,
  StorageCredential,
  StorageProfile,
  TabularDeleteProfile,
  ValidateWarehouseResponse,
} from '../gen/management/types.gen';
import { Intent, ObjectType, Type } from '../common/enums';
import { WarehousObject } from '@/common/interfaces';
import { useUserStore } from '../stores/user';

const visual = useVisualStore();
const userStore = useUserStore();
// Managed-by can only be changed by instance admins (lakekeeper#1828).
const isInstanceAdmin = computed(() => userStore.isInstanceAdmin === true);
const projectId = computed(() => {
  return visual.projectSelected['project-id'];
});

const creatingWarehouse = ref(false);
const loadedDeltionSeconds = ref(0);
const loadedDelProfileSoftActive = ref(false);

// Access & protection (settings flow only). Current + loaded baseline so we
// only emit changed values — avoids no-op mutations that could 403/permission-fail.
const csManagedBy = ref<ManagedBy>('self-managed');
const csProtected = ref(false);
const loadedManagedBy = ref<ManagedBy>('self-managed');
const loadedProtected = ref(false);
// Baseline warehouse name (settings flow only) to detect a rename.
const loadedName = ref('');

const delProfileSoftActive = ref(false);
const isDialogActive = ref(false);

// Iceberg format-version policy (create-flow defaults: all allowed, v2 default).
// Default mirrors server semantics: v2 if allowed, otherwise highest allowed.
function pickDefaultFromAllowed(allowed: number[]): number {
  // Guard against empty input. The btn-toggle is `mandatory` so this should not
  // happen in practice, but `Math.max(...[])` returns -Infinity and would land
  // in the payload if it ever did.
  if (allowed.length === 0) return 2;
  if (allowed.includes(2)) return 2;
  return Math.max(...allowed);
}
const policyAllowed = ref<number[]>([1, 2, 3]);
const policyDefault = ref<number>(2);
const policyDefaultItems = computed(() =>
  policyAllowed.value.map((v) => ({ title: `v${v}`, value: v })),
);
// If allowed changes such that the current default is no longer in it, pick a sensible one.
// deep:true because v-btn-toggle (multiple) may mutate the bound array in place.
watch(
  policyAllowed,
  (next) => {
    if (next.length > 0 && !next.includes(policyDefault.value)) {
      policyDefault.value = pickDefaultFromAllowed(next);
    }
  },
  { deep: true },
);

const emit = defineEmits<{
  (e: 'addedWarehouse'): void;
  (e: 'cancel'): void;
  (e: 'close'): void;
  (e: 'renameWarehouse', name: string): void;
  (e: 'updateCredentials', credentials: StorageCredential): void;
  (
    e: 'updateProfile',
    newProfile: { profile: StorageProfile; credentials?: StorageCredential },
  ): void;
  (
    e: 'updateCatalogSettings',
    payload: {
      deleteProfile?: TabularDeleteProfile;
      formatPolicy?: { allowed: number[]; default: number };
      managedBy?: ManagedBy;
      protected?: boolean;
    },
  ): void;
}>();

const props = defineProps<{
  warehouse: GetWarehouseResponse | undefined;
  intent: Intent;
  objectType: ObjectType;
  processStatus: string;
}>();

// Two flows share this dialog: creating a warehouse, and editing an existing one.
// They render the same panes; the difference is which actions those panes carry.
const isCreateFlow = computed(() => props.objectType === ObjectType.WAREHOUSE);
const isSettingsFlow = computed(() => !isCreateFlow.value);
const updating = computed(() => props.processStatus === 'running');

// Bumping this remounts the storage pane, which is how it re-reads its seed —
// used by Import, by Reset, and after a successful update.
const importKey = ref(0);
// Reported by the storage pane, which owns its own state.
const storageFormDirty = ref(false);
// A dirty pane that stays dirty reports the same boolean on every keystroke, so
// the flag alone cannot invalidate a verification report. This counts edits.
const storageEdits = ref(0);

function onStorageDirty(value: boolean) {
  storageFormDirty.value = value;
  storageEdits.value++;
}

const min = ref(0);
const max = ref(90);
const slider = ref(7);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleFileImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      preloadWarehouseJSON(JSON.parse(e.target?.result as string));
    } catch (err) {
      handleError(err, 'importing warehouse JSON', true);
    }
    input.value = '';
  };
  reader.onerror = () => {
    handleError(reader.error || new Error('File read error'), 'reading warehouse JSON file', true);
    input.value = '';
  };
  reader.readAsText(file);
}

const storageCredentialType = ref('');
const warehouseName = ref('');
const functions = useFunctions();
const rules = {
  required: (value: any) => !!value || 'Required.',
  noSlash: (value: string) => !value.includes('/') || 'Cannot contain "/"',
};

const warehouseObjectS3 = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: '',
    'remote-signing-enabled': true,
    'sts-enabled': false,
    flavor: 'aws',
  },
  'storage-credential': {
    type: 's3',
    'access-key-id': '',
    'secret-access-key': '',
    'credential-type': 'access-key',
  },
});

const warehouseObjectR2 = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: '',
    'remote-signing-enabled': true,
    'sts-enabled': true,
    flavor: 's3-compat',
  },
  'storage-credential': {
    type: 's3',
    'credential-type': 'cloudflare-r2',
    'access-key-id': '',
    'secret-access-key': '',
    'account-id': '',
    token: '',
  },
});

const warehouseObjectS3Compat = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: 'local',
    'remote-signing-enabled': true,
    'sts-enabled': false,
    flavor: 's3-compat',
  },
  'storage-credential': {
    type: 's3',
    'access-key-id': '',
    'secret-access-key': '',
    'credential-type': 'access-key',
  },
});

const warehouseObjectAliyun = reactive<WarehousObject>({
  'storage-profile': {
    type: 's3',
    bucket: '',
    region: '',
    'remote-signing-enabled': true,
    // Aliyun OSS vends temporary credentials via the Alibaba Cloud STS AssumeRole API,
    // which requires an STS role ARN, so STS is enabled by default.
    'sts-enabled': true,
    flavor: 's3-compat',
  },
  'storage-credential': {
    type: 's3',
    'access-key-id': '',
    'secret-access-key': '',
    'credential-type': 'aliyun-oss',
  },
});

const key = reactive<GcsServiceKey>({
  auth_provider_x509_cert_url: '',
  auth_uri: '',
  client_email: '',
  client_id: '',
  client_x509_cert_url: '',
  private_key: '',
  private_key_id: '',
  project_id: '',
  token_uri: '',
  type: '',
  universe_domain: '',
});
const warehouseObjectGCS = reactive<WarehousObject>({
  'storage-profile': {
    type: 'gcs',
    bucket: '',
    'sts-enabled': true,
  },
  'storage-credential': {
    type: 'gcs',
    'credential-type': 'service-account-key',
    key,
  },
});

const warehouseObjectAz = reactive<WarehousObject>({
  'storage-profile': {
    'account-name': '',
    filesystem: '',
    'sas-enabled': true,
    type: 'adls',
  },
  'storage-credential': {
    'client-id': '',
    'client-secret': '',
    'credential-type': 'client-credentials',
    'tenant-id': '',
    type: 'az',
  },
});

const warehouseObjectOneLake = reactive<WarehousObject>({
  'storage-profile': {
    'workspace-id': '',
    'lakehouse-id': '',
    'top-level-folder': 'Files',
    'sas-enabled': true,
    type: 'onelake',
  },
  'storage-credential': {
    'client-id': '',
    'client-secret': '',
    'credential-type': 'client-credentials',
    'tenant-id': '',
    type: 'az',
  },
});

// Vue's reactive() proxies aren't structured-cloneable (DataCloneError) —
// a JSON round-trip is a safe deep clone for this plain form data instead.
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// Pristine snapshots captured once at setup, used to reset the create-flow
// form after a successful create so re-opening the dialog (e.g. to add
// another warehouse) doesn't show stale input from the previous one.
const initialWarehouseObjects = {
  s3: deepClone(warehouseObjectS3),
  r2: deepClone(warehouseObjectR2),
  s3Compat: deepClone(warehouseObjectS3Compat),
  aliyun: deepClone(warehouseObjectAliyun),
  gcs: deepClone(warehouseObjectGCS),
  az: deepClone(warehouseObjectAz),
  oneLake: deepClone(warehouseObjectOneLake),
};
const initialKey = deepClone(key);

function resetCreateForm() {
  warehouseName.value = '';
  // Back to the pane and provider the dialog opens on, so re-opening it after a
  // create doesn't land on a provider tab with no form under it.
  pane.value = 'SETTINGS';
  storageCredentialType.value = 'S3';
  slider.value = 7;
  delProfileSoftActive.value = false;
  policyAllowed.value = [1, 2, 3];
  policyDefault.value = 2;
  Object.assign(warehouseObjectS3, deepClone(initialWarehouseObjects.s3));
  Object.assign(warehouseObjectR2, deepClone(initialWarehouseObjects.r2));
  Object.assign(warehouseObjectS3Compat, deepClone(initialWarehouseObjects.s3Compat));
  Object.assign(warehouseObjectAliyun, deepClone(initialWarehouseObjects.aliyun));
  Object.assign(warehouseObjectGCS, deepClone(initialWarehouseObjects.gcs));
  Object.assign(warehouseObjectAz, deepClone(initialWarehouseObjects.az));
  Object.assign(warehouseObjectOneLake, deepClone(initialWarehouseObjects.oneLake));
  Object.assign(key, deepClone(initialKey));
  // Force the storage pane to remount so its own local state resets too.
  storageFormDirty.value = false;
  importKey.value++;
}

function buildCreateWarehouseRequest(warehouseObject: WarehousObject): CreateWarehouseRequest {
  const delProfile: TabularDeleteProfile = delProfileSoftActive.value
    ? { type: 'soft', 'expiration-seconds': Math.round(slider.value * 86400) }
    : { type: 'hard' };

  // Belt-and-suspenders: never send a default that's not in the allowed set.
  const effectiveDefault = policyAllowed.value.includes(policyDefault.value)
    ? policyDefault.value
    : pickDefaultFromAllowed(policyAllowed.value);

  return {
    'delete-profile': delProfile,
    'warehouse-name': warehouseName.value,
    'project-id': projectId.value,
    'storage-credential': warehouseObject['storage-credential'] as StorageCredential,
    'storage-profile': warehouseObject['storage-profile'] as StorageProfile,
    'allowed-format-versions': [...policyAllowed.value].sort((a, b) => a - b),
    'default-format-version': effectiveDefault,
  };
}

async function createWarehouse(
  warehouseObject: WarehousObject,
  shouldDownloadJson: boolean = false,
) {
  try {
    creatingWarehouse.value = true;

    const wh = buildCreateWarehouseRequest(warehouseObject);

    const res: CreateWarehouseResponse = await functions.createWarehouse(wh, true);

    // Download JSON if requested
    if (shouldDownloadJson) {
      const jsonString = JSON.stringify(wh, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `warehouse-${warehouseName.value}-${res['warehouse-id']}-config.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    emit('addedWarehouse');
    creatingWarehouse.value = false;
    isDialogActive.value = false;
    resetCreateForm();
  } catch (error) {
    creatingWarehouse.value = false;
    handleError(error, 'createWarehouse', true);
  }
}

async function preloadWarehouseJSON(wh: CreateWarehouseRequest) {
  try {
    // Start from a clean form: the imported config is the whole truth, and
    // Object.assign below would otherwise leave fields the file does not mention
    // holding whatever was typed before.
    resetCreateForm();
    validationReport.value = null;
    validationError.value = null;

    warehouseName.value = wh['warehouse-name'];
    const data = {
      'storage-profile': wh['storage-profile'],
      'storage-credential': wh['storage-credential'],
    };
    const type = wh['storage-profile'].type;
    if (type === 'adls') {
      storageCredentialType.value = 'AZURE';
      Object.assign(warehouseObjectAz, data);
    } else if (type === 'onelake') {
      storageCredentialType.value = 'ONELAKE';
      Object.assign(warehouseObjectOneLake, data);
    } else if (type === 'gcs') {
      storageCredentialType.value = 'GCS';
      Object.assign(warehouseObjectGCS, data);
    } else if (type === 's3') {
      const credType = wh['storage-credential']?.['credential-type'];
      const flavor = wh['storage-profile']?.flavor;
      if (credType === 'cloudflare-r2') {
        storageCredentialType.value = 'R2';
        Object.assign(warehouseObjectR2, data);
      } else if (credType === 'aliyun-oss') {
        storageCredentialType.value = 'ALIYUN_OSS';
        Object.assign(warehouseObjectAliyun, data);
      } else if (flavor === 's3-compat') {
        storageCredentialType.value = 'S3_COMPAT';
        Object.assign(warehouseObjectS3Compat, data);
      } else {
        storageCredentialType.value = 'S3';
        Object.assign(warehouseObjectS3, data);
      }
    } else {
      storageCredentialType.value = String(type).toUpperCase();
    }
    // Land on the provider the file describes, rather than leaving the rail on
    // whichever pane happened to be open.
    pane.value = storageCredentialType.value;
    importKey.value++;
  } catch (error) {
    handleError(error, 'importing warehouse JSON', true);
  }
}

// True when any non-name catalog setting differs from the loaded warehouse state.
const settingsChanged = computed(() => {
  const deletionChanged =
    slider.value !== loadedDeltionSeconds.value ||
    delProfileSoftActive.value !== loadedDelProfileSoftActive.value;
  const serverAllowed = (props.warehouse?.['allowed-format-versions'] ?? []) as number[];
  const serverDefault = (props.warehouse?.['default-format-version'] ?? null) as number | null;
  const resolvedServerDefault =
    serverDefault !== null
      ? serverDefault
      : serverAllowed.length > 0
        ? serverAllowed.includes(2)
          ? 2
          : Math.max(...serverAllowed)
        : null;
  const allowedChanged =
    serverAllowed.length !== policyAllowed.value.length ||
    serverAllowed.some((v) => !policyAllowed.value.includes(v));
  const defaultChanged = policyDefault.value !== resolvedServerDefault;
  const accessChanged =
    csManagedBy.value !== loadedManagedBy.value || csProtected.value !== loadedProtected.value;
  return deletionChanged || allowedChanged || defaultChanged || accessChanged;
});

const nameChanged = computed(() => warehouseName.value.trim() !== loadedName.value);

// Tracks whether any settings-pane field (or the name) differs from loaded.
const catalogSettingsDirty = computed(
  () => isSettingsFlow.value && (settingsChanged.value || nameChanged.value),
);

// A rename to a taken name is rejected by the server, so it blocks the save the
// same way an empty name does.
const canSaveSettings = computed(
  () => catalogSettingsDirty.value && warehouseName.value.trim().length > 0 && !nameTaken.value,
);
const canUpdateStorage = computed(() => storageFormDirty.value && !updating.value);

function emitCatalogSettings() {
  // Rename first, if the name changed and is valid.
  const newName = warehouseName.value.trim();
  if (nameChanged.value && newName.length > 0 && !newName.includes('/') && !nameTaken.value) {
    emit('renameWarehouse', newName);
  }

  // Only emit a settings update when a non-name field actually changed, so a
  // pure rename doesn't trigger a redundant delete-profile / format PATCH.
  if (!settingsChanged.value) return;

  const delProfile: TabularDeleteProfile = delProfileSoftActive.value
    ? { type: 'soft', 'expiration-seconds': Math.round(slider.value * 86400) }
    : { type: 'hard' };
  const effectiveDefault = policyAllowed.value.includes(policyDefault.value)
    ? policyDefault.value
    : pickDefaultFromAllowed(policyAllowed.value);
  emit('updateCatalogSettings', {
    deleteProfile: delProfile,
    formatPolicy: {
      allowed: [...policyAllowed.value].sort((a, b) => a - b),
      default: effectiveDefault,
    },
    // Only include access/protection fields that actually changed.
    ...(csManagedBy.value !== loadedManagedBy.value ? { managedBy: csManagedBy.value } : {}),
    ...(csProtected.value !== loadedProtected.value ? { protected: csProtected.value } : {}),
  });
}

// The toggles stage like every other field in this pane; "Save settings" is the
// single commit point, and the rail marks the pane until then. A confirm step
// here would ask twice for one change, and the other entities do not have one.
// ---------------------------------------------------------------------------
// Rail: providers + Settings + Verify
// ---------------------------------------------------------------------------
const storageFormRef = ref<{ getData?: () => WarehousObject } | null>(null);

// Every supported provider stays individually visible — the four s3 flavours are
// one component under the hood, but collapsing them in the UI would hide half the
// providers Lakekeeper actually supports.
const storageProviders = [
  { value: 'S3', title: 'AWS S3', icon: 'mdi-aws', color: 'orange' },
  { value: 'AZURE', title: 'Azure ADLS', icon: 'mdi-microsoft-azure', color: 'primary' },
  { value: 'ONELAKE', title: 'OneLake', img: oneLakeIcon },
  { value: 'S3_COMPAT', title: 'S3 Compatible', icon: 'mdi-bucket-outline', color: 'primary' },
  { value: 'GCS', title: 'Google Cloud', icon: 'mdi-google-cloud', color: 'info' },
  { value: 'R2', title: 'Cloudflare R2', img: cfIcon },
  { value: 'ALIYUN_OSS', title: 'Alibaba OSS', img: aliyunIcon },
];

// An existing warehouse cannot change storage type, so only its own provider is
// offered; the create flow advertises all of them.
const visibleProviders = computed(() =>
  isCreateFlow.value
    ? storageProviders
    : storageProviders.filter((p) => p.value === storageCredentialType.value),
);

// Only the settings flow has an existing warehouse to test against; the create
// flow has a configuration and nothing else.
const verifyTabTitle = computed(() => (isSettingsFlow.value ? 'Verify & test' : 'Verify'));

const currentProviderTitle = computed(
  () => storageProviders.find((p) => p.value === storageCredentialType.value)?.title ?? 'provider',
);

const existingNames = ref<string[]>([]);
const nameTaken = computed(() => {
  const candidate = warehouseName.value.trim().toLowerCase();
  if (!candidate) return false;
  // Keeping (or restoring) the warehouse's own name is not a collision.
  if (isSettingsFlow.value && candidate === loadedName.value.trim().toLowerCase()) return false;
  return existingNames.value.includes(candidate);
});

// The rail doubles as pane navigation: a provider entry both selects the provider
// and shows its form, while SETTINGS/VERIFY are panes of their own.
const pane = ref('SETTINGS');
const isProviderPane = computed(() => storageProviders.some((p) => p.value === pane.value));
watch(pane, (value) => {
  if (storageProviders.some((p) => p.value === value)) storageCredentialType.value = value;
});

// Which seed the storage pane reads. Each provider keeps its own object so
// switching providers in the create flow doesn't smear one config over another.
const STORAGE_OBJECTS: Record<string, WarehousObject> = {
  S3: warehouseObjectS3,
  R2: warehouseObjectR2,
  S3_COMPAT: warehouseObjectS3Compat,
  ALIYUN_OSS: warehouseObjectAliyun,
  GCS: warehouseObjectGCS,
  AZURE: warehouseObjectAz,
  ONELAKE: warehouseObjectOneLake,
};

const currentInitial = computed(() => STORAGE_OBJECTS[storageCredentialType.value] ?? null);

type S3Flavor = 'aws' | 'cloudflare-r2' | 'aliyun-oss' | 's3-compat';
const S3_FLAVORS: Record<string, S3Flavor> = {
  S3: 'aws',
  R2: 'cloudflare-r2',
  ALIYUN_OSS: 'aliyun-oss',
  S3_COMPAT: 's3-compat',
};
const s3Flavor = computed<S3Flavor | null>(() => S3_FLAVORS[storageCredentialType.value] ?? null);

const verifySummary = computed(() => {
  if (validationLoading.value) return null;
  if (validationError.value)
    return { color: 'error', icon: 'mdi-alert-circle', text: 'Verification failed', short: '!' };
  const report = validationReport.value;
  if (!report) return null;
  const failed = report.checks.filter((c) => c.status === 'failed').length;
  return failed > 0
    ? {
        color: 'error',
        icon: 'mdi-close-circle',
        text: `${failed} check${failed === 1 ? '' : 's'} failed`,
        short: String(failed),
      }
    : { color: 'success', icon: 'mdi-check-circle', text: 'All checks passed', short: '✓' };
});

// A report describes the config as it was when Verify ran. Editing anything after
// that makes the verdict stale — and a stale green tick is worse than none — so
// the result is dropped as soon as the form changes.
watch([() => warehouseName.value, storageCredentialType, storageEdits], () => {
  if (validationLoading.value) return;
  if (validationReport.value || validationError.value) {
    validationReport.value = null;
    validationError.value = null;
  }
});

const blockedReason = computed(() => {
  if (!warehouseName.value.trim()) return 'Enter a warehouse name in Settings before verifying.';
  if (nameTaken.value) return 'That warehouse name is already taken — pick another in Settings.';
  if (warehouseName.value.includes('/')) return 'The warehouse name cannot contain "/".';
  return '';
});

function currentStorageData(): WarehousObject | null {
  return storageFormRef.value?.getData?.() ?? null;
}

// The API never returns credentials, so the settings flow starts with empty
// fields. Sending that back as a credential would fail — treat "nothing entered"
// as "leave the stored credential alone".
function credentialEntered(credential: Record<string, any> | undefined): boolean {
  if (!credential) return false;
  const type = String(credential['credential-type'] ?? '');
  if (type.includes('system-identity')) return true;
  return Object.keys(credential).some(
    (k) => k !== 'type' && k !== 'credential-type' && credential[k] !== undefined,
  );
}

async function runVerify(): Promise<boolean> {
  const data = currentStorageData();
  if (!data) return false;
  validationLoading.value = true;
  validationSource.value = 'config';
  validationReport.value = null;
  validationError.value = null;
  // Straight to the report, which renders its own loading state — the pane used
  // to flick through Settings while the request was in flight.
  pane.value = 'VERIFY';
  try {
    const credential = data['storage-credential'] as StorageCredential;
    // An existing warehouse has its own validation endpoints — validateWarehouse
    // would check a create request that is not what we are about to send.
    validationReport.value =
      isSettingsFlow.value && props.warehouse
        ? await functions.validateStorageProfile(
            props.warehouse['warehouse-id'],
            credentialEntered(credential) ? credential : null,
            data['storage-profile'] as StorageProfile,
          )
        : await functions.validateWarehouse(buildCreateWarehouseRequest(data));
    return validationReport.value.valid;
  } catch (error: any) {
    validationError.value = error?.error?.message || error?.message || 'Validation request failed.';
    return false;
  } finally {
    validationLoading.value = false;
    validationSource.value = null;
    pane.value = 'VERIFY';
  }
}

async function verifyAndCreate() {
  if (await runVerify()) createNow();
}

// The other half of Verify: what the warehouse is stored with, rather than what
// the form currently shows. This was the "Test Storage Access" menu entry.
async function runStoredAccessTest() {
  if (!props.warehouse) return;
  validationLoading.value = true;
  validationSource.value = 'stored';
  validationReport.value = null;
  validationError.value = null;
  pane.value = 'VERIFY';
  try {
    validationReport.value = await functions.validateStorageAccess(props.warehouse.id);
  } catch (error: any) {
    validationError.value = error?.error?.message || error?.message || 'Validation request failed.';
  } finally {
    validationLoading.value = false;
    validationSource.value = null;
  }
}

function createNow(shouldDownloadJson = false) {
  const data = currentStorageData();
  if (data) createWarehouse(data, shouldDownloadJson);
}

// Export the config without creating anything, so it can be kept as a template.
function downloadConfig() {
  const data = currentStorageData();
  if (!data) return;
  const wh = buildCreateWarehouseRequest(data);
  const blob = new Blob([JSON.stringify(wh, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `warehouse-${warehouseName.value || 'config'}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const canSubmit = computed(
  () =>
    warehouseName.value.trim().length > 0 && !warehouseName.value.includes('/') && !nameTaken.value,
);

// Unsaved work lives in the panes, so the modal asks before throwing it away.
const confirmCloseOpen = ref(false);
const hasUnsaved = computed(() => {
  if (isCreateFlow.value) return storageFormDirty.value || warehouseName.value.trim().length > 0;
  return catalogSettingsDirty.value || storageFormDirty.value;
});
const unsavedSummary = computed(() => {
  if (isCreateFlow.value) return 'This warehouse has not been created yet, so everything entered';
  const panes = [
    catalogSettingsDirty.value ? 'Settings' : null,
    storageFormDirty.value ? currentProviderTitle.value : null,
  ].filter(Boolean);
  return `Unsaved changes in ${panes.join(' and ')}`;
});

function attemptClose() {
  if (hasUnsaved.value) confirmCloseOpen.value = true;
  else cancelDialog();
}

function discardAndClose() {
  confirmCloseOpen.value = false;
  cancelDialog();
}

function cancelDialog() {
  isDialogActive.value = false;
  emit('cancel');
  emit('close');
}

// Reset means "discard my edits". The storage pane owns its state and never
// mutates the seed, so remounting it is enough to restore the loaded values.
function resetProviderPane() {
  storageFormDirty.value = false;
  validationReport.value = null;
  validationError.value = null;
  importKey.value++;
}

// The settings pane resets to what the warehouse currently has.
function resetSettingsPane() {
  seedSettingsFromWarehouse();
}

function handleReset() {
  if (isSettingsFlow.value) {
    resetProviderPane();
    resetSettingsPane();
    return;
  }
  // Create flow: clear every input, but keep the user where they were —
  // resetCreateForm() returns to the opening pane, which is only wanted after a
  // successful create, where the dialog closes anyway.
  const selectedProvider = storageCredentialType.value;
  const selectedPane = pane.value;
  resetCreateForm();
  validationReport.value = null;
  validationError.value = null;
  storageCredentialType.value = selectedProvider;
  pane.value = selectedPane;
}

// --- Settings flow: one action per pane, each its own request ----------------
function submitCredentials() {
  const data = currentStorageData();
  if (!data) return;
  const credential = data['storage-credential'] as StorageCredential;
  // The API never returns credentials, so the fields start empty; sending that
  // back would replace a working credential with nothing.
  if (!credentialEntered(credential)) {
    visual.setSnackbarMsg({
      function: 'updateStorageCredential',
      text: 'Enter the credential fields before updating credentials.',
      ttl: 4000,
      ts: Date.now(),
      type: Type.WARNING,
    });
    return;
  }
  emit('updateCredentials', credential);
}

function submitProfile() {
  const data = currentStorageData();
  if (!data) return;
  const credential = data['storage-credential'] as StorageCredential;
  emit('updateProfile', {
    profile: data['storage-profile'] as StorageProfile,
    // Omitted rather than sent empty: the endpoint keeps the stored credential
    // when none is supplied.
    credentials: credentialEntered(credential) ? credential : undefined,
  });
}

const validationLoading = ref(false);
// Which check is running, so a spinner appears on the button that was pressed
// rather than on every button bound to the shared loading flag.
const validationSource = ref<'config' | 'stored' | null>(null);
const validationReport = ref<ValidateWarehouseResponse | null>(null);
const validationError = ref<string | null>(null);

// --- Seeding from an existing warehouse --------------------------------------
function seedStorageFromWarehouse(wh: GetWarehouseResponse) {
  const credType = wh['storage-credential-type'];
  const profile = deepClone(wh['storage-profile']) as any;
  const type = profile.type;

  // Only the profile comes back from the API; credentials are write-only, so the
  // credential keeps its default shape with the stored type pre-selected.
  const seed = (target: WarehousObject, credentialType?: string | null) => {
    Object.assign(target, { 'storage-profile': profile });
    if (credentialType) {
      (target['storage-credential'] as Record<string, any>)['credential-type'] = credentialType;
    }
  };

  if (type === 's3') {
    const s3CredType = credType && credType.type === 's3' ? credType['credential-type'] : null;
    if (s3CredType === 'cloudflare-r2') {
      storageCredentialType.value = 'R2';
      seed(warehouseObjectR2, 'cloudflare-r2');
    } else if (s3CredType === 'aliyun-oss') {
      storageCredentialType.value = 'ALIYUN_OSS';
      seed(warehouseObjectAliyun, 'aliyun-oss');
    } else if (profile.flavor === 's3-compat') {
      storageCredentialType.value = 'S3_COMPAT';
      seed(warehouseObjectS3Compat, s3CredType ?? 'access-key');
    } else {
      storageCredentialType.value = 'S3';
      seed(warehouseObjectS3, s3CredType);
    }
  } else if (type === 'adls') {
    storageCredentialType.value = 'AZURE';
    seed(
      warehouseObjectAz,
      credType && credType.type === 'az' ? credType['credential-type'] : null,
    );
  } else if (type === 'onelake') {
    storageCredentialType.value = 'ONELAKE';
    seed(
      warehouseObjectOneLake,
      credType && credType.type === 'az' ? credType['credential-type'] : null,
    );
  } else if (type === 'gcs') {
    storageCredentialType.value = 'GCS';
    seed(
      warehouseObjectGCS,
      credType && credType.type === 'gcs' ? credType['credential-type'] : null,
    );
  }
}

// Seeds the settings pane and, at the same time, the baselines that "dirty" and
// the diffed save are measured against.
// Split from the name so a rename in progress is not clobbered when the server
// copy changes for an unrelated reason.
function seedAccessAndPolicyFromWarehouse() {
  const wh = props.warehouse;
  if (!wh) return;

  if (wh['delete-profile'].type === 'soft') {
    slider.value = Math.round(wh['delete-profile']['expiration-seconds'] / 86400);
    delProfileSoftActive.value = true;
  } else {
    slider.value = 7;
    delProfileSoftActive.value = false;
  }
  loadedDeltionSeconds.value = slider.value;
  loadedDelProfileSoftActive.value = delProfileSoftActive.value;

  const serverAllowed = (wh['allowed-format-versions'] ?? [1, 2, 3]) as number[];
  const serverDefault = (wh['default-format-version'] ?? null) as number | null;
  policyAllowed.value = [...serverAllowed];
  policyDefault.value =
    serverDefault !== null ? serverDefault : pickDefaultFromAllowed(serverAllowed);

  csManagedBy.value = (wh['managed-by'] ?? 'self-managed') as ManagedBy;
  csProtected.value = wh.protected === true;
  loadedManagedBy.value = csManagedBy.value;
  loadedProtected.value = csProtected.value;
}

function seedSettingsFromWarehouse() {
  const wh = props.warehouse;
  if (!wh) return;
  seedAccessAndPolicyFromWarehouse();
  warehouseName.value = wh.name ?? '';
  loadedName.value = warehouseName.value;
}

// Saving these settings goes through the parent, which reloads the warehouse but
// reports no status back, so the baselines this pane compares against have to
// follow the server copy itself — otherwise a saved change still reads as unsaved.
watch(
  () => [
    props.warehouse?.protected,
    props.warehouse?.['managed-by'],
    props.warehouse?.['delete-profile'],
    props.warehouse?.['allowed-format-versions'],
    props.warehouse?.['default-format-version'],
  ],
  () => {
    if (isSettingsFlow.value) seedAccessAndPolicyFromWarehouse();
  },
  { deep: true },
);

// Both flows need the taken names: creating and renaming collide the same way,
// and a rejected rename is worth catching before the request. The list goes stale
// as soon as anything is renamed — including by this dialog — so it is re-read
// rather than fetched once.
function loadExistingNames() {
  functions
    .listWarehouses()
    .then((res: any) => {
      existingNames.value = (res?.warehouses ?? [])
        // This warehouse is not a collision with itself, and matching on id
        // survives a rename that the list has not caught up with yet.
        .filter((w: any) => !props.warehouse || w.id !== props.warehouse.id)
        .map((w: any) => String(w.name ?? '').toLowerCase());
    })
    // Non-fatal: the server still rejects duplicates, and Verify reports them.
    .catch(() => {});
}

// Re-read on every open: warehouses come and go while this component stays
// mounted inside the actions menu.
watch(isDialogActive, (open) => {
  if (open) loadExistingNames();
});

onMounted(() => {
  loadExistingNames();

  if (isCreateFlow.value) {
    // A provider is always shown selected, so the create flow needs one up front
    // (the old tab strip opened with none selected and no form beneath it).
    storageCredentialType.value = 'S3';
    return;
  }
  if (props.warehouse) {
    seedStorageFromWarehouse(props.warehouse);
    seedSettingsFromWarehouse();
  }
});

// Keep the rename baseline in sync with the parent after a successful rename, so
// nameChanged doesn't stay true and re-emit renameWarehouse on the next save.
watch(
  () => props.warehouse?.name,
  (name) => {
    if (isCreateFlow.value || name === undefined) return;
    // Only move the field if the user hasn't diverged from the old baseline.
    if (warehouseName.value === loadedName.value) warehouseName.value = name ?? '';
    loadedName.value = name ?? '';
    // The rename just freed the old name and took a new one — without this,
    // renaming back reports the name this dialog itself released as taken.
    loadExistingNames();
  },
);

// An update lands as a new warehouse object from the parent. Re-seed from it so
// the panes show what is now stored and stop reporting themselves as dirty —
// without closing the dialog, since the other pane may still have work to do.
watch(
  () => props.processStatus,
  (status) => {
    if (status !== 'success') return;
    if (isCreateFlow.value) {
      isDialogActive.value = false;
      emit('cancel');
      return;
    }
    if (props.warehouse) {
      seedStorageFromWarehouse(props.warehouse);
      seedSettingsFromWarehouse();
    }
    resetProviderPane();
  },
);
</script>
