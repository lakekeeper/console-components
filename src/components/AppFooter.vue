<template>
  <v-footer app height="40">
    <div class="text-caption text-disabled" style="position: absolute; right: 16px">
      &copy; {{ new Date().getFullYear() }}
      <span class="d-none d-sm-inline-block">
        <a href="https://lakekeeper.io">Lakekeeper<slot name="suffix"></slot></a>
      </span>
    </div>
  </v-footer>
</template>

<script setup lang="ts"></script>

<style scoped lang="sass">
.social-link :deep(.v-icon)
  color: rgba(var(--v-theme-on-background), var(--v-disabled-opacity))
  text-decoration: none
  transition: .2s ease-in-out

  &:hover
    color: rgba(25, 118, 210, 1)
</style>
