import { computed } from 'vue';
import { useVisualStore } from '../stores/visual';

/**
 * Who owns a role's membership, and what that means for the console.
 *
 * Every role carries a `provider-id`. Two namespaces are the catalog's own:
 * `lakekeeper`, whose roles are created and assigned here, and the reserved
 * `system`. Every other namespace belongs to a role provider (LDAP, Entra,
 * Okta, OIDC token claims), which owns the role and its membership; the
 * management API refuses member edits there with `RoleNotManuallyAssignable`.
 *
 * Provider membership is also synced lazily: a principal only becomes visible
 * as a member once it has signed in to Lakekeeper. So the member list of a
 * provider-owned role is not the group — it is the part of the group Lakekeeper
 * has seen, which is why the console frames it as "Known members".
 */

/** The catalog's own namespace: roles created, edited and assigned here. */
export const LOCAL_ROLE_PROVIDER_ID = 'lakekeeper';
/** Reserved namespace for built-in roles; membership is instance-admin only. */
export const SYSTEM_ROLE_PROVIDER_ID = 'system';

/**
 * Whether the role is owned by an external role provider rather than by the
 * catalog. Absent means not loaded yet, not "external", so a title does not
 * flip after the metadata arrives.
 */
export function isProviderOwnedRole(providerId: string | undefined | null): boolean {
  return (
    !!providerId && providerId !== LOCAL_ROLE_PROVIDER_ID && providerId !== SYSTEM_ROLE_PROVIDER_ID
  );
}

/**
 * Whether members can be added and removed through the API.
 *
 * Gated on the namespace, not on `managed-role-providers`: a role left behind
 * by a since-removed provider becomes renamable and deletable again but stays
 * unassignable, so the list of configured providers is the wrong test here.
 */
export function isMembershipEditableRole(providerId: string | undefined | null): boolean {
  return (
    !providerId || providerId === LOCAL_ROLE_PROVIDER_ID || providerId === SYSTEM_ROLE_PROVIDER_ID
  );
}

/**
 * The role provider namespaces the server currently syncs, from
 * `GET /management/v1/info`. It tracks live configuration: drop a provider from
 * the config and its namespace disappears here, leaving its roles behind as
 * orphans. Empty on OSS, which ships no role providers.
 */
export function useManagedRoleProviders() {
  const visual = useVisualStore();
  return computed(() => visual.getServerInfo()?.['managed-role-providers'] ?? []);
}

/**
 * Whether this role's provider is still configured, i.e. sync still maintains
 * it. False for a provider-owned role whose provider has been removed: nothing
 * refreshes its members any more, so the list is frozen at whoever had signed
 * in while the provider was around.
 */
export function useRoleProviderStillSynced(providerId: () => string | undefined | null) {
  const isSyncManaged = useIsSyncManagedRole();
  return computed(() => isSyncManaged.value(providerId()));
}

/**
 * Predicate over `managed-role-providers`: whether provider sync owns this
 * role, so renaming, re-describing and deleting it are refused with
 * `ManagedRoleImmutable`.
 *
 * This is the right test for those three, and the wrong one for membership —
 * see `isMembershipEditableRole`. A role left behind by a since-removed
 * provider is not managed: the list tracks live configuration, so the role
 * becomes writable again on its own and can be cleaned up.
 */
export function useIsSyncManagedRole() {
  const managed = useManagedRoleProviders();
  return computed(
    () => (providerId: string | undefined | null) =>
      !!providerId && managed.value.includes(providerId),
  );
}

/** How a role is owned, in the words the console uses for it. */
export type RoleOwnership = {
  kind: 'internal' | 'built-in' | 'external';
  /** The classification on its own, e.g. `Internal`. */
  label: string;
  /** What the classification means for writes. */
  description: string;
  /** Whether provider sync still maintains this role. */
  syncManaged: boolean;
};

/**
 * The single answer to "who owns this role, and what may I change" — so the
 * chip, its tooltip and the overview cannot drift apart in wording.
 *
 * Four outcomes, not two: a provider-owned role whose provider has since been
 * removed from the config is writable again, and saying so is the difference
 * between "you may not" and "nothing maintains this any more".
 */
export function useRoleOwnership(providerId: () => string | undefined | null) {
  const isSyncManaged = useIsSyncManagedRole();
  return computed<RoleOwnership>(() => {
    const id = providerId() ?? '';
    if (id === SYSTEM_ROLE_PROVIDER_ID)
      return {
        kind: 'built-in',
        label: 'Built-in',
        description: 'Reserved by Lakekeeper.',
        syncManaged: false,
      };
    if (!isProviderOwnedRole(id))
      return {
        kind: 'internal',
        label: 'Internal',
        description: 'Created and managed in Lakekeeper. Editable here, membership included.',
        syncManaged: false,
      };
    if (isSyncManaged.value(id))
      return {
        kind: 'external',
        label: 'External',
        description: `Maintained by the ${id} provider. Its name, description and membership are owned by provider sync and cannot be changed here.`,
        syncManaged: true,
      };
    return {
      kind: 'external',
      label: 'External',
      description: `Owned by the ${id} provider, which is no longer configured. Nothing maintains this role any more, so it can be renamed and deleted — but its members still cannot be edited.`,
      syncManaged: false,
    };
  });
}
