<template>
  <!-- Fullscreen like the namespace move, and for the same reason: picking a
       destination means walking a namespace tree, which needs the height. Every
       level from the card down is a min-height:0 flex box, or the tree never
       scrolls and the card just grows. -->
  <v-dialog v-model="open" fullscreen transition="dialog-bottom-transition" :persistent="moving">
    <template #activator="activator">
      <slot name="activator" v-bind="activator"></slot>
    </template>

    <v-card style="height: 100%; width: 100%; display: flex; flex-direction: column">
      <v-toolbar density="comfortable" flat>
        <v-btn icon="mdi-close" :disabled="moving" @click="open = false"></v-btn>
        <v-toolbar-title>
          <v-icon class="mr-2" size="small">mdi-file-move-outline</v-icon>
          Move {{ kindLabel }}
        </v-toolbar-title>
      </v-toolbar>
      <v-divider></v-divider>

      <v-card-text class="card-body">
        <div v-if="listing && !destItems.length" class="d-flex align-center py-4">
          <v-progress-circular indeterminate size="20" width="2" class="mr-3"></v-progress-circular>
          <span class="text-body-2 text-medium-emphasis">Loading namespaces…</span>
        </div>

        <v-alert v-else-if="blocker" type="info" variant="tonal" density="compact">
          {{ blocker }}
        </v-alert>

        <template v-else>
          <div class="d-flex align-center flex-wrap ga-2 mb-4">
            <span class="text-caption text-medium-emphasis text-uppercase">Moving</span>
            <template v-for="(seg, i) in currentNamespace" :key="i">
              <span class="text-body-2 text-medium-emphasis">{{ seg }}</span>
              <v-icon size="14" class="text-disabled">mdi-chevron-right</v-icon>
            </template>
            <v-chip size="small" color="primary" variant="flat" :prepend-icon="kindIcon">
              {{ name }}
            </v-chip>
          </div>

          <div class="text-caption text-medium-emphasis text-uppercase mb-1">New namespace</div>
          <div class="text-caption text-medium-emphasis mb-2">
            Pick the namespace it should live in. A {{ kindLabel }} cannot sit at the warehouse
            root, so only namespaces are offered.
          </div>
          <v-sheet border rounded class="tree-box">
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
                <span v-if="item.isCurrent" class="text-caption text-disabled">
                  current namespace
                </span>
                <!-- A refused listing is not "no children". -->
                <span v-else-if="item.listError" class="text-caption text-medium-emphasis">
                  {{ item.listError }}
                </span>
                <span v-else-if="destRight(item) === false" class="text-caption text-disabled">
                  you may not move it here
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
                  <code class="text-disabled">{{ currentPathLabel }}</code>
                  <v-icon size="16">mdi-arrow-right</v-icon>
                  <code>{{ resultPath || '—' }}</code>
                </div>
              </v-col>
            </v-row>

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

            <!-- A standing fact about moves, not a problem with this one. -->
            <div class="d-flex align-start ga-2 mt-3 text-caption text-medium-emphasis">
              <v-icon size="14" class="mt-1">mdi-information-outline</v-icon>
              <span>
                The {{ kindLabel }} keeps its own grants and inherits the destination namespace's —
                which is why a move asks for more than a rename: needs
                <strong>move</strong>
                here, and
                <strong>accept moved tabular</strong>
                on the destination. The data files stay where they are; only the catalog entry
                moves.
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
import { useMenuBoundary } from '@/composables/useMenuBoundary';
import { useItemRights, type ItemTarget } from '@/composables/useItemRights';
import { isForbiddenError } from '@/common/errorUtils';
import { tagRefusal } from '@/composables/useTagRights';

// Opened from an actions menu: keep its menus out of that menu's close chain.
useMenuBoundary();

const props = defineProps<{
  warehouseId: string;
  /** Unit-separated, as the rest of the console addresses namespaces. */
  namespacePath: string;
  name: string;
  kind: 'table' | 'view' | 'generic-table';
}>();

const emit = defineEmits<{ (e: 'moved', destination: string[], name: string): void }>();

const functions = useFunctions();
const SEP = '\x1F';

