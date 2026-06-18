<template>
  <v-card variant="outlined">
    <v-toolbar color="transparent" density="compact" flat>
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2" color="primary">mdi-card-account-details-outline</v-icon>
        Details
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <RoleDialog
        v-if="role.name && canUpdate"
        :action-type="'edit'"
        :role="role"
        @role-input="editRole" />
    </v-toolbar>

    <v-divider></v-divider>

    <v-card-text v-if="role.id">
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
          <div class="mt-1">
            <v-chip
              v-if="role['provider-id']"
              size="small"
              variant="tonal"
              color="purple"
              class="mr-1">
              <v-icon start size="x-small">mdi-source-branch</v-icon>
              {{ role['provider-id'] }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </div>

          <div class="text-overline text-medium-emphasis mt-3">Identifier</div>
          <div class="d-flex align-center mt-1">
            <v-chip
              v-if="role.ident"
              size="small"
              variant="outlined"
              label
              class="mr-1 font-monospace">
              {{ role.ident }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
            <v-btn
              v-if="role.ident"
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              :aria-label="`Copy identifier ${role.ident}`"
              :title="`Copy identifier ${role.ident}`"
              @click="functions.copyToClipboard(role.ident)"></v-btn>
          </div>

          <div class="text-overline text-medium-emphasis mt-3">Role ID</div>
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
import { onMounted, reactive } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useRolePermissions } from '../composables/useCatalogPermissions';
import type { Role } from '../gen/management/types.gen';

const props = defineProps<{
  roleId: string;
}>();

const emit = defineEmits<{
  (e: 'roleLoaded', role: any): void;
}>();

const functions = useFunctions();

// Use the role permissions composable
const { canUpdate } = useRolePermissions(props.roleId);

const role = reactive<Role>({
  id: '',
  ident: '',
  name: '',
  description: '',
  'created-at': '',
  'updated-at': '',
  'project-id': '',
  'provider-id': '',
  'source-id': '',
});

onMounted(async () => {
  await loadRole();
});

async function loadRole() {
  Object.assign(role, await functions.getRole(props.roleId));
  emit('roleLoaded', role);
}

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
