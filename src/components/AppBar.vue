<template>
  <v-app-bar :elevation="2" density="compact">
    <template #prepend>
      <v-app-bar-nav-icon :icon="navIcon" @click="navBar"></v-app-bar-nav-icon>
    </template>
    <slot name="logo">
      <v-app-bar-title>
        <img
          :src="logoSrc"
          alt="Lakekeeper"
          style="height: 26px; width: auto; vertical-align: middle" />
      </v-app-bar-title>
    </slot>
    <!-- The bar says which project you are in and switches between them; it
         does not manage them. Switching is the frequent gesture and stays one
         click, while creating, renaming and granting live on /projects, where
         there is room to show what they act on. -->
    <!-- Same gate as the user menu: with authentication disabled there is no
         principal, but there is still a project, and the bar still names it. -->
    <v-menu v-if="showUserMenu && !projectsRefused" @update:model-value="onProjectMenu">
      <template #activator="{ props: menuProps }">
        <v-btn
          v-bind="menuProps"
          variant="text"
          size="small"
          class="text-none ml-2"
          rounded="lg"
          prepend-icon="mdi-home-silo"
          append-icon="mdi-menu-down">
          {{ visual.projectSelected['project-name'] || 'No project' }}
          <v-tooltip activator="parent" location="bottom">Switch project</v-tooltip>
        </v-btn>
      </template>
      <v-list density="compact" max-height="420" min-width="260">
        <v-list-subheader>Projects</v-list-subheader>
        <v-list-item v-if="projectsLoading">
          <template #prepend>
            <v-progress-circular indeterminate size="16" width="2" class="mr-3" />
          </template>
          <v-list-item-title class="text-caption">loading…</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-for="p in projects"
          :key="p['project-id']"
          :active="p['project-id'] === visual.projectSelected['project-id']"
          @click="switchProject(p)">
          <template #prepend>
            <v-icon
              size="small"
              class="mr-2"
              :icon="
                p['project-id'] === visual.projectSelected['project-id']
                  ? 'mdi-check-circle'
                  : 'mdi-home-silo'
              "></v-icon>
          </template>
          <v-list-item-title>{{ p['project-name'] }}</v-list-item-title>
        </v-list-item>
        <!-- Only "none", never "not permitted": the menu itself is gated on
             `!projectsRefused`, so a refusal never reaches this line — it is
             the chip below that answers for that case. -->
        <v-list-item v-if="!projectsLoading && !projects.length">
          <v-list-item-title class="text-caption text-medium-emphasis">
            No projects available
          </v-list-item-title>
        </v-list-item>

        <v-divider class="my-1"></v-divider>
        <v-list-item prepend-icon="mdi-cog-outline" @click="goToProjects">
          <v-list-item-title>Manage projects</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Refused the listing, there is nothing to switch to and no menu to open:
         the bar names the project and stops there. A control that opens onto a
         single line of apology is worse than no control — it offers a choice
         that does not exist, and it offers it on every page. -->
    <v-chip
      v-else-if="showUserMenu"
      size="small"
      label
      variant="tonal"
      class="ml-2"
      prepend-icon="mdi-home-silo">
      {{ visual.projectSelected['project-name'] || 'No project' }}
    </v-chip>
    <v-spacer></v-spacer>

    <!-- GitHub link — opt-in per app (`show-github`), so an enterprise or
         white-labelled AppBar carries no link to the OSS repo. The star count
         additionally needs a count to have been fetched, which an air-gapped or
         offline deployment will not have. -->
    <v-btn
      v-if="showGithub"
      href="https://github.com/lakekeeper/lakekeeper"
      target="_blank"
      rel="noopener noreferrer"
      variant="text"
      size="small"
      class="text-none mr-1"
      rounded="lg">
      <v-icon :start="showStars" size="small">mdi-github</v-icon>
      <template v-if="showStars">
        <v-icon size="small" class="mr-1" color="amber">mdi-star</v-icon>
        {{ formatStarCount(starCount) }}
      </template>
    </v-btn>

    <slot name="support-menu">
      <!-- Default OSS support menu (fallback if slot not provided) -->
      <v-menu v-if="showUserMenu" open-on-hover>
        <template #activator="{ props }">
          <v-btn icon="mdi-help-circle-outline" variant="text" v-bind="props"></v-btn>
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
          <v-list-item prepend-icon="mdi-email-outline" @click="contactOpen = true">
            <v-list-item-title>Contact Vakamo</v-list-item-title>
          </v-list-item>
          <v-divider class="my-1"></v-divider>
          <v-list-item prepend-icon="mdi-export-variant" @click="supportBundleOpen = true">
            <v-list-item-title>Export for GitHub</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </slot>

    <SupportBundleDialog v-model="supportBundleOpen" />

    <v-menu v-if="showUserMenu" open-on-hover>
      <template #activator="{ props }">
        <v-btn icon="mdi-account" variant="text" v-bind="props"></v-btn>
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

    <!-- Notification Button -->
    <NotificationButton />

    <v-btn
      :icon="visual.themeLight ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny'"
      size="small"
      class="ml-2"
      variant="text"
      @click="toggleTheme"></v-btn>

    <!-- Feedback button (OSS only) -->
    <v-tooltip v-if="!isEnterpriseEdition" location="bottom" text="Share feedback">
      <template #activator="{ props: tipProps }">
        <v-btn
          v-bind="tipProps"
          icon="mdi-message-text"
          size="small"
          class="ml-2"
          variant="text"
          @click="feedbackOpen = true"></v-btn>
      </template>
    </v-tooltip>

    <!-- Notification Panel -->
    <NotificationPanel />

    <!-- Token Dialog -->
    <TokenDialog ref="tokenDialog" />

    <!-- Feedback Dialog (OSS only) -->
    <FeedbackDialog v-if="!isEnterpriseEdition" v-model="feedbackOpen" />

    <!-- Contact Dialog (OSS only — enterprise deployments have direct support) -->
    <ContactVakamoDialog v-if="!isEnterpriseEdition" v-model="contactOpen" />
  </v-app-bar>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useTheme } from 'vuetify';
