<template>
  <EntityIdentityRow
    collapsible
    icon="mdi-table"
    :parent-path="parentPath"
    :name="tableName"
    :id="tableId"
    id-label="Table ID">
    <template #actions>
      <TableActionsMenu
        :warehouse-id="warehouseId"
        :namespace-id="namespaceId"
        :table-name="tableName"
        @updated="$emit('updated')">
        <template #maintenance="slotProps">
          <slot name="maintenance" v-bind="slotProps"></slot>
        </template>
      </TableActionsMenu>
    </template>
  </EntityIdentityRow>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TableActionsMenu from './TableActionsMenu.vue';
import EntityIdentityRow from './EntityIdentityRow.vue';

const props = withDefaults(
  defineProps<{
    warehouseId: string;
    namespaceId: string;
    tableName: string;
    /** Table UUID, when the host has already loaded the metadata. */
    tableId?: string;
  }>(),
  { tableId: '' },
);

defineEmits<{ (e: 'updated'): void }>();

const parentPath = computed(() => props.namespaceId.split(String.fromCharCode(0x1f)).join('.'));
</script>
