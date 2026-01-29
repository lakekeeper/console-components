import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface NavigationState {
  path: string;
  params: Record<string, any>;
  query: Record<string, any>;
  timestamp: number;
}

export const useNavigationStore = defineStore(
  'navigation',
  () => {
    const savedState = ref<NavigationState | null>(null);
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    /**
     * Update the current location - called by router on every navigation
     * Only saves if the location is worth restoring (not auth pages, not home)
     */
    function updateCurrentLocation(state: Omit<NavigationState, 'timestamp'>) {
      if (!shouldSaveLocation(state.path)) {
        return;
      }

      savedState.value = {
        ...state,
        timestamp: Date.now(),
      };
    }

    /**
     * Get saved navigation state if it exists and is not expired
     */
    function getNavigationState(): NavigationState | null {
      if (!savedState.value) {
        return null;
      }

      if (isExpired()) {
        clearNavigationState();
        return null;
      }

      return savedState.value;
    }

    /**
     * Check if saved state is expired (older than 7 days)
     */
    function isExpired(): boolean {
      if (!savedState.value) {
        return true;
      }

      const age = Date.now() - savedState.value.timestamp;
      return age > MAX_AGE_MS;
    }

    /**
     * Clear saved navigation state
     */
    function clearNavigationState() {
      savedState.value = null;
    }

    /**
     * Check if path is an auth-related page that shouldn't be saved
     */
    function isAuthPage(path: string): boolean {
      const authPages = ['/login', '/logout', '/callback', '/bootstrap'];
      return authPages.some((authPath) => path.includes(authPath));
    }

    /**
     * Check if we should save the current location
     * Returns false for auth pages, home page, and root
     */
    function shouldSaveLocation(path: string): boolean {
      return !isAuthPage(path) && path !== '/' && path !== '/ui' && path !== '/ui/';
    }

    return {
      savedState,
      updateCurrentLocation,
      getNavigationState,
      isExpired,
      clearNavigationState,
      isAuthPage,
      shouldSaveLocation,
    };
  },
  {
    persistedState: {
      key: 'navigation',
      persist: true,
    },
  },
);