import { useVisualStore } from '../stores/visual';
import { Project } from '../common/interfaces';
import { isForbiddenError } from '../common/errorUtils';
import { useConfig } from '../composables/useCatalogPermissions';
import { useUserStore } from '../stores/user';
import { useFunctions } from '@/plugins/functions';
import { useConnectivity } from '@/composables/useConnectivity';
import { useCurrentProject } from '@/composables/useCurrentProject';
import { useRouter } from 'vue-router';
import LogoDark from '@/assets/LAKEKEEPER_IMAGE_TEXT_SIDE.svg';
import LogoLight from '@/assets/LAKEKEEPER_IMAGE_TEXT_WHITE_SIDE.svg';
import TokenDialog from './TokenDialog.vue';
import SupportBundleDialog from './SupportBundleDialog.vue';
import FeedbackDialog from './FeedbackDialog.vue';
import ContactVakamoDialog from './ContactVakamoDialog.vue';

const supportBundleOpen = ref(false);
const feedbackOpen = ref(false);
const contactOpen = ref(false);

const appConfigInjected = inject<any>('appConfig', {});
const isEnterpriseEdition = computed(() => appConfigInjected?.edition === 'enterprise');

// Props
const props = defineProps({
  logoSrc: {
    type: String,
    default: undefined,
  },
  logoSrcLight: {
    type: String,
    default: undefined,
  },
  logoSrcDark: {
    type: String,
    default: undefined,
  },
  /**
   * Show the GitHub link (with its star count) in the bar. Off by default; the
   * fetch behind the count runs either way, since it doubles as the
   * connectivity probe (see useConnectivity).
   */
  showGithub: {
    type: Boolean,
    default: false,
  },
});

const router = useRouter();
const visual = useVisualStore();
const config = useConfig();
const functions = useFunctions();
const { ensureProjectSelected } = useCurrentProject();
const auth = inject<any>('auth', null);
const tokenDialog = ref<InstanceType<typeof TokenDialog> | null>(null);

