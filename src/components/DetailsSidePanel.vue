<template>
  <!-- The frame of a details column beside a list: it folds by width (never
       unmounts, DESIGN.md "Folding"), resizes from its left edge, remembers the
       width per `storageKey`, and lies over the list where there is no room
       for both. The content — header, body, actions — is the host's. -->
  <div
    ref="frameRef"
    class="dsp"
    :class="{
      'dsp--out': !open,
      'dsp--dragging': dragging,
      'dsp--overlay': overlay,
    }"
    :style="{ width: open ? `${shownWidth}px` : '0px' }"
    :aria-hidden="!open">
    <div
      v-if="!overlay"
      class="dsp-grip"
      title="Drag to resize · double-click for half width"
      @pointerdown="startDrag"
      @dblclick="toggleHalf"></div>
    <div class="dsp-inner" :style="{ width: `${shownWidth}px` }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Where the chosen width is remembered, per viewer; omit to not remember. */
    storageKey?: string;
    defaultWidth?: number;
    minWidth?: number;
    /** The list beside it keeps at least this much. */
    listMinWidth?: number;
    /** Below this host width the panel lies over the list instead of beside it. */
    overlayBelow?: number;
  }>(),
  {
    storageKey: undefined,
    defaultWidth: 420,
    minWidth: 300,
    listMinWidth: 360,
    overlayBelow: 900,
  },
);

const frameRef = ref<HTMLElement | null>(null);
const hostWidth = ref(0);
const dragging = ref(false);

function stored(): number {
  if (!props.storageKey) return props.defaultWidth;
  try {
    const v = Number(localStorage.getItem(props.storageKey));
    return Number.isFinite(v) && v >= props.minWidth ? v : props.defaultWidth;
  } catch {
    return props.defaultWidth;
  }
}
const width = ref(stored());

const overlay = computed(() => hostWidth.value > 0 && hostWidth.value < props.overlayBelow);

function clamp(w: number): number {
  const room = (hostWidth.value || 1200) - props.listMinWidth;
  return Math.round(Math.max(props.minWidth, Math.min(w, Math.max(props.minWidth, room))));
}

/** In overlay it takes what it needs up to the host; beside, what it was given. */
const shownWidth = computed(() =>
  overlay.value ? Math.min(props.defaultWidth, hostWidth.value) : clamp(width.value),
);

function keep() {
  if (!props.storageKey) return;
  try {
    localStorage.setItem(props.storageKey, String(width.value));
  } catch {
    // Private window or blocked storage: the width just isn't remembered.
  }
}

function startDrag(e: PointerEvent) {
  const grip = e.currentTarget as HTMLElement;
  grip.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = shownWidth.value;
  dragging.value = true;
  const move = (ev: PointerEvent) => {
    width.value = clamp(startW + (startX - ev.clientX));
  };
  const up = () => {
    dragging.value = false;
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', up);
    grip.removeEventListener('pointercancel', up);
    keep();
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', up);
  grip.addEventListener('pointercancel', up);
}

function toggleHalf() {
  const half = clamp(hostWidth.value / 2);
  width.value = Math.abs(shownWidth.value - half) < 8 ? props.defaultWidth : half;
  keep();
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  const host = frameRef.value?.parentElement;
  if (!host) return;
  hostWidth.value = host.clientWidth;
  observer = new ResizeObserver(() => (hostWidth.value = host.clientWidth));
  observer.observe(host);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.dsp {
  position: relative;
  flex: none;
  min-height: 0;
  overflow: hidden;
  border-left: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  transition: width 0.2s ease;
}

.dsp--out {
  border-left-width: 0;
}

/* The edge follows the pointer, not a transition. */
.dsp--dragging {
  transition: none;
  user-select: none;
}

/* No room for both: over the list, from the right edge of the host. */
.dsp--overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.25);
}
.dsp--overlay.dsp--out {
  box-shadow: none;
}

.dsp-inner {
  height: 100%;
  min-height: 0;
}

.dsp-grip {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  z-index: 1;
  cursor: col-resize;
  touch-action: none;
}
.dsp-grip:hover,
.dsp--dragging .dsp-grip {
  background: rgba(var(--v-theme-primary), 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .dsp {
    transition: none;
  }
}
</style>
