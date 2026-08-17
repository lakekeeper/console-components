<template>
  <div>
    <v-toolbar color="transparent" density="comfortable" flat>
      <v-btn icon="mdi-arrow-left" variant="text" title="Back to tags" @click="goBack"></v-btn>
      <v-icon class="mr-2" color="info">mdi-tag-outline</v-icon>
      <v-toolbar-title>
        <span class="d-inline-flex align-center flex-wrap">
          <template v-for="(seg, i) in nameSegments" :key="i">
            <v-icon v-if="i > 0" size="x-small" class="mx-1 text-disabled">
              mdi-chevron-right
            </v-icon>
            <v-chip
              size="small"
              variant="tonal"
              :color="i === nameSegments.length - 1 ? 'info' : undefined">
              {{ seg }}
            </v-chip>
          </template>
        </span>
      </v-toolbar-title>
      <v-icon v-if="isSystem" class="ml-2 text-medium-emphasis" size="small">
        mdi-lock-outline
      </v-icon>
    </v-toolbar>

    <v-tabs v-model="tab" color="primary">
      <v-tab value="details">Details</v-tab>
      <v-tab v-if="isOpenFga && !isSystem" value="permissions">Permissions</v-tab>
      <v-tab v-if="grantsSupported && !isSystem" value="grants">Grants</v-tab>
      <v-tab value="attachments">Attachments</v-tab>
    </v-tabs>
    <v-divider></v-divider>

    <v-tabs-window v-model="tab" crossfade>
      <!-- Details -->
      <v-tabs-window-item value="details">
        <div class="pa-4">
          <v-sheet rounded="lg" border>
            <v-table density="compact">
              <tbody>
                <tr>
                  <td class="text-medium-emphasis" style="width: 200px">Value kind</td>
                  <td>
                    <v-chip size="x-small" variant="tonal">{{ full['value-kind'] }}</v-chip>
                  </td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Scope</td>
                  <td>
                    <v-chip
                      v-for="s in full.scope"
                      :key="s"
                      class="mr-1 mb-1"
                      size="x-small"
                      variant="outlined">
                      {{ s }}
                    </v-chip>
                  </td>
                </tr>
                <tr v-if="full['value-kind'] === 'enumerated'">
                  <td class="text-medium-emphasis">Allowed values</td>
                  <td>
                    <template v-if="(full['allowed-values'] || []).length">
                      <v-chip
                        v-for="v in full['allowed-values']"
                        :key="v"
                        class="mr-1 mb-1"
                        size="x-small"
                        variant="tonal"
                        color="info">
                        {{ v }}
                      </v-chip>
                    </template>
                    <span v-else class="text-disabled">—</span>
                  </td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Description</td>
                  <td>{{ full.description || '—' }}</td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Created</td>
                  <td>{{ fmtDate(full['created-at']) }}</td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Updated</td>
                  <td>{{ fmtDate(full['updated-at']) }}</td>
                </tr>
                <tr>
                  <td class="text-medium-emphasis">Tag ID</td>
                  <td>
                    <div class="d-flex align-center">
                      <span class="font-mono">{{ full.id }}</span>
                      <v-btn
                        icon="mdi-content-copy"
                        size="x-small"
                        variant="text"
                        class="ml-1"
                        @click="functions.copyToClipboard(full.id)"></v-btn>
                    </div>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-sheet>

          <div v-if="canCreateTag && !isSystem" class="d-flex ga-2 mt-4 align-center justify-end">
            <TagDefinitionDialog action-type="edit" :definition="full" @submit="onEdit">
              <template #activator="{ props: aProps }">
                <v-btn
                  v-bind="aProps"
                  color="primary"
                  variant="outlined"
                  size="small"
                  prepend-icon="mdi-pencil-outline">
                  Edit tag
                </v-btn>
              </template>
            </TagDefinitionDialog>
            <v-btn
              color="error"
              variant="outlined"
              size="small"
              prepend-icon="mdi-delete-outline"
              :loading="checking"
              @click="requestDelete">
              Delete tag
            </v-btn>
          </div>
        </div>
      </v-tabs-window-item>

      <!-- Permissions -->
      <v-tabs-window-item v-if="isOpenFga && !isSystem" value="permissions">
        <TagPermissionsPanel
          v-if="tab === 'permissions' && full.id"
          :tag-definition-id="full.id"
          :tag-name="full.name" />
      </v-tabs-window-item>

      <!-- Grants. Sits beside Permissions rather than replacing it: the two
           are different models over the same intent, and a deployment can be
           moving from one to the other. -->
      <v-tabs-window-item v-if="grantsSupported && !isSystem" value="grants">
        <div class="pa-4" style="height: calc(100vh - 300px); min-height: 360px">
          <GrantsPanel
            v-if="tab === 'grants' && full.id"
            :resource="{ type: 'tag-definition', tagDefinitionId: full.id }" />
        </div>
      </v-tabs-window-item>

      <!-- Attachments -->
      <v-tabs-window-item value="attachments">
        <TagAttachmentsPanel v-if="tab === 'attachments' && full.id" :tag-definition-id="full.id" />
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Type-to-confirm delete -->
    <v-dialog v-model="confirmDialog" max-width="440">
      <v-card title="Confirm deletion of tag definition">
        <v-card-text>
          <div class="ma-2">Please enter the name "{{ full.name }}" to confirm the deletion</div>
          <v-text-field
            v-model="confirmName"
            label="Tag definition name"
            maxlength="500"
            :placeholder="full.name"
            @keyup.enter="confirmName === full.name && doDelete()"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" text="Cancel" @click="confirmDialog = false"></v-btn>
          <v-btn
            color="error"
            variant="flat"
            :disabled="confirmName !== full.name"
            text="Confirm"
            @click="doDelete"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Still-in-use -->
    <v-dialog v-model="inUseDialog" max-width="440">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
          <v-icon color="warning">mdi-alert-circle-outline</v-icon>
          Can't delete tag
        </v-card-title>
        <v-card-text>
          <strong>{{ full.name }}</strong>
          is still applied to
          {{ inUseAttachments.length ? inUseAttachments.length : 'one or more' }}
          resource{{ inUseAttachments.length === 1 ? '' : 's' }}. Remove it from all targets, then
          try again.
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" text="Close" @click="inUseDialog = false"></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { useProjectPermissions } from '../composables/useCatalogPermissions';
import TagDefinitionDialog, { TagDefinitionInput } from './TagDefinitionDialog.vue';
import TagPermissionsPanel from './TagPermissionsPanel.vue';
import TagAttachmentsPanel from './TagAttachmentsPanel.vue';
import GrantsPanel from './GrantsPanel.vue';
import { useGrantsSupported } from '../composables/useGrants';
import {
  TagAttachment,
  TagDefinition,
  UpdateTagDefinitionRequest,
} from '../gen/management/types.gen';