const userStorage = useUserStore();

// Read when the menu opens rather than on mount: every page already knows the
// selected project from the store, and the full list is only needed by someone
// about to switch.
const projects = ref<Project[]>([]);
const projectsLoading = ref(false);
const projectsRefused = ref(false);

/**
 * Asked once on mount, and again whenever the menu opens.
 *
 * On mount because the answer decides what the bar renders: a deployment that
 * refuses the listing gets a label, not a switcher, and finding that out only
 * when someone opens the menu means offering the control on every page until
 * they do. Again on open because the list changes — a project created on
 * `/projects` should be switchable to without a reload.
 */
async function loadProjects() {
  if (projectsLoading.value) return;
  projectsLoading.value = true;
  try {
    projects.value = (await functions.loadProjectList()) ?? [];
    projectsRefused.value = false;
  } catch (error: any) {
    // The refusal is rendered in the menu rather than as a snackbar: opening a
    // switcher is not the moment to be told off for something you cannot
    // change.
    projects.value = [];
    projectsRefused.value = isForbiddenError(error);
    // Refused the listing, the selection was never filled: ask for the one
    // project the reader is in, so the chip below has a name to carry.
    if (projectsRefused.value) await ensureProjectSelected();
  } finally {
    projectsLoading.value = false;
  }
}

function onProjectMenu(open: boolean) {
  if (open) loadProjects();
}

function switchProject(project: Project) {
  if (project['project-id'] === visual.projectSelected['project-id']) return;
  visual.setProjectSelected(project);
  // Home, not wherever we were: a warehouse, namespace or table route names an
  // object in the project being left, and it does not exist in the new one.
  router.push('/');
}

function goToProjects() {
  router.push('/projects');
}

const starCount = ref(0);
const showGithub = computed(() => props.showGithub);
const showStars = computed(() => props.showGithub && starCount.value > 0);
const { checkConnectivity } = useConnectivity();

const theme = useTheme();

const themeText = computed(() => {
  return visual.themeLight ? 'light' : 'dark';
});

const navIcon = computed(() => {
  return visual.navBarShow ? 'mdi-menu-open' : 'mdi-menu';
});

const logoSrc = computed(() => {
  // If theme-specific custom logos are provided, use them
  if (props.logoSrcLight && props.logoSrcDark) {
    return visual.themeLight ? props.logoSrcDark : props.logoSrcLight;
  }
  // If single custom logo is provided, use it
  if (props.logoSrc) {
    return props.logoSrc;
  }
  // Otherwise use default theme-based logos
  return visual.themeLight ? LogoDark : LogoLight;
});

// Show user menu when user is authenticated OR when authentication is disabled
const showUserMenu = computed(() => {
  return userStorage.isAuthenticated || !config.enabledAuthentication.value;
});

onMounted(async () => {
  theme.change(themeText.value);
  fetchGitHubStars();
  // Resolve instance-admin status centrally so managed-by controls gate correctly
  // regardless of which route the user lands on first (lakekeeper#1828).
  // Only when authentication is enabled: with auth disabled, whoami has no
  // principal and returns 401, which would trigger a redirect loop to /login.
  if (config.enabledAuthentication.value && userStorage.isAuthenticated) {
    functions.whoAmI().catch(() => {
      /* surfaced by the functions plugin; gating falls back to non-admin */
    });
  }
  // Same gate as the control it decides: with authentication disabled there is
  // no principal to refuse, and the listing is readable.
  if (showUserMenu.value) loadProjects();
});

function formatStarCount(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(count);
}

async function fetchGitHubStars() {
  // Doubles as the session's connectivity probe — see useConnectivity.
  const repo = await checkConnectivity();
  starCount.value = repo?.stargazers_count ?? 0;
}

function toggleTheme() {
  visual.toggleThemeLight();
  theme.change(themeText.value);
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
  await functions.getNewToken(auth, tokenDialog.value);
}
</script>
