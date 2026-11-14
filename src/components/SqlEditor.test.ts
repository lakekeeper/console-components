import { mount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createVuetify } from 'vuetify';
import SqlEditor from './SqlEditor.vue';

// jsdom lays nothing out; CodeMirror only asks for these while measuring.
beforeAll(() => {
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  (Range.prototype as any).getBoundingClientRect ??= rect;
  (Range.prototype as any).getClientRects ??= () => ({ length: 0, item: () => null });
  (document as any).elementFromPoint ??= () => null;
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(SqlEditor, {
    props: { modelValue: 'select a, b from t where a = 1', ...props },
    global: { plugins: [createVuetify()] },
    attachTo: document.body,
  });
  // The view is built in an async onMounted.
  for (let i = 0; i < 20 && !wrapper.find('.cm-content').exists(); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const content = wrapper.find('.cm-content').element as HTMLElement;
  content.focus();
  return { wrapper, content };
}

/** A keydown as the browser sends it; `code` is the physical key. */
function press(
  target: HTMLElement,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; code?: string } = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: mods.code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: !!mods.meta,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

// jsdom reports no platform, so CodeMirror's Mod is Ctrl here — the Windows and
// Linux binding. The Mac one (⌘) is the same keymap entry.
describe('SqlEditor keyboard', () => {
  it('Ctrl+Enter asks to run, Shift+Ctrl+Enter to run the statement', async () => {
    const { wrapper, content } = await mountEditor();

    press(content, 'Enter', { ctrl: true });
    expect(wrapper.emitted('run')).toHaveLength(1);

    press(content, 'Enter', { ctrl: true, shift: true });
    expect(wrapper.emitted('runStatement')).toHaveLength(1);
  });

  it('Esc cancels only while a query runs, and is left to others otherwise', async () => {
    const { wrapper, content } = await mountEditor();

    const idle = press(content, 'Escape');
    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(idle.defaultPrevented, 'an idle Esc stays free for dialogs and menus').toBe(false);

    await wrapper.setProps({ running: true });
    press(content, 'Escape');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  // ⌥ combinations on a Mac type a character (⇧⌥F is "Ï"), so the binding is on
  // the physical key: the key value here is what macOS sends.
  it('Shift+Alt+F formats, matched on the physical F key', async () => {
    const { wrapper, content } = await mountEditor();

    const event = press(content, 'Ï', { shift: true, alt: true, code: 'KeyF' });
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    const formatted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as string;
    expect(formatted).toMatch(/^SELECT\n\s+a,\n\s+b\nFROM\n\s+t\nWHERE\n\s+a = 1$/);
  });

  it('does not format a read-only editor', async () => {
    const { wrapper, content } = await mountEditor({ readonly: true });
    const event = press(content, 'Ï', { shift: true, alt: true, code: 'KeyF' });
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  // VAK-663: Tab indented the line instead of taking the open suggestion.
  it('Tab accepts the open suggestion, and indents when none is open', async () => {
    const { wrapper, content } = await mountEditor({ modelValue: 'SEL' });
    (wrapper.vm as any).setSelection(3, 3);

    press(content, ' ', { ctrl: true, code: 'Space' });
    for (let i = 0; i < 50 && !document.querySelector('.cm-tooltip-autocomplete'); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(
      document.querySelector('.cm-tooltip-autocomplete'),
      'no suggestion list opened',
    ).not.toBeNull();
    // CodeMirror ignores an accept within `interactionDelay` (75 ms) of the list
    // opening, so a key already on its way does not pick something unseen.
    await new Promise((r) => setTimeout(r, 120));

    press(content, 'Tab', { code: 'Tab' });
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('SELECT');

    // No list now: Tab indents the line, as in any code editor.
    press(content, 'Tab', { code: 'Tab' });
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('  SELECT');
  });
});
