<template>
  <!-- The table details tab's layout: a header-less fact list, then tags and
       properties side by side under hairline headings. -->
  <div class="nsx-page">
    <section>
      <dl class="nsx-kv nsx-kv--pairs">
        <div v-for="row in factRows" :key="row.label" class="nsx-kv__row">
          <dt>{{ row.label }}</dt>
          <dd>
            <span v-if="row.error" class="text-medium-emphasis">{{ row.error }}</span>
            <span v-else class="font-mono">{{ row.value || '—' }}</span>
            <v-btn
              v-if="row.copy && row.value"
              icon="mdi-content-copy"
              size="x-small"
              variant="text"
              class="nsx-copy"
              @click="functions.copyToClipboard(row.value)"></v-btn>
          </dd>
        </div>
      </dl>
    </section>

    <div class="nsx-attached">
      <section class="nsx-section nsx-section--tags">
        <EntityTagsChips
          v-if="namespaceId"
          scope="namespace"
          :warehouse-id="warehouseId"
          :entity-id="namespaceId"
          effective
          manageable>
          <template #heading="{ count, add, filterToggle }">
            <div class="nsx-head">
              <v-icon
                icon="mdi-tag-multiple-outline"
                size="16"
                color="primary"
                class="mr-2"></v-icon>
              Tags
              <v-chip v-if="count" size="x-small" variant="tonal" class="ml-2">{{ count }}</v-chip>
              <v-spacer></v-spacer>
              <component :is="filterToggle" />
              <component :is="add" />
            </div>
          </template>
        </EntityTagsChips>
        <template v-else>
          <div class="nsx-head">
            <v-icon icon="mdi-tag-multiple-outline" size="16" color="primary" class="mr-2"></v-icon>
            Tags
          </div>
          <!-- The tags are addressed by the id the metadata carries. -->
          <span v-if="metaError" class="text-medium-emphasis text-body-2">{{ metaError }}</span>
          <span v-else class="text-disabled">—</span>
        </template>
      </section>

      <section class="nsx-section nsx-section--props">
        <div class="nsx-head">
          <v-icon icon="mdi-cog-outline" size="16" color="primary" class="mr-2"></v-icon>
          Properties
          <v-chip v-if="!metaError" size="x-small" variant="tonal" class="ml-2">
            {{ propertyItems.length }}
          </v-chip>
          <v-spacer></v-spacer>
          <PropertiesEditToggle
            v-if="canEditProps"
            v-model:editing="editingProps"
            :dirty="propsDirty" />
        </div>
        <div v-if="editingProps" class="nsx-fill">
          <EntityPropertiesPanel
            entity-type="namespace"
            :warehouse-id="warehouseId"
            :namespace-path="namespacePath"
            can-edit
            height="100%"
            @dirty="propsDirty = $event"
            @updated="load"
            @saved="editingProps = false" />
        </div>
        <dl v-else-if="propertyItems.length" class="nsx-kv nsx-fill nsx-fill--scroll">
          <div v-for="p in propertyItems" :key="p.key" class="nsx-kv__row">
            <dt>{{ p.key }}</dt>
            <dd>
              <span class="font-mono text-wrap">{{ p.value }}</span>
              <v-btn
                icon="mdi-content-copy"
                size="x-small"
                variant="text"
                class="nsx-copy"
                @click="functions.copyToClipboard(p.value)"></v-btn>
            </dd>
          </div>
        </dl>
        <div v-else-if="metaError" class="text-medium-emphasis text-body-2 pt-2">
          {{ metaError }}
        </div>
        <div v-else class="text-medium-emphasis text-body-2 pt-2">No properties set</div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import EntityTagsChips from './EntityTagsChips.vue';
import EntityPropertiesPanel from './EntityPropertiesPanel.vue';
import PropertiesEditToggle from './PropertiesEditToggle.vue';
import { useNamespacePermissions } from '../composables/useCatalogPermissions';
import type { GetNamespaceResponse } from '../gen/iceberg/types.gen';
import { isForbiddenError, isNotFoundError } from '../common/errorUtils';
import { tagRefusal } from '../composables/useTagRights';

const props = defineProps<{
  warehouseId: string;
  namespacePath: string;
}>();

