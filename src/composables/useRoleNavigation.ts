import { useRoute, useRouter } from 'vue-router';

/**
 * Opening a role from somewhere that names one.
 *
 * A role is reachable two ways: its own page at `/roles/:id`, and in-place on the
 * Identities page, which selects it with a `?role=` query param and keeps the
 * Roles tab active. Callers should not have to know which host they are in, so
 * the current route decides: a `role` param means the Identities page is the
 * host and the param is swapped, otherwise navigate to the standalone page.
 */
export function useRoleNavigation() {
  const router = useRouter();
  const route = useRoute();

  function openRole(roleId: string) {
    if (!roleId) return;
    if ('role' in route.query) {
      router.push({ query: { ...route.query, role: roleId } });
      return;
    }
    router.push(`/roles/${roleId}`);
  }

  return { openRole };
}
