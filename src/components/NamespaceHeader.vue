<template>
  <EntityIdentityRow
    collapsible
    icon="mdi-folder-open"
    :parent-path="parentPath"
    :name="leafName"
    :id="namespaceId"
    id-label="Namespace ID"
    :chips="chips">
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
import { isForbiddenError, isNotFoundError, logError } from '@/common/errorUtils';
import type { GetNamespaceResponse } from '@/gen/iceberg/types.gen';
import type { IdentityChip } from '@/common/interfaces';
import NamespaceActionsMenu from './NamespaceActionsMenu.vue';
import EntityIdentityRow from './EntityIdentityRow.vue';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();
const namespace = ref<GetNamespaceResponse>({ namespace: [] });
const namespaceId = ref('');
// A refused metadata read leaves the row without an id; the chip says why
// instead of letting the gap read as "this namespace has none".
// The catalog answers 404 "not found or access denied" for a namespace the
// reader may not see at all — that one is named as the ambiguity it is.
const metadataRefused = ref<'forbidden' | 'not-found' | null>(null);
const chips = computed<IdentityChip[]>(() =>
  metadataRefused.value === 'forbidden'
    ? [
        {
          text: 'Metadata not visible to you',
          icon: 'mdi-eye-off-outline',
          tooltip: "You are not allowed to read this namespace's metadata.",
        },
      ]
    : metadataRefused.value === 'not-found'
      ? [
          {
            text: 'Not found or not visible to you',
            icon: 'mdi-eye-off-outline',
            tooltip: 'This namespace does not exist or is not visible to you.',
          },
        ]
      : [],
);

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
  metadataRefused.value = null;
  try {
    namespace.value = await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    );
    namespaceId.value =
      namespace.value.properties?.namespace_id || namespace.value['namespace-uuid'] || '';
  } catch (error) {
    namespaceId.value = '';
    metadataRefused.value = isForbiddenError(error)
      ? 'forbidden'
      : isNotFoundError(error)
        ? 'not-found'
        : null;
    logError('NamespaceHeader.loadNamespaceMetadata', error);
  }
}
</script>
