import { computed } from 'vue';
import { useVisualStore } from '@/stores/visual';

export type PinnedObjectType = 'warehouse' | 'namespace' | 'table' | 'view' | 'generic-table';

/** One pin. Stored per browser in the visual store, shared by both trees. */
export interface PinnedObject {
  projectId: string;
  warehouseId: string;
  /** The name when pinned; prefer the live name where the caller has it. */
  warehouseName: string;
  /** Dotted namespace path; empty for a warehouse pin. */
  namespaceId: string;
  name: string;
  type: PinnedObjectType;
  /** Generic tables: their format, so the pin can wear the right mark. */
  format?: string;
}

/** What identifies a pin; anything with these fields can be looked up. */
export interface PinTarget {
  type: string;
  warehouseId: string;
  namespaceId?: string;
  name: string;
}

export function pinKey(p: PinTarget): string {
  return `${p.type}:${p.warehouseId}:${p.namespaceId ?? ''}:${p.name}`;
}

const PINNABLE: PinnedObjectType[] = ['warehouse', 'namespace', 'table', 'view', 'generic-table'];

/**
 * The current project's pins, as one tree should see them.
 *
 * `warehouseFilter` narrows the list to the warehouse a tree is showing, the
 * way the tree itself is narrowed. `types` drops what a tree cannot show — LoQE
 * has no generic tables.
 */
export function usePinnedObjects(opts: {
  warehouseFilter?: () => string | null | undefined;
  types?: PinnedObjectType[];
}) {
  const visual = useVisualStore();
  const projectId = computed(() => visual.projectSelected['project-id']);
  const types = opts.types ?? PINNABLE;

  const pins = computed(() => {
    const wh = opts.warehouseFilter?.();
    return (visual.pinnedObjects ?? []).filter(
      (p) =>
        p.projectId === projectId.value && types.includes(p.type) && (!wh || p.warehouseId === wh),
    );
  });

  const pinnedKeys = computed(() => new Set(pins.value.map(pinKey)));

  function isPinned(target: PinTarget): boolean {
    return pinnedKeys.value.has(pinKey(target));
  }

  function unpin(target: PinTarget) {
    const key = pinKey(target);
    visual.pinnedObjects = (visual.pinnedObjects ?? []).filter(
      (p) => !(p.projectId === projectId.value && pinKey(p) === key),
    );
  }

  function togglePin(target: PinTarget & { warehouseName?: string; format?: string }) {
    const type = target.type as PinnedObjectType;
    if (!PINNABLE.includes(type)) return;
    if (type !== 'warehouse' && !target.namespaceId) return;
    if (isPinned(target)) {
      unpin(target);
      return;
    }
    visual.pinnedObjects = [
      ...(visual.pinnedObjects ?? []),
      {
        projectId: projectId.value,
        warehouseId: target.warehouseId,
        warehouseName: target.warehouseName ?? '',
        namespaceId: target.namespaceId ?? '',
        name: target.name,
        type,
        ...(target.format ? { format: target.format } : {}),
      },
    ];
  }

  const collapsed = computed({
    get: () => visual.pinnedCollapsed,
    set: (v: boolean) => (visual.pinnedCollapsed = v),
  });

  return { pins, isPinned, togglePin, unpin, collapsed };
}
