<template>
  <!-- Every grant that bears on one entity, along the only axis that matters
       for reach: the levels above it, which is what the rail walks, and —
       where the app can answer it — everything below, which is one more entry
       on that rail. Grants never roll up, so a level is where its grants are
       held and where they are edited.

       A panel rather than a dialog: it is one of the scopes a grants pane
       offers, not a detour out of the page. `GrantsDialog` still wraps it for
       callers that want the old fullscreen form. -->
  <div class="d-flex" style="height: 100%; min-height: 0; overflow: hidden">
    <!-- LEFT: the axis, in one tree. It starts at the server and walks down to
         the object you are looking at, and it keeps going: ask for what is
         inside and the same tree extends past the leaf with the places that
         hold grants in there. Indentation carries the whole relationship, and
         picking any node narrows the table beside it.

         The downward half is asked for rather than walked. Upward is a handful
         of levels read in full; inside is unbounded, separately authorized and
         paged, so it stays one node until someone calls it. -->
    <div
      v-if="!treeCollapsed"
      class="flex-shrink-0"
      style="
        width: 300px;
        overflow-y: auto;
        border-right: 1px solid rgba(var(--v-border-color), 0.16);
      ">
      <div v-if="buildingChain" class="d-flex align-center ga-2 pa-4">
        <v-progress-circular indeterminate size="18" width="2"></v-progress-circular>
        <span class="text-caption text-medium-emphasis">Resolving…</span>
      </div>

      <v-list v-else density="compact" nav>
        <v-list-item :active="!levelFilter" color="primary" @click="levelFilter = ''">
          <v-list-item-title class="text-body-2">Everything</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ allRows.length }} {{ allRows.length === 1 ? 'grant' : 'grants' }}
          </v-list-item-subtitle>
        </v-list-item>
        <v-divider class="my-1"></v-divider>

        <!-- Upward: server → … → this one. -->
        <v-list-item
          v-for="(level, depth) in chain"
          :key="level.key"
          :active="levelFilter === level.key"
          color="primary"
          @click="levelFilter = level.key">
          <div class="d-flex align-center ga-2" style="min-width: 0">
            <span :style="{ width: depth * 12 + 'px' }" class="flex-shrink-0"></span>
            <v-icon v-if="depth" size="13" class="text-disabled flex-shrink-0">
              mdi-subdirectory-arrow-right
            </v-icon>
            <v-icon size="18" class="flex-shrink-0">{{ level.icon }}</v-icon>
            <div style="min-width: 0">
              <div class="text-body-2 text-truncate" :title="level.title">{{ level.title }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ level.subtitle }}
                <template v-if="level.key === leafKey">· this one</template>
              </div>
            </div>
            <v-spacer></v-spacer>
            <v-icon
              v-if="unreadableLevels.has(level.key)"
              size="14"
              color="medium-emphasis"
              class="flex-shrink-0">
              mdi-eye-off-outline
              <v-tooltip activator="parent" location="bottom" max-width="300">
                You do not have permission to list grants at this level. Grants held here can still
                reach the levels below.
              </v-tooltip>
            </v-icon>
            <span v-else class="text-caption text-medium-emphasis flex-shrink-0">
              {{ countFor(level.key) }}
            </span>
          </div>
        </v-list-item>

        <!-- Downward: the same tree, continuing past the leaf — but separated,
             because the halves are not alike. Above is every level, read in
             full and authorized level by level; below is one permission, read a
             page at a time. The rule says where one ends and the other begins;
             the indentation still carries the hierarchy across it. -->
        <template v-if="subtreeAvailable">
          <v-divider class="my-1"></v-divider>
          <v-list-item
            v-if="!belowLoaded"
            :disabled="loadingBelow"
            color="primary"
            @click="loadBelowPage()">
            <div class="d-flex align-center ga-2" style="min-width: 0">
              <span :style="{ width: chain.length * 12 + 'px' }" class="flex-shrink-0"></span>
              <v-icon size="16" class="flex-shrink-0">
                {{ loadingBelow ? 'mdi-timer-sand' : 'mdi-chevron-down-circle-outline' }}
              </v-icon>
              <div style="min-width: 0">
                <div class="text-body-2 text-primary">
                  {{ loadingBelow ? 'Loading…' : 'Load subtree grants' }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  Held on objects inside this {{ resourceLabel(resource.type).toLowerCase() }}
                </div>
              </div>
            </div>
          </v-list-item>

          <template v-else>
            <v-list-item
              :active="levelFilter === BELOW_ALL"
              color="primary"
              @click="levelFilter = BELOW_ALL">
              <div class="d-flex align-center ga-2" style="min-width: 0">
                <span :style="{ width: chain.length * 12 + 'px' }" class="flex-shrink-0"></span>
                <v-icon size="16" class="flex-shrink-0">mdi-file-tree-outline</v-icon>
                <div style="min-width: 0">
                  <div class="text-body-2">Subtree</div>
                  <div class="text-caption text-medium-emphasis">
                    <template v-if="belowUnsupported">Not offered by this authorizer</template>
                    <template v-else-if="belowForbidden">Not visible to you</template>
                    <template v-else-if="belowError">{{ belowError }}</template>
                    <template v-else>
                      {{ belowNodes.length }}
                      {{ belowNodes.length === 1 ? 'object' : 'objects' }}
                    </template>
                  </div>
                </div>
                <v-spacer></v-spacer>
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ belowRows.length }}
                </span>
              </div>
            </v-list-item>

            <v-list-item
              v-for="node in belowNodes"
              :key="node.key"
              :active="levelFilter === node.key"
              color="primary"
              @click="levelFilter = node.key">
              <div class="d-flex align-center ga-2" style="min-width: 0">
                <span
                  :style="{ width: (chain.length + 1 + node.depth) * 12 + 'px' }"
                  class="flex-shrink-0"></span>
                <v-icon size="13" class="text-disabled flex-shrink-0">
                  mdi-subdirectory-arrow-right
                </v-icon>
                <v-icon size="18" class="flex-shrink-0">{{ node.icon }}</v-icon>
                <div style="min-width: 0">
                  <div class="text-body-2 text-truncate" :title="node.title">{{ node.title }}</div>
                  <div class="text-caption text-medium-emphasis">{{ node.subtitle }}</div>
                </div>
                <v-spacer></v-spacer>
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ node.count }}
                </span>
              </div>
            </v-list-item>

            <!-- Pages come back full, so an absent token is the end — not a
                 short page. Until then the tree is honest about being partial. -->
            <v-list-item v-if="belowNextToken" :disabled="loadingBelow" @click="loadMoreBelow">
              <div class="d-flex align-center ga-2" style="min-width: 0">
                <span
                  :style="{ width: (chain.length + 1) * 12 + 'px' }"
                  class="flex-shrink-0"></span>
                <v-icon size="16">mdi-dots-horizontal</v-icon>
                <span class="text-caption text-primary">
                  {{ loadingBelow ? 'Reading…' : 'Load more' }}
                </span>
              </div>
            </v-list-item>
          </template>
        </template>
      </v-list>

      <div v-if="chainError" class="text-caption text-warning px-4 pb-3">{{ chainError }}</div>
      <div v-else-if="unreadableLevels.size" class="text-caption text-medium-emphasis px-4 pb-3">
        {{ unreadableLevels.size }}
        {{ unreadableLevels.size === 1 ? 'level is' : 'levels are' }}
        hidden by permissions. Everything you may read is shown.
      </div>
    </div>

    <!-- RIGHT: one table over both directions. Which node is selected decides
         what it shows; the arrow on each row says which way that row came
         from, so the table still reads on its own when nothing is selected. -->
    <div style="flex: 1 1 auto; min-width: 0; overflow-y: auto">
      <div style="padding: 8px 16px 16px">
        <div v-if="loading" class="d-flex flex-column align-center pa-8">
          <l-helix size="45" speed="2.5" color="rgb(var(--v-theme-primary))"></l-helix>
          <span class="mt-4 text-body-2 text-medium-emphasis">Reading every level…</span>
        </div>

        <template v-else>
          <div class="d-flex align-center flex-wrap ga-3 mb-2">
            <!-- Which node the tree has selected, said in words, because the
                 table below it is otherwise indistinguishable from the whole
                 listing filtered by hand. -->
            <!-- The tree is this pane's own navigation, so its collapse sits
                 with the line that says what the tree has selected — not with
                 the one above, which belongs to the rail outside. -->
            <v-btn
              :icon="treeCollapsed ? 'mdi-menu' : 'mdi-menu-open'"
              size="x-small"
              variant="text"
              @click="treeCollapsed = !treeCollapsed">
              <v-icon></v-icon>
              <v-tooltip activator="parent" location="bottom">
                {{ treeCollapsed ? 'Show the tree' : 'Hide the tree' }}
              </v-tooltip>
            </v-btn>
            <span class="text-caption text-medium-emphasis">
              <template v-if="!levelFilter">
                Every grant that reaches this
                {{ resourceLabel(resource.type).toLowerCase() }}, and where it is held
              </template>
              <template v-else-if="levelFilter === BELOW_ALL">
                Subtree grants — held on objects inside this
                {{ resourceLabel(resource.type).toLowerCase() }}
              </template>
              <template v-else>
                Grants held on
                <strong>{{ selectedTitle }}</strong>
              </template>
            </span>
            <v-spacer></v-spacer>
            <v-btn-toggle v-model="kindFilter" mandatory density="compact" variant="outlined">
              <v-btn value="all" size="small">All</v-btn>
              <v-btn value="user" size="small" prepend-icon="mdi-account">Users</v-btn>
              <v-btn value="role" size="small" prepend-icon="mdi-account-group">Roles</v-btn>
            </v-btn-toggle>
            <v-text-field
              v-model="filterText"
              label="Filter"
              prepend-inner-icon="mdi-filter"
              variant="underlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 200px"></v-text-field>
            <!-- The app's own destructive action, which reaches downward only —
                 so it is labelled by the app and sits apart from the rows. -->
            <component
              :is="subtreeSource?.actions"
              v-if="subtreeAvailable && subtreeSource?.actions"
              :resource="resource"
              :resource-name="entityName"
              :as-of="belowAsOf"
              :disabled="!canRevokeSubtree"
              @revoked="reload" />
          </div>

          <!-- The one thing the tree cannot show: the two halves are not
               equally complete. Upward is every level, read in full. Inside is
               however many pages have been asked for, under one instant. -->
          <div
            v-if="belowLoaded && !belowUnsupported && !belowForbidden"
            class="text-caption text-medium-emphasis mb-2">
            Subtree: {{ belowRows.length }} {{ belowRows.length === 1 ? 'grant' : 'grants' }} read{{
              belowNextToken ? ', more remain' : ''
            }}
            <template v-if="belowAsOf">· as of {{ formatInstant(belowAsOf) }}</template>
          </div>

          <v-data-table
            density="compact"
            hover
            :headers="headers"
            :items="visibleRows"
            show-expand
            item-value="key"
            :items-per-page="50"
            :items-per-page-options="[50, 100, -1]"
            :sort-by="[{ key: 'principal', order: 'asc' }]">
            <template #item.principal="{ item }">
              <div class="d-flex align-center ga-2">
                <v-icon size="18">
                  {{
                    item.kind === 'user'
                      ? 'mdi-account-circle-outline'
                      : 'mdi-account-box-multiple-outline'
                  }}
                </v-icon>
                <div style="min-width: 0">
                  <div class="text-truncate" :title="item.principal">{{ item.principal }}</div>
                  <div v-if="item.subtitle" class="text-caption text-medium-emphasis">
                    {{ item.subtitle }}
                  </div>
                </div>
              </div>
            </template>

            <template #item.level="{ item }">
              <div class="d-flex align-center ga-2">
                <!-- Direction rides on the resource rather than taking a column
                     of its own: "where is this held" and "is that above me or
                     inside me" are the same fact read at two depths. -->
                <v-icon
                  size="14"
                  :color="item.direction === 'below' ? 'primary' : 'medium-emphasis'"
                  class="flex-shrink-0">
                  {{
                    item.direction === 'above'
                      ? 'mdi-arrow-up'
                      : item.direction === 'below'
                        ? 'mdi-arrow-down'
                        : 'mdi-circle-small'
                  }}
                  <v-tooltip activator="parent" location="top" max-width="320">
                    <template v-if="item.direction === 'above'">
                      Held above this {{ resourceLabel(resource.type).toLowerCase() }} — it reaches
                      here without being listed here.
                    </template>
                    <template v-else-if="item.direction === 'below'">
                      Held on something inside this
                      {{ resourceLabel(resource.type).toLowerCase() }}.
                    </template>
                    <template v-else>
                      Held on this {{ resourceLabel(resource.type).toLowerCase() }} itself.
                    </template>
                  </v-tooltip>
                </v-icon>
                <v-icon size="16">{{ item.levelIcon }}</v-icon>
                <div style="min-width: 0">
                  <div class="text-body-2 text-truncate" :title="item.levelTitle">
                    {{ item.levelTitle }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ item.levelSubtitle }}
                    <template v-if="item.levelKey === leafKey">· this one</template>
                  </div>
                </div>
              </div>
            </template>

            <!-- Counts per category, not the names: a row here can hold two
                 dozen privileges, and the wall of chips pushed every other
                 column off screen. The names are one expand away. -->
            <template #item.privileges="{ item }">
              <div class="d-flex align-center flex-wrap ga-1">
                <v-chip
                  v-for="c in item.categories"
                  :key="c"
                  size="x-small"
                  variant="tonal"
                  color="primary">
                  {{ c }} · {{ item.byCategory[c].length }}
                  <v-tooltip activator="parent" location="top" max-width="360">
                    {{ item.byCategory[c].join(', ') }}
                  </v-tooltip>
                </v-chip>
                <span v-if="!item.privileges.length" class="text-disabled">–</span>
                <v-chip
                  v-for="p in item.stale"
                  :key="p"
                  size="x-small"
                  variant="outlined"
                  color="warning">
                  {{ p }}
                  <v-tooltip activator="parent" location="top">
                    No longer in this authorizer's vocabulary — enforces nothing, but is still held.
                  </v-tooltip>
                </v-chip>
              </div>
            </template>

            <template #expanded-row="{ columns, item }">
              <tr>
                <td :colspan="columns.length" class="py-2">
                  <div v-for="c in item.categories" :key="c" class="d-flex align-start ga-2 mb-1">
                    <span
                      class="text-caption text-medium-emphasis text-uppercase"
                      style="min-width: 110px">
                      {{ c }}
                    </span>
                    <div>
                      <v-chip
                        v-for="p in item.byCategory[c]"
                        :key="p"
                        class="mr-1 mb-1"
                        size="x-small"
                        variant="tonal">
                        {{ p }}
                      </v-chip>
                    </div>
                  </div>
                  <span v-if="!item.privileges.length" class="text-disabled text-caption">
                    Only unrecognized privileges are held here.
                  </span>
                </td>
              </tr>
            </template>

            <template #item.granted="{ item }">
              <span class="text-caption text-medium-emphasis">{{ item.granted || '—' }}</span>
            </template>

            <template #item.actions="{ item }">
              <!-- Editing where the grant is actually held: this table spans
                   levels, so the row carries which one. -->
              <div class="d-flex align-center ga-2 justify-end">
                <v-btn
                  size="small"
                  variant="outlined"
                  text="Edit"
                  :loading="preparing === item.key"
                  @click="openEdit(item)"></v-btn>
                <v-btn
                  color="error"
                  size="small"
                  variant="text"
                  text="Revoke all"
                  :loading="revoking === item.key"
                  @click="requestRevokeAll(item)"></v-btn>
              </div>
            </template>

            <template #no-data>
              <span class="text-disabled">
                {{
                  !levelFilter && !filterText
                    ? 'Nothing is granted on this object or anywhere above it.'
                    : 'Nothing matches this selection.'
                }}
              </span>
            </template>
          </v-data-table>

          <!-- Revoke-all confirmation. Named per level, because this table
               spans several and revoking the wrong one is not undoable. -->
          <v-dialog v-model="confirmRevokeOpen" max-width="480">
            <v-card>
              <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3">
                <v-icon color="error">mdi-shield-remove-outline</v-icon>
                Revoke all grants
              </v-card-title>
              <v-card-text class="text-body-2">
                Revoke
                <strong>every privilege</strong>
                held by
                <strong>{{ pendingRevoke?.principal }}</strong>
                on
                <strong>{{ pendingRevoke?.levelTitle }}</strong>
                ({{ pendingRevoke?.levelSubtitle.toLowerCase() }})?
                <div v-if="revokeLocked.length" class="text-caption text-medium-emphasis mt-2">
                  {{ revokeLocked.join(', ') }} will remain — you may not revoke those here.
                </div>
                <div v-if="revokeError" class="text-caption text-error mt-2">
                  {{ revokeError }}
                </div>
              </v-card-text>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" :disabled="!!revoking" @click="confirmRevokeOpen = false">
                  Cancel
                </v-btn>
                <v-btn color="error" variant="flat" :loading="!!revoking" @click="doRevokeAll">
                  Revoke all
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>

          <GrantAssignDialog
            v-if="editing"
            v-model="editOpen"
            :privileges="editPrivileges"
            :resource-type="editing.resource.type"
            :resource-name="editing.levelTitle"
            :principal="editing.principal"
            :held-for="heldForEdit"
            :project-id="editProjectId"
            :saving="saving"
            :error="saveError"
            @apply="applyEdit" />
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, ref, watch } from 'vue';
import { helix } from 'ldrs';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import {
  derivePrivilegeCategory,
  formatGrantedSummary,
  principalKey,
  refFromResponse,
  privilegeCategoryRank,
  resourceIcon,
  resourceKey,
  resourceLabel,
  useGrants,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import type { GrantEntry, GrantResponse, GrantablePrivilege } from '../gen/management/types.gen';
import type { Header } from '../common/interfaces';
import { isForbiddenError } from '../common/errorUtils';
import { GrantsSubtreeKey, type SubtreeGrantSource } from '../common/grantsSubtree';
import type { GrantResourceRef } from '../common/interfaces';
import type { GetNamespaceResponse } from '../gen/iceberg/types.gen';
import { toPrincipal } from '../common/principal';

const props = withDefaults(
  defineProps<{
    /** The entity this chain ends at — the deepest level in the rail. */
    resource: GrantResourceRef;
    /** Display name for the leaf rail entry. */
    entityName: string;
    /** Warehouse display name, when the chain passes through one. */
    warehouseName?: string;
    /**
     * Unit-separated namespace path of the entity, used to build the namespace
     * levels. For a namespace this is its own path; for a table or view it is
     * the containing one.
     */
    namespacePath?: string;
    /**
     * Defers the chain walk until the pane is actually looked at. Building it
     * is several listings — one per level — so a pane nobody opened should not
     * pay for them.
     */
    active?: boolean;
  }>(),
  { active: true },
);

const emit = defineEmits<{ (e: 'saved'): void }>();

const functions = useFunctions();
const visual = useVisualStore();
const grants = useGrants();

/**
 * An optional view of what is held *beneath* this entity.
 *
 * The chain above is bounded — a handful of levels, each read in full — and is
 * walked on open. Everything below is neither: unbounded, paginated and
 * separately authorized, so it is an entry in the rail that loads when asked
 * rather than part of the walk. Provided by the app (Plus registers one for
 * Cedar); `null` everywhere else, and then the entry is simply absent.
 */
const subtreeSource = inject<SubtreeGrantSource | null>(GrantsSubtreeKey, null);

/** Only containers have a subtree; a table's own grants are the whole answer. */
const subtreeAvailable = computed(
  () =>
    !!subtreeSource && (props.resource.type === 'warehouse' || props.resource.type === 'namespace'),
);

/** Rows read from below, paged, and what the walk is reading under. */
const belowRows = ref<Row[]>([]);
const belowNextToken = ref<string | null>(null);
const belowAsOf = ref<string | null>(null);
const loadingBelow = ref(false);
const belowForbidden = ref(false);
const belowUnsupported = ref(false);
const belowError = ref<string | null>(null);

/**
 * Which node the tree has selected: empty for everything, a level key for one
 * node, or this sentinel for "every object inside".
 */
const BELOW_ALL = '__inside__';
const levelFilter = ref('');

/** Hides this pane's tree, leaving the table the full width. */
const treeCollapsed = ref(false);

/** Whether the downward half has been asked for yet. */
const belowLoaded = ref(false);

/**
 * Whether a bulk revoke has anything to act on.
 *
 * A revoke that reaches further than the review did is the one thing this pane
 * must not offer: until the subtree has been read, nobody has seen what the
 * button would remove — and the ceiling it binds itself to does not exist yet
 * either. An empty or refused read is the same answer for this purpose.
 */
const canRevokeSubtree = computed(
  () =>
    belowLoaded.value &&
    !belowForbidden.value &&
    !belowUnsupported.value &&
    belowRows.value.length > 0,
);

function countFor(levelKey: string): number {
  return rows.value.filter((r) => r.levelKey === levelKey).length;
}

/**
 * The tree's downward nodes: the objects inside that actually hold a grant.
 *
 * There is no listing of the subtree's shape to draw from — only the grants —
 * so the tree shows where grants are, not everything that exists. Depth is
 * derived from each resolved path and normalized against the shallowest, so
 * the indentation reads as a tree whichever level the review is rooted at.
 */
const belowNodes = computed(() => {
  const byKey = new Map<
    string,
    { key: string; title: string; subtitle: string; icon: string; count: number; path: string }
  >();
  for (const r of belowRows.value) {
    const hit = byKey.get(r.levelKey);
    if (hit) {
      hit.count += 1;
      continue;
    }
    byKey.set(r.levelKey, {
      key: r.levelKey,
      title: r.levelTitle,
      subtitle: r.levelSubtitle,
      icon: r.levelIcon,
      count: 1,
      path: r.levelTitle,
    });
  }
  const nodes = [...byKey.values()].map((n) => ({ ...n, depth: pathDepth(n.path) }));
  const shallowest = nodes.reduce((min, n) => Math.min(min, n.depth), Number.MAX_SAFE_INTEGER);
  return nodes
    .map((n) => ({ ...n, depth: Number.isFinite(shallowest) ? n.depth - shallowest : 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));
});

/**
 * How deep a resolved path sits, counting namespace levels.
 *
 * `resolveResourceLocation` renders "warehouse / a.b.c / table", so the
 * warehouse is dropped, the namespace segment contributes one level per dot,
 * and a trailing tabular contributes one more.
 */
function pathDepth(path: string): number {
  const parts = path.split(' / ').slice(1);
  if (!parts.length) return 0;
  const nsDepth = parts[0] ? parts[0].split('.').length : 0;
  return nsDepth + (parts.length > 1 ? 1 : 0);
}

/** The selected node's own name, for the line above the table. */
const selectedTitle = computed(
  () =>
    chain.value.find((l) => l.key === levelFilter.value)?.title ??
    belowNodes.value.find((n) => n.key === levelFilter.value)?.title ??
    '',
);

// Registers the <l-helix> custom element. Idempotent.
helix.register();

const leafKey = ref('');
const loading = ref(false);
const filterText = ref('');
const kindFilter = ref<'all' | 'user' | 'role'>('all');
const headers = computed<Header[]>(() => [
  { title: 'Principal', key: 'principal', align: 'start' },
  { title: 'Granted on', key: 'level', align: 'start' },
  { title: 'Privileges', key: 'privileges', align: 'start', sortable: false },
  { title: 'Since', key: 'granted', align: 'start', sortable: false },
  { title: '', key: 'actions', align: 'end', sortable: false },
]);

interface Row {
  key: string;
  principal: string;
  principalId: string;
  subtitle: string;
  kind: 'user' | 'role';
  /**
   * The resource this grant is actually held on — carried per row rather than
   * looked up in the chain, because rows from below have no chain entry and
   * are edited at their own level like every other row.
   */
  resource: GrantResourceRef;
  /** Where the row came from, relative to the object being reviewed. */
  direction: 'above' | 'here' | 'below';
  levelKey: string;
  levelTitle: string;
  levelSubtitle: string;
  levelIcon: string;
  depth: number;
  privileges: string[];
  /** Held privileges bucketed by category, for the collapsed summary. */
  byCategory: Record<string, string[]>;
  /** The categories this row actually holds, in display order. */
  categories: string[];
  stale: string[];
  granted: string;
}

/**
 * The category comes off the name, not the authorizer's vocabulary: this table
 * spans levels whose vocabularies are only fetched when a row is edited, and
 * loading six of them just to group chips is not worth the round trips.
 */
function bucketByCategory(privileges: string[]): {
  byCategory: Record<string, string[]>;
  categories: string[];
} {
  const byCategory: Record<string, string[]> = {};
  for (const name of privileges) {
    (byCategory[derivePrivilegeCategory(name)] ??= []).push(name);
  }
  const categories = Object.keys(byCategory).sort(
    (a, b) => privilegeCategoryRank(a) - privilegeCategoryRank(b) || a.localeCompare(b),
  );
  return { byCategory, categories };
}
const rows = ref<Row[]>([]);

/**
 * The one list: the chain above, this object, and whatever has been read from
 * below — in that order, which is the order they sit in.
 */
const allRows = computed(() => [...rows.value, ...belowRows.value]);

const visibleRows = computed(() => {
  const q = filterText.value?.toLowerCase().trim();
  return allRows.value.filter((r) => {
    if (levelFilter.value === BELOW_ALL) {
      if (r.direction !== 'below') return false;
    } else if (levelFilter.value && r.levelKey !== levelFilter.value) {
      return false;
    }
    if (kindFilter.value !== 'all' && r.kind !== kindFilter.value) return false;
    if (!q) return true;
    return (
      r.principal.toLowerCase().includes(q) ||
      r.levelTitle.toLowerCase().includes(q) ||
      r.privileges.some((p) => p.toLowerCase().includes(q))
    );
  });
});

// ---- editing ---------------------------------------------------------------

const editOpen = ref(false);
const preparing = ref<string | null>(null);
const saving = ref(false);
const saveError = ref<string | null>(null);
const editPrivileges = ref<GrantablePrivilege[]>([]);
const editing = ref<{
  row: Row;
  resource: GrantResourceRef;
  levelTitle: string;
  principal: GrantPrincipalRow;
} | null>(null);

/** Roles must come from the resource's project; the server itself has none. */
const editProjectId = computed(() =>
  editing.value?.resource.type === 'server'
    ? undefined
    : visual.projectSelected['project-id'] || undefined,
);

function heldForEdit(): string[] {
  const known = new Set(editPrivileges.value.map((p) => p.privilege.name));
  return (editing.value?.row.privileges ?? []).filter((n) => known.has(n));
}

async function openEdit(row: Row) {
  preparing.value = row.key;
  saveError.value = null;
  try {
    editPrivileges.value = await grants.grantablePrivileges(row.resource);
    editing.value = {
      row,
      resource: row.resource,
      levelTitle: row.levelTitle,
      principal: {
        key: `${row.kind}:${row.principalId}`,
        id: row.principalId,
        kind: row.kind,
        name: row.principal,
      },
    };
    editOpen.value = true;
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to read grantable privileges';
  } finally {
    preparing.value = null;
  }
}

// ---- revoke all ------------------------------------------------------------

const confirmRevokeOpen = ref(false);
const pendingRevoke = ref<Row | null>(null);
const revoking = ref<string | null>(null);
const revokeError = ref<string | null>(null);
/** Held here but not revocable by this caller — they survive the revoke. */
const revokeLocked = ref<string[]>([]);

/**
 * The vocabulary is fetched before asking, so the confirmation can say what
 * will actually be removed rather than promising "everything" and leaving
 * privileges behind.
 */
async function requestRevokeAll(row: Row) {
  revoking.value = row.key;
  revokeError.value = null;
  try {
    const privs = await grants.grantablePrivileges(row.resource);
    const grantable = new Set(privs.filter((p) => p.allowed).map((p) => p.privilege.name));
    revokeLocked.value = row.privileges.filter((p) => !grantable.has(p));
    pendingRevoke.value = row;
    confirmRevokeOpen.value = true;
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to read grantable privileges';
  } finally {
    revoking.value = null;
  }
}

async function doRevokeAll() {
  const row = pendingRevoke.value;
  if (!row) return;

  revoking.value = row.key;
  revokeError.value = null;
  try {
    const principal = toPrincipal(row.kind, row.principalId);
    const locked = new Set(revokeLocked.value);
    // Stale privileges go too: they enforce nothing, but a "revoke all" that
    // left some behind would be a lie.
    const deletes: GrantEntry[] = [
      ...row.privileges.filter((p) => !locked.has(p)),
      ...row.stale,
    ].map((privilege) => ({ principal, privilege }));

    if (deletes.length) {
      await grants.applyGrants(row.resource, { deletes });
      await reload();
      emit('saved');
    }
    confirmRevokeOpen.value = false;
    pendingRevoke.value = null;
  } catch (e: any) {
    revokeError.value = e?.error?.message || e?.message || 'Failed to revoke grants';
  } finally {
    revoking.value = null;
  }
}

async function applyEdit(payload: { principal: GrantPrincipalRow; privileges: string[] }) {
  const target = editing.value;
  if (!target) return;
  const before = new Set(heldForEdit());
  const after = new Set(payload.privileges);
  const grantable = new Set(
    editPrivileges.value.filter((p) => p.allowed).map((p) => p.privilege.name),
  );
  const entry = (privilege: string): GrantEntry => ({
    principal: toPrincipal(payload.principal.kind, payload.principal.id),
    privilege,
  });
  // Only what this caller may change on either side — a revoke they are not
  // entitled to would fail the whole atomic apply.
  const writes = [...after].filter((n) => !before.has(n) && grantable.has(n)).map(entry);
  const deletes = [...before].filter((n) => !after.has(n) && grantable.has(n)).map(entry);
  if (!writes.length && !deletes.length) {
    editOpen.value = false;
    return;
  }

  saving.value = true;
  saveError.value = null;
  try {
    await grants.applyGrants(target.resource, { writes, deletes });
    editOpen.value = false;
    await loadAllLevels();
    emit('saved');
  } catch (e: any) {
    saveError.value = e?.error?.message || e?.message || 'Failed to apply grants';
  } finally {
    saving.value = false;
  }
}

/**
 * Reads every level in the chain and flattens them into one listing.
 *
 * All of them at once, unlike the per-level panels: the question here is where
 * someone's access comes from, which cannot be answered a level at a time.
 * Levels this caller cannot read are skipped rather than failing the table.
 */
async function loadAllLevels() {
  loading.value = true;
  const next: Row[] = [];
  const refused = new Set<string>();
  try {
    await Promise.all(
      chain.value.map(async (level, depth) => {
        let listed;
        try {
          listed = await grants.listGrants(level.resource);
        } catch (e) {
          // A level this caller may not read is expected here — reading grants
          // on a namespace does not imply reading them on the server above it.
          // Recorded so the rail can say "not visible to you", which an empty
          // level would otherwise be indistinguishable from. Anything that is
          // not a refusal stays silent as before, but is not claimed as empty.
          if (isForbiddenError(e)) refused.add(level.key);
          return;
        }
        const byPrincipal = new Map<string, any[]>();
        for (const g of listed) {
          const key = principalKey(g.principal);
          if (!byPrincipal.has(key)) byPrincipal.set(key, []);
          byPrincipal.get(key)!.push(g);
        }
        await Promise.all(
          [...byPrincipal.entries()].map(async ([pk, list]) => {
            const kind: 'user' | 'role' = pk.startsWith('user:') ? 'user' : 'role';
            const id = pk.slice(pk.indexOf(':') + 1);
            const meta = await grants.resolvePrincipalName(kind, id);
            const held = list
              .filter((g) => g.recognized !== false)
              .map((g) => g.privilege)
              .sort();
            next.push({
              key: `${level.key}|${pk}`,
              principal: meta.name,
              principalId: id,
              subtitle: meta.subtitle,
              kind,
              resource: level.resource,
              direction: level.key === leafKey.value ? 'here' : 'above',
              levelKey: level.key,
              levelTitle: level.title,
              levelSubtitle: level.subtitle,
              levelIcon: level.icon,
              depth,
              privileges: held,
              ...bucketByCategory(held),
              stale: list
                .filter((g) => g.recognized === false)
                .map((g) => g.privilege)
                .sort(),
              granted: formatGrantedSummary(list.map((g) => g['created-at'])),
            });
          }),
        );
      }),
    );
    rows.value = next;
    unreadableLevels.value = refused;
  } finally {
    loading.value = false;
  }
}

/**
 * Reads one page of what is held inside this object, as rows of the same table.
 *
 * Pivoted the same way the levels are — one row per principal per resource —
 * so a reader scanning the list is not switching between two shapes halfway
 * down it. Its own failures are recorded rather than thrown: the chain above
 * is still a useful answer when the subtree is refused, unsupported or simply
 * not read yet.
 */
async function loadBelowPage(pageToken?: string) {
  if (!subtreeAvailable.value || !subtreeSource) return;
  loadingBelow.value = true;
  belowLoaded.value = true;
  belowError.value = null;
  try {
    const page = await subtreeSource.list(props.resource, { pageToken, pageSize: BELOW_PAGE_SIZE });
    belowAsOf.value = page.asOf ?? belowAsOf.value;
    belowNextToken.value = page.nextPageToken ?? null;

    // One row per principal per resource, matching the level rows above.
    const byKey = new Map<string, { resource: GrantResourceRef; list: GrantResponse[] }>();
    for (const g of page.grants ?? []) {
      const ref = refFromResponse(g.resource);
      if (!ref) continue;
      const k = `${resourceKey(ref)}|${principalKey(g.principal)}`;
      if (!byKey.has(k)) byKey.set(k, { resource: ref, list: [] });
      byKey.get(k)!.list.push(g);
    }

    const next: Row[] = [];
    await Promise.all(
      [...byKey.entries()].map(async ([k, { resource, list }]) => {
        const pk = principalKey(list[0].principal);
        const kind: 'user' | 'role' = pk.startsWith('user:') ? 'user' : 'role';
        const id = pk.slice(pk.indexOf(':') + 1);
        const [meta, location] = await Promise.all([
          grants.resolvePrincipalName(kind, id),
          grants
            .resolveResourceLocation(resource)
            .catch(() => ({ path: '', route: null as string | null })),
        ]);
        const held = list
          .filter((g) => g.recognized !== false)
          .map((g) => g.privilege)
          .sort();
        next.push({
          key: `below|${k}`,
          principal: meta.name,
          principalId: id,
          subtitle: meta.subtitle,
          kind,
          resource,
          direction: 'below',
          levelKey: `below|${resourceKey(resource)}`,
          levelTitle: location.path || resourceLabel(resource.type),
          levelSubtitle: resourceLabel(resource.type),
          levelIcon: resourceIcon(resource.type),
          // Sorted below every level of the chain, which is where it is.
          depth: chain.value.length,
          privileges: held,
          ...bucketByCategory(held),
          stale: list
            .filter((g) => g.recognized === false)
            .map((g) => g.privilege)
            .sort(),
          granted: formatGrantedSummary(list.map((g) => g['created-at'])),
        });
      }),
    );
    belowRows.value = pageToken ? [...belowRows.value, ...next] : next;
  } catch (e: any) {
    const code = e?.error?.code || e?.status || 0;
    if (code === 501) belowUnsupported.value = true;
    else if (isForbiddenError(e)) belowForbidden.value = true;
    else belowError.value = e?.error?.message || e?.message || 'could not be read';
  } finally {
    loadingBelow.value = false;
  }
}

function loadMoreBelow() {
  if (belowNextToken.value) loadBelowPage(belowNextToken.value);
}

/**
 * Levels whose grants this caller may not list.
 *
 * The hierarchy is still worth showing: someone with `read_grants` on a table
 * and its namespace sees both, and the levels above are marked rather than
 * omitted — dropping them would misrepresent where their access could come
 * from as much as failing the whole dialog would.
 */
const unreadableLevels = ref<Set<string>>(new Set());
const buildingChain = ref(false);
const chainError = ref<string | null>(null);

interface Level {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  resource: GrantResourceRef;
}
const chain = ref<Level[]>([]);

function levelFor(resource: GrantResourceRef, title: string, subtitle?: string): Level {
  return {
    key: resourceKey(resource),
    title,
    subtitle: subtitle ?? resourceLabel(resource.type),
    icon: resourceIcon(resource.type),
    resource,
  };
}

/**
 * Builds the rail from the server down to the entity.
 *
 * The namespace levels are the expensive part: a grant is addressed by
 * namespace id, but the console carries a path, so each ancestor prefix is
 * resolved separately. A prefix the caller cannot read is skipped rather than
 * failing the whole rail — its own pane would have shown a lock anyway.
 */
async function buildChain() {
  buildingChain.value = true;
  chainError.value = null;
  const levels: Level[] = [];

  try {
    const leaf = props.resource;

    levels.push(levelFor({ type: 'server' }, 'Server'));
    levels.push(
      levelFor({ type: 'project' }, visual.projectSelected['project-name'] || 'Project', 'Project'),
    );

    const warehouseId = (leaf as any).warehouseId as string | undefined;
    if (warehouseId) {
      levels.push(
        levelFor(
          { type: 'warehouse', warehouseId },
          props.warehouseName || 'Warehouse',
          'Warehouse',
        ),
      );
    }

    if (warehouseId && props.namespacePath) {
      const parts = props.namespacePath.split('\x1F').filter(Boolean);
      // A namespace leaf is the last prefix; anything else sits under the full
      // path, so every prefix is an ancestor.
      const depth = parts.length;
      for (let i = 1; i <= depth; i++) {
        const prefix = parts.slice(0, i);
        const isLeafNamespace = leaf.type === 'namespace' && i === depth;
        try {
          const id = isLeafNamespace
            ? (leaf as any).namespaceId
            : await resolveNamespaceId(warehouseId, prefix.join('\x1F'));
          if (!id) continue;
          levels.push(
            levelFor(
              { type: 'namespace', warehouseId, namespaceId: id },
              prefix.join('.'),
              'Namespace',
            ),
          );
        } catch {
          // Not readable by this caller — leave it out of the rail.
          chainError.value = 'Some namespace levels could not be resolved.';
        }
      }
    }

    // The leaf, unless one of the levels above already is it.
    const key = resourceKey(leaf);
    leafKey.value = key;
    if (!levels.some((l) => l.key === key)) {
      levels.push(levelFor(leaf, props.entityName, resourceLabel(leaf.type)));
    }

    chain.value = levels;
    await loadAllLevels();
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to build the resource hierarchy';
    chain.value = levels;
  } finally {
    buildingChain.value = false;
  }
}

const namespaceIdCache = new Map<string, string>();

async function resolveNamespaceId(warehouseId: string, path: string): Promise<string> {
  const cacheKey = `${warehouseId}|${path}`;
  const cached = namespaceIdCache.get(cacheKey);
  if (cached) return cached;
  const meta = (await functions.loadNamespaceMetadata(
    warehouseId,
    path,
    false,
  )) as GetNamespaceResponse;
  const id = meta.properties?.namespace_id || (meta as any)['namespace-uuid'] || '';
  if (id) namespaceIdCache.set(cacheKey, id);
  return id;
}

const BELOW_PAGE_SIZE = 250;

/** `as-of` is an instant, and reads better as one than as an ISO string. */
function formatInstant(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Re-reads both halves.
 *
 * They run together rather than one behind a button: the point of the pane is
 * a single answer, and a half of it that only appears after a second click is
 * a half the reader will forget to ask for. The downward read is the expensive,
 * separately-authorized one, so it reports its own state under the table
 * instead of failing the whole view.
 */
async function reload() {
  rows.value = [];
  levelFilter.value = '';
  belowRows.value = [];
  belowLoaded.value = false;
  belowNextToken.value = null;
  belowAsOf.value = null;
  belowForbidden.value = false;
  belowUnsupported.value = false;
  belowError.value = null;
  // The first page of the subtree comes with the chain. It is the expensive,
  // separately-authorized half, so only the first page — the rest stays behind
  // "Load more" — but a review that shows nothing about what is inside until
  // you ask twice is a review most people will read as complete.
  await Promise.all([buildChain(), loadBelowPage()]);
}

// Panes mount together and load on first view, so switching scope does not
// fire a listing for every level of the hierarchy before anyone asked.
watch(
  () => props.active,
  (active) => {
    if (active && !chain.value.length) reload();
  },
);

// A different entity is a different chain; keyed on the identity rather than
// the object, since hosts pass the ref as an inline literal.
watch(
  () => resourceKey(props.resource),
  () => {
    if (props.active) reload();
  },
);

onMounted(() => {
  if (props.active) reload();
});

defineExpose({ reload });
</script>
