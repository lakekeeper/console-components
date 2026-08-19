<template>
  <!-- Fullscreen because a deep namespace tree needs the height. Every level
       from the card down to the tree is a min-height:0 flex box — without that
       nothing can shrink, the tree never scrolls, and the card just grows. -->
  <v-dialog v-model="open" fullscreen transition="dialog-bottom-transition" :persistent="moving">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" :disabled="moving" @click="open = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-folder-move-outline</v-icon>
          Move namespace
        </v-toolbar-title>
      </v-toolbar>
      <v-divider></v-divider>

      <v-card-text class="card-body">
        <div v-if="checking" class="d-flex align-center py-4">
          <v-progress-circular indeterminate size="20" width="2" class="mr-3"></v-progress-circular>
          <span class="text-body-2 text-medium-emphasis">Checking whether this can move…</span>
        </div>

        <v-alert v-else-if="blocker" type="info" variant="tonal" density="compact">
          {{ blocker }}
        </v-alert>

        <template v-else>
          <!-- The source was a second tree, which spent half the dialog
               restating one path and made the moved namespace hard to pick out.
               As a row it is unmistakable, and the destination gets the width. -->
          <div class="d-flex align-center flex-wrap ga-2 mb-4">
            <span class="text-caption text-medium-emphasis text-uppercase">Moving</span>
            <v-icon size="16" class="text-medium-emphasis">mdi-database-outline</v-icon>
            <span class="text-body-2 text-medium-emphasis">Warehouse root</span>
            <template v-for="(seg, i) in currentPath" :key="i">
              <v-icon size="14" class="text-disabled">mdi-chevron-right</v-icon>
              <span v-if="i < currentPath.length - 1" class="text-body-2 text-medium-emphasis">
                {{ seg }}
              </span>
              <v-chip
                v-else
                size="small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-folder-move">
                {{ seg }}
              </v-chip>
            </template>
          </div>

          <div class="text-caption text-medium-emphasis text-uppercase mb-1">New parent</div>
          <div class="text-caption text-medium-emphasis mb-2">
            Pick where it should live — the warehouse root or any namespace.
          </div>
          <v-sheet border rounded class="tree-box">
            <!-- No `open-on-click`: it routes a row click to the expand handler
                 for any node with children, so a parent could never be picked
                 and Move stayed disabled. The caret expands; the row selects. -->
            <v-treeview
              v-model:opened="destOpened"
              v-model:activated="destActivated"
              :items="destItems"
              item-value="key"
              item-title="name"
              activatable
              active-strategy="single-independent"
              active-color="primary"
              density="compact"
              indent-lines="default"
              class="pa-1"
              style="background-color: transparent !important">
              <template #prepend="{ item }">
                <v-icon size="18">{{ item.icon }}</v-icon>
              </template>
              <template #append="{ item }">
                <span v-if="item.isSelf" class="text-caption text-disabled">
                  cannot move into itself
                </span>
              </template>
            </v-treeview>
          </v-sheet>

          <div class="controls">
            <v-row dense class="align-center">
              <v-col cols="12" md="5">
                <v-text-field
                  v-model="newName"
                  label="Name at the destination"
                  density="compact"
                  :disabled="moving"
                  hide-details></v-text-field>
              </v-col>
              <v-col cols="12" md="7">
                <div class="d-flex align-center flex-wrap ga-2 text-body-2">
                  <code class="text-disabled">{{ displayName }}</code>
                  <v-icon size="16">mdi-arrow-right</v-icon>
                  <code>{{ resultPath || '—' }}</code>
                </div>
              </v-col>
            </v-row>

            <v-checkbox
              v-if="protectedState"
              v-model="force"
              :disabled="moving"
              density="compact"
              color="warning"
              hide-details
              label="This namespace is protected — move it anyway"
              class="mt-1"></v-checkbox>

            <v-alert
              v-if="validationMessage"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3">
              {{ validationMessage }}
            </v-alert>

            <v-alert v-if="moveError" type="error" variant="tonal" density="compact" class="mt-3">
              {{ moveError }}
            </v-alert>

            <!-- A standing fact about moves, not a problem with this one, so a
                 caption rather than an alert. -->
            <div class="d-flex align-start ga-2 mt-3 text-caption text-medium-emphasis">
              <v-icon size="14" class="mt-1">mdi-information-outline</v-icon>
              <span>
                The namespace keeps its own grants; its contents inherit the destination's. Needs
                <strong>move</strong>
                here, plus
                <strong>create</strong>
                and
                <strong>accept moved namespace</strong>
                on the destination.
              </span>
            </div>
          </div>
        </template>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="moving" @click="open = false">Cancel</v-btn>
        <v-btn
          v-if="!blocker"
          color="primary"
          variant="flat"
          :loading="moving"
          :disabled="!canMove"
          @click="confirmMove">
          Move
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFunctions } from '@/plugins/functions';
import type { GetWarehouseResponse } from '@/gen/management/types.gen';
import {
  namespaceMoveRefusal,
  namespaceMoveCapability,
  isReparent,
  type StorageLayoutInfo,
} from '@/common/namespaceMove';

