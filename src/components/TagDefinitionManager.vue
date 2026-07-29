<template>
  <v-card>
    <v-toolbar class="mb-4" color="transparent" density="compact" flat>
      <template #prepend>
        <v-icon>mdi-tag-multiple-outline</v-icon>
      </template>
      <v-toolbar-title>
        <span class="text-subtitle-1">Tag Definitions</span>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <TagDefinitionDialog v-if="canCreateTag" action-type="add" @submit="createDefinition" />
    </v-toolbar>

    <v-data-table
      v-if="canListTags"
      height="calc(100vh - 340px)"
      fixed-header
      :headers="headers"
      hover
      :items="definitions"
      :sort-by="[{ key: 'name', order: 'asc' }]"
      :loading="loading">
      <template #item.name="{ item }">
        <span style="display: flex; align-items: center">
          <v-icon class="mr-2" color="info">mdi-tag-outline</v-icon>
          {{ item.name }}
          <v-icon v-if="isSystem(item)" class="ml-2" size="x-small" color="grey">
            mdi-lock-outline
          </v-icon>
        </span>
      </template>
      <template #item.value-kind="{ item }">
        <v-chip size="x-small" variant="tonal">{{ item['value-kind'] }}</v-chip>
      </template>
      <template #item.scope="{ item }">
        <v-chip v-for="s in item.scope" :key="s" class="mr-1" size="x-small" variant="outlined">
          {{ s }}
        </v-chip>
      </template>
      <template #item.description="{ item }">
        <v-tooltip
          v-if="item.description && item.description.length > 50"
          :text="item.description"
          location="top"
          max-width="400">
          <template #activator="{ props: tipProps }">
            <span v-bind="tipProps">{{ item.description.slice(0, 50) }}…</span>
          </template>
        </v-tooltip>
        <span v-else>{{ item.description }}</span>
      </template>
      <template #item.actions="{ item }">
        <TagAttachmentsDialog :tag-definition-id="item.id" :name="item.name" />
        <template v-if="!isSystem(item) && canCreateTag">
          <TagDefinitionDialog
            action-type="edit"
            :definition="item"
            @submit="(input) => updateDefinition(item.id, input)" />
          <DeleteConfirmDialog
            type="tag definition"
            :name="item.name"
            @confirmed="deleteDefinition(item.id)" />
        </template>
      </template>
      <template #no-data>
        <span class="text-disabled">No tag definitions yet.</span>
      </template>
    </v-data-table>
    <div v-else>You don't have permission to list tag definitions</div>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { Header } from '../common/interfaces';
import { useVisualStore } from '../stores/visual';
import { useProjectPermissions } from '../composables/useCatalogPermissions';
import {
  CreateTagDefinitionRequest,
  UpdateTagDefinitionRequest,
  TagDefinition,
} from '../gen/management/types.gen';
import TagDefinitionDialog, { TagDefinitionInput } from './TagDefinitionDialog.vue';

const functions = useFunctions();
const visual = useVisualStore();
const notify = true;

const definitions = ref<TagDefinition[]>([]);
const loading = ref(false);

const headers: readonly Header[] = Object.freeze([
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Value kind', key: 'value-kind', align: 'start' },
  { title: 'Scope', key: 'scope', align: 'start', sortable: false },
  { title: 'Description', key: 'description', align: 'start' },
  { title: 'Actions', key: 'actions', align: 'end', sortable: false },
]);

const projectId = computed(() => visual.projectSelected['project-id']);
const { canListTags, canCreateTag } = useProjectPermissions(projectId);

function isSystem(item: TagDefinition): boolean {
  return item.name.toLowerCase().startsWith('system.');
}

async function loadDefinitions() {
  loading.value = true;
  try {
    const res = await functions.listTagDefinitions(1000, undefined, undefined, false);
    definitions.value = res['tag-definitions'] ?? [];
  } catch {
    // handled
  } finally {
    loading.value = false;
  }
}

let hasLoaded = false;
watch(
  canListTags,
  async (canList) => {
    if (canList && !hasLoaded) {
      hasLoaded = true;
      await loadDefinitions();
    }
  },
  { immediate: true },
);

async function createDefinition(input: TagDefinitionInput) {
  const body: CreateTagDefinitionRequest = {
    name: input.name,
    description: input.description,
    'value-kind': input.valueKind,
    scope: input.scope,
    'allowed-values': input.allowedValues ?? null,
  };
  try {
    await functions.createTagDefinition(body, notify);
    await loadDefinitions();
  } catch {
    // handled
  }
}

async function updateDefinition(id: string, input: TagDefinitionInput) {
  const body: UpdateTagDefinitionRequest = {
    name: input.name,
    description: input.description,
    scope: input.scope,
    'add-allowed-values': input.addAllowedValues ?? null,
  };
  try {
    await functions.updateTagDefinition(id, body, notify);
    await loadDefinitions();
  } catch {
    // handled
  }
}

async function deleteDefinition(id: string) {
  try {
    await functions.deleteTagDefinition(id, notify);
    definitions.value = definitions.value.filter((d) => d.id !== id);
  } catch {
    // handled
  }
}
</script>
