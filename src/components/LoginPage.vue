<template>
  <v-container fluid class="login-container fill-height pa-0">
    <!-- Animated background -->
    <div class="login-background">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- Login card -->
    <v-row class="fill-height" align="center" justify="center">
      <v-col cols="12" sm="8" md="6" lg="4" xl="3">
        <v-card class="login-card pa-8" elevation="24" rounded="xl">
          <!-- Logo section -->
          <div class="text-center mb-6">
            <div class="logo-container mb-4">
              <img
                src="../assets/LAKEKEEPER_IMAGE_TEXT.svg"
                alt="Lakekeeper"
                class="logo-image-svg"
                style="max-width: 200px !important; width: 200px !important" />
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
            variant="elevated"
            @click="login">
            <span class="text-h6 font-weight-medium">Sign In</span>
          </v-btn>

          <!-- Footer -->
          <div class="text-center mt-8">
            <p class="text-caption text-medium-emphasis">
              Secure authentication powered by OpenID Connect
            </p>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useVisualStore } from '../stores/visual';
import { useUserStore } from '../stores/user';
import { useConfig } from '../composables/usePermissions';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const visual = useVisualStore();
const userStore = useUserStore();
const auth = useAuth();
const config = useConfig();

async function login() {
  console.log('Login button clicked');
  console.log('Authentication enabled:', config.enabledAuthentication.value);
  console.log('Auth available:', !!auth);

  if (!config.enabledAuthentication.value) {
    console.warn('Authentication is disabled in config');
    return;
  }

  if (!auth) {
    console.error('Auth plugin not available - cannot login');
    return;
  }

  try {
    console.log('Calling auth.initUser()');
    await auth.initUser();
    console.log('auth.initUser() completed');

    // After initUser, check if user is now authenticated with valid token and redirect
    if (userStore.isAuthenticated && userStore.user.access_token) {
      console.log('User authenticated, redirecting to home');
      router.push('/');
    } else {
      console.log('User not authenticated after initUser - should have redirected to IDP');
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

onMounted(() => {
  visual.showAppOrNavBar = false;

  // If already authenticated with valid token, redirect to home
  if (userStore.isAuthenticated && userStore.user.access_token) {
    router.push('/');
  }
});

onUnmounted(() => {
  visual.showAppOrNavBar = true;
});
</script>

<style>
/* Same styles as before */
.login-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 0;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  animation: float 20s ease-in-out infinite;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  top: -100px;
  left: -100px;
  animation-delay: 0s;
}

.orb-2 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  bottom: -100px;
  right: -100px;
  animation-delay: 5s;
}

.orb-3 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 10s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -30px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}
</style>

<style scoped>
.login-container {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
}

.login-card {
  position: relative;
  z-index: 1;
  backdrop-filter: blur(20px);
  background: rgba(255, 255, 255, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
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

.v-theme--dark .login-card {
  background: rgba(30, 30, 30, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
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
</style>