const props = defineProps<{
  warehouseId: string;
  namespaceId: string;
  /** Unit-separated, as the rest of the console addresses namespaces. */
  namespacePath: string;
  protectedState?: boolean;
}>();

const emit = defineEmits<{ (e: 'moved', destination: string[]): void }>();

const functions = useFunctions();
const SEP = '\x1F';

const open = ref(false);
const moving = ref(false);
const checking = ref(false);
const listing = ref(false);
const moveError = ref<string | null>(null);
const force = ref(false);
const blocker = ref<string | null>(null);

const layout = ref<StorageLayoutInfo | null>(null);

const currentPath = computed(() => props.namespacePath.split(SEP).filter(Boolean));
const currentKey = computed(() => currentPath.value.join(SEP));
const displayName = computed(() => currentPath.value.join('.'));

interface DestNode {
  key: string;
  name: string;
  path: string[];
  icon: string;
  isSelf: boolean;
  /** Spread onto the rendered row by VTreeview — used to disable the source. */
  props?: Record<string, unknown>;
  /** Whether this node's children have been fetched. */
  loaded?: boolean;
  /** `[]` until fetched. Absent only on the source, which cannot be expanded. */
  children?: DestNode[];
}

/** The warehouse root is a real, selectable node — moving there is a real move. */
const ROOT_KEY = '\u0000root';

const destItems = ref<DestNode[]>([]);
const destOpened = ref<string[]>([]);
const destActivated = ref<string[]>([]);
const newName = ref('');

