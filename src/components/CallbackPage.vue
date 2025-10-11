<template><div></div></template>

<script lang="ts" setup>
import { inject, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { UserManager } from 'oidc-client-ts';
import { useUserStore } from '../stores/user';
import { User } from '../common/interfaces';
import { TokenType } from '../common/enums';
import { useVisualStore } from '../stores/visual';

const router = useRouter();
const visual = useVisualStore();
const userStorage = useUserStore();
const auth = inject<any>('auth', null);
const functions = inject<any>('functions');
const config = inject<any>('appConfig');

async function init() {
  if (!auth) {
    console.error('Auth not configured');
    router.push('/');
    return;
  }

  try {
    const userManager = new UserManager(auth.oidcSettings);
    const user = await userManager.signinRedirectCallback();

    const firstName =
      user.profile.family_name || user.profile.name?.split(' ').splice(1).join(' ') || '';
    const givenName = user.profile.given_name || user.profile.name?.split(' ')[0] || '';

    const newUser: User = {
      access_token:
        config.idpTokenType == TokenType.ID_TOKEN ? user.id_token || '' : user.access_token,
      id_token: user.id_token || '',
      refresh_token: user.refresh_token || '',
      token_expires_at: user.profile.exp,
      email: user.profile.email || '',
      preferred_username: user.profile.preferred_username || '',
      family_name: firstName,
      given_name: givenName,
    };

    userStorage.setUser(newUser);

    if (functions?.createUser) {
      await functions.createUser();
    }

    if (functions?.getServerInfo) {
      const data = await functions.getServerInfo();

      if (!data.bootstrapped) {
        router.push('/bootstrap');
        return;
      }
    }

    visual.showAppOrNavBar = true;
    router.push('/');
  } catch (error) {
    console.error('Error during callback processing:', error);
    router.push('/');
  }
}

onMounted(async () => {
  visual.showAppOrNavBar = false;

  await init();
});

onUnmounted(() => {
  visual.showAppOrNavBar = true;
});
</script>
