<template>
  <v-container fluid class="login-container fill-height pa-0">
    <!-- Login card -->
    <v-row class="fill-height" align="center" justify="center">
      <v-col cols="12" sm="8" md="6" lg="4" xl="3">
        <v-card class="login-card pa-8" elevation="24" rounded="xl">
          <!-- Logo section -->
          <div class="text-center mb-6">
            <div class="logo-container mb-4">
              <slot name="logo">
                <img
                  :src="logoSrc"
                  alt="Lakekeeper"
                  class="logo-image-svg"
                  style="max-width: 200px !important; width: 200px !important" />
              </slot>
            </div>
            <p class="text-h6 text-medium-emphasis mt-2">Control Plane for Data and AI</p>
          </div>

          <v-divider class="mb-6"></v-divider>

          <!-- Welcome message -->
          <div class="text-center mb-8">
            <div class="text-h5 font-weight-medium mb-2">Welcome</div>
            <p class="text-body-2 text-medium-emphasis">
              Sign in to access your data catalog and warehouses
            </p>
          </div>

          <!-- Login button -->
          <v-btn
            block
            class="login-btn text-none mb-4"
            color="primary"
            prepend-icon="mdi-login"
            size="x-large"
            variant="flat"
            @click="login">
            <span class="text-h6 font-weight-medium">Sign In</span>
          </v-btn>

          <!-- Footer -->
          <div class="text-center mt-8">
            <p class="text-caption text-medium-emphasis mb-0">
              Secure authentication powered by OpenID Connect
            </p>

            <!-- Vendor attribution. Opt-in via `show-built-by` so white-labelled
                 deployments are unaffected, and unlinked when the internet is
                 unreachable rather than a link that goes nowhere. -->
            <div
              v-if="showBuiltBy"
              class="d-flex align-center justify-center ga-1 mt-4 text-caption text-medium-emphasis">
              <span>Built by</span>
              <component
                :is="isOnline ? 'a' : 'span'"
                v-bind="
                  isOnline ? { href: VAKAMO_URL, target: '_blank', rel: 'noopener noreferrer' } : {}
                "
                class="built-by-link d-inline-flex align-center">
                <img :src="vakamoLogoSrc" alt="Vakamo" class="built-by-logo" />
              </component>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useVisualStore } from '../stores/visual';
import { useUserStore } from '../stores/user';
import { useNavigationStore } from '../stores/navigation';
import { useConfig } from '../composables/useCatalogPermissions';
import { useAuth } from '../composables/useAuth';
import { useConnectivity } from '../composables/useConnectivity';
import LogoDark from '@/assets/LAKEKEEPER_IMAGE_TEXT.svg';
import LogoLight from '@/assets/LAKEKEEPER_IMAGE_TEXT_WHITE.svg';
import VakamoLogoDark from '@/assets/vakamo-logo.svg';
import VakamoLogoLight from '@/assets/vakamo-logo-white.svg';

const VAKAMO_URL = 'https://vakamo.com/about?utm_source=lakekeeper-console&utm_medium=login';

const router = useRouter();
const visual = useVisualStore();
const userStore = useUserStore();
const navigationStore = useNavigationStore();
const auth = useAuth();
const config = useConfig();

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
  /** Shows the "Built by Vakamo" attribution. Off by default so white-labelled
   *  deployments opt in explicitly. */
  showBuiltBy: {
    type: Boolean,
    default: false,
  },
});

const { isOnline } = useConnectivity();

const vakamoLogoSrc = computed(() => (visual.themeLight ? VakamoLogoDark : VakamoLogoLight));

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

async function login() {
  if (!config.enabledAuthentication.value) {
    console.warn('Authentication is disabled in config');
    return;
  }

  if (!auth) {
    console.error('Auth plugin not available - cannot login');
    return;
  }

  try {
    await auth.initUser();

    // After initUser, check if user is now authenticated with valid token
    if (userStore.isAuthenticated && userStore.user.access_token) {
      // Check for saved navigation state
      const savedNavigation = navigationStore.getNavigationState();

      if (savedNavigation && !navigationStore.isExpired()) {
        console.log('Restoring previous location:', savedNavigation.path);
        navigationStore.clearNavigationState();

        router.push({
          path: savedNavigation.path,
          query: savedNavigation.query,
        });
      } else {
        router.push('/');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

onMounted(() => {
  visual.showAppOrNavBar = false;

  // If already authenticated with valid token, redirect
  if (userStore.isAuthenticated && userStore.user.access_token) {
    // Check for saved navigation state
    const savedNavigation = navigationStore.getNavigationState();

    if (savedNavigation && !navigationStore.isExpired()) {
      console.log('Restoring previous location:', savedNavigation.path);
      navigationStore.clearNavigationState();

      router.push({
        path: savedNavigation.path,
        query: savedNavigation.query,
      });
    } else {
      router.push('/');
    }
  }
});

onUnmounted(() => {
  visual.showAppOrNavBar = true;
});
</script>

<style scoped>
.login-container {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}

.login-card {
  position: relative;
  z-index: 1;
  backdrop-filter: blur(20px);
  background: rgba(var(--v-theme-surface), 0.95) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
}

.login-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 48px 0 rgba(31, 38, 135, 0.5);
}

.logo-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo-image-svg {
  max-width: 150px;
  width: 150px;
  height: auto;
  display: block;
  object-fit: contain;
  animation: float-gentle 3s ease-in-out infinite;
  filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.15));
  transition:
    transform 0.3s ease,
    filter 0.3s ease;
}

.logo-image-svg:hover {
  transform: scale(1.05);
  filter: drop-shadow(0 8px 30px rgba(0, 0, 0, 0.25));
}

@keyframes float-gentle {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.login-btn {
  height: 56px !important;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.login-btn:active {
  transform: translateY(0);
}

@media (max-width: 600px) {
  .login-card {
    margin: 16px;
  }

  .orb-1,
  .orb-2,
  .orb-3 {
    width: 250px;
    height: 250px;
  }
}

.built-by-logo {
  height: 14px;
  width: auto;
  vertical-align: middle;
  opacity: 0.7;
  transition: opacity 0.2s ease-in-out;
}

a.built-by-link {
  text-decoration: none;
}

a.built-by-link:hover .built-by-logo {
  opacity: 1;
}
</style>
