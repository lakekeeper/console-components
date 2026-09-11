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
      <div style="min-width: 0">
        <div class="d-flex align-center ga-2" style="min-width: 0">
          <div class="text-h6 text-truncate" :title="roleName">{{ roleName || '—' }}</div>
          <!-- Who owns this role travels with its name, so it is answered
               before any tab is opened. -->
          <RoleProviderChip v-if="providerId" :provider-id="providerId" size="x-small" />
        </div>
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
      <v-spacer></v-spacer>
      <!-- Leaving is about the role, not about a section of it, so it sits with
           the name and stays reachable from every tab. Editing stays in the
           Details pane, beside the fields it changes. -->
      <v-btn
        variant="outlined"
        size="small"
        prepend-icon="mdi-arrow-left"
        text="All roles"
        @click="backToRoles"></v-btn>
    </div>

    <div class="d-flex align-stretch" style="height: calc(100vh - 300px); min-height: 380px">
      <div class="d-flex flex-column flex-shrink-0" style="min-width: 200px">
        <v-tabs
          v-model="tab"
          direction="vertical"
          color="primary"
          class="flex-grow-1"
          style="min-height: 0; overflow-y: auto">
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
      </div>
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
            :provider-id="providerId"
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

        <div v-show="tab === 'member-of'">
          <!-- Card, toolbar, count chip, table: the same shape the Members and
               Owners panes use, so the three read as one family rather than this
               one being a loose table under a stray toggle. -->
          <v-card variant="flat">
            <v-toolbar color="transparent" density="compact" flat>
              <v-toolbar-title class="text-subtitle-1">
                <v-icon class="mr-2" color="primary">mdi-account-arrow-up</v-icon>
                Member of
                <v-chip size="x-small" variant="tonal" class="ml-2">
                  {{ memberOf.length }}
                </v-chip>
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <!-- Direct membership is what can be changed; the closure is what
                   actually gives this role its reach. Both are worth asking for,
                   so the scope is a toggle rather than a choice made for the
                   reader — and it sits where the panes beside it keep theirs. -->
              <template v-if="memberOfTransitiveSupported !== false">
                <span
                  v-if="memberOfTransitiveSupported === null"
                  class="text-caption text-medium-emphasis mr-2">
                  {{ TRANSITIVE_UNSUPPORTED }}
                </span>
                <v-btn-toggle
                  v-model="memberOfScope"
                  mandatory
                  density="compact"
                  variant="outlined">
                  <v-btn value="direct" size="small">Direct</v-btn>
                  <v-btn
                    value="transitive"
                    size="small"
                    prepend-icon="mdi-file-tree-outline"
                    :disabled="memberOfTransitiveSupported === null">
                    Incl. nested
                  </v-btn>
                </v-btn-toggle>
              </template>
            </v-toolbar>
            <v-divider></v-divider>
            <!-- A table, not chips: the id is as much the answer as the name here
                 (roles can share a display name across providers), and it has to
                 be readable and copyable rather than squeezed into a pill. -->
            <v-data-table
              :headers="memberOfHeaders"
              :items="memberOf"
              :items-per-page="25"
              density="compact"
              item-value="id">
              <template #item.name="{ item }">
                <a
                  class="text-primary"
                  style="cursor: pointer; text-decoration: none"
                  @click="openRole(item.id)">
                  <v-icon size="small" class="mr-2">mdi-account-group</v-icon>
                  {{ item.name || item.ident || item.id }}
                </a>
              </template>
              <template #item.id="{ item }">
                <span class="d-flex align-center">
                  <span class="font-monospace text-caption">{{ item.id }}</span>
                  <v-btn
                    icon="mdi-content-copy"
                    size="x-small"
                    variant="text"
                    :title="`Copy role id ${item.id}`"
                    @click.stop="functions.copyToClipboard(item.id)"></v-btn>
                </span>
              </template>
              <template #item.via="{ item }">
                <v-chip
                  v-if="memberOfScope === 'transitive' && !directMemberOfIds.has(item.id)"
                  size="x-small"
                  variant="tonal">
                  nested
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">direct</span>
              </template>
              <template #no-data>
                <div class="text-medium-emphasis py-4">
                  {{
                    memberOfScope === 'transitive'
                      ? 'This role reaches no other role, directly or through a nested one.'
                      : 'This role is not a member of any other role.'
                  }}
                </div>
              </template>
            </v-data-table>
          </v-card>
        </div>
      </div>
    </div>
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
import RoleProviderChip from './RoleProviderChip.vue';
import PrincipalGrantsPanel from './PrincipalGrantsPanel.vue';
import { useGrantPrincipalListingSupported } from '../composables/useGrants';
import { isNotImplementedError } from '../common/errorUtils';
import { useRoleNavigation } from '../composables/useRoleNavigation';
import {
  TRANSITIVE_UNSUPPORTED,
  markTransitiveMembershipSupported,
  markTransitiveMembershipUnsupported,
  useTransitiveMembershipSupported,
} from '../common/transitiveMembership';

