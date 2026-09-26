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
 * Empty by decision, not because no backend owns roles.
 *
 * Cedar does. Measured against a 0.13.1 server: the project reports
 * `create_role` among its allowed actions, and the create is refused anyway.
 *
 *   POST /management/v1/role  ->  503
 *   CreateRolesNotSupported (400): Creating Roles is not supported for the
 *   Cedar Authorizer. Roles are managed through Cedar policies, Cedar entities
 *   and group providers.
 *
 * Supplying `provider-id` and `source-id` does not change it. So on Cedar the
 * controls are offered and the server refuses them, and the reader sees that
 * message rather than an absent button — which is the trade this file was
 * originally written to avoid. It is deliberate: the button is expected to
 * start working when the backend lands role creation, and hiding it until then
 * was costing more than the refusal does.
 *
 * Whoever revisits this: the check above is the switch. Put `'cedar'` back and
 * the controls disappear again.
 *
 * `allow-all` does NOT belong here: it permits every operation, roles live in
 * the catalog's own store, and the backend covers role creation and membership
 * under that authorizer in its integration tests. Listing it disabled role
 * management on the one backend that refuses nothing.
 */
export const EXTERNAL_ROLE_AUTHZ_BACKENDS: string[] = [];

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
