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
      // Debug: Log token updates (hide most of the token for security)
      const newRefreshToken = mappedUser.refresh_token;

      // ...removed console.log

      useUserStore().setUser(mappedUser);
      accessToken.value = mappedUser.access_token;
      isAuthenticated.value = true;

      // CRITICAL: Verify UserManager's storage has the same refresh token
      // If different, it means the event parameter has stale data
      try {
        const freshUser = await userManager.getUser();
        if (freshUser && freshUser.refresh_token && freshUser.refresh_token !== newRefreshToken) {
          console.warn('[userLoaded] Refresh token mismatch! Event has stale token.');
          // ...removed console.log
          const correctedUser = mapOidcUserToUser(freshUser);
          if (correctedUser) {
            useUserStore().setUser(correctedUser);
          }
        } else if (freshUser) {
          // ...removed console.log
        }
      } catch (e) {
        console.error('[userLoaded] Failed to verify token from storage:', e);
      }
    }

    // Only throttle console logging to prevent spam
    if (now - lastUserLoadedTime >= THROTTLE_MS) {
      // ...removed console.log
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

    // ...removed console.log

    // Debug: Check what refresh token OIDC library has before renewal
    try {
      const currentUser = await userManager.getUser();
      if (currentUser) {
        // ...removed console.log
      }
    } catch (e) {
      console.error('[BEFORE RENEWAL] Failed to get current user:', e);
    }
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
    // ...removed console.log
    accessToken.value = '';
    isAuthenticated.value = false;
    useUserStore().unsetUser();

    // Explicitly remove OIDC user from sessionStorage
    await userManager.removeUser();
  });

  // Helper functions
  const initUser = async () => {
    try {
      // ...removed console.log
      const user = await userManager.getUser();
      // ...removed console.log

      if (user && !user.expired) {
        // ...removed console.log
        const mappedUser = mapOidcUserToUser(user);
        if (mappedUser) {
          useUserStore().setUser(mappedUser);
          accessToken.value = mappedUser.access_token;
          isAuthenticated.value = true;
        }
      } else {
        // ...removed console.log
        await signIn();
      }
    } catch (error) {
      console.error('Failed to initialize OIDC user', error);
    }
  };

  const signIn = async () => {
    try {
      // ...removed console.log
      // ...removed console.log
      await userManager.signinRedirect();
      // ...removed console.log
    } catch (error) {
      console.error('OIDC sign-in failed', error);
    }
  };

  const signOut = async () => {
    try {
      await userManager.signoutRedirect();
      accessToken.value = '';
      isAuthenticated.value = false;
    } catch (error) {
      console.error('OIDC sign-out failed', error);
    }
  };

  async function refreshToken(): Promise<User | undefined> {
    // If refresh is already in progress, return the existing promise
    if (refreshPromise) {
      // ...removed console.log
      return refreshPromise;
    }

    // Create new refresh promise
    refreshPromise = (async () => {
      try {
        // ...removed console.log
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
            // ...removed console.log
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
