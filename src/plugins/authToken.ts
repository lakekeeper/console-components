import { useUserStore } from '@/stores/user';

/**
 * Resolve the current access token for outgoing API requests.
 *
 * The Pinia user store mirrors the OIDC token, but on a full page reload the
 * store can be momentarily empty while oidc-client-ts rehydrates. A request
 * firing in that window would otherwise go out with no token (→ 401) or, worse,
 * `Bearer undefined` (→ 400), bouncing the user to login. So when the store is
 * cold we fall back to oidc-client-ts's own persisted user in sessionStorage
 * (it stores under `oidc.user:<authority>:<client_id>`), ignoring expired tokens.
 *
 * Returns '' when there is genuinely no valid token — callers must NOT attach an
 * Authorization header in that case.
 */
export function currentAccessToken(): string {
  const fromStore = useUserStore().user.access_token;
  if (fromStore) return fromStore;
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith('oidc.user:')) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const u = JSON.parse(raw);
      const notExpired = !u?.expires_at || u.expires_at * 1000 > Date.now();
      if (u?.access_token && notExpired) return u.access_token;
    }
  } catch {
    /* sessionStorage unavailable or unparseable — fall through */
  }
  return '';
}
