<template>
  <v-footer app height="40">
    <slot name="app-links"></slot>
    <div class="text-caption text-disabled" style="position: absolute; right: 16px">
      &copy; {{ new Date().getFullYear() }}
      <slot name="logo">
        <img
          :src="logoSrc"
          alt="Lakekeeper"
          style="height: 16px; width: auto; vertical-align: middle" />
      </slot>
    </div>
  </v-footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVisualStore } from '@/stores/visual';
import LogoDark from '@/assets/LAKEKEEPER_IMAGE_TEXT_SIDE.svg';
import LogoLight from '@/assets/LAKEKEEPER_IMAGE_TEXT_WHITE_SIDE.svg';

const visual = useVisualStore();

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
</script>

<style scoped lang="sass">
.social-link :deep(.v-icon)
  color: rgba(var(--v-theme-on-background), var(--v-disabled-opacity))
  text-decoration: none
  transition: .2s ease-in-out

  &:hover
    color: rgba(25, 118, 210, 1)
</style>
