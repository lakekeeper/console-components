<template>
  <v-footer app height="32">
    <slot name="app-links"></slot>

    <div
      class="text-caption text-disabled d-flex align-center"
      style="position: absolute; right: 16px">
      <span>
        &copy; {{ new Date().getFullYear() }}
        <slot name="logo">
          <img
            :src="logoSrc"
            alt="Lakekeeper"
            style="height: 16px; width: auto; vertical-align: middle" />
        </slot>
      </span>

      <!-- Vendor attribution, trailing the product mark. Opt-in via
           `show-built-by` so white-labelled deployments are unaffected. Renders
           as plain text when the internet is unreachable rather than as a link
           that goes nowhere. -->
      <template v-if="showBuiltBy">
        <span class="mx-2 built-by-separator">·</span>
        <span class="mr-1">Built by</span>
        <component
          :is="isOnline ? 'a' : 'span'"
          v-bind="
            isOnline ? { href: VAKAMO_URL, target: '_blank', rel: 'noopener noreferrer' } : {}
          "
          class="built-by-link d-inline-flex align-center">
          <img :src="vakamoLogoSrc" alt="Vakamo" class="built-by-logo" />
        </component>
      </template>
    </div>
  </v-footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVisualStore } from '@/stores/visual';
import { useConnectivity } from '@/composables/useConnectivity';
import LogoDark from '@/assets/LAKEKEEPER_IMAGE_TEXT_SIDE.svg';
import LogoLight from '@/assets/LAKEKEEPER_IMAGE_TEXT_WHITE_SIDE.svg';
import VakamoLogoDark from '@/assets/vakamo-logo.svg';
import VakamoLogoLight from '@/assets/vakamo-logo-white.svg';

const VAKAMO_URL = 'https://vakamo.com/about?utm_source=lakekeeper-console&utm_medium=footer';

const visual = useVisualStore();
const { isOnline } = useConnectivity();

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
</script>

<style scoped lang="sass">
.built-by-separator
  opacity: 0.5

.built-by-logo
  height: 11px
  width: auto
  vertical-align: middle
  opacity: 0.75
  transition: opacity .2s ease-in-out

a.built-by-link
  text-decoration: none

  &:hover .built-by-logo
    opacity: 1

.social-link :deep(.v-icon)
  color: rgba(var(--v-theme-on-background), var(--v-disabled-opacity))
  text-decoration: none
  transition: .2s ease-in-out

  &:hover
    color: rgb(var(--v-theme-primary))
</style>
