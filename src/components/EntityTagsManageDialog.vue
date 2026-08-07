<template>
  <v-dialog v-model="dialogOpen" max-width="860">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card>
      <EntityTagsManagePanel
        v-if="dialogOpen"
        :scope="scope"
        :warehouse-id="warehouseId"
        :entity-id="entityId" />
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text="Close" @click="dialogOpen = false"></v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import EntityTagsManagePanel from './EntityTagsManagePanel.vue';
import { TagScope } from '../gen/management/types.gen';

defineProps<{
  scope: TagScope;
  warehouseId: string;
  entityId: string;
}>();

const dialogOpen = ref(false);
</script>
