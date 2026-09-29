<template>
  <EntityIdentityRow
    collapsible
    icon="mdi-folder-open"
    :parent-path="parentPath"
    :name="leafName"
    :id="namespaceId"
    id-label="Namespace ID">
    <template #actions>
      <NamespaceActionsMenu
        :warehouse-id="warehouseId"
        :namespace-path="namespacePath"
        @updated="loadNamespaceMetadata" />
    </template>
  </EntityIdentityRow>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { logError } from '@/common/errorUtils';
import type { GetNamespaceResponse } from '@/gen/iceberg/types.gen';
import NamespaceActionsMenu from './NamespaceActionsMenu.vue';
import EntityIdentityRow from './EntityIdentityRow.vue';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();
const namespace = ref<GetNamespaceResponse>({ namespace: [] });
const namespaceId = ref('');

// The route carries the path; the loaded metadata only fills in when the
// request lands, so the name is read from the path and the response is the
// fallback.
const pathParts = computed(() => {
  if (props.namespacePath.length > 0) {
    return props.namespacePath.split(String.fromCharCode(0x1f));
  }
  return namespace.value.namespace ?? [];
});

const parentPath = computed(() => pathParts.value.slice(0, -1).join('.'));
const leafName = computed(() => pathParts.value[pathParts.value.length - 1] ?? '');

onMounted(loadNamespaceMetadata);
watch(() => props.namespacePath, loadNamespaceMetadata);

async function loadNamespaceMetadata() {
  try {
    namespace.value = await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    );
    namespaceId.value =
      namespace.value.properties?.namespace_id || namespace.value['namespace-uuid'] || '';
  } catch (error) {
    logError('NamespaceHeader.loadNamespaceMetadata', error);
  }
}
</script>
