<template>
  <v-breadcrumbs :items="breadcrumbs">
    <template #divider>
      <v-icon icon="mdi-chevron-right"></v-icon>
    </template>
  </v-breadcrumbs>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { AppFunctions, FUNCTIONS_INJECTION_KEY } from '../types/functions';

export interface Breadcrumb {
  title: string;
  href?: string;
  disabled?: boolean;
}

interface Props {
  url: string;
  basePrefix?: string;
  getWarehouse?: (id: string) => Promise<{ name: string }>;
}

const props = withDefaults(defineProps<Props>(), {
  basePrefix: '/ui',
});

const functions = inject<AppFunctions>(FUNCTIONS_INJECTION_KEY);

const emit = defineEmits<{
  breadcrumbsChanged: [breadcrumbs: Breadcrumb[]];
}>();

const breadcrumbs = computed<Breadcrumb[]>(() => {
  try {
    const result: Breadcrumb[] = [];
    const paths = props.url.split('/').filter(Boolean);

    let currentPath = props.basePrefix;

    for (let index = 0; index < paths.length; index++) {
      const segment = paths[index];
      currentPath += `/${segment}`;

      let title = segment;

      // First path segment - warehouse
      if (index === 1 && functions?.getWarehouseById) {
        // Note: This would need to be async, but computed can't be async
        // The parent component should handle fetching warehouse names
        title = segment; // Keep ID as fallback
      } else if (index === 2 || index === 4) {
        // Skip certain segments
        continue;
      } else if (index === 3) {
        // Handle namespace paths with special encoding
        const nsId = segment.includes('%1F')
          ? segment.split('%1F')
          : segment.split(String.fromCharCode(0x1f));

        const previousBreadcrumb = result[result.length - 1];
        const namespacePath = `${previousBreadcrumb?.href || currentPath}/namespace`;
        const nsPreviousPath: string[] = [];
        let path = '';

        nsId.forEach((p) => {
          nsPreviousPath.push(p);
          path = `${namespacePath}/${nsPreviousPath.join(String.fromCharCode(0x1f))}`;

          result.push({
            title: p,
            href: decodeURIComponent(path),
          });
        });
        continue;
      }

      result.push({
        title,
        href: currentPath,
      });
    }

    return result;
  } catch (error) {
    console.error('Error generating breadcrumbs:', error);
    return [];
  }
});

// Emit breadcrumbs when they change
computed(() => {
  emit('breadcrumbsChanged', breadcrumbs.value);
  return breadcrumbs.value;
});
</script>
