import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrantAssignDialog from './GrantAssignDialog.vue';

const serverInfo: Record<string, string> = { 'authz-backend': 'cedar' };

vi.mock('../stores/visual', () => ({
  useVisualStore: () => ({ getServerInfo: () => serverInfo }),
}));

vi.mock('../plugins/functions', () => ({ useFunctions: () => ({}) }));

// The search is stubbed: this file is about which principals the dialog asks it
// for, not about searching.
const PrincipalSearchStub = {
  name: 'PrincipalSearch',
  props: ['modelValue', 'lockProjectId', 'usersOnly'],
  template: '<div class="principal-search-stub" />',
};

// Vuetify is not installed in this environment, so its wrappers would swallow
// their slots. Pass-through stubs keep the dialog body rendered.
const passThrough = { template: '<div><slot /></div>' };

function mountDialog(resourceType: string) {
  return mount(GrantAssignDialog, {
    props: {
      modelValue: true,
      privileges: [],
      resourceType,
      projectId: resourceType === 'server' ? undefined : 'p1',
      principal: null,
      heldFor: () => [],
    },
    global: {
      stubs: {
        PrincipalSearch: PrincipalSearchStub,
        'v-dialog': passThrough,
        'v-card': passThrough,
        'v-card-title': passThrough,
        'v-card-text': passThrough,
        'v-card-actions': passThrough,
      },
    },
  });
}

function usersOnly(wrapper: ReturnType<typeof mountDialog>): boolean {
  return wrapper.findComponent(PrincipalSearchStub).props('usersOnly');
}

beforeEach(() => {
  serverInfo['authz-backend'] = 'cedar';
});

describe('GrantAssignDialog principal kinds', () => {
  it('offers users only for a server grant where grants are stored in the catalog', () => {
    const wrapper = mountDialog('server');
    expect(usersOnly(wrapper)).toBe(true);
    expect(wrapper.text()).toContain('Server privileges go to users only.');
    expect(wrapper.text()).toContain('Search for a user to grant privileges to.');
  });

  it('offers users only for a server grant under allow-all as well', () => {
    serverInfo['authz-backend'] = 'allow-all';
    expect(usersOnly(mountDialog('server'))).toBe(true);
  });

  it('offers roles for a server grant where the authorizer keeps its own grants', () => {
    serverInfo['authz-backend'] = 'openfga';
    const wrapper = mountDialog('server');
    expect(usersOnly(wrapper)).toBe(false);
    expect(wrapper.text()).not.toContain('Server privileges go to users only.');
  });

  it('offers roles below the server on every authorizer', () => {
    for (const backend of ['cedar', 'openfga', 'allow-all']) {
      serverInfo['authz-backend'] = backend;
      for (const type of ['project', 'warehouse', 'namespace', 'table']) {
        expect(usersOnly(mountDialog(type))).toBe(false);
      }
    }
  });
});
