<!-- The connection-string wizard also renders as a pane inside the warehouse
     settings modal, so the content lives in ComputeConnectPanel and this is only
     the standalone dialog around it. -->
<template>
  <v-dialog v-model="isDialogActive" max-width="900">
    <template #activator="{ props: activatorProps }">
      <v-list-item prepend-icon="mdi-connection" v-bind="activatorProps">
        <v-list-item-title>Connect Compute</v-list-item-title>
      </v-list-item>
    </template>

    <ComputeConnectPanel
      :warehouse="warehouse"
      @finish="isDialogActive = false"></ComputeConnectPanel>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { GetWarehouseResponse } from '@/gen/management';
import ComputeConnectPanel from './ComputeConnectPanel.vue';

const isDialogActive = ref(false);

defineProps<{
  warehouse: GetWarehouseResponse;
}>();
</script>
