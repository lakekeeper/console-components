import { computed, ref } from 'vue';
import { useVisualStore } from '@/stores/visual';

/**
 * Whether this server can expand a role's membership closure.
 *
 * Walking the closure needs the catalog to own the assignments. An authorizer
 * that manages them itself keeps the graph in its own store, and the management
 * API answers `501` instead of guessing — `role_assignments().is_some()` is the
 * backend's own test, and OpenFGA is the only authorizer that implements it.
 *
 * Read from `authz-backend` rather than discovered from a refused request: the
 * answer is a property of the deployment, so the scope can be withheld before it
 * is offered instead of vanishing under the cursor when clicked.
 */
export const ASSIGNMENT_MANAGING_AUTHZ_BACKENDS = ['openfga'];

export function managesRoleAssignments(authzBackend: string | undefined | null): boolean {
  return !!authzBackend && ASSIGNMENT_MANAGING_AUTHZ_BACKENDS.includes(authzBackend.toLowerCase());
}

/**
 * Refusals learned at runtime, for a backend this list does not know about.
 *
 * The backend check covers every authorizer that exists today; this is the
 * backstop for one that ships later. Session-wide, so the first visit to every
 * role and user does not pay for the same refused request again. `null` means
 * "not asked yet" and keeps the scope offered.
 */
export const transitiveMembershipRefused = ref<boolean | null>(null);

/** Record that the server refused; call only for a genuine 501. */
export function markTransitiveMembershipUnsupported() {
  transitiveMembershipRefused.value = true;
}

/** Record a successful closure read. */
export function markTransitiveMembershipSupported() {
  transitiveMembershipRefused.value = false;
}

/**
 * Three answers, and the surfaces treat them differently: `false` withholds the
 * scope entirely (known before it is offered), `null` after a refusal disables it
 * with a reason (it was already on screen), `true` offers it.
 */
export function useTransitiveMembershipSupported() {
  const visual = useVisualStore();
  return computed<boolean | null>(() => {
    const backend = visual.getServerInfo()?.['authz-backend'];
    // Absent means serverInfo has not loaded, not "unsupported".
    if (backend && managesRoleAssignments(backend)) return false;
    if (transitiveMembershipRefused.value === true) return null;
    return true;
  });
}

/**
 * Said beside the disabled option rather than instead of it, for the runtime
 * case: a control that disappears when clicked teaches nothing.
 */
export const TRANSITIVE_UNSUPPORTED =
  'Nested membership needs catalog-managed assignments; this server’s authorizer manages them itself.';
