import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrincipalSearch from './PrincipalSearch.vue';

/** Per-test answers, so a refusal or a failure can be arranged without remocking. */
const api = vi.hoisted(() => ({
  getProjectCatalogActionsFor: vi.fn(),
}));

vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({
    getProjectCatalogActionsFor: (...a: unknown[]) => api.getProjectCatalogActionsFor(...a),
    loadProjectList: vi.fn().mockResolvedValue([]),
    searchUser: vi.fn().mockResolvedValue([]),
    searchRole: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../stores/visual', () => ({
  useVisualStore: () => ({
    projectSelected: { 'project-id': 'p1', 'project-name': 'Default Project' },
    projectList: [],
  }),
}));

// Vuetify is not installed in this environment, so its components would swallow
// their content. The toggle stub renders its buttons and turns a click into the
// toggle's own event; the alert stub renders its text; the search fields mark
// where they are.
const stubs = {
  'v-autocomplete': { template: '<div class="principal-autocomplete" />' },
  'v-text-field': { template: '<div class="principal-id-field" />' },
  'v-btn-toggle': {
    emits: ['update:model-value'],
    template:
      '<div class="type-toggle" @click="$emit(\'update:model-value\', $event.target.dataset.value)"><slot /></div>',
  },
  'v-btn': { props: ['value'], template: '<button :data-value="value"><slot /></button>' },
  'v-alert': { props: ['text'], template: '<div class="alert">{{ text }}<slot /></div>' },
};

function mountSearch(props: Record<string, unknown> = {}) {
  return mount(PrincipalSearch, {
    props: { modelValue: null, ...props },
    global: { stubs },
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function chooseRoles(wrapper: ReturnType<typeof mountSearch>) {
  await wrapper.find('button[data-value="role"]').trigger('click');
  await flush();
  await nextTick();
}

beforeEach(() => {
  api.getProjectCatalogActionsFor.mockReset().mockResolvedValue([{ action: 'search_roles' }]);
});

describe('PrincipalSearch users-only', () => {
  it('offers both kinds by default', () => {
    const wrapper = mountSearch();
    expect(wrapper.find('.type-toggle').exists()).toBe(true);
    expect(wrapper.find('button[data-value="role"]').exists()).toBe(true);
  });

  it('offers no role choice when the target takes users only', () => {
    const wrapper = mountSearch({ usersOnly: true });
    expect(wrapper.find('.type-toggle').exists()).toBe(false);
    expect(wrapper.find('button[data-value="role"]').exists()).toBe(false);
  });

  it('drops a picked role when switched to users only', async () => {
    const wrapper = mountSearch({ lockProjectId: 'p1' });
    await chooseRoles(wrapper);
    const role = { id: 'r1', title: 'Analysts', type: 'role' as const, projectId: 'p1' };
    await wrapper.setProps({ modelValue: role });
    const before = wrapper.emitted('update:modelValue')?.length ?? 0;

    await wrapper.setProps({ usersOnly: true });
    await nextTick();

    // The switch itself clears the pick: one more emission, and it is null.
    const emitted = wrapper.emitted('update:modelValue') ?? [];
    expect(emitted).toHaveLength(before + 1);
    expect(emitted.at(-1)).toEqual([null]);
    expect(wrapper.find('.type-toggle').exists()).toBe(false);
  });
});

describe('PrincipalSearch role-search check', () => {
  it('says a refusal is a refusal', async () => {
    api.getProjectCatalogActionsFor.mockRejectedValue({
      error: { code: 403, type: 'ProjectActionForbidden', message: 'Forbidden' },
    });
    const wrapper = mountSearch({ lockProjectId: 'p1' });
    await chooseRoles(wrapper);

    expect(wrapper.text()).toContain('You are not allowed to search roles here.');
  });

  // An authorizer failure says nothing about the caller's rights.
  it('reports a failed check as a failure, not as a missing permission', async () => {
    api.getProjectCatalogActionsFor.mockRejectedValue({
      error: {
        code: 500,
        type: 'AuthorizationInternalError',
        message: 'Authorization failed due to an internal error',
      },
    });
    const wrapper = mountSearch({ lockProjectId: 'p1' });
    await chooseRoles(wrapper);

    expect(wrapper.text()).not.toContain('not allowed');
    expect(wrapper.text()).toContain('Could not check whether you may search roles here:');
    expect(wrapper.text()).toMatch(/server-side error, not a missing permission/);
  });

  // With nowhere to search, a live search box could only answer "No roles found".
  it('offers a retry in place of the search after a failed check', async () => {
    api.getProjectCatalogActionsFor.mockRejectedValueOnce(new Error('Failed to fetch'));
    const wrapper = mountSearch({ lockProjectId: 'p1' });
    await chooseRoles(wrapper);

    expect(wrapper.find('.principal-autocomplete').exists()).toBe(false);
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Retry');
    expect(retry).toBeDefined();

    await retry!.trigger('click');
    await flush();
    await nextTick();

    expect(api.getProjectCatalogActionsFor).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.principal-autocomplete').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Could not check');
  });

  it('asks again on the next switch to roles after a failed check', async () => {
    api.getProjectCatalogActionsFor.mockRejectedValueOnce(new Error('Failed to fetch'));
    const wrapper = mountSearch({ lockProjectId: 'p1' });
    await chooseRoles(wrapper);
    await wrapper.find('button[data-value="user"]').trigger('click');
    await chooseRoles(wrapper);

    expect(api.getProjectCatalogActionsFor).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain('Could not check');
    expect(wrapper.text()).not.toContain('not allowed');
  });
});
