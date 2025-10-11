<template>
  <v-breadcrumbs :items="breadcrumbs">
    <v-breadcrumbs-item />
    <template #divider>
      <v-icon icon="mdi-chevron-right"></v-icon>
    </template>
  </v-breadcrumbs>
</template>

<script lang="ts" setup>
import { inject, reactive, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Breadcrumb } from '../common/interfaces';
import { useVisualStore } from '../stores/visual';
import { useFunctions } from '@/plugins/functions';

const functions = useFunctions();
const breadcrumbs = reactive<Breadcrumb[]>([]);
const appConfig = inject<any>('appConfig', { baseUrlPrefix: '' });

const visual = useVisualStore();
const route = useRoute();
const currentUrl = computed(() => route.path);

async function loadBreadcrumbs(url: string) {
  try {
    breadcrumbs.splice(0, breadcrumbs.length);
    const paths = url.split('/').filter(Boolean);

    let currentPath = `${appConfig.baseUrlPrefix}/ui`;

    for (let index = 0; index < paths.length; index++) {
      const segment = paths[index];
      currentPath += `/${segment}`;

      let title = segment;
      if (index === 1) {
        // Use warehouse name from visual store if available, otherwise fetch
        if (visual.wahrehouseName && paths[1] === visual.whId) {
          title = visual.wahrehouseName;
        } else {
          const response = await functions.getWarehouse(paths[1]);
          title = response.name;
        }
        breadcrumbs.push({
          title,
          href: currentPath,
        });
      } else if (index === 2 || index === 4) {
        continue;
      } else if (index === 3) {
        const nsId =
          segment.split(String.fromCharCode(0x1f)).length > 1
            ? segment.split(String.fromCharCode(0x1f))
            : segment.split('%1F');

        const priviousBreadcrumb = `${breadcrumbs[breadcrumbs.length - 1].href}/namespace`;
        const nsPreviousPath: string[] = [];
        let path = '';

        nsId.forEach((p) => {
          nsPreviousPath.push(p);
          path = `${priviousBreadcrumb}/${nsPreviousPath.join(String.fromCharCode(0x1f))}`;

          breadcrumbs.push({
            title: p,
            href: decodeURIComponent(path),
          });
        });
      } else {
        breadcrumbs.push({
          title,
          href: currentPath,
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

watch(
  currentUrl,
  (newVal) => {
    loadBreadcrumbs(newVal);
  },
  { immediate: true },
);

// Watch for warehouse name changes to update breadcrumbs
watch(
  () => visual.wahrehouseName,
  () => {
    if (currentUrl.value) {
      loadBreadcrumbs(currentUrl.value);
    }
  },
);
</script>
