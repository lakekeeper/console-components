import { describe, it, expect, beforeEach, vi } from 'vitest';
import { currentAccessToken } from './authToken';

// Control what the user store reports.
let storeToken = '';
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ user: { access_token: storeToken } }),
}));

const AUTHORITY = 'http://localhost:30080/realms/iceberg';
const CLIENT_ID = 'lakekeeper';
const OIDC_KEY = `oidc.user:${AUTHORITY}:${CLIENT_ID}`;
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe('currentAccessToken', () => {
  beforeEach(() => {
    storeToken = '';
    sessionStorage.clear();
  });

  it('returns the store token when present', () => {
    storeToken = 'store-jwt';
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('store-jwt');
  });

  it('falls back to the oidc sessionStorage token when the store is cold', () => {
    // This is the bug: on reload the store is empty but oidc has the token.
    sessionStorage.setItem(
      OIDC_KEY,
      JSON.stringify({ access_token: 'oidc-jwt', expires_at: future }),
    );
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('oidc-jwt');
  });

  it('ignores an expired oidc token', () => {
    sessionStorage.setItem(OIDC_KEY, JSON.stringify({ access_token: 'old-jwt', expires_at: past }));
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('');
  });

  it('returns "" when there is no token anywhere (so no "Bearer undefined" header)', () => {
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('');
  });

  it('ignores a token persisted by a different authority/client', () => {
    // A stale session from another client must not be used for this one.
    sessionStorage.setItem(
      'oidc.user:https://other-idp.example.com:other-client',
      JSON.stringify({ access_token: 'other-jwt', expires_at: future }),
    );
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('');
  });

  it('returns "" when the client identity is unknown (cannot disambiguate safely)', () => {
    sessionStorage.setItem(
      OIDC_KEY,
      JSON.stringify({ access_token: 'oidc-jwt', expires_at: future }),
    );
    expect(currentAccessToken()).toBe('');
  });

  it('prefers the store token over the oidc fallback', () => {
    storeToken = 'store-jwt';
    sessionStorage.setItem(
      OIDC_KEY,
      JSON.stringify({ access_token: 'oidc-jwt', expires_at: future }),
    );
    expect(currentAccessToken(AUTHORITY, CLIENT_ID)).toBe('store-jwt');
  });
});
