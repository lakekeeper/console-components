import { computed } from 'vue';
import { useVisualStore } from '../stores/visual';

/**
 * What the configured authorizer lets the console do, beyond per-object
 * permissions.
 *
 * Some capabilities are not a matter of the caller's rights but of the
 * authorizer's design: it may own a concept entirely, leaving the catalog no
 * say. Offering a control the backend will always refuse is worse than not
 * offering it, so these are read from `authz-backend` rather than discovered
 * from a failed request.
 */

/**
 * Authorizers that own roles themselves, so roles cannot be created or deleted
 * through the catalog.
 *
 * Cedar manages them through its own policies, entities and group providers and
 * rejects both operations outright (`CreateRolesNotSupported` /
 * `DeleteRolesNotSupported`). A list rather than a single name so another such
 * backend can be added in one place.
 */
export const EXTERNAL_ROLE_AUTHZ_BACKENDS = ['cedar', 'allow-all'];

export function isExternalRoleBackend(authzBackend: string | undefined | null): boolean {
  return !!authzBackend && EXTERNAL_ROLE_AUTHZ_BACKENDS.includes(authzBackend.toLowerCase());
}

/**
 * Whether roles can be created and deleted here.
 *
 * Renaming and re-describing stay available: the authorizer refuses only the
 * two lifecycle operations, not edits to a role the catalog already knows.
 * Unknown while `serverInfo` is still loading reads as "allowed", so a control
 * does not flicker out from under someone mid-click.
 */
export function useRoleLifecycleSupported() {
  const visual = useVisualStore();
  return computed(() => {
    const backend = visual.getServerInfo()?.['authz-backend'];
    // Absent means not loaded yet, not "external".
    if (!backend) return true;
    return !isExternalRoleBackend(backend);
  });
}
