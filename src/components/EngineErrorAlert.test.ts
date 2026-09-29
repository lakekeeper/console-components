import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EngineErrorAlert from './EngineErrorAlert.vue';
import { ENGINE_NOTE } from '@/composables/loqe/queryError';

// Vuetify is not installed in this environment, so `v-alert` would render as an
// unresolved element and swallow its slots — the append slot included, which is
// where the CORS helper goes. A stub that renders both slots keeps the test about
// this component's decisions rather than Vuetify's markup.
function mountAlert(props: InstanceType<typeof EngineErrorAlert>['$props']) {
  return mount(EngineErrorAlert, {
    props,
    global: {
      stubs: {
        CorsConfigDialog: { template: '<div class="cors-stub" />' },
        'v-alert': { template: '<div><slot /><slot name="append" /></div>' },
      },
    },
  });
}

const DIAGNOSED = `Lakekeeper refused this statement: 403 Forbidden.${ENGINE_NOTE}Invalid Configuration Error: returned a non-200 status code (Forbidden_403)`;

describe('EngineErrorAlert', () => {
  it('attributes a marked message to DuckDB and keeps its raw line', () => {
    const w = mountAlert({ error: DIAGNOSED, title: 'Query Error' });

    expect(w.text()).toContain('Query Error — reported by DuckDB');
    expect(w.text()).toContain('403 Forbidden');
    expect(w.text()).toContain('Forbidden_403');
  });

  // A reachability verdict or a permission answer of ours carries no marker, and
  // putting DuckDB's name on it would blame the engine for our own conclusion.
  it('leaves an unmarked message unattributed', () => {
    const w = mountAlert({
      error: 'You do not have permission to read this table’s data.',
      title: 'Failed to load preview',
    });

    expect(w.text()).toContain('Failed to load preview');
    expect(w.text()).not.toContain('DuckDB');
  });

  it('attributes without a title too, so the alert never loses it', () => {
    const w = mountAlert({ error: DIAGNOSED });

    expect(w.text()).toContain('Reported by DuckDB');
  });

  // The offer follows our verdict, not DuckDB's prose: the engine says "might be
  // potentially a CORS error" about every failed download.
  it('offers the CORS helper only when our explanation reached that conclusion', () => {
    const ours = mountAlert({
      error: `The bucket most likely has no CORS rule allowing this origin.${ENGINE_NOTE}Full download failed`,
    });
    const theirs = mountAlert({
      error: `Lakekeeper refused this statement: 403 Forbidden.${ENGINE_NOTE}404 (might be potentially a CORS error)`,
    });

    expect(ours.find('.cors-stub').exists()).toBe(true);
    expect(theirs.find('.cors-stub').exists()).toBe(false);
  });

  it('renders nothing without an error', () => {
    expect(mountAlert({ error: null }).text()).toBe('');
  });
});
