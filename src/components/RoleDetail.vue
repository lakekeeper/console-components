<template>
  <!-- One role: an identity header, then a rail of sections. The rail is
       vertical because the page already sits under the Users/Roles tabs, and a
       second horizontal row reads as competing with the first rather than
       belonging to it. -->
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

    <div class="d-flex align-stretch" style="height: calc(100vh - 300px); min-height: 380px">
      <v-tabs
        v-model="tab"
        direction="vertical"
        color="primary"
        class="flex-shrink-0"
        style="min-width: 200px; align-self: stretch; overflow-y: auto">
        <v-tab value="details">
          <v-icon size="20" class="mr-3">mdi-card-account-details-outline</v-icon>
          Details
        </v-tab>
        <v-tab value="owners">
          <v-icon size="20" class="mr-3">mdi-shield-account</v-icon>
          Owners
        </v-tab>
        <v-tab value="members">
          <v-icon size="20" class="mr-3">mdi-account-multiple</v-icon>
          Members
        </v-tab>
        <v-tab v-if="grantsSupported" value="grants">
          <v-icon size="20" class="mr-3">mdi-shield-key-outline</v-icon>
          Grants
          <v-chip v-if="grantCount !== null" size="x-small" variant="tonal" class="ml-2">
            {{ grantCount }}
          </v-chip>
        </v-tab>
        <v-tab value="member-of">
          <v-icon size="20" class="mr-3">mdi-account-arrow-up</v-icon>
          Member of
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ memberOf.length }}</v-chip>
        </v-tab>
      </v-tabs>
      <v-divider vertical></v-divider>

      <!-- The scroller is the wrapper, not each section: every flex ancestor
           needs min-height 0 or the overflow never engages. -->
      <div class="flex-grow-1" style="min-width: 0; min-height: 0; overflow-y: auto">
        <div v-show="tab === 'details'">
          <!-- The overview re-emits after a rename, so the header follows the
               edit instead of keeping the name this page loaded with. -->
          <RoleOverviewEdit
            v-if="visited.has('details')"
            :role-id="roleId"
            embedded
            @role-loaded="onRoleLoaded" />
        </div>

        <div v-show="tab === 'owners'">
          <RoleOwners v-if="visited.has('owners')" :role-id="roleId" :can-edit="canEdit" embedded />
        </div>

        <div v-show="tab === 'members'">
          <RoleMembers
            v-if="visited.has('members')"
            :role-id="roleId"
            :can-edit="canEdit"
            embedded />
        </div>

        <!-- What this role can actually do. Elsewhere grants are read per
             resource; here the question is the other way round. -->
        <div v-if="grantsSupported" v-show="tab === 'grants'" class="pa-4">
          <PrincipalGrantsPanel
            v-if="visited.has('grants')"
            :principal-id="roleId"
            principal-type="role"
            :principal-name="roleName"
            allow-edit
            allow-open
            @loaded="grantCount = $event" />
        </div>

        <div v-show="tab === 'member-of'" class="pa-4">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFunctions } from '../plugins/functions';
import type { RoleMembership } from '../gen/management/types.gen';
import RoleOverviewEdit from './RoleOverviewEdit.vue';
import RoleMembers from './RoleMembers.vue';
import RoleOwners from './RoleOwners.vue';
import PrincipalGrantsPanel from './PrincipalGrantsPanel.vue';
import { useGrantsSupported, useGrantsUiEnabled } from '../composables/useGrants';

const props = defineProps<{ roleId: string; canEdit?: boolean }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const roleName = ref('');

const tab = ref('details');
// Sections mount on first visit and stay mounted, so switching back does not
// refetch — and the grants listing in particular is the expensive one.
const visited = ref(new Set([tab.value]));
watch(tab, (t) => visited.value.add(t));

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
// Grants ship only in the enterprise build; the server's answer gates it
// further, so a capable server still surfaces nothing in the OSS console.
const grantsUiEnabled = useGrantsUiEnabled();
const serverGrantsSupported = useGrantsSupported();
const grantsSupported = computed(
  () => grantsUiEnabled.value && serverGrantsSupported.value === true,
);
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
    visited.value = new Set(['details']);
    grantCount.value = null;
    load();
  },
);
</script>
