import { describe, it, expect, beforeEach, vi } from 'vitest';
import { currentAccessToken } from './authToken';

// Control what the user store reports.
let storeToken = '';
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ user: { access_token: storeToken } }),
}));

const OIDC_KEY = 'oidc.user:http://localhost:30080/realms/iceberg:lakekeeper';
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

describe('currentAccessToken', () => {
  beforeEach(() => {
    storeToken = '';
    sessionStorage.clear();
  });

  it('returns the store token when present', () => {
    storeToken = 'store-jwt';
    expect(currentAccessToken()).toBe('store-jwt');
  });

  it('falls back to the oidc sessionStorage token when the store is cold', () => {
    // This is the bug: on reload the store is empty but oidc has the token.
    sessionStorage.setItem(OIDC_KEY, JSON.stringify({ access_token: 'oidc-jwt', expires_at: future }));
    expect(currentAccessToken()).toBe('oidc-jwt');
  });

  it('ignores an expired oidc token', () => {
    sessionStorage.setItem(OIDC_KEY, JSON.stringify({ access_token: 'old-jwt', expires_at: past }));
    expect(currentAccessToken()).toBe('');
  });

  it('returns "" when there is no token anywhere (so no "Bearer undefined" header)', () => {
    expect(currentAccessToken()).toBe('');
  });

  it('prefers the store token over the oidc fallback', () => {
    storeToken = 'store-jwt';
    sessionStorage.setItem(OIDC_KEY, JSON.stringify({ access_token: 'oidc-jwt', expires_at: future }));
    expect(currentAccessToken()).toBe('store-jwt');
  });
});
