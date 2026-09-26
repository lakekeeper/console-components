import { onMounted, onUnmounted, ref } from 'vue';

/**
 * How tall a pane may be where it actually sits.
 *
 * Panes that fill the rest of the screen used to carry a formula each —
 * `calc(100vh - 240px)`, `- 292px`, `- 340px`, `- 420px` — every one of them a
 * belief about how much chrome sat above that particular pane in that
 * particular host. A wrong belief makes the pane taller than the space it has,
 * and because the shell pins `body` with `overflow: hidden`, nothing scrolls to
 * reveal what spills: the footer simply goes off the bottom of the screen.
 *
 * Two edges decide the answer, and only two:
 *
 * - **The top** is the pane's own `getBoundingClientRect().top`, which already
 *   accounts for every bit of chrome above it — app bar, tabs, headers — with
 *   no formula needed.
 *
 * - **The bottom** is the viewport, less the app footer. That footer is
 *   `<v-footer app>`, which Vuetify reserves space for by padding `v-main`
 *   rather than by bounding it — so `v-main` is as tall as whatever is inside
 *   it, and measuring against it, as an earlier version of this did, reports
 *   the overflow back as if it were room.
 *
 * Nothing else is consulted, and in particular no ancestor's measured box. A
 * `max-height` caps a container without fixing its height, so such a box is as
 * tall as whatever is inside it — which is this pane. Clamping to one made the
 * pane shrink the container, which shrank the pane, until it hit its floor and
 * sat in the top corner of an empty screen.
 */
/**
 * How much air to leave under a pane, above the app footer.
 *
 * One number for every pane, because panes ending on different lines across
 * three tabs is what sent this round-tripping in the first place. Raise it if a
 * pane overshoots and the page grows a scrollbar; there is nothing else to
 * tune.
 */
const DEFAULT_GAP = 24;

export function measurePaneHeight(target: unknown, min = 320, gap = DEFAULT_GAP): string | null {
  // A `ref` on a Vuetify component hands back the component, not the element;
  // measuring the instance throws during mount and takes the pane down with it.
  const el = ((target as any)?.$el ?? target) as HTMLElement | null;
  if (!el?.getBoundingClientRect || typeof window === 'undefined') return null;

  const rect = el.getBoundingClientRect();

  // An element inside a tab that is not showing has no box at all — every
  // measurement reads zero. Taking that at face value put the pane's top at the
  // very top of the screen and made it a whole viewport tall, which is what it
  // then stayed at once the tab was opened. No answer is better than that one:
  // callers keep what they had and measure again when the pane is laid out.
  if (!el.offsetParent && rect.height === 0) return null;

  const footer = appFooterHeight();
  const bottom = window.innerHeight - footer;
  const height = Math.max(min, Math.round(bottom - rect.top - gap));

  return `${height}px`;
}

/**
 * Keeps a pane's height right for as long as it is mounted.
 *
 * Measuring once on mount is not enough: these panes are built inside tab
 * windows that are not showing, so the first measurement happens when the
 * element has no box. The observer is what catches the moment it gains one —
 * and the window listener catches the rest.
 *
 * It watches the parent rather than the pane itself, because the pane's size is
 * what this sets: observing it would be watching for its own echo.
 */
export function usePaneHeight(min = 320, gap = DEFAULT_GAP) {
  const paneRef = ref<any>(null);
  const paneHeight = ref<string | null>(null);
  let observer: ResizeObserver | null = null;
  let visibility: IntersectionObserver | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function measure() {
    const next = measurePaneHeight(paneRef.value, min, gap);
    if (next) paneHeight.value = next;
  }

  /**
   * Measure now, and again after the animation that is probably running.
   *
   * This is the one that mattered. `v-tabs-window` animates its items, and a
   * pane measured while its item is still sliding is measured where it was
   * passing through — short if it is coming up from below, tall if it is on its
   * way down. Whichever it caught, it kept: the visibility trigger fires once
   * and nothing measured again, which is exactly how two panes built from the
   * same code ended one above the footer and the other below it.
   *
   * The last measurement wins, so the only requirement is that one of these
   * lands after the transition has settled. Vuetify's window transition is
   * 300ms by default; 600 covers a slow frame, and re-measuring a pane that was
   * already right costs a `getBoundingClientRect`.
   */
  function scheduleMeasure() {
    measure();
    requestAnimationFrame(measure);
    for (const delay of [120, 350, 650]) timers.push(setTimeout(measure, delay));
  }

  onMounted(() => {
    scheduleMeasure();
    window.addEventListener('resize', measure);

    const el = ((paneRef.value as any)?.$el ?? paneRef.value) as HTMLElement | null;
    if (!el) return;

    // Three triggers, because one measurement is never enough and the formula
    // was never the problem:
    //
    //   mount + a frame — the ordinary case, where the pane is already showing;
    //   resize          — the window changes and every pane is wrong at once;
    //   visibility      — a pane built inside a tab that is not showing has no
    //                     box, so its first measurement is refused and it keeps
    //                     a fallback until this fires.
    //
    // The third is what made panes disagree: whichever ones happened to mount
    // visible looked right, and the rest kept a constant nobody had revisited.
    if (typeof ResizeObserver !== 'undefined' && el.parentElement) {
      // The parent, not the pane: the pane's size is what this sets, so
      // observing it would be watching for its own echo.
      observer = new ResizeObserver(measure);
      observer.observe(el.parentElement);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      visibility = new IntersectionObserver((entries) => {
        // Not a bare `measure()`: this fires at the *start* of the transition
        // that reveals the pane, which is the worst possible instant to read a
        // position from.
        if (entries.some((entry) => entry.isIntersecting)) scheduleMeasure();
      });
      visibility.observe(el);
    }
  });

  onUnmounted(() => {
    window.removeEventListener('resize', measure);
    observer?.disconnect();
    visibility?.disconnect();
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  });

  return { paneRef, paneHeight, measurePane: measure };
}

/**
 * The app footer's reserved height, or nothing when there is no footer.
 *
 * `offsetHeight` rather than a rect: an `app` footer is positioned by the
 * layout, so its rect moves when the content above it overflows, while the
 * space it reserves does not.
 */
function appFooterHeight(): number {
  const footer = document.querySelector<HTMLElement>('.v-footer');
  return footer?.offsetHeight ?? 0;
}
