<template>
  <!-- One role, laid out the way the entity pages are: an identity header, then
       tabs. Stacking every section as its own outlined card made the page a
       long scroll of repeated chrome, where the sections are alternatives
       rather than a sequence. -->
  <div class="d-flex flex-column" style="min-height: 0">
    <!-- The breadcrumb's only unique content was the role name, which the title
         already carries, so the trail collapses into a back arrow on the title
         itself. No role icon either: the page is only ever about a role, so it
         marks nothing. -->
    <div class="d-flex align-center ga-3 px-1 py-3">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        title="Back to roles"
        @click="backToRoles"></v-btn>
      <div style="min-width: 0">
        <div class="text-h6 text-truncate" :title="roleName">{{ roleName || '—' }}</div>
        <div class="text-caption text-medium-emphasis d-flex align-center ga-1">
          {{ roleId }}
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="text"
            title="Copy role id"
            @click="functions.copyToClipboard(roleId)"></v-btn>
        </div>
      </div>
    </div>

    <v-tabs v-model="tab" color="primary">
      <v-tab value="details">Details</v-tab>
      <v-tab value="owners">Owners</v-tab>
      <v-tab value="members">Members</v-tab>
      <v-tab v-if="grantsSupported" value="grants">
        Grants
        <v-chip v-if="grantCount !== null" size="x-small" variant="tonal" class="ml-2">
          {{ grantCount }}
        </v-chip>
      </v-tab>
      <v-tab value="member-of">
        Member of
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ memberOf.length }}</v-chip>
      </v-tab>
    </v-tabs>
    <v-divider></v-divider>

    <v-tabs-window v-model="tab" crossfade>
      <v-tabs-window-item value="details">
        <!-- The overview re-emits after a rename, so the header follows the
             edit instead of keeping the name this page loaded with. -->
        <RoleOverviewEdit
          v-if="tab === 'details'"
          :role-id="roleId"
          embedded
          @role-loaded="onRoleLoaded" />
      </v-tabs-window-item>

      <v-tabs-window-item value="owners">
        <RoleOwners v-if="tab === 'owners'" :role-id="roleId" :can-edit="canEdit" embedded />
      </v-tabs-window-item>

      <v-tabs-window-item value="members">
        <RoleMembers v-if="tab === 'members'" :role-id="roleId" :can-edit="canEdit" embedded />
      </v-tabs-window-item>

      <!-- What this role can actually do. Elsewhere grants are read per
           resource; here the question is the other way round. -->
      <v-tabs-window-item v-if="grantsSupported" value="grants">
        <div class="pa-4">
          <PrincipalGrantsPanel
            v-if="tab === 'grants'"
            :principal-id="roleId"
            principal-type="role"
            :principal-name="roleName"
            allow-edit
            @loaded="grantCount = $event" />
        </div>
      </v-tabs-window-item>

      <v-tabs-window-item value="member-of">
        <div class="pa-4">
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
          <div v-else class="text-medium-emphasis">
            This role is not a member of any other role.
          </div>
        </div>
      </v-tabs-window-item>
    </v-tabs-window>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import type { RoleMembership } from '../gen/management/types.gen';
import RoleOverviewEdit from './RoleOverviewEdit.vue';
import RoleMembers from './RoleMembers.vue';
import RoleOwners from './RoleOwners.vue';
import PrincipalGrantsPanel from './PrincipalGrantsPanel.vue';
import { useGrantsSupported } from '../composables/useGrants';

const props = defineProps<{ roleId: string; canEdit?: boolean }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const roleName = ref('');

const tab = ref('details');

// Drops the ?role= that selected this role, keeping the rest of the query so the
// Roles tab stays put rather than the page reopening on Users.
function backToRoles() {
  const query = { ...route.query };
  delete query.role;
  router.push({ query });
}

function onRoleLoaded(role: any) {
  if (role?.name) roleName.value = role.name;
}
// Hidden where the authorizer manages no grants at all.
const grantsSupported = useGrantsSupported();
const grantCount = ref<number | null>(null);
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
watch(
  () => props.roleId,
  () => {
    // A different role starts on its own overview rather than inheriting
    // whichever tab happened to be open for the previous one.
    tab.value = 'details';
    grantCount.value = null;
    load();
  },
);
</script>
