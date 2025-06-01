<template>
  <v-navigation-drawer v-model="isOpen">
    <v-list>
      <v-list-item
        v-for="item in navigationItems"
        :key="item.title"
        :link="item.link"
        :prepend-icon="item.icon"
        :title="item.title"
        :to="item.to"
        @click="item.onClick ? item.onClick() : null"></v-list-item>

      <slot name="additional-items"></slot>
    </v-list>

    <slot name="footer"></slot>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface NavigationItem {
  title: string;
  icon: string;
  to?: string;
  link?: boolean;
  onClick?: () => void;
}

interface Props {
  modelValue?: boolean;
  navigationItems?: NavigationItem[];
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  navigationItems: () => [
    { title: 'Home', icon: 'mdi-home', to: '/', link: true },
    { title: 'Warehouses', icon: 'mdi-warehouse', to: '/warehouse', link: true },
    { title: 'Roles', icon: 'mdi-account-key', link: true },
    { title: 'Server settings', icon: 'mdi-cog', to: '/server-settings', link: true },
  ],
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
</script>
