<template>
  <EntityIdentityRow
    collapsible
    icon="mdi-eye-outline"
    :parent-path="parentPath"
    :name="viewName"
    :id="viewId"
    id-label="View ID">
    <template #actions>
      <ViewActionsMenu
        :warehouse-id="warehouseId"
        :namespace-id="namespaceId"
        :view-name="viewName"
        @updated="$emit('updated')" />
    </template>
  </EntityIdentityRow>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ViewActionsMenu from './ViewActionsMenu.vue';
import EntityIdentityRow from './EntityIdentityRow.vue';

const props = withDefaults(
  defineProps<{
    warehouseId: string;
    namespaceId: string;
    viewName: string;
    /** View UUID, when the host has already loaded the metadata. */
    viewId?: string;
  }>(),
  { viewId: '' },
);

defineEmits<{ (e: 'updated'): void }>();

const parentPath = computed(() => props.namespaceId.split(String.fromCharCode(0x1f)).join('.'));
</script>
