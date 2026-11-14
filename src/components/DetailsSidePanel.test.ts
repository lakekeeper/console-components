import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import DetailsSidePanel from './DetailsSidePanel.vue';

beforeAll(() => {
  // jsdom has no ResizeObserver; the panel only uses it to follow the host's width.
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    disconnect() {}
  };
  // Nor the `inert` property every current browser has. Without it Vue writes the
  // attribute as the string "false", which no browser would see; define it the
  // way browsers do (reflecting the attribute's presence) so the test sees what
  // they get.
  if (!('inert' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'inert', {
      get(this: HTMLElement) {
        return this.hasAttribute('inert');
      },
      set(this: HTMLElement, on: boolean) {
        this.toggleAttribute('inert', !!on);
      },
      configurable: true,
    });
  }
});

/** A host with an opener button and the panel holding one focusable control. */
function mountHost() {
  const open = ref(false);
  const Host = defineComponent({
    setup: () => () =>
      h('div', [
        h('button', { id: 'opener', onClick: () => (open.value = true) }, 'Details'),
        h(DetailsSidePanel, { open: open.value }, () =>
          h('button', { id: 'inside', onClick: () => (open.value = false) }, 'Close'),
        ),
      ]),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, open };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DetailsSidePanel', () => {
  it('is inert and hidden from assistive tech while folded, and neither when open', async () => {
    const { wrapper, open } = mountHost();
    const frame = wrapper.find('.dsp');

    expect(frame.attributes('aria-hidden')).toBe('true');
    expect((frame.element as HTMLElement).inert).toBe(true);

    open.value = true;
    await nextTick();
    expect(frame.attributes('aria-hidden')).toBe('false');
    expect((frame.element as HTMLElement).inert).toBe(false);
    expect(frame.attributes()).not.toHaveProperty('inert');
  });

  // Folded, the panel is inert: focus left inside it would be lost to the body.
  it('hands focus back to its opener when it folds with focus inside', async () => {
    const { wrapper, open } = mountHost();
    const opener = wrapper.find('#opener').element as HTMLButtonElement;
    const inside = wrapper.find('#inside').element as HTMLButtonElement;

    opener.focus();
    open.value = true;
    await nextTick();
    inside.focus();
    expect(document.activeElement).toBe(inside);

    open.value = false;
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus alone when it folds with focus elsewhere', async () => {
    const { wrapper, open } = mountHost();
    const outside = document.createElement('input');
    document.body.appendChild(outside);

    (wrapper.find('#opener').element as HTMLButtonElement).focus();
    open.value = true;
    await nextTick();
    outside.focus();

    open.value = false;
    await nextTick();
    expect(document.activeElement).toBe(outside);
  });
});
