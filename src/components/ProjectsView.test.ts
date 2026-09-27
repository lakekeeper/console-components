import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView from './ProjectsView.vue';

const PROJECTS = [
  { 'project-id': '00000000-0000-0000-0000-000000000001', 'project-name': 'Default Project' },
  { 'project-id': 'aa11bb22-0000-0000-0000-0000000000ff', 'project-name': 'Analytics' },
];

vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({
    loadProjectList: vi.fn().mockResolvedValue(PROJECTS),
    getProjectCatalogActionsFor: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

vi.mock('../stores/visual', () => ({
  useVisualStore: () => ({
    projectSelected: PROJECTS[0],
    getServerInfo: () => ({ 'server-id': 'server' }),
    setProjectSelected: vi.fn(),
  }),
}));

vi.mock('../composables/useCatalogPermissions', () => ({
  useServerPermissions: () => ({ canCreateProject: ref(false) }),
}));

vi.mock('../common/paneHeight', () => ({
  usePaneHeight: () => ({ paneRef: ref(null), paneHeight: ref('400px') }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

async function mountView() {
  const wrapper = mount(ProjectsView, {
    global: {
      stubs: {
        ProjectNameAddOrEditDialog: true,
        DeleteConfirmDialog: true,
      },
      directives: { intersect: {} },
    },
  });
  await nextTick();
  await nextTick();
  return wrapper;
}

/** The filter's result, read out of `<script setup>` state. */
function filtered(wrapper: any): Array<{ 'project-name': string }> {
  return wrapper.vm.$.setupState.filteredProjects;
}

function setQuery(wrapper: any, query: string | null) {
  wrapper.vm.$.setupState.searchQuery = query;
}

describe('ProjectsView filter', () => {
  it('matches on the project name, not only the id', async () => {
    const wrapper = await mountView();
    expect(filtered(wrapper)).toHaveLength(2);

    setQuery(wrapper, 'analy');
    await nextTick();
    expect(filtered(wrapper).map((p) => p['project-name'])).toEqual(['Analytics']);
  });

  it('ignores case and surrounding spaces in the name', async () => {
    const wrapper = await mountView();

    setQuery(wrapper, '  DEFAULT ');
    await nextTick();
    expect(filtered(wrapper).map((p) => p['project-name'])).toEqual(['Default Project']);
  });

  it('still matches on the id', async () => {
    const wrapper = await mountView();

    setQuery(wrapper, 'aa11bb22');
    await nextTick();
    expect(filtered(wrapper).map((p) => p['project-name'])).toEqual(['Analytics']);
  });

  // `clearable` hands back null rather than an empty string, which is the one
  // input the filter sees that is not a string at all.
  it('shows everything again when cleared', async () => {
    const wrapper = await mountView();

    setQuery(wrapper, 'analy');
    await nextTick();
    expect(filtered(wrapper)).toHaveLength(1);

    setQuery(wrapper, null);
    await nextTick();
    expect(filtered(wrapper)).toHaveLength(2);
  });
});