const functions = useFunctions();
const namespaceId = ref('');
const properties = ref<Record<string, string>>({});
// Set when the metadata could not be read: the id and the properties come from
// it, so without this a refusal read as "no id" and "No properties set".
const metaError = ref('');

const { canUpdateProperties } = useNamespacePermissions(
  namespaceId,
  computed(() => props.warehouseId),
);
const editingProps = ref(false);
const propsDirty = ref(false);
const canEditProps = computed(() => !!namespaceId.value && canUpdateProperties.value);
watch(editingProps, (on) => {
  if (!on) propsDirty.value = false;
});

// eslint-disable-next-line no-control-regex
const displayPath = computed(() => props.namespacePath.replace(/\x1F/g, '.'));
const factRows = computed(() => [
  { label: 'Namespace', value: displayPath.value, copy: false },
  { label: 'Namespace ID', value: namespaceId.value, copy: true, error: metaError.value },
  { label: 'Warehouse ID', value: props.warehouseId, copy: true },
]);
const propertyItems = computed(() =>
  Object.entries(properties.value)
    .filter(([k]) => k !== 'namespace_id')
    .map(([key, value]) => ({ key, value })),
);

async function load() {
  namespaceId.value = '';
  properties.value = {};
  metaError.value = '';
  if (!props.warehouseId || !props.namespacePath) return;
  try {
    const meta = (await functions.loadNamespaceMetadata(
      props.warehouseId,
      props.namespacePath,
      false,
    )) as GetNamespaceResponse;
    properties.value = meta?.properties ?? {};
    namespaceId.value = meta?.properties?.namespace_id || meta?.['namespace-uuid'] || '';
  } catch (e) {
    // The catalog answers 404 "not found or access denied" for a namespace the
    // reader may not see at all, so that one cannot be told apart from gone.
    metaError.value = isForbiddenError(e)
      ? "You are not allowed to read this namespace's metadata."
      : isNotFoundError(e)
        ? 'This namespace does not exist or is not visible to you.'
        : tagRefusal(e, "read this namespace's metadata");
  }
}

onMounted(load);
watch(() => [props.warehouseId, props.namespacePath], load);
</script>

<style scoped>
/* Mirrors TableDetails' tdx-* rules so the two details tabs read as one. */
.font-mono {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.875rem;
}
.text-wrap {
  word-break: break-word;
  white-space: pre-wrap;
}
.nsx-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  min-height: 0;
  padding: 16px;
}
.nsx-attached {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  flex: 1 1 auto;
  min-height: 0;
}
@media (min-width: 1264px) {
  .nsx-attached {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    column-gap: 40px;
  }
}
.nsx-section {
  min-width: 0;
  min-height: 0;
}
.nsx-section--tags {
  overflow-y: auto;
}
.nsx-section--props {
  display: flex;
  flex-direction: column;
}
/* The editor and the list take what is left of the column; each scrolls on its
   own rather than pushing the column past the page. */
.nsx-fill {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.nsx-fill--scroll {
  overflow-y: auto;
  align-content: start;
}
/* Stacked: the tab scrolls as one and the editor takes a fixed slice. */
@media (max-width: 1263px) {
  .nsx-page {
    overflow-y: auto;
  }
  .nsx-attached {
    flex: 0 0 auto;
  }
  .nsx-section--tags,
  .nsx-fill--scroll {
    overflow: visible;
  }
  .nsx-fill {
    height: 360px;
    flex: 0 0 auto;
  }
  .nsx-fill--scroll {
    height: auto;
  }
}
.nsx-head {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.7);
  min-height: 32px;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.nsx-head :deep(.v-btn),
.nsx-head :deep(.v-chip) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
.nsx-kv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
}
@media (min-width: 1264px) {
  .nsx-kv--pairs {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
  }
}
.nsx-kv__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-height: 34px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.nsx-kv dt {
  flex: 0 0 136px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding-top: 2px;
  overflow-wrap: anywhere;
}
.nsx-kv dd {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.nsx-copy {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.nsx-kv dd:hover .nsx-copy,
.nsx-copy:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .nsx-copy {
    opacity: 1;
  }
}
</style>