/** The node the destination is read from — root when nothing is picked yet. */
const selectedNode = computed<DestNode | null>(() => {
  const key = destActivated.value[0];
  if (!key || key === ROOT_KEY) return null;
  const walk = (nodes: DestNode[]): DestNode | null => {
    for (const n of nodes) {
      if (n.key === key) return n;
      const hit = n.children ? walk(n.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  return walk(destItems.value);
});

const browsePath = computed(() => selectedNode.value?.path ?? []);

async function fetchChildren(path: string[]): Promise<DestNode[]> {
  const parent = path.length ? path.join(SEP) : undefined;
  const res = await functions.listNamespaces(props.warehouseId, parent, undefined, false);
  return (res.namespaces ?? []).map((ns: string[]) => {
    const key = ns.join(SEP);
    const isSelf = key === currentKey.value;
    return {
      key,
      name: ns[ns.length - 1],
      path: [...ns],
      icon: isSelf ? 'mdi-folder-move' : 'mdi-folder-outline',
      isSelf,
      // A namespace cannot be moved inside itself. `props` is what VTreeview
      // spreads onto the row (itemProps defaults to 'props'), so this disables
      // the node outright rather than letting it be picked and then refused.
      // It also gets no `children`, which is what removes its expand caret.
      //
      // Everything else starts with an empty array rather than `undefined`:
      // VTreeview only renders a caret when `Array.isArray(children)`, so
      // `undefined` would make every unvisited namespace a dead leaf and the
      // tree unwalkable. `loaded` — not `children.length` — is what says whether
      // it has been fetched, so a genuinely empty namespace is not refetched on
      // every expand.
      ...(isSelf ? { props: { disabled: true } } : { children: [], loaded: false }),
    } as DestNode;
  });
}

function findNode(nodes: DestNode[], key: string): DestNode | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    const hit = n.children ? findNode(n.children, key) : null;
    if (hit) return hit;
  }
  return null;
}

// The repo's other trees load on expand rather than through `load-children`, so
// this follows suit: watch what opened and fill in whatever is still empty.
async function loadOpened(keys: string[]) {
  for (const key of keys) {
    if (key === ROOT_KEY) continue;
    const node = findNode(destItems.value, key);
    if (!node || node.loaded) continue;
    listing.value = true;
    try {
      node.children = await fetchChildren(node.path);
      node.loaded = true;
    } catch {
      node.children = [];
      node.loaded = true;
    } finally {
      listing.value = false;
    }
  }
}

watch(destOpened, loadOpened);

// Opening is what triggers the checks: they cost two requests, and a menu that
// ran them for every namespace it rendered would pay for answers nobody reads.
watch(open, async (isOpen) => {
  if (!isOpen) return;
  newName.value = currentPath.value[currentPath.value.length - 1] ?? '';
  force.value = false;
  moveError.value = null;
  blocker.value = null;
  destItems.value = [];
  destOpened.value = [];
  destActivated.value = [];
  layout.value = null;
  checking.value = true;
  try {
    const [childList, warehouse] = await Promise.all([
      functions
        .listNamespaces(props.warehouseId, props.namespacePath, undefined, false)
        .catch(() => null),
      functions.getWarehouse(props.warehouseId, false).catch(() => null),
    ]);

    if (childList?.namespaces?.length) {
      blocker.value =
        'This namespace contains child namespaces. Only namespaces without children can be moved.';
      return;
    }

    // Whether the layout forbids this move depends on *which* move it is, so it
    // is kept and re-evaluated against the chosen destination rather than
    // deciding here. Mirrors `StorageLayout::move_desyncs_location`.
    layout.value =
      ((warehouse as GetWarehouseResponse | null)?.['storage-profile']?.['storage-layout'] as
        StorageLayoutInfo | undefined) ?? null;

    // When the layout permits neither half there is nothing to pick, so this is
    // a blocker like the others rather than a refusal the user has to discover
    // by choosing a destination first.
    const capability = namespaceMoveCapability(layout.value);
    if (!capability.canRename && !capability.canReparent) {
      blocker.value = namespaceMoveRefusal(layout.value, true, true);
      return;
    }

    // Seed the tree at the root and open down to where the namespace lives now,
    // so "rename in place" needs no navigation and the current parent is already
    // the selection.
    const root: DestNode = {
      key: ROOT_KEY,
      name: 'Warehouse root',
      path: [],
      icon: 'mdi-database-outline',
      isSelf: false,
      loaded: true,
      children: await fetchChildren([]),
    };
    destItems.value = [root];

    const ancestors = currentPath.value.slice(0, -1);
    const openKeys = [ROOT_KEY];
    for (let i = 0; i < ancestors.length; i++) {
      const path = ancestors.slice(0, i + 1);
      const node = findNode(destItems.value, path.join(SEP));
      if (!node) break;
      node.children = await fetchChildren(path);
      node.loaded = true;
      openKeys.push(node.key);
    }
    destOpened.value = openKeys;
    destActivated.value = [ancestors.length ? ancestors.join(SEP) : ROOT_KEY];
  } catch (e: any) {
    // Seeding the tree is several requests; a rejection here would otherwise be
    // unhandled and leave an empty tree with no explanation for why.
    blocker.value =
      e?.error?.message || e?.message || 'Could not load the namespaces of this warehouse.';
  } finally {
    checking.value = false;
  }
});

const destination = computed(() => [...browsePath.value, newName.value.trim()]);

const renamed = computed(
  () => newName.value.trim() !== (currentPath.value[currentPath.value.length - 1] ?? ''),
);
const reparented = computed(() => isReparent(currentPath.value.slice(0, -1), browsePath.value));

const layoutRefusal = computed(() =>
  namespaceMoveRefusal(layout.value, renamed.value, reparented.value),
);

const resultPath = computed(() => (newName.value.trim() ? destination.value.join('.') : ''));

const validationMessage = computed(() => {
  if (!destActivated.value.length) return 'Pick a destination on the right.';
  if (!newName.value.trim()) return 'The namespace needs a name at the destination.';
  const destKey = destination.value.join(SEP);
  if (destKey === currentKey.value) return 'That is the current location — nothing would change.';
  // Belt and braces: the listing already refuses to descend into the namespace
  // being moved, so this only fires if that guard is ever bypassed.
  if (destKey.startsWith(currentKey.value + SEP))
    return `A namespace cannot be moved inside itself. "${displayName.value}" is already the start of that path.`;
  // Last, so the cheaper structural problems are reported first: this one is a
  // property of the destination, and only worth explaining once there is a
  // coherent destination to explain it about.
  if (layoutRefusal.value) return layoutRefusal.value;
  return null;
});

const canMove = computed(
  () =>
    !validationMessage.value &&
    !moving.value &&
    !listing.value &&
    (!props.protectedState || force.value),
);

async function confirmMove() {
  moving.value = true;
  moveError.value = null;
  try {
    await functions.moveNamespace(
      props.warehouseId,
      props.namespaceId,
      destination.value,
      force.value || undefined,
      true,
    );
    emit('moved', [...destination.value]);
    open.value = false;
  } catch (e: any) {
    moveError.value = e?.error?.message || e?.message || 'Move failed.';
  } finally {
    moving.value = false;
  }
}
</script>

<style scoped>
/* The chain that makes the tree scroll instead of the card growing. Each level
   needs min-height:0 — a flex item defaults to min-height:auto, so without it
   nothing shrinks and the overflow never engages. */
.card-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tree-box {
  flex: 1 1 auto;
  min-height: 160px;
  overflow-y: auto;
}
.controls {
  flex: 0 0 auto;
  max-height: 40%;
  overflow-y: auto;
  padding-top: 12px;
}
</style>
