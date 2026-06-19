<template>
  <div>
    <!-- Breadcrumb keeps the Roles › <role> context (and back navigation) -->
    <v-breadcrumbs
      class="px-0 mt-2"
      :items="[
        { title: 'Roles', to: '/identities' },
        { title: roleName || '—', disabled: true },
      ]">
      <template #prepend>
        <v-icon size="small" color="info">mdi-account-box-multiple-outline</v-icon>
      </template>
    </v-breadcrumbs>

    <RoleOverviewEdit :role-id="roleId" class="mb-4" />
    <RoleOwners :role-id="roleId" :can-edit="canEdit" class="mb-4" />
    <RoleMembers :role-id="roleId" :can-edit="canEdit" class="mb-4" />

    <!-- Roles this role is a member of (inherits from) -->
    <v-card variant="outlined" class="mt-4">
      <v-toolbar color="transparent" density="compact" flat>
        <v-toolbar-title class="text-subtitle-1">
          <v-icon class="mr-2">mdi-account-arrow-up</v-icon>
          Member of
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ memberOf.length }}</v-chip>
        </v-toolbar-title>
      </v-toolbar>
      <v-divider></v-divider>
      <v-card-text>
        <div v-if="memberOf.length" class="d-flex flex-wrap" style="gap: 6px">
          <v-chip
            v-for="r in memberOf"
            :key="r.id"
            size="small"
            variant="tonal"
            prepend-icon="mdi-account-group">
            {{ r.name || r.ident }}
          </v-chip>
        </div>
        <div v-else class="text-medium-emphasis">This role is not a member of any other role.</div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import type { RoleMembership } from '../gen/management/types.gen';
import RoleOverviewEdit from './RoleOverviewEdit.vue';
import RoleMembers from './RoleMembers.vue';
import RoleOwners from './RoleOwners.vue';

const props = defineProps<{ roleId: string; canEdit?: boolean }>();

const functions = useFunctions();
const roleName = ref('');
const memberOf = ref<RoleMembership[]>([]);

async function load() {
  try {
    const [meta, mo] = await Promise.all([
      functions.getRoleMetadata(props.roleId).catch(() => null),
      functions.listRoleMemberOf(props.roleId).catch(() => ({ roles: [] })),
    ]);
    roleName.value = (meta as any)?.name ?? '';
    memberOf.value = ((mo as any)?.roles ?? []) as RoleMembership[];
  } catch {
    /* surfaced by the functions plugin */
  }
}

onMounted(load);
watch(() => props.roleId, load);
</script>
