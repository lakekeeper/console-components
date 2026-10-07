<template>
  <!-- One resource's grants — and, in the same table, the levels above it and
       whatever is held inside it.

       This used to be two panes behind a rail: a matrix of who holds what here,
       and a review of where access comes from. They were the same view twice.
       Selecting this object in the review's tree *is* the matrix, with the
       privileges as chips rather than columns, and its rows already edit and
       revoke at their own level. The one thing a listing cannot offer is
       granting to someone who holds nothing yet — there is no row for them —
       so that is what this component adds, and all it adds. -->
  <div class="d-flex flex-column" style="min-height: 0; height: 100%">
    <!-- What this pane is about, and the one action that belongs to it rather
         than to a row. Granting acts on this object whatever the tree below has
         selected, so it sits on the line that names the object — anywhere
         lower and it reads as acting on the current selection. -->
    <div
      class="d-flex align-center ga-3 px-4 py-2 flex-shrink-0"
      style="border-bottom: 1px solid rgba(var(--v-border-color), 0.16)">
      <v-icon size="22">{{ resourceIcon(resource.type) }}</v-icon>
      <div style="min-width: 0">
        <div class="text-subtitle-2 text-truncate" :title="headerTitle">{{ headerTitle }}</div>
        <div class="text-caption text-medium-emphasis text-truncate" :title="headerSubtitle">
          {{ headerSubtitle }}
        </div>
      </div>
      <v-spacer></v-spacer>
      <!-- Both act on this object rather than on a row: one adds access to it,
           the other clears access inside it. They belong on the same line as
           its name, and next to each other. -->
      <v-btn
        v-if="canEditAnything"
        size="small"
        variant="outlined"
        prepend-icon="mdi-shield-plus-outline"
        :loading="preparing"
        @click="openGrant">
        Grant
      </v-btn>
      <component
        :is="subtreeSource?.actions"
        v-if="subtreeSource?.actions"
        :resource="resource"
        :resource-name="resourceName"
        :as-of="subtreeState.asOf"
        :filter="subtreeState.filter"
        :disabled="!subtreeState.canRevoke"
        @revoked="reviewRef?.reload()" />
    </div>

    <GrantsReviewPanel
      ref="reviewRef"
      :resource="resource"
      :entity-name="resourceName || resourceLabel(resource.type)"
      :warehouse-name="warehouseName"
      :namespace-path="namespacePath"
      :active="active"
      style="flex: 1 1 auto; min-height: 0"
      @saved="emit('saved')"
      @subtree-state="onSubtreeState">
      <template #notice>
        <slot name="notice">
          <!-- Fallback: a component the app registered for every grants pane.
               This pane has four hosts and threading a slot through each one
               misses whichever is added next — so the extension point is an
               injection, and a host that wants something specific still
               overrides it with the slot. Absent in OSS: nothing provides it. -->
          <component :is="grantsNotice" v-if="grantsNotice" :resource="resource" />
        </slot>
      </template>

      <!-- Kept for hosts that carry an action of their own. -->
      <template v-if="$slots['toolbar-actions']" #toolbar-actions>
        <slot name="toolbar-actions"></slot>
      </template>
    </GrantsReviewPanel>

    <GrantAssignDialog
      v-model="assignOpen"
      :privileges="privileges"
      :resource-type="resource.type"
      :resource-name="resourceName"
      :project-id="resourceProjectId"
      :principal="null"
      :held-for="heldFor"
      :existing-keys="existingKeys"
      :saving="saving"
      :error="saveError"
      @apply="applyAssignment" />
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useVisualStore } from '../stores/visual';
import { GrantsNoticeKey } from '../common/grantsNotice';
import { GrantsSubtreeKey, type SubtreeGrantSource } from '../common/grantsSubtree';
import {
  useGrants,
  grantErrorMessage,
  principalKey,
  resourceIcon,
  resourceKey,
  resourceLabel,
} from '../composables/useGrants';
import GrantAssignDialog, { type GrantPrincipalRow } from './GrantAssignDialog.vue';
import GrantsReviewPanel from './GrantsReviewPanel.vue';
import type { GrantResourceRef } from '../common/interfaces';
import type { GrantEntry, GrantablePrivilege } from '../gen/management/types.gen';
import { toPrincipal } from '../common/principal';

const props = withDefaults(
  defineProps<{
    /**
     * The resource this pane is rooted at: what it grants on, and where the
     * review's chain ends.
     */
    resource: GrantResourceRef;
    /** Shown in the assign dialog's title, when the caller knows the name. */
    resourceName?: string;
    /** Warehouse display name, when the hierarchy passes through one. */
    warehouseName?: string;
    /** Unit-separated namespace path, used to build the hierarchy's levels. */
    namespacePath?: string;
    /** Accepted for callers that still set it; the review pane says it itself. */
    hideScopeNote?: boolean;
    /** Defers the first load until the pane is actually looked at. */
    active?: boolean;
  }>(),
  { hideScopeNote: false, active: true },
);

const emit = defineEmits<{ (e: 'saved'): void }>();

const grants = useGrants();
const visual = useVisualStore();

const headerTitle = computed(() => props.resourceName || resourceLabel(props.resource.type));

/**
 * The kind, and where it sits — the same shape the explorer's own header used,
 * so moving that row in here did not change how a selection reads.
 */
