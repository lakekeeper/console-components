import { inject } from 'vue';
import type { InjectionKey } from 'vue';

export interface AuthInstance {
  userManager: any;
  oidcSettings: any;
  access_token: any;
  isAuthenticated: any;
  refreshToken: () => Promise<any>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  initUser: () => Promise<void>;
}

// Define the injection key for type safety
export const AuthInjectionKey: InjectionKey<AuthInstance> = Symbol('auth');

/**
 * Composable to inject the auth instance provided by the auth plugin.
 * Must be called within component setup context.
 *
 * @returns The auth instance or null if not configured
 * @example
 * const auth = useAuth()
 * if (auth) {
 *   await auth.initUser()
 * }
 */
export function useAuth(): AuthInstance | null {
  return inject<AuthInstance | null>('auth', null);
}
