/**
 * Build-time switches for UI that is on its way in or out.
 *
 * These are plain constants rather than runtime config: the point is a single
 * line to flip when the decision is made, not something an operator tunes.
 */

/**
 * Whether the permission-assignment UI (the "Permissions" tabs and the
 * permission explorer) is offered at all.
 *
 * Grants cover the same intent through the authorizer-agnostic grants API, so
 * the permissions views now only restate what the Grants tab already shows.
 * They are hidden ahead of removal — everything behind this flag still builds
 * and still works, so flipping it back restores the tabs unchanged.
 *
 * When the removal lands, delete this flag along with the components it gates:
 * `PermissionManager`, `PermissionExplorer`, `PermissionAssignDialog`, and the
 * `useAuthorizerPermissions` / `useCatalogPermissions` tab helpers.
 */
export const PERMISSIONS_UI_ENABLED = false;
