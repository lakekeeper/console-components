<template>
  <v-dialog v-model="model" max-width="1120" scrollable>
    <v-card v-if="definition" style="min-height: 78vh">
      <v-toolbar color="transparent" density="compact" flat class="pl-4">
        <v-icon class="mr-2" color="info">mdi-tag-outline</v-icon>
        <v-toolbar-title>
          <span class="text-subtitle-1">Tag: {{ definition.name }}</span>
        </v-toolbar-title>
        <v-icon v-if="isSystem" class="ml-2" size="x-small" color="grey">mdi-lock-outline</v-icon>
        <v-spacer></v-spacer>
        <v-btn icon variant="text" size="small" @click="model = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="general">General</v-tab>
        <v-tab v-if="isOpenFga && !isSystem" value="permissions">Permissions</v-tab>
        <v-tab value="attachments">Attachments</v-tab>
      </v-tabs>
      <v-divider></v-divider>

      <v-tabs-window v-if="model" v-model="tab">
        <!-- General -->
        <v-tabs-window-item value="general">
          <v-card-text>
            <v-sheet rounded="lg" border>
              <v-table density="compact">
                <tbody>
                  <tr>
                    <td class="text-medium-emphasis" style="width: 200px">Name</td>
                    <td>
                      <span class="d-inline-flex align-center flex-wrap">
                        <template v-for="(seg, i) in nameSegments" :key="i">
                          <v-icon v-if="i > 0" size="x-small" class="mx-1 text-disabled">
                            mdi-chevron-right
                          </v-icon>
                          <v-chip
                            size="small"
                            variant="tonal"
                            :color="i === nameSegments.length - 1 ? 'info' : undefined">
                            {{ seg }}
                          </v-chip>
                        </template>
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Value kind</td>
                    <td>
                      <v-chip size="x-small" variant="tonal">{{ full['value-kind'] }}</v-chip>
                    </td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Scope</td>
                    <td>
                      <v-chip
                        v-for="s in full.scope"
                        :key="s"
                        class="mr-1 mb-1"
                        size="x-small"
                        variant="outlined">
                        {{ s }}
                      </v-chip>
                    </td>
                  </tr>
                  <tr v-if="full['value-kind'] === 'enumerated'">
                    <td class="text-medium-emphasis">Allowed values</td>
                    <td>
                      <template v-if="(full['allowed-values'] || []).length">
                        <v-chip
                          v-for="v in full['allowed-values']"
                          :key="v"
                          class="mr-1 mb-1"
                          size="x-small"
                          variant="tonal"
                          color="info">
                          {{ v }}
                        </v-chip>
                      </template>
                      <span v-else class="text-disabled">—</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Description</td>
                    <td>{{ full.description || '—' }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Created</td>
                    <td>{{ fmtDate(full['created-at']) }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Updated</td>
                    <td>{{ fmtDate(full['updated-at']) }}</td>
                  </tr>
                  <tr>
                    <td class="text-medium-emphasis">Tag ID</td>
                    <td>
                      <div class="d-flex align-center">
                        <span class="font-mono">{{ full.id }}</span>
                        <v-btn
                          icon="mdi-content-copy"
                          size="x-small"
                          variant="text"
                          class="ml-1"
                          @click="functions.copyToClipboard(full.id)"></v-btn>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-sheet>

            <div v-if="canEdit && !isSystem" class="d-flex ga-2 mt-4 align-center justify-end">
              <TagDefinitionDialog
                action-type="edit"
                :definition="full"
                @submit="(input) => $emit('edit', { id: full.id, input })" />
              <v-btn
                color="error"
                variant="tonal"
                size="small"
                prepend-icon="mdi-delete-outline"
                @click="$emit('delete', definition)">
                Delete tag
              </v-btn>
            </div>
          </v-card-text>
        </v-tabs-window-item>

        <!-- Permissions -->
        <v-tabs-window-item v-if="isOpenFga && !isSystem" value="permissions">
          <TagPermissionsPanel
            v-if="tab === 'permissions'"
            :tag-definition-id="definition.id"
            :tag-name="definition.name" />
        </v-tabs-window-item>

        <!-- Attachments -->
        <v-tabs-window-item value="attachments">
          <TagAttachmentsPanel
            v-if="tab === 'attachments'"
            :tag-definition-id="definition.id"
            @navigate="model = false" />
        </v-tabs-window-item>
      </v-tabs-window>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import TagDefinitionDialog from './TagDefinitionDialog.vue';
import TagPermissionsPanel from './TagPermissionsPanel.vue';
import TagAttachmentsPanel from './TagAttachmentsPanel.vue';
import { TagDefinition } from '../gen/management/types.gen';

const props = defineProps<{
  modelValue: boolean;
  definition: TagDefinition | null;
  isOpenFga?: boolean;
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'edit', payload: { id: string; input: unknown }): void;
  (e: 'delete', definition: TagDefinition): void;
}>();

const functions = useFunctions();
const tab = ref('general');

function fmtDate(v?: string | null): string {
  return v ? new Date(v).toLocaleString() : '—';
}

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isSystem = computed(() => (props.definition?.name ?? '').startsWith('system.'));
const nameSegments = computed(() => (full.value.name ?? '').split('.').filter(Boolean));

// Full definition (list rows omit allowed-values). Fall back to the passed one.
const full = ref<TagDefinition>({} as TagDefinition);

async function loadFull() {
  if (!props.definition) return;
  full.value = props.definition;
  try {
    full.value = await functions.getTagDefinition(props.definition.id, false);
  } catch {
    // keep the row's definition as fallback
  }
}

watch(
  () => [props.modelValue, props.definition?.id],
  ([open]) => {
    if (open) {
      tab.value = 'general';
      loadFull();
    }
  },
);
</script>