const open = ref(false);
const moving = ref(false);
const listing = ref(false);
const moveError = ref<string | null>(null);
const blocker = ref<string | null>(null);

const KIND_LABELS: Record<string, string> = {
  table: 'table',
  view: 'view',
  'generic-table': 'generic table',
};
const KIND_ICONS: Record<string, string> = {
  table: 'mdi-table',
  view: 'mdi-table-eye',
  'generic-table': 'mdi-table-large',
};
const kindLabel = computed(() => KIND_LABELS[props.kind] ?? 'tabular');
const kindIcon = computed(() => KIND_ICONS[props.kind] ?? 'mdi-table');

const currentNamespace = computed(() => props.namespacePath.split(SEP).filter(Boolean));
const currentKey = computed(() => currentNamespace.value.join(SEP));
const currentPathLabel = computed(() => [...currentNamespace.value, props.name].join('.'));

interface DestNode {
  key: string;
  name: string;
  path: string[];
  icon: string;
  isCurrent: boolean;
  loaded?: boolean;
  children?: DestNode[];
  listError?: string;
}

// A destination takes `accept_moved_tabular` and the right to create this kind
// of tabular there. Asked per row as rows render.
const rights = useItemRights();
const CREATE_ACTION: Record<string, string> = {
  table: 'create_table',
  view: 'create_view',
  'generic-table': 'create_generic_table',
};
function destTarget(node: DestNode): ItemTarget {
  return { kind: 'namespace', warehouseId: props.warehouseId, namespace: node.path };
}
/** true / false once both answers are in, undefined while either is not. */
function destRight(node: DestNode | null | undefined): boolean | undefined {
  if (!node || node.isCurrent) return undefined;
  const t = destTarget(node);
  const accept = rights.can(t, 'accept_moved_tabular');
  const create = rights.can(t, CREATE_ACTION[props.kind] ?? 'create_table');
  if (accept === false || create === false) return false;
  return accept && create ? true : undefined;
}

// The tabular's own rights. The server checks `rename` on every rename —
// including one that crosses namespaces — and `move` only on top of it, so a
// move needs both; `move` alone would offer a button the server refuses.
// Unknown while either answer is in flight, and a plain `false` is worth saying
// up front rather than at the end of a destination walk.
const sourceTarget = computed<ItemTarget>(() => ({
  kind: props.kind,
  warehouseId: props.warehouseId,
  namespace: currentNamespace.value,
  name: props.name,
}));
const sourceRight = computed(() => {
  const move = rights.can(sourceTarget.value, 'move');
  const rename = rights.can(sourceTarget.value, 'rename');
  if (move === false || rename === false) return false;
  return move && rename ? true : undefined;
});

function listRefusal(e: any): string {
  return isForbiddenError(e) ? 'contents not visible to you' : tagRefusal(e, 'list its contents');
}

const destItems = ref<DestNode[]>([]);
const destOpened = ref<string[]>([]);
const destActivated = ref<string[]>([]);
const newName = ref('');

const selectedNode = computed<DestNode | null>(() => {
  const key = destActivated.value[0];
  if (!key) return null;
  return findNode(destItems.value, key);
});

