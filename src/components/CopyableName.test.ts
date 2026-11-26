import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CopyableName from './CopyableName.vue';

const copyToClipboard = vi.fn();

vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({ copyToClipboard }),
}));

// Vuetify is not installed here: the tooltip stub renders its activator so the
// button is reachable, and v-icon exposes the glyph it was given.
function mountName(name = 'sales.orders') {
  return mount(CopyableName, {
    props: { name },
    global: {
      stubs: {
        'v-tooltip': {
          props: ['text'],
          template: '<span :data-tooltip="text"><slot name="activator" :props="{}" /></span>',
        },
        'v-icon': { props: ['icon'], template: '<i :data-icon="icon" />' },
      },
    },
  });
}

describe('CopyableName', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    copyToClipboard.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the name as an accessible button', () => {
    const w = mountName();
    const btn = w.get('button');
    expect(btn.text()).toContain('sales.orders');
    expect(btn.attributes('type')).toBe('button');
    expect(btn.attributes('aria-label')).toBe('Copy name sales.orders');
    expect(w.get('[data-tooltip]').attributes('data-tooltip')).toBe('Copy name');
    expect(w.get('[data-icon]').attributes('data-icon')).toBe('mdi-content-copy');
  });

  it('copies through the shared helper and confirms briefly', async () => {
    const w = mountName();
    await w.get('button').trigger('click');

    expect(copyToClipboard).toHaveBeenCalledWith('sales.orders');
    expect(w.get('[data-icon]').attributes('data-icon')).toBe('mdi-check');
    expect(w.get('[data-tooltip]').attributes('data-tooltip')).toBe('Copied');

    await vi.advanceTimersByTimeAsync(1500);
    expect(w.get('[data-icon]').attributes('data-icon')).toBe('mdi-content-copy');
  });

  // Submitting inside a dialog form must not fire on a copy click.
  it('does not submit an enclosing form', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const w = mount(
      {
        components: { CopyableName },
        template: '<form @submit="onSubmit"><CopyableName name="x" /></form>',
        setup: () => ({ onSubmit }),
      },
      {
        global: {
          stubs: {
            'v-tooltip': { template: '<span><slot name="activator" :props="{}" /></span>' },
            'v-icon': true,
          },
        },
        attachTo: document.body,
      },
    );
    await w.get('button').trigger('click');
    expect(onSubmit).not.toHaveBeenCalled();
    w.unmount();
  });
});
