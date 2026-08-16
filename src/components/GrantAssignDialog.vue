<template>
  <!-- Principal first, then privileges — the same shape as the permission
       assign dialog, so granting reads the same way as assigning. Nothing is
       written until Save: the dialog hands back the desired set and the panel
       turns it into one atomic apply. -->
  <v-dialog
    :model-value="modelValue"
    max-width="980"
    scrollable
    @update:model-value="emit('update:modelValue', $event)">
    <v-card style="display: flex; flex-direction: column; max-height: 90vh">
      <v-card-title class="text-subtitle-1 d-flex align-center ga-2 py-3 flex-grow-0">
        <v-icon>{{ isEdit ? 'mdi-pencil-outline' : 'mdi-shield-plus-outline' }}</v-icon>
        {{ isEdit ? 'Edit grants' : 'Grant privileges' }}
        <span class="text-medium-emphasis">on {{ resourceLabel(resourceType).toLowerCase() }}</span>
        <span v-if="resourceName" class="font-weight-medium">— {{ resourceName }}</span>
      </v-card-title>
      <v-divider></v-divider>

      <v-card-text style="flex: 1 1 auto; min-height: 0; overflow-y: auto">
        <!-- Editing an existing row fixes the principal; only a new grant asks
             who it is for. -->
        <div v-if="isEdit" class="d-flex align-center ga-2 mb-4">
          <v-icon size="20">
            {{
              principal?.kind === 'user'
                ? 'mdi-account-circle-outline'
                : 'mdi-account-box-multiple-outline'
            }}
          </v-icon>
          <div>
            <div class="text-body-2 font-weight-medium">{{ principal?.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ principal?.id }}</div>
          </div>
        </div>

        <template v-else>
          <!-- Grants can only name principals in the resource's own project, so
               the search is pinned there rather than letting a doomed pick
               through to a server-side rejection. -->
          <PrincipalSearch v-model="picked" :lock-project-id="projectId"></PrincipalSearch>
          <div
            v-if="alreadyListed"
            class="text-caption text-medium-emphasis mt-2 d-flex align-center ga-1">
            <v-icon size="14">mdi-information-outline</v-icon>
            Already holds grants here — they are pre-selected below.
          </div>
          <v-divider class="my-4"></v-divider>
        </template>

        <div v-if="!targetPrincipal" class="text-body-2 text-medium-emphasis py-4">
          Search for a user or role to grant privileges to.
        </div>

        <template v-else>
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <span class="text-body-2 font-weight-medium">Privileges</span>
            <v-chip size="x-small" variant="tonal">{{ selected.length }} selected</v-chip>
            <v-spacer></v-spacer>
            <v-btn
              size="x-small"
              variant="text"
              :disabled="!grantableNames.length || allSelected"
              @click="selectAll">
              Select all
            </v-btn>
            <v-btn size="x-small" variant="text" :disabled="!selected.length" @click="clearAll">
              Clear
            </v-btn>
          </div>

          <div v-if="!privileges.length" class="text-body-2 text-medium-emphasis py-2">
            This resource publishes no grantable privileges.
          </div>

          <!-- The vocabulary is shown whole, including what this caller may not
               grant: a silently shortened list reads as a missing privilege
               rather than a withheld one. -->
          <div v-for="group in displayGroups" :key="group.name" class="mb-3">
            <div
              v-if="showGroupHeadings"
              class="text-caption text-medium-emphasis text-uppercase mb-1">
              {{ group.label }}
            </div>
            <v-row no-gutters>
              <v-col v-for="p in group.privileges" :key="p.privilege.name" cols="12" sm="6" md="4">
                <v-tooltip location="top" :disabled="p.allowed && !p.privilege.description">
                  <template #activator="{ props: tp }">
                    <div v-bind="tp">
                      <v-checkbox
                        v-model="selected"
                        :value="p.privilege.name"
                        :disabled="!p.allowed"
                        :label="p.privilege['display-name'] || p.privilege.name"
                        density="compact"
                        color="primary"
                        hide-details></v-checkbox>
                    </div>
                  </template>
                  <span style="max-width: 320px; display: inline-block">
                    <template v-if="!p.allowed">
                      You may not grant or revoke this privilege here.
                    </template>
                    <template v-else>{{ p.privilege.description }}</template>
                  </span>
                </v-tooltip>
              </v-col>
            </v-row>
          </div>

          <v-alert
            v-if="crossProjectRole"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-2">
            {{ targetPrincipal?.name }} belongs to another project. Grants can only name principals
            from the project this {{ resourceLabel(resourceType).toLowerCase() }} is in, so the
            server will refuse this.
          </v-alert>
          <v-alert v-if="changeSummary" type="info" variant="tonal" density="compact" class="mt-2">
            {{ changeSummary }}
          </v-alert>
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2">
            {{ error }}
          </v-alert>
        </template>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="flex-grow-0">
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="saving" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!targetPrincipal || !dirty || crossProjectRole"
          @click="save">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { groupPrivileges, resourceLabel } from '../composables/useGrants';
import PrincipalSearch, { type SelectedPrincipal } from './PrincipalSearch.vue';
import type { GrantablePrivilege, ResourceType } from '../gen/management/types.gen';

