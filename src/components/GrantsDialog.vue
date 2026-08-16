<template>
  <!-- Grants are held per level and do not inherit, so the rail *is* the
       hierarchy: one pane per resource between the server and this entity,
       each reading and saving through its own endpoint. There is no
       cross-level transaction, so there is no global save. -->
  <v-dialog v-model="dialogOpen" fullscreen transition="dialog-bottom-transition">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" @click="dialogOpen = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-shield-key-outline</v-icon>
          Grants
          <span class="font-weight-medium">— {{ entityName }}</span>
        </v-toolbar-title>
        <v-spacer></v-spacer>
      </v-toolbar>

      <div style="flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden">
        <v-card-text style="padding: 0; display: flex; min-height: 0; flex: 1 1 auto">
          <div class="d-flex align-stretch" style="flex: 1 1 auto; min-height: 0">
            <v-tabs
              v-model="pane"
              direction="vertical"
              color="primary"
              class="flex-shrink-0"
              style="min-width: 260px; align-self: stretch; overflow-y: auto">
              <div class="text-caption text-medium-emphasis px-4 pt-2 pb-1">HIERARCHY</div>

              <div v-if="buildingChain" class="px-4 py-3 d-flex align-center ga-2">
                <v-progress-circular indeterminate size="16" width="2"></v-progress-circular>
                <span class="text-caption text-medium-emphasis">Resolving levels…</span>
              </div>

              <v-tab v-for="level in chain" :key="level.key" :value="level.key">
                <v-icon size="20" class="mr-3">{{ level.icon }}</v-icon>
                <div class="text-left" style="min-width: 0">
                  <div class="text-truncate" style="max-width: 150px" :title="level.title">
                    {{ level.title }}
                  </div>
                  <div class="text-caption text-medium-emphasis">{{ level.subtitle }}</div>
                </div>
              </v-tab>

              <div v-if="chainError" class="px-4 py-2 text-caption text-warning">
                {{ chainError }}
              </div>
            </v-tabs>

            <!-- The scroller is the wrapper, not the matrix: each pane caps
                 itself and scrolls its own content. -->
            <div
              class="flex-grow-1 d-flex flex-column"
              style="min-width: 0; min-height: 0; overflow: hidden">
              <div
                v-for="level in chain"
                v-show="pane === level.key"
                :key="level.key"
                class="d-flex flex-column"
                style="flex: 1 1 auto; min-height: 0; padding: 12px 20px">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="18">{{ level.icon }}</v-icon>
                  <span class="text-subtitle-1">{{ level.title }}</span>
                  <v-chip size="x-small" variant="tonal">{{ level.subtitle }}</v-chip>
                </div>
                <!-- Kept mounted once visited so a half-finished edit survives a
                     trip to another level in the rail. -->
                <GrantsPanel
                  v-if="visited[level.key]"
                  :resource="level.resource"
                  :active="pane === level.key"
                  @saved="emit('saved')" />
              </div>

              <div
                v-if="!chain.length && !buildingChain"
                class="pa-8 text-center text-medium-emphasis">
                No grantable levels for this entity.
              </div>
            </div>
          </div>
        </v-card-text>
      </div>

      <v-card-actions
        class="px-6 py-4"
        style="flex: 0 0 auto; border-top: 1px solid rgba(var(--v-border-color), 0.16)">
        <span class="text-caption text-medium-emphasis">
          Each level saves on its own — grants are held where they are listed.
        </span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="dialogOpen = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { resourceIcon, resourceKey, resourceLabel } from '../composables/useGrants';
import GrantsPanel from './GrantsPanel.vue';
import type { GrantResourceRef } from '../common/interfaces';
import type { GetNamespaceResponse } from '../gen/iceberg/types.gen';

const props = defineProps<{
  /** The entity the caller opened this from — the deepest level in the rail. */
  resource: GrantResourceRef;
  /** Display name for the toolbar and the leaf rail entry. */
  entityName: string;
  /** Warehouse display name, when the chain passes through one. */
  warehouseName?: string;
  /**
   * Unit-separated namespace path of the entity, used to build the namespace
   * levels. For a namespace this is its own path; for a table or view it is
   * the containing one.
   */
  namespacePath?: string;
}>();

