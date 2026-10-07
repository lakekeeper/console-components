// Utilities
import { ref, reactive } from 'vue';
import { User } from '@/common/interfaces';
import { defineStore } from 'pinia';

export const useUserStore = defineStore(
  'user',
  () => {
    const isAuthenticated = ref(false);
    // Whether the authenticated principal is a Lakekeeper instance admin
    // (whoami.is-instance-admin). Drives managed-by controls (lakekeeper#1828).
    const isInstanceAdmin = ref(false);
    // The caller's own principal id (whoami.id). Null until whoAmI answers, and
    // with authentication disabled, where there is no principal.
    const principalId = ref<string | null>(null);

    const user: User = reactive({
      access_token: '',
      id_token: '',
      refresh_token: '',
      token_expires_at: 0,
      email: 'anonymous@unknown.com',
      preferred_username: 'anonymous',
      family_name: 'Ymous',
      given_name: 'Anon',
    });

    function setUser(newUser: User) {
      isAuthenticated.value = true;
      // NB: don't reset isInstanceAdmin here — setUser also fires on every silent
      // token renewal (addUserLoaded), which would drop admin gating mid-session.
      // It's cleared on logout (unsetUser); whoAmI sets it after login.
      user.access_token = newUser.access_token;
      user.id_token = newUser.id_token;
      user.refresh_token = newUser.refresh_token;
      user.token_expires_at = newUser.token_expires_at;
      user.email = newUser.email;
      user.preferred_username = newUser.preferred_username;
      user.family_name = newUser.family_name;
      user.given_name = newUser.given_name;
    }

    function getUser(): User {
      return user;
    }

    function unsetUser() {
      isAuthenticated.value = false;
      isInstanceAdmin.value = false;
      principalId.value = null;
      user.access_token = '';
      user.id_token = '';
      user.refresh_token = '';
      user.token_expires_at = 0;
      user.email = 'anonymous@unknown.com';
      user.preferred_username = 'anonymous';
      user.family_name = 'Ymous';
      user.given_name = 'Anon';
    }

    function renewAT(accessToken: string) {
      user.access_token = accessToken;
    }

    return {
      isAuthenticated,
      isInstanceAdmin,
      principalId,
      user,
      unsetUser,
      setUser,
      getUser,
      renewAT,
    };
  },
  {
    persistedState: {
      key: 'user',
      persist: true,
    },
  },
);