export interface GrantPrincipalRow {
  key: string;
  id: string;
  kind: 'user' | 'role';
  name: string;
}

const props = defineProps<{
  modelValue: boolean;
  /** The resource's vocabulary, each entry carrying whether the caller may grant it. */
  privileges: GrantablePrivilege[];
  resourceType: ResourceType | string;
  resourceName?: string;
  /** The project the resource belongs to; roles must come from it. */
  projectId?: string;
  /** Present when editing an existing row; absent when granting to someone new. */
  principal?: GrantPrincipalRow | null;
  /**
   * What a principal already holds here, by principal key. A function rather
   * than a list because in grant mode the principal is not known until it has
   * been searched for — and opening on an empty set would turn Save into a
   * silent revoke of everything they already had.
   */
  heldFor: (principalKey: string) => string[];
  /** Principals already listed, to warn when a new grant targets one of them. */
  existingKeys?: string[];
  saving?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /** The desired final set for this principal; the panel diffs and applies it. */
  (e: 'apply', v: { principal: GrantPrincipalRow; privileges: string[] }): void;
}>();

const picked = ref<SelectedPrincipal | null>(null);
const selected = ref<string[]>([]);

const isEdit = computed(() => !!props.principal);
const groups = computed(() => groupPrivileges(props.privileges));
const grantableNames = computed(() =>
  props.privileges.filter((p) => p.allowed).map((p) => p.privilege.name),
);

/**
 * Headings earn their place only when they cluster something.
 *
 * A vocabulary with no categories collapses to a single "Other" group, and a
 * short one — the server publishes five privileges — lands one item under each
 * heading, which is five headings doing no grouping at all. In both cases the
 * list reads better flat.
 */
const showGroupHeadings = computed(
  () =>
    groups.value.length > 1 &&
    groups.value.some((g) => g.privileges.length > 1) &&
    !(groups.value.length === 1 && groups.value[0]?.name === 'other'),
);

/** Grouped when the headings are shown, one flat list when they are not. */
const displayGroups = computed(() =>
  showGroupHeadings.value
    ? groups.value
    : [{ name: 'all', label: '', privileges: props.privileges }],
);

/** The principal being edited, whether it was passed in or just searched for. */
const targetPrincipal = computed<GrantPrincipalRow | null>(() => {
  if (props.principal) return props.principal;
  if (!picked.value) return null;
  return {
    key: `${picked.value.type}:${picked.value.id}`,
    id: picked.value.id,
    kind: picked.value.type,
    name: picked.value.title.split(' · ')[0] || picked.value.id,
  };
});

/**
 * A role from a different project cannot hold a grant here. Pinning the search
 * prevents most of these; a role pasted in by id can still be one.
 */
const crossProjectRole = computed(() => {
  if (!props.projectId || picked.value?.type !== 'role') return false;
  const rolesProject = picked.value.projectId;
  return !!rolesProject && rolesProject !== props.projectId;
});

const alreadyListed = computed(
  () => !!targetPrincipal.value && (props.existingKeys ?? []).includes(targetPrincipal.value.key),
);

const allSelected = computed(() => grantableNames.value.every((n) => selected.value.includes(n)));

/** What the current target already holds — the baseline every diff is against. */
const initialSet = computed(() =>
  targetPrincipal.value ? props.heldFor(targetPrincipal.value.key) : [],
);

const dirty = computed(() => {
  const before = new Set(initialSet.value);
  const after = new Set(selected.value);
  if (before.size !== after.size) return true;
  for (const v of before) if (!after.has(v)) return true;
  return false;
});

/** Says what Save will do, in the same add/remove terms the apply uses. */
const changeSummary = computed(() => {
  const before = new Set(initialSet.value);
  const adds = selected.value.filter((n) => !before.has(n));
  const removes = [...before].filter((n) => !selected.value.includes(n));
  if (!adds.length && !removes.length) return '';
  const parts = [];
  if (adds.length) parts.push(`grant ${adds.join(', ')}`);
  if (removes.length) parts.push(`revoke ${removes.join(', ')}`);
  return `Save will ${parts.join(' and ')}.`;
});

function selectAll() {
  // Only what this caller may actually grant — the rest would be refused.
  selected.value = [...new Set([...selected.value, ...grantableNames.value])];
}

function clearAll() {
  // Privileges the caller cannot grant stay put: unchecking one would build a
  // revoke the server refuses.
  const locked = initialSet.value.filter((n) => !grantableNames.value.includes(n));
  selected.value = locked;
}

function close() {
  emit('update:modelValue', false);
}

function save() {
  if (!targetPrincipal.value) return;
  emit('apply', { principal: targetPrincipal.value, privileges: [...selected.value] });
}

// Seed whenever the dialog is open, including on mount: a host that renders it
// behind a v-if and opens it in the same tick mounts it already open, so a
// change-only watcher would never fire and the form would come up empty.
// Re-seeding on each open also stops a previous row's selection leaking in.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    picked.value = null;
    selected.value = [...initialSet.value];
  },
  { immediate: true },
);

// A newly searched principal starts from whatever they already hold here.
watch(picked, () => {
  if (!isEdit.value) selected.value = [...initialSet.value];
});
</script>
