<template>
  <!-- Task Config - Lakekeeper+ only -->
  <v-list-item @click="openDialog">
    <template #prepend>
      <v-icon>mdi-cog-outline</v-icon>
    </template>
    <v-list-item-title class="text-subtitle-2">Configure Tasks</v-list-item-title>
    <template #append>
      <v-chip size="x-small" color="primary" variant="tonal">PLUS</v-chip>
    </template>
  </v-list-item>

  <PlusFeatureDialog
    v-model="showTaskConfigDialog"
    title="Task Configuration"
    icon="mdi-cog-outline"
    description="Task Configuration allows you to customize and manage automated tasks for your warehouse."
    :bullets="[
      'Soft Deletion Settings',
      'Tabular Purge Configuration',
      'Custom Task Queues',
      'Advanced Scheduling Options',
    ]" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PlusFeatureDialog from './PlusFeatureDialog.vue';
import type { GetWarehouseResponse } from '@/gen/management/types.gen';

defineProps<{
  warehouse: GetWarehouseResponse;
}>();

const showTaskConfigDialog = ref(false);

const openDialog = (event: Event) => {
  // Prevent the parent menu from closing
  event.stopPropagation();
  showTaskConfigDialog.value = true;
};
</script>
