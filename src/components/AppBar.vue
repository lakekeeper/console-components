<template>
  <v-app-bar :elevation="elevation" :color="color" :density="density" class="app-bar">
    <template #prepend>
      <v-app-bar-nav-icon :icon="navIcon" @click="handleNavToggle" :disabled="navDisabled" />
    </template>

    <v-app-bar-title class="app-bar__title">
      {{ title }}
    </v-app-bar-title>

    <slot name="center" />

    <v-spacer />

    <!-- Actions slot for custom actions -->
    <slot name="actions" />

    <!-- Help menu -->
    <v-menu v-if="showHelp" :open-on-hover="openMenuOnHover" :close-on-content-click="true">
      <template #activator="{ props: menuProps }">
        <v-btn
          v-bind="menuProps"
          icon="mdi-help-box"
          variant="text"
          :size="buttonSize"
          aria-label="Help menu" />
      </template>
      <v-list density="compact">
        <v-list-item
          v-for="helpItem in helpItems"
          :key="helpItem.action"
          :prepend-icon="helpItem.icon"
          @click="handleHelpAction(helpItem.action)">
          <v-list-item-title>{{ helpItem.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- User menu -->
    <v-menu v-if="user" :open-on-hover="openMenuOnHover" :close-on-content-click="true">
      <template #activator="{ props: menuProps }">
        <v-btn v-bind="menuProps" :size="buttonSize" variant="text" aria-label="User menu">
          <v-avatar v-if="user.avatar_url" :image="user.avatar_url" size="small" />
          <v-icon v-else>mdi-account</v-icon>
        </v-btn>
      </template>
      <v-list density="compact">
        <!-- User info -->
        <v-list-item class="user-info">
          <template #prepend>
            <v-avatar v-if="user.avatar_url" :image="user.avatar_url" size="small" />
            <v-icon v-else>mdi-account</v-icon>
          </template>
          <v-list-item-title class="d-flex align-center">
            {{ userDisplayName }}
            <v-btn
              :icon="themeToggleIcon"
              size="x-small"
              variant="text"
              @click="handleThemeToggle"
              class="ml-2"
              :aria-label="themeToggleLabel" />
          </v-list-item-title>
          <v-list-item-subtitle v-if="user.email">
            {{ user.email }}
          </v-list-item-subtitle>
        </v-list-item>

        <v-divider />

        <!-- User actions -->
        <v-list-item
          v-for="userItem in userMenuItems"
          :key="userItem.action"
          :prepend-icon="userItem.icon"
          @click="handleUserAction(userItem.action)"
          :disabled="userItem.disabled">
          <v-list-item-title>{{ userItem.title }}</v-list-item-title>
        </v-list-item>

        <v-divider class="mt-2" />

        <!-- Logout -->
        <v-list-item @click="handleLogout" class="logout-item">
          <template #prepend>
            <v-icon color="error">mdi-logout</v-icon>
          </template>
          <v-list-item-title class="text-error">Logout</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </v-app-bar>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface User {
  given_name: string;
  family_name: string;
  email?: string;
  avatar_url?: string;
  access_token?: string;
}

export interface MenuItem {
  title: string;
  icon: string;
  action: string;
  disabled?: boolean;
}

export type HelpAction = 'goToDocumentation' | 'openIssue' | 'goToSupport';
export type UserAction = 'goToUserProfile' | 'getNewToken';

interface Props {
  title?: string;
  navBarShow?: boolean;
  navDisabled?: boolean;
  themeLight?: boolean;
  user?: User | null;
  showHelp?: boolean;
  showCreateToken?: boolean;
  elevation?: number | string;
  color?: string;
  density?: 'default' | 'comfortable' | 'compact';
  buttonSize?: 'x-small' | 'small' | 'default' | 'large' | 'x-large';
  openMenuOnHover?: boolean;
  customHelpItems?: MenuItem[];
  customUserItems?: MenuItem[];
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Lakekeeper',
  navBarShow: false,
  navDisabled: false,
  themeLight: true,
  user: null,
  showHelp: true,
  showCreateToken: true,
  elevation: 2,
  color: undefined,
  density: 'default',
  buttonSize: 'default',
  openMenuOnHover: true,
  customHelpItems: () => [],
  customUserItems: () => [],
});

const emit = defineEmits<{
  toggleNav: [];
  toggleTheme: [];
  logout: [];
  goToUserProfile: [];
  goToDocumentation: [];
  openIssue: [];
  goToSupport: [];
  getNewToken: [];
  helpAction: [action: HelpAction];
  userAction: [action: UserAction];
}>();

// Computed properties
const navIcon = computed(() => {
  return props.navBarShow ? 'mdi-menu-open' : 'mdi-menu';
});

const userDisplayName = computed(() => {
  if (!props.user) return '';
  return `${props.user.given_name} ${props.user.family_name}`.trim();
});

const themeToggleIcon = computed(() => {
  return props.themeLight ? 'mdi-lightbulb-off' : 'mdi-lightbulb-on';
});

const themeToggleLabel = computed(() => {
  return props.themeLight ? 'Switch to dark theme' : 'Switch to light theme';
});

const helpItems = computed(() => {
  const defaultItems: MenuItem[] = [
    {
      title: 'Documentation',
      icon: 'mdi-file-document-check-outline',
      action: 'goToDocumentation',
    },
    {
      title: 'Create an Issue',
      icon: 'mdi-alert-circle-outline',
      action: 'openIssue',
    },
    {
      title: 'Support',
      icon: 'mdi-face-agent',
      action: 'goToSupport',
    },
  ];

  return props.customHelpItems.length > 0 ? props.customHelpItems : defaultItems;
});

const userMenuItems = computed(() => {
  const defaultItems: MenuItem[] = [
    {
      title: 'User Profile',
      icon: 'mdi-account-circle-outline',
      action: 'goToUserProfile',
    },
  ];

  if (props.showCreateToken) {
    defaultItems.push({
      title: 'Create Token',
      icon: 'mdi-key-change',
      action: 'getNewToken',
    });
  }

  return props.customUserItems.length > 0
    ? [...defaultItems, ...props.customUserItems]
    : defaultItems;
});

// Event handlers
const handleNavToggle = () => {
  emit('toggleNav');
};

const handleThemeToggle = () => {
  emit('toggleTheme');
};

const handleLogout = () => {
  emit('logout');
};

const handleHelpAction = (action: string) => {
  const helpAction = action as HelpAction;

  // Emit both specific and generic events
  switch (helpAction) {
    case 'goToDocumentation':
      emit('goToDocumentation');
      break;
    case 'openIssue':
      emit('openIssue');
      break;
    case 'goToSupport':
      emit('goToSupport');
      break;
  }

  emit('helpAction', helpAction);
};

const handleUserAction = (action: string) => {
  const userAction = action as UserAction;

  // Emit both specific and generic events
  switch (userAction) {
    case 'goToUserProfile':
      emit('goToUserProfile');
      break;
    case 'getNewToken':
      emit('getNewToken');
      break;
  }

  emit('userAction', userAction);
};
</script>

<style scoped>
.app-bar {
  backdrop-filter: blur(8px);
}

.app-bar__title {
  font-weight: 600;
}

.user-info {
  pointer-events: auto;
}

.logout-item {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-top: 4px;
}
</style>
