import { App, ref } from 'vue';
import {
  UserManager,
  UserManagerSettings,
  WebStorageStateStore,
  User as OidcUser,
} from 'oidc-client-ts';
import { useUserStore } from '@/stores/user';
import { User } from '@/common/interfaces';
import { TokenType } from '@/common/enums';

// Auth configuration interface
export interface AuthConfig {
  idpAuthority: string;
  idpClientId: string;
  idpRedirectPath: string;
  idpScope: string;
  idpResource: string;
  idpLogoutRedirectPath: string;
  idpTokenType: TokenType;
  baseUrlPrefix: string;
  enabledAuthentication: boolean;
}

// Factory function to create auth with config
export function createAuth(config: AuthConfig) {
  // OIDC Configuration
  const oidcSettings: UserManagerSettings = {
    authority: config.idpAuthority,
    client_id: config.idpClientId,
    redirect_uri: `${window.location.origin}${config.baseUrlPrefix}/ui${config.idpRedirectPath}`,
    response_type: 'code',
    scope: config.idpScope,
    resource: config.idpResource !== '' ? config.idpResource : undefined,
    post_logout_redirect_uri: `${window.location.origin}${config.baseUrlPrefix}/ui${config.idpLogoutRedirectPath}`,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // Enable automatic silent renew - OIDC library handles this efficiently
    automaticSilentRenew: true,
    // Check token 60 seconds before expiry (reduced from 300 to avoid constant firing)
    accessTokenExpiringNotificationTimeInSeconds: 60,
    // Timeout for silent renew iframe - 55 seconds
    silentRequestTimeoutInSeconds: 55,
  };

  // Initialize UserManager
  const userManager = new UserManager(oidcSettings);

  // Define reactive state
  const accessToken = ref('');
  const isAuthenticated = ref(false);

  // Track ongoing refresh to prevent race conditions
  let refreshPromise: Promise<User | undefined> | null = null;

  // Throttle variables to prevent event spam
  let lastUserLoadedTime = 0;
  let lastExpiringNotification = 0;
  const THROTTLE_MS = 10000; // 10 seconds between notifications

  // Helper to convert OIDC user to our User type
  const mapOidcUserToUser = (user: OidcUser | null): User | undefined => {
    if (!user) return undefined;

    const firstName =
      user.profile.family_name || user.profile.name?.split(' ').splice(1).join(' ') || '';
    const givenName = user.profile.given_name || user.profile.name?.split(' ')[0] || '';

    return {
      access_token:
        config.idpTokenType === TokenType.ID_TOKEN ? user.id_token || '' : user.access_token,
      id_token: user.id_token || '',
      refresh_token: user.refresh_token || '',
      token_expires_at: user.profile.exp || 0,
      email: user.profile.email || '',
      preferred_username: user.profile.preferred_username || '',
      family_name: firstName,
      given_name: givenName,
    };
  };

  // Set up OIDC event handlers
  userManager.events.addUserLoaded(async (user) => {
    const now = Date.now();

    // Always update the store with new token data
    const mappedUser = mapOidcUserToUser(user);
    if (mappedUser) {
      useUserStore().setUser(mappedUser);
      accessToken.value = mappedUser.access_token;
      isAuthenticated.value = true;

      // CRITICAL: Verify UserManager's storage has the same refresh token
      // If different, it means the event parameter has stale data
      try {
        const freshUser = await userManager.getUser();
        if (
          freshUser &&
          freshUser.refresh_token &&
          freshUser.refresh_token !== mappedUser.refresh_token
        ) {
          console.warn('[userLoaded] Refresh token mismatch! Event has stale token.');

          const correctedUser = mapOidcUserToUser(freshUser);
          if (correctedUser) {
            useUserStore().setUser(correctedUser);
          }
        }
      } catch (e) {
        console.error('[userLoaded] Failed to verify token from storage:', e);
      }
    }

    // Only throttle console logging to prevent spam
    if (now - lastUserLoadedTime >= THROTTLE_MS) {
      lastUserLoadedTime = now;
    }
  });

  // Event fired when token is about to expire - automatic renewal handles it
  userManager.events.addAccessTokenExpiring(async () => {
    const now = Date.now();
    // Throttle expiring notifications to prevent spam
    if (now - lastExpiringNotification < THROTTLE_MS) {
      return;
    }
    lastExpiringNotification = now;
  });

  // Event fired when token has expired
  userManager.events.addAccessTokenExpired(() => {
    console.warn('Access token expired');
    accessToken.value = '';
    isAuthenticated.value = false;
  });

  userManager.events.addSilentRenewError(async (error) => {
    console.error('Silent renew error - logging out user:', error);
    // Clear auth state
    accessToken.value = '';
    isAuthenticated.value = false;
    refreshPromise = null;

    // Clear user from store
    const userStore = useUserStore();
    userStore.unsetUser();

    // Explicitly remove OIDC user from sessionStorage to prevent stale state
    await userManager.removeUser();

    // Note: The app should handle redirecting to login via router navigation guard
    // when it detects isAuthenticated is false
  });

  userManager.events.addUserSignedOut(async () => {
    accessToken.value = '';
    isAuthenticated.value = false;
    useUserStore().unsetUser();

    // Explicitly remove OIDC user from sessionStorage
    await userManager.removeUser();
  });

  // Helper functions
  const initUser = async () => {
    try {
      const user = await userManager.getUser();

      if (user && !user.expired) {
        const mappedUser = mapOidcUserToUser(user);
        if (mappedUser) {
          useUserStore().setUser(mappedUser);
          accessToken.value = mappedUser.access_token;
          isAuthenticated.value = true;
        }
      } else {
        await signIn();
      }
    } catch (error) {
      console.error('Failed to initialize OIDC user', error);
    }
  };

  const signIn = async () => {
    try {
      await userManager.signinRedirect();
    } catch (error) {
      console.error('OIDC sign-in failed', error);
    }
  };

  const signOut = async () => {
    try {
      // AWS Cognito logout endpoint expects `client_id` and `logout_uri` instead of
      // the standard OIDC `post_logout_redirect_uri` and `id_token_hint`.
      // See: https://github.com/authts/oidc-client-ts/issues/1385
      const isCognito = config.idpAuthority.includes('cognito');
      const signoutArgs = isCognito
        ? {
            extraQueryParams: {
              client_id: config.idpClientId,
              logout_uri: oidcSettings.post_logout_redirect_uri || window.location.origin,
            },
          }
        : undefined;

      await userManager.signoutRedirect(signoutArgs);
      accessToken.value = '';
      isAuthenticated.value = false;
    } catch (error) {
      console.error('OIDC sign-out failed', error);
    }
  };

  async function refreshToken(): Promise<User | undefined> {
    // If refresh is already in progress, return the existing promise
    if (refreshPromise) {
      return refreshPromise;
    }

    // Create new refresh promise
    refreshPromise = (async () => {
      try {
        const user = await userManager.signinSilent();
        const newUser = mapOidcUserToUser(user);

        if (newUser) {
          useUserStore().setUser(newUser);
          accessToken.value = newUser.access_token;
          isAuthenticated.value = true;
        }

        return newUser;
      } catch (error: any) {
        console.error('Token refresh failed:', error);

        // If silent refresh fails, try to get the current user
        try {
          const currentUser = await userManager.getUser();
          if (currentUser && !currentUser.expired) {
            return mapOidcUserToUser(currentUser);
          }
        } catch (getUserError) {
          console.error('Failed to get current user:', getUserError);
        }

        // If all else fails, redirect to login
        // ...existing code...
        await userManager.signinRedirect();
        return undefined;
      } finally {
        // Clear the promise after completion
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  // Note: checkTokenExpiry, startTokenCheck, and stopTokenCheck removed
  // We rely on automaticSilentRenew from OIDC library instead of manual polling

  // Return composable
  function useAuth() {
    return {
      oidcSettings,
      userManager,
      access_token: accessToken,
      isAuthenticated,
      refreshToken,
      signIn,
      signOut,
      initUser,
    };
  }

  // Return plugin
  return {
    install: (app: App) => {
      if (config.enabledAuthentication) {
        const auth = useAuth();
        app.provide('auth', auth);
        app.config.globalProperties.$auth = auth;

        // Note: Token renewal is handled automatically by OIDC library
        // with automaticSilentRenew: true configuration
      }
    },
    useAuth, // Export useAuth for direct usage
  };
}

// Export composable for injection