async function fetchChildren(path: string[]): Promise<DestNode[]> {
  const parent = path.length ? path.join(SEP) : undefined;
  // The listing pages at 100: a warehouse with more namespaces under one parent
  // would otherwise hide the rest of them, and a destination that is not in the
  // tree cannot be picked at all.
  const namespaces: string[][] = [];
  let pageToken: string | undefined;
  do {
    const res = await functions.listNamespaces(props.warehouseId, parent, pageToken, false);
    namespaces.push(...((res.namespaces ?? []) as string[][]));
    pageToken = res['next-page-token'] ?? undefined;
  } while (pageToken);
  return namespaces.map((ns: string[]) => {
    const key = ns.join(SEP);
    return {
      key,
      name: ns[ns.length - 1],
      path: [...ns],
      icon: key === currentKey.value ? 'mdi-folder-home-outline' : 'mdi-folder-outline',
      isCurrent: key === currentKey.value,
      children: [],
      loaded: false,
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

// Load on expand, as the repo's other trees do.
async function loadOpened(keys: string[]) {
  for (const key of keys) {
    const node = findNode(destItems.value, key);
    if (!node || node.loaded) continue;
    listing.value = true;
    try {
      node.children = await fetchChildren(node.path);
      node.loaded = true;
    } catch (e) {
      node.children = [];
      node.loaded = true;
      node.listError = listRefusal(e);
    } finally {
      listing.value = false;
    }
  }
}

watch(destOpened, loadOpened);

// Seeding the tree is several requests, so a close-and-reopen while they are in
// flight would otherwise let the first opening's answers land on the second
// one's tree.
let seedToken = 0;

// Opening is what seeds the tree: a menu that listed namespaces for every row it
// rendered would pay for answers nobody reads.
watch(open, async (isOpen) => {
  if (!isOpen) {
    seedToken++;
    return;
  }
  const token = ++seedToken;
  newName.value = props.name;
  moveError.value = null;
  blocker.value = null;
  destItems.value = [];
  destOpened.value = [];
  destActivated.value = [];
  listing.value = true;
  try {
    const roots = await fetchChildren([]);
    if (token !== seedToken) return;
    destItems.value = roots;
    // Open down to where it lives now, so a near-by destination needs no walking.
    const openKeys: string[] = [];
    for (let i = 0; i < currentNamespace.value.length; i++) {
      const path = currentNamespace.value.slice(0, i + 1);
      const node = findNode(destItems.value, path.join(SEP));
      if (!node) break;
      openKeys.push(node.key);
      node.loaded = true;
      try {
        const children = await fetchChildren(path);
        if (token !== seedToken) return;
        node.children = children;
      } catch (e) {
        if (token !== seedToken) return;
        node.children = [];
        node.listError = listRefusal(e);
        break;
      }
    }
    if (token !== seedToken) return;
    destOpened.value = openKeys;
  } catch (e: any) {
    if (token !== seedToken) return;
    blocker.value =
      e?.error?.message || e?.message || 'Could not load the namespaces of this warehouse.';
  } finally {
    if (token === seedToken) listing.value = false;
  }
});

const destinationNamespace = computed(() => selectedNode.value?.path ?? []);
const resultPath = computed(() =>
  destinationNamespace.value.length && newName.value.trim()
    ? [...destinationNamespace.value, newName.value.trim()].join('.')
    : '',
);

const validationMessage = computed(() => {
  if (sourceRight.value === false)
    return `You are not allowed to move this ${kindLabel.value} out of its namespace.`;
  if (!destActivated.value.length) return 'Pick a destination namespace.';
  if (!newName.value.trim()) return `The ${kindLabel.value} needs a name at the destination.`;
  const destKey = destinationNamespace.value.join(SEP);
  if (destKey === currentKey.value && newName.value.trim() === props.name)
    return 'That is the current location — nothing would change.';
  const right = destRight(selectedNode.value);
  if (right === false)
    return `You are not allowed to move a ${kindLabel.value} into "${destinationNamespace.value.join('.')}".`;
  if (right === undefined) return 'Checking whether you may move it here…';
  return null;
});

const canMove = computed(
  () => !validationMessage.value && !moving.value && sourceRight.value !== false,
);

async function confirmMove() {
  moving.value = true;
  moveError.value = null;
  const destination = [...destinationNamespace.value];
  const finalName = newName.value.trim();
  try {
    if (props.kind === 'generic-table') {
      // The generic-table wrapper already takes a destination namespace, so a
      // move needs no separate call there.
      await functions.renameGenericTable(
        props.warehouseId,
        props.namespacePath,
        props.name,
        destination.join(SEP),
        finalName,
        true,
      );
    } else if (props.kind === 'view') {
      await functions.moveView(
        props.warehouseId,
        props.namespacePath,
        props.name,
        destination,
        finalName,
        true,
      );
    } else {
      await functions.moveTable(
        props.warehouseId,
        props.namespacePath,
        props.name,
        destination,
        finalName,
        true,
      );
    }
    // Which names exist just changed at both ends.
    rights.forget();
    emit('moved', destination, finalName);
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
   needs min-height:0 — a flex item defaults to min-height:auto. */
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
