<template>
  <EntityIdentityRow
    collapsible
    :icon="entityLabel === 'dataset' ? 'mdi-folder-multiple-outline' : 'mdi-table-multiple'"
    :parent-path="parentPath"
    :name="tableName"
    :id="genericTableId"
    :id-label="entityLabel === 'dataset' ? 'Dataset ID' : 'Table ID'">
    <template #actions>
      <GenericTableActionsMenu
        :warehouse-id="warehouseId"
        :namespace-id="namespaceId"
        :table-name="tableName"
        :entity-label="entityLabel"
        @updated="$emit('updated')" />
    </template>
  </EntityIdentityRow>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GenericTableActionsMenu from './GenericTableActionsMenu.vue';
import EntityIdentityRow from './EntityIdentityRow.vue';

const props = withDefaults(
  defineProps<{
    warehouseId: string;
    namespaceId: string;
    tableName: string;
    entityLabel?: string;
    /** Generic-table UUID, when the host has already resolved it. */
    genericTableId?: string;
  }>(),
  { entityLabel: undefined, genericTableId: '' },
);

defineEmits<{ (e: 'updated'): void }>();

const parentPath = computed(() => props.namespaceId.split(String.fromCharCode(0x1f)).join('.'));
</script>
