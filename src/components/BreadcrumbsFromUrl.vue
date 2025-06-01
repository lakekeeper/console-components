<template>
  <v-breadcrumbs :items="breadcrumbs" :loading="isLoading">
    <template #divider>
      <v-icon icon="mdi-chevron-right"></v-icon>
    </template>
  </v-breadcrumbs>
</template>

<script setup lang="ts">
import { inject, ref, watch, onMounted } from 'vue';
import { AppFunctions, FUNCTIONS_INJECTION_KEY } from '../types/functions';

export interface Breadcrumb {
  title: string;
  href?: string;
  disabled?: boolean;
}

interface Props {
  url: string;
  basePrefix?: string;
}

const props = withDefaults(defineProps<Props>(), {
  basePrefix: '/ui',
});

const functions = inject<AppFunctions>(FUNCTIONS_INJECTION_KEY);

if (!functions) {
  throw new Error(
    'Functions not provided. Make sure to provide functions in the parent component.',
  );
}

const emit = defineEmits<{
  breadcrumbsChanged: [breadcrumbs: Breadcrumb[]];
}>();

// Reactive state
const isLoading = ref(false);
const breadcrumbs = ref<Breadcrumb[]>([]);

// Load breadcrumbs based on URL
async function loadBreadcrumbs(url: string) {
  if (!url) {
    breadcrumbs.value = [];
    return;
  }

  isLoading.value = true;
  try {
    const result: Breadcrumb[] = [];
    const paths = url.split('/').filter(Boolean);

    let currentPath = props.basePrefix;

    for (let index = 0; index < paths.length; index++) {
      const segment = paths[index];
      currentPath += `/${segment}`;

      let title = segment;

      if (index === 1) {
        // Warehouse segment - try to get warehouse name
        if (functions!.getWarehouse) {
          try {
            const warehouse = await functions!.getWarehouse(segment);
            title = warehouse?.name || segment;
          } catch (error) {
            console.warn(`Failed to fetch warehouse name for ${segment}:`, error);
            title = segment; // Use segment as fallback
          }
        }
        result.push({
          title,
          href: currentPath,
        });
      } else if (index === 2 || index === 4) {
        // Skip intermediate segments (e.g., 'namespace', 'table')
        continue;
      } else if (index === 3) {
        // Handle namespace paths with special encoding
        const nsId = segment.includes('%1F')
          ? segment.split('%1F')
          : segment.split(String.fromCharCode(0x1f));

        const previousBreadcrumb = result[result.length - 1];
        const namespacePath = `${previousBreadcrumb?.href || currentPath}/namespace`;
        const nsPreviousPath: string[] = [];

        for (const p of nsId) {
          nsPreviousPath.push(p);
          const path = `${namespacePath}/${nsPreviousPath.join(String.fromCharCode(0x1f))}`;

          result.push({
            title: p,
            href: decodeURIComponent(path),
          });
        }
      } else {
        // Other segments
        result.push({
          title,
          href: currentPath,
        });
      }
    }

    breadcrumbs.value = result;
  } catch (error) {
    console.error('Error generating breadcrumbs:', error);
    breadcrumbs.value = [];
  } finally {
    isLoading.value = false;
  }
}

// Watch for URL changes
watch(() => props.url, loadBreadcrumbs, { immediate: true });

// Emit breadcrumbs when they change
watch(
  breadcrumbs,
  (newBreadcrumbs) => {
    emit('breadcrumbsChanged', newBreadcrumbs);
  },
  { deep: true },
);

// Initialize on mount
onMounted(() => {
  loadBreadcrumbs(props.url);
});
</script>