const emit = defineEmits<{ (e: 'saved'): void }>();

const functions = useFunctions();
const visual = useVisualStore();

const dialogOpen = ref(false);
const pane = ref<string>('');
const buildingChain = ref(false);
const chainError = ref<string | null>(null);

interface Level {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  resource: GrantResourceRef;
}
const chain = ref<Level[]>([]);

/** Panes mount on first visit, so opening the modal fires one listing, not six. */
const visited = reactive<Record<string, boolean>>({});

function levelFor(resource: GrantResourceRef, title: string, subtitle?: string): Level {
  return {
    key: resourceKey(resource),
    title,
    subtitle: subtitle ?? resourceLabel(resource.type),
    icon: resourceIcon(resource.type),
    resource,
  };
}

/**
 * Builds the rail from the server down to the entity.
 *
 * The namespace levels are the expensive part: a grant is addressed by
 * namespace id, but the console carries a path, so each ancestor prefix is
 * resolved separately. A prefix the caller cannot read is skipped rather than
 * failing the whole rail — its own pane would have shown a lock anyway.
 */
async function buildChain() {
  buildingChain.value = true;
  chainError.value = null;
  const levels: Level[] = [];

  try {
    const leaf = props.resource;

    levels.push(levelFor({ type: 'server' }, 'Server'));
    levels.push(
      levelFor({ type: 'project' }, visual.projectSelected['project-name'] || 'Project', 'Project'),
    );

    const warehouseId = (leaf as any).warehouseId as string | undefined;
    if (warehouseId) {
      levels.push(
        levelFor(
          { type: 'warehouse', warehouseId },
          props.warehouseName || 'Warehouse',
          'Warehouse',
        ),
      );
    }

    if (warehouseId && props.namespacePath) {
      const parts = props.namespacePath.split('\x1F').filter(Boolean);
      // A namespace leaf is the last prefix; anything else sits under the full
      // path, so every prefix is an ancestor.
      const depth = parts.length;
      for (let i = 1; i <= depth; i++) {
        const prefix = parts.slice(0, i);
        const isLeafNamespace = leaf.type === 'namespace' && i === depth;
        try {
          const id = isLeafNamespace
            ? (leaf as any).namespaceId
            : await resolveNamespaceId(warehouseId, prefix.join('\x1F'));
          if (!id) continue;
          levels.push(
            levelFor(
              { type: 'namespace', warehouseId, namespaceId: id },
              prefix.join('.'),
              'Namespace',
            ),
          );
        } catch {
          // Not readable by this caller — leave it out of the rail.
          chainError.value = 'Some namespace levels could not be resolved.';
        }
      }
    }

    // The leaf, unless one of the levels above already is it.
    const leafKey = resourceKey(leaf);
    if (!levels.some((l) => l.key === leafKey)) {
      levels.push(levelFor(leaf, props.entityName, resourceLabel(leaf.type)));
    }

    chain.value = levels;
    // Open on the entity itself: that is what the caller clicked from.
    const target = levels.find((l) => l.key === leafKey) ?? levels[levels.length - 1];
    pane.value = target?.key ?? '';
    if (pane.value) visited[pane.value] = true;
  } catch (e: any) {
    chainError.value = e?.error?.message || e?.message || 'Failed to build the resource hierarchy';
    chain.value = levels;
  } finally {
    buildingChain.value = false;
  }
}

const namespaceIdCache = new Map<string, string>();

async function resolveNamespaceId(warehouseId: string, path: string): Promise<string> {
  const cacheKey = `${warehouseId}|${path}`;
  const cached = namespaceIdCache.get(cacheKey);
  if (cached) return cached;
  const meta = (await functions.loadNamespaceMetadata(
    warehouseId,
    path,
    false,
  )) as GetNamespaceResponse;
  const id = meta.properties?.namespace_id || (meta as any)['namespace-uuid'] || '';
  if (id) namespaceIdCache.set(cacheKey, id);
  return id;
}

watch(pane, (key) => {
  if (key) visited[key] = true;
});

watch(dialogOpen, (open) => {
  if (open) {
    for (const k of Object.keys(visited)) delete visited[k];
    buildChain();
  }
});

defineExpose({ open: () => (dialogOpen.value = true) });
</script>
