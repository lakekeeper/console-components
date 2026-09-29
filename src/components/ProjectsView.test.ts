import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsView from './ProjectsView.vue';

const PROJECTS = [
  { 'project-id': '00000000-0000-0000-0000-000000000001', 'project-name': 'Default Project' },
  { 'project-id': 'aa11bb22-0000-0000-0000-0000000000ff', 'project-name': 'Analytics' },
];

/** Per-test answers, so a refusal can be arranged without remocking. */
const api = {
  loadProjectList: vi.fn(),
  getProject: vi.fn(),
};

/** The selection the console is reading, as mutable as the real store is. */
const selected: Record<string, string> = { ...PROJECTS[0] };

vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({
    loadProjectList: (...args: unknown[]) => api.loadProjectList(...args),
    getProject: (...args: unknown[]) => api.getProject(...args),
    getProjectCatalogActionsFor: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

vi.mock('../stores/visual', () => ({
  useVisualStore: () => ({
    projectSelected: selected,
    getServerInfo: () => ({ 'server-id': 'server' }),
    setProjectSelected: (p: Record<string, string>) => Object.assign(selected, p),
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

beforeEach(() => {
  vi.clearAllMocks();
  api.loadProjectList.mockResolvedValue(PROJECTS);
  api.getProject.mockRejectedValue(new Error('not asked'));
  Object.assign(selected, PROJECTS[0]);
});

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

describe('ProjectsView with the listing refused', () => {
  /** What an authorizer returns to a reader granted a single project. */
  const forbidden = { error: { code: 403, message: 'not permitted to list projects' } };

  it('names the one project the reader is in when nothing was selected yet', async () => {
    api.loadProjectList.mockRejectedValue(forbidden);
    api.getProject.mockResolvedValue(PROJECTS[1]);
    Object.assign(selected, { 'project-id': '', 'project-name': '' });

    const wrapper = await mountView();
    await nextTick();

    expect(api.getProject).toHaveBeenCalled();
    expect(filtered(wrapper).map((p) => p['project-name'])).toEqual(['Analytics']);
  });

  it('keeps the selection it already has rather than re-asking', async () => {
    api.loadProjectList.mockRejectedValue(forbidden);

    const wrapper = await mountView();
    await nextTick();

    expect(api.getProject).not.toHaveBeenCalled();
    expect(filtered(wrapper).map((p) => p['project-name'])).toEqual(['Default Project']);
  });

  // Refused this too: the project is not one this reader may read by name.
  it('shows nothing rather than a guess when the project cannot be named', async () => {
    api.loadProjectList.mockRejectedValue(forbidden);
    api.getProject.mockRejectedValue(forbidden);
    Object.assign(selected, { 'project-id': '', 'project-name': '' });

    const wrapper = await mountView();
    await nextTick();

    expect(filtered(wrapper)).toHaveLength(0);
  });
});