const props = defineProps<{ tagDefinitionId: string }>();

const functions = useFunctions();
const visual = useVisualStore();
const router = useRouter();
const route = useRoute();

const projectId = computed(() => visual.projectSelected['project-id']);
const { canCreateTag } = useProjectPermissions(projectId);
const isOpenFga = computed(() => visual.getServerInfo()?.['authz-backend'] === 'openfga');
// Hidden where the authorizer manages no grants — under `allow-all` every
// vocabulary comes back empty, and an empty matrix would say nothing.
// Null while the server is still being asked, which is not the same as no:
// nothing renders until the answer is a definite yes.
const serverGrantsSupported = useGrantsSupported();
const grantsSupported = computed(() => serverGrantsSupported.value === true);

const full = ref<TagDefinition>({ id: '', name: '' } as TagDefinition);
const isSystem = computed(() => (full.value.name ?? '').startsWith('system.'));
const nameSegments = computed(() => (full.value.name ?? '').split('.').filter(Boolean));

const tab = ref((route.query.tab as string) || 'details');
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t } }));

function fmtDate(v?: string | null): string {
  return v ? new Date(v).toLocaleString() : '—';
}

async function loadFull() {
  try {
    full.value = await functions.getTagDefinition(props.tagDefinitionId, false);
  } catch {
    // handled by functions.handleError
  }
}
onMounted(loadFull);
watch(() => props.tagDefinitionId, loadFull);

function goBack() {
  router.push({ path: '/governance', query: { tab: 'tags' } });
}

async function onEdit(input: TagDefinitionInput) {
  const body: UpdateTagDefinitionRequest = {
    name: input.name,
    description: input.description,
    scope: input.scope,
    'add-allowed-values': input.addAllowedValues ?? null,
  };
  try {
    await functions.updateTagDefinition(full.value.id, body, true);
    await loadFull();
  } catch {
    // handled
  }
}

// ---- delete ----
const checking = ref(false);
const confirmDialog = ref(false);
const confirmName = ref('');
const inUseDialog = ref(false);
const inUseAttachments = ref<TagAttachment[]>([]);

async function requestDelete() {
  checking.value = true;
  let attachments: TagAttachment[] = [];
  try {
    const res = await functions.listTagAttachments(full.value.id, { pageSize: 100 }, false);
    attachments = res.attachments ?? [];
  } catch {
    // can't read attachments — let the delete attempt decide
  } finally {
    checking.value = false;
  }
  if (attachments.length) {
    inUseAttachments.value = attachments;
    inUseDialog.value = true;
    return;
  }
  confirmName.value = '';
  confirmDialog.value = true;
}

async function doDelete() {
  confirmDialog.value = false;
  try {
    await functions.deleteTagDefinition(full.value.id, false);
    goBack();
  } catch (error) {
    let attachments: TagAttachment[] = [];
    try {
      const res = await functions.listTagAttachments(full.value.id, { pageSize: 100 }, false);
      attachments = res.attachments ?? [];
    } catch {
      // ignore
    }
    if (attachments.length) {
      inUseAttachments.value = attachments;
      inUseDialog.value = true;
    } else {
      // Deletion failed for a reason other than being in use (permission,
      // validation, network...) — report it instead of mislabeling it as in-use.
      functions.handleError(error, 'deleteTagDefinition', true);
    }
  }
}
</script>