const props = defineProps<{ roleId: string; canEdit?: boolean }>();

const functions = useFunctions();
const router = useRouter();
const route = useRoute();
const { openRole } = useRoleNavigation();
const roleName = ref('');
// A role provider owns membership for every namespace but `lakekeeper` and
// `system`, and syncs it lazily. The tab keeps its name regardless — it would
// otherwise rename itself as you move between roles — and the members panel
// qualifies the list where the list actually is.
const providerId = ref('');

const tab = ref('details');
// Sections mount on first visit and stay mounted, so switching back does not
// refetch — and the grants listing in particular is the expensive one.
const visited = ref(new Set([tab.value]));
watch(tab, (t) => visited.value.add(t));

// Two hosts, two ways back: on the Identities page the role is selected by a
// ?role= param, so dropping it restores the list with the Roles tab still
// active. On the standalone /roles/:id page there is no such param — deleting
// it there pushed the same route and the button did nothing — so navigate.
function backToRoles() {
  if (route.query.role) {
    const query = { ...route.query };
    delete query.role;
    router.push({ query });
    return;
  }
  router.push('/roles');
}

function onRoleLoaded(role: any) {
  if (role?.name) roleName.value = role.name;
  if (role?.['provider-id']) providerId.value = role['provider-id'];
}
// Hidden where the authorizer manages no grants at all.
// Principal-scoped: this asks what one principal holds everywhere, which not
// every authorizer indexes for. OpenFGA cannot, so the surface is not offered
// there rather than offered and then explaining itself.
const grantsSupported = useGrantPrincipalListingSupported();
const grantCount = ref<number | null>(null);
const memberOf = ref<RoleMembership[]>([]);
// The tab's chip count follows the chosen scope, and the direct ids stay around
// so the transitive view can mark what is only reached through another role.
const memberOfScope = ref<'direct' | 'transitive'>('direct');
const memberOfTransitiveSupported = useTransitiveMembershipSupported();
const directMemberOfIds = ref<Set<string>>(new Set());

const memberOfHeaders = [
  { title: 'Role', key: 'name', sortable: false },
  { title: 'Role ID', key: 'id', sortable: false },
  // Only meaningful in the transitive scope, but kept in both so the columns do
  // not shift when the scope changes.
  { title: 'Via', key: 'via', sortable: false, align: 'end' as const, width: 90 },
];

async function load() {
  try {
    const [meta, mo] = await Promise.all([
      functions.getRoleMetadata(props.roleId).catch(() => null),
      functions.listRoleMemberOf(props.roleId).catch(() => ({ roles: [] })),
    ]);
    roleName.value = (meta as any)?.name ?? '';
    providerId.value = (meta as any)?.['provider-id'] ?? '';
    memberOf.value = ((mo as any)?.roles ?? []) as RoleMembership[];
    directMemberOfIds.value = new Set(memberOf.value.map((r) => r.id));
  } catch {
    /* surfaced by the functions plugin */
  }
}

// Only the transitive answer needs a second request; the direct one is already
// loaded with the page.
watch(memberOfScope, async (value) => {
  if (value === 'direct') {
    memberOf.value = await functions
      .listRoleMemberOf(props.roleId)
      .then((r: any) => (r?.roles ?? []) as RoleMembership[])
      .catch(() => memberOf.value);
    return;
  }
  try {
    const res: any = await functions.listRoleTransitiveMemberOf(props.roleId);
    markTransitiveMembershipSupported();
    memberOf.value = (res?.roles ?? []) as RoleMembership[];
  } catch (e) {
    // Not answerable on this authorizer — withdraw the offer and stay put.
    if (isNotImplementedError(e)) {
      markTransitiveMembershipUnsupported();
      memberOfScope.value = 'direct';
    }
  }
});

onMounted(load);
watch(
  () => props.roleId,
  () => {
    // A different role starts on its own overview rather than inheriting
    // whichever tab happened to be open for the previous one.
    tab.value = 'details';
    visited.value = new Set(['details']);
    grantCount.value = null;
    providerId.value = '';
    memberOfScope.value = 'direct';
    load();
  },
);
</script>
