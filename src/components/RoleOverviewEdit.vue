<template>
  <v-card :variant="embedded ? 'flat' : 'outlined'">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" color="primary">mdi-card-account-details-outline</v-icon>
        Details
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <!-- The host's own actions sit beside this pane's, so "leave" and "edit"
           read as one group rather than living in two different places. -->
      <slot name="toolbar-actions"></slot>
      <!-- `canUpdate` is the authorizer's answer; provider sync owns the name and
           description regardless, and the API refuses both with
           `ManagedRoleImmutable`. Say so instead of offering a failing edit. -->
      <span v-if="syncManaged" class="text-caption text-medium-emphasis">
        Maintained by the {{ role['provider-id'] }} provider
      </span>
      <RoleDialog
        v-else-if="role.name && canUpdate"
        :action-type="'edit'"
        :role="role"
        @role-input="editRole" />
    </v-toolbar>

    <v-divider></v-divider>

    <!-- Gated on the read's answer, not on an id that only a successful read
         delivers: a refused read says so here instead of leaving a blank tab. -->
    <v-card-text v-if="readError">
      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        icon="mdi-lock-outline"
        :text="readError"></v-alert>
    </v-card-text>
    <v-card-text v-else-if="role.id">
      <v-row dense>
        <v-col cols="12" md="6">
          <div class="text-overline text-medium-emphasis">Description</div>
          <div
            class="text-body-2 mt-1 pa-2 rounded border"
            style="
              white-space: pre-wrap;
              max-height: 200px;
              overflow-y: auto;
              word-break: break-word;
            ">
            {{ role.description || '—' }}
          </div>
        </v-col>
        <v-col cols="12" md="6">
          <div class="text-overline text-medium-emphasis">Provider</div>
          <div class="mt-1 d-flex align-center flex-wrap ga-1">
            <template v-if="role['provider-id']">
              <v-chip size="small" variant="outlined" label class="font-monospace">
                {{ role['provider-id'] }}
              </v-chip>
              <!-- The overview is where the id gets explained. Elsewhere the
                   chip only has room to carry it. -->
              <v-chip
                size="small"
                variant="tonal"
                :color="ownership.kind === 'external' ? 'purple' : undefined">
                {{ ownership.label }}
              </v-chip>
            </template>
            <span v-else class="text-medium-emphasis">—</span>
          </div>
          <div v-if="role['provider-id']" class="text-caption text-medium-emphasis mt-1">
            {{ ownership.description }}
          </div>

          <div class="text-overline text-medium-emphasis mt-3">Role ID in Provider</div>
          <div class="d-flex align-center mt-1">
            <v-chip
              v-if="role['source-id']"
              size="small"
              variant="outlined"
              label
              class="mr-1 font-monospace">
              {{ role['source-id'] }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
            <v-btn
              v-if="role['source-id']"
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              :aria-label="`Copy source ID ${role['source-id']}`"
              :title="`Copy source ID ${role['source-id']}`"
              @click="functions.copyToClipboard(role['source-id'])"></v-btn>
          </div>

          <div class="text-overline text-medium-emphasis mt-3">Role ID in Lakekeeper</div>
          <div class="d-flex align-center mt-1">
            <v-chip size="small" variant="outlined" label class="mr-1 font-monospace">
              {{ role.id }}
            </v-chip>
            <v-btn
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              :aria-label="`Copy role ID ${role.id}`"
              :title="`Copy role ID ${role.id}`"
              @click="functions.copyToClipboard(role.id)"></v-btn>
          </div>
        </v-col>

        <v-col cols="12" md="6" class="mt-2">
          <div class="text-overline text-medium-emphasis">Created</div>
          <div class="text-body-2 mt-1">{{ formatDate(role['created-at']) }}</div>
        </v-col>
        <v-col cols="12" md="6" class="mt-2">
          <div class="text-overline text-medium-emphasis">Updated</div>
          <div class="text-body-2 mt-1">{{ formatDate(role['updated-at']) }}</div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useRolePermissions } from '../composables/useCatalogPermissions';
import { useIsSyncManagedRole, useRoleOwnership } from '../composables/useRoleProviders';
import type { Role } from '../gen/management/types.gen';
import { isForbiddenError } from '../common/errorUtils';
import { tagRefusal } from '../composables/useTagRights';

const props = defineProps<{
  roleId: string;
  /** Drop the outer card chrome when a host already provides it (e.g. a tab). */
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'roleLoaded', role: any): void;
}>();

const functions = useFunctions();

// A ref, not the prop's value at setup: the host keeps this pane mounted while
// moving between roles, and the rights must follow the role on screen.
const roleIdRef = computed(() => props.roleId);
const { canUpdate } = useRolePermissions(roleIdRef);

const readError = ref('');

const emptyRole: Role = {
  id: '',
  ident: '',
  name: '',
  description: '',
  'created-at': '',
  'updated-at': '',
  'project-id': '',
  'provider-id': '',
  'source-id': '',
};
const role = reactive<Role>({ ...emptyRole });

const isSyncManagedRole = useIsSyncManagedRole();
const syncManaged = computed(() => isSyncManagedRole.value(role['provider-id']));
const ownership = useRoleOwnership(() => role['provider-id']);

onMounted(async () => {
  await loadRole();
});

async function loadRole() {
  // A late answer for the previous role must not land under the new one.
  const roleId = props.roleId;
  try {
    const loaded = await functions.getRole(roleId);
    if (roleId !== props.roleId) return;
    readError.value = '';
    Object.assign(role, loaded);
    emit('roleLoaded', role);
  } catch (e) {
    if (roleId !== props.roleId) return;
    Object.assign(role, emptyRole);
    readError.value = isForbiddenError(e)
      ? 'You are not allowed to read this role.'
      : tagRefusal(e, 'read this role');
  }
}

watch(
  () => props.roleId,
  (id, old) => {
    if (!id || id === old) return;
    Object.assign(role, emptyRole);
    readError.value = '';
    loadRole();
  },
);

async function editRole(roleIn: { name: string; description: string }) {
  await functions.updateRole(role.id, roleIn.name, roleIn.description, true);
  await loadRole();
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}
</script>
