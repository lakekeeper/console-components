<template>
  <v-app-bar :elevation="2">
    <template #prepend>
      <v-app-bar-nav-icon :icon="navIcon" @click="navBar"></v-app-bar-nav-icon>
    </template>

    <v-app-bar-title>Lakekeeper</v-app-bar-title>
    <v-list-item>
      <ProjectManager />
    </v-list-item>
    <v-spacer></v-spacer>

    <slot name="support-menu">
      <!-- Default OSS support menu (fallback if slot not provided) -->
      <v-menu v-if="showUserMenu" open-on-hover>
        <template #activator="{ props }">
          <v-btn v-bind="props"><v-icon>mdi-help-box</v-icon></v-btn>
        </template>
        <v-list>
          <v-list-item prepend-icon="mdi-file-document-check-outline" @click="goToDocumentation">
            <v-list-item-title>Documentation</v-list-item-title>
          </v-list-item>
          <v-list-item prepend-icon="mdi-alert-circle-outline" @click="openIssue">
            <v-list-item-title>Create an Issue</v-list-item-title>
          </v-list-item>
          <v-list-item prepend-icon="mdi-face-agent" @click="goToSupport">
            <v-list-item-title>Support</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </slot>

    <v-menu v-if="showUserMenu" open-on-hover>
      <template #activator="{ props }">
        <v-btn v-bind="props"><v-icon>mdi-account</v-icon></v-btn>
      </template>
      <v-list>
        <v-list-item prepend-icon="mdi-account">
          <v-list-item-title>
            {{ userStorage.user.given_name }}
            {{ userStorage.user.family_name }}
          </v-list-item-title>
        </v-list-item>

        <v-divider></v-divider>

        <v-list-item prepend-icon="mdi-account-circle-outline" @click="goToUserProfile">
          <v-list-item-title>User Profile</v-list-item-title>
        </v-list-item>

        <v-list-item
          prepend-icon="mdi-key-change"
          @click="getNewToken"
          v-if="config.enabledAuthentication.value">
          <v-list-item-title>Create Token</v-list-item-title>
        </v-list-item>

        <v-divider class="mt-2"></v-divider>

        <v-list-item @click="logout" v-if="config.enabledAuthentication.value">
          <template #prepend>
            <v-icon icon="mdi-logout"></v-icon>
          </template>
          <v-list-item-title>Logout</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-btn
      :icon="visual.themeLight ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny'"
      size="small"
      class="ml-2"
      variant="text"
      @click="toggleTheme"></v-btn>
  </v-app-bar>
</template>

<script setup lang="ts">
import { computed, inject, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useVisualStore } from '../stores/visual';
import { useConfig } from '../composables/usePermissions';
import { useUserStore } from '../stores/user';
import { useFunctions } from '@/plugins/functions';

import { useRouter } from 'vue-router';

const router = useRouter();
const visual = useVisualStore();
const config = useConfig();
const functions = useFunctions();
const auth = inject<any>('auth', null);

const userStorage = useUserStore();

const theme = useTheme();

const themeText = computed(() => {
  return visual.themeLight ? 'light' : 'dark';
});

const navIcon = computed(() => {
  return visual.navBarShow ? 'mdi-menu-open' : 'mdi-menu';
});

// Show user menu when user is authenticated OR when authentication is disabled
const showUserMenu = computed(() => {
  return userStorage.isAuthenticated || !config.enabledAuthentication.value;
});

onMounted(async () => {
  theme.global.name.value = themeText.value;
});

function toggleTheme() {
  visual.toggleThemeLight();
  theme.global.name.value = themeText.value;
}

function navBar() {
  visual.navBarSwitch();
}

function logout() {
  // Navigate to logout page which will handle the full logout flow
  router.push('/logout');
}

function goToUserProfile() {
  router.push('/user-profile');
}

function goToDocumentation() {
  window.open('https://docs.lakekeeper.io/docs/nightly/concepts/', '_blank');
}

function openIssue() {
  window.open('https://github.com/lakekeeper/lakekeeper/issues/new', '_blank');
}

function goToSupport() {
  window.open('https://lakekeeper.io/support', '_blank');
}

async function getNewToken() {
  await functions.getNewToken(auth);
}
</script>