const headerSubtitle = computed(() => {
  const parts = [resourceLabel(props.resource.type)];
  if (props.warehouseName) {
    // eslint-disable-next-line no-control-regex
    const path = props.namespacePath?.replace(/\x1F/g, '.');
    parts.push(path ? `${props.warehouseName} / ${path}` : props.warehouseName);
  }
  return parts.join(' · ');
});

/**
 * An optional per-deployment notice about whether grants here take effect.
 *
 * Provided by the app (Plus registers a Cedar one); `null` everywhere else, so
 * OSS renders nothing and this file needs no knowledge of what it would say.
 */
const grantsNotice = inject<unknown>(GrantsNoticeKey, null);

const reviewRef = ref<{ reload: () => Promise<void> } | null>(null);

/**
 * The app's subtree access, for the bulk revoke it contributes. Rendered here
 * rather than inside the review pane so it sits beside granting, on the line
 * that names what both of them act on.
 */
const subtreeSource = inject<SubtreeGrantSource | null>(GrantsSubtreeKey, null);

/** Published by the review pane, which is the only thing that knows it. */
const subtreeState = ref<{
  asOf: string | null;
  filter: Record<string, unknown>;
  canRevoke: boolean;
}>({ asOf: null, filter: {}, canRevoke: false });

function onSubtreeState(v: typeof subtreeState.value) {
  subtreeState.value = v;
}

/**
 * The project this resource sits in. Everything except the server is addressed
 * under a project, and roles must come from it.
 */
const resourceProjectId = computed(() => {
  if (props.resource.type === 'server') return undefined;
  if (props.resource.type === 'project') {
    return props.resource.projectId || visual.projectSelected['project-id'] || undefined;
  }
  return visual.projectSelected['project-id'] || undefined;
});

// ---- what may be granted here ----------------------------------------------

const privileges = ref<GrantablePrivilege[]>([]);

/**
 * `allowed` is the only signal of grant authority — action introspection does
 * not report it — so the vocabulary doubles as the gate on whether anything
 * here is grantable at all.
 */
const canEditAnything = computed(() => privileges.value.some((p) => p.allowed));
const grantableNames = computed(
  () => new Set(privileges.value.filter((p) => p.allowed).map((p) => p.privilege.name)),
);

async function loadVocabulary() {
  try {
    privileges.value = await grants.grantablePrivileges(props.resource);
  } catch {
    // Refused or unavailable: no Grant button. The review pane reports the read
    // side for itself, per level.
    privileges.value = [];
  }
}

// ---- granting --------------------------------------------------------------

const assignOpen = ref(false);
const preparing = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);

/**
 * What each principal already holds here, read when the dialog opens.
 *
 * The dialog hands back a desired final set and the diff is taken against this,
 * so opening on an empty one would turn Save into a silent revoke of everything
 * that principal already had.
 */
const held = ref<Record<string, string[]>>({});
const existingKeys = computed(() => Object.keys(held.value));

function heldFor(key: string): string[] {
  return held.value[key] ?? [];
}

async function openGrant() {
  preparing.value = true;
  saveError.value = null;
  try {
    const listed = await grants.listGrants(props.resource);
    const next: Record<string, string[]> = {};
    for (const g of listed) (next[principalKey(g.principal)] ??= []).push(g.privilege);
    held.value = next;
  } catch (e: any) {
    // Open anyway, saying so: granting to someone new does not depend on this,
    // and refusing to open would be a worse answer than a warning.
    saveError.value = grantErrorMessage(e, 'Could not read the current grants');
  } finally {
    preparing.value = false;
    assignOpen.value = true;
  }
}

/**
 * Turns a desired privilege set for one principal into the diff the API takes.
 *
 * Only privileges this caller may grant are considered on either side: one they
 * hold but cannot revoke must not appear in `deletes`, or the whole atomic
 * apply is refused.
 */
async function applyAssignment(payload: { principal: GrantPrincipalRow; privileges: string[] }) {
  const { principal, privileges: desired } = payload;
  const before = new Set(heldFor(principal.key));
  const after = new Set(desired);
  const entry = (privilege: string): GrantEntry => ({
    principal: toPrincipal(principal.kind, principal.id),
    privilege,
  });

  const writes = [...after].filter((p) => !before.has(p) && grantableNames.value.has(p)).map(entry);
  const deletes = [...before]
    .filter((p) => !after.has(p) && grantableNames.value.has(p))
    .map(entry);

  if (!writes.length && !deletes.length) {
    assignOpen.value = false;
    return;
  }

  saving.value = true;
  saveError.value = null;
  try {
    await grants.applyGrants(props.resource, { writes, deletes });
    assignOpen.value = false;
    // Apply answers 204 with no body — whether an entry was already in the
    // requested state is not reported — so the truth comes from a re-read.
    await reviewRef.value?.reload();
    emit('saved');
  } catch (e: any) {
    saveError.value = grantErrorMessage(e, 'Failed to apply grants');
  } finally {
    saving.value = false;
  }
}

// ---- lifecycle -------------------------------------------------------------

// Keyed on the identity rather than the object: hosts pass the ref as an inline
// literal, so a deep watch on it would refire on every parent re-render.
watch(() => resourceKey(props.resource), loadVocabulary);

onMounted(loadVocabulary);

defineExpose({ reload: () => reviewRef.value?.reload() });
</script>
