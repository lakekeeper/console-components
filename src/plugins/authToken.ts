import { useUserStore } from '@/stores/user';

/**
 * Resolve the current access token for outgoing API requests.
 *
 * The Pinia user store mirrors the OIDC token, but on a full page reload the
 * store can be momentarily empty while oidc-client-ts rehydrates. A request
 * firing in that window would otherwise go out with no token (→ 401) or, worse,
 * `Bearer undefined` (→ 400), bouncing the user to login. So when the store is
 * cold we fall back to oidc-client-ts's own persisted user in sessionStorage,
 * read from the exact key for the active client
 * (`oidc.user:<authority>:<client_id>`) so a stale session from a different
 * authority/client can never win. Expired tokens are ignored.
 *
 * Returns '' when there is genuinely no valid token — callers must NOT attach an
 * Authorization header in that case.
 */
export function currentAccessToken(authority?: string, clientId?: string): string {
  const fromStore = useUserStore().user.access_token;
  if (fromStore) return fromStore;
  // Without the active client's identity we cannot safely disambiguate among
  // persisted sessions, so don't guess.
  if (!authority || !clientId) return '';
  try {
    const raw = sessionStorage.getItem(`oidc.user:${authority}:${clientId}`);
    if (!raw) return '';
    const u = JSON.parse(raw);
    const notExpired = !u?.expires_at || u.expires_at * 1000 > Date.now();
    if (u?.access_token && notExpired) return u.access_token;
  } catch {
    /* sessionStorage unavailable or unparseable — fall through */
  }
  return '';
}

/**
 * Drop the persisted OIDC session for the active client.
 *
 * `unsetUser()` clears the Pinia copy, but `currentAccessToken` deliberately
 * falls back to oidc-client-ts's own session in `sessionStorage` so a request
 * fired during rehydration is not sent unauthenticated. That fallback also
 * means a token the *server* has rejected keeps being re-attached: it is
 * unexpired by the clock, so nothing local considers it stale. Only the server
 * can say otherwise, and when it does the session has to go too — otherwise the
 * next request carries the same dead token and login loops.
 */
export function clearPersistedAuthSession(authority?: string, clientId?: string): void {
  try {
    if (authority && clientId) {
      sessionStorage.removeItem(`oidc.user:${authority}:${clientId}`);
      return;
    }
    // Without the client's identity, clear whatever oidc-client-ts wrote rather
    // than leaving behind a session we cannot name.
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('oidc.user:')) sessionStorage.removeItem(key);
    }
  } catch {
    /* sessionStorage unavailable — nothing to clear */
  }
}
