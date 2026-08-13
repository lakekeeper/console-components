import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { TableMetadata } from '../gen/iceberg/types.gen';
import TableColumnProfiler from './TableColumnProfiler.vue';

vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({
    copyToClipboard: vi.fn(),
    listTableColumnTags: vi.fn(),
  }),
}));

vi.mock('../composables/useLoQE', () => ({
  useLoQE: () => ({}),
}));

vi.mock('../stores/user', () => ({
  useUserStore: () => ({ user: { access_token: '' } }),
}));

vi.mock('../stores/visual', () => ({
  useVisualStore: () => ({ themeLight: true, tagsRefresh: 0 }),
}));

vi.mock('../stores/loqe', () => ({
  useLoQEStore: () => ({
    clearTableProfiles: vi.fn(),
    getTableProfiles: () => ({}),
  }),
}));

describe('TableColumnProfiler', () => {
  it('shows field documentation from the current schema for top-level and nested fields', async () => {
    const metadata = {
      'current-schema-id': 2,
      schemas: [
        {
          'schema-id': 1,
          type: 'struct',
          fields: [{ id: 1, name: 'legacy', type: 'string', required: false, doc: 'Legacy field' }],
        },
        {
          'schema-id': 2,
          type: 'struct',
          fields: [
            {
              id: 2,
              name: 'customer',
              required: true,
              doc: 'Current customer record',
              type: {
                type: 'struct',
                fields: [
                  {
                    id: 3,
                    name: 'email',
                    type: 'string',
                    required: false,
                    doc: 'Primary contact address',
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as TableMetadata;

    const wrapper = mount(TableColumnProfiler, {
      props: { metadata },
      global: {
        stubs: {
          'v-alert': { template: '<div><slot /></div>' },
          'v-btn': {
            props: ['icon'],
            emits: ['click'],
            template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
          },
          'v-btn-toggle': { template: '<div><slot /></div>' },
          'v-card': { template: '<div><slot /></div>' },
          'v-card-text': { template: '<div><slot /></div>' },
          'v-card-title': { template: '<div><slot /></div>' },
          'v-chip': { template: '<span><slot /></span>' },
          'v-dialog': { template: '<div><slot /></div>' },
          'v-divider': { template: '<div />' },
          'v-icon': { template: '<span><slot /></span>' },
          'v-progress-circular': { template: '<span />' },
          'v-select': { template: '<div />' },
          'v-spacer': { template: '<span />' },
          'v-table': { template: '<div><slot /></div>' },
          'v-tooltip': { template: '<div><slot /></div>' },
        },
      },
    });

    const initialFieldDocs = wrapper.findAll('.field-doc').map((node) => node.text());
    expect(initialFieldDocs).toContain('Current customer record');
    expect(initialFieldDocs).not.toContain('Legacy field');
    expect(initialFieldDocs).not.toContain('Primary contact address');

    await wrapper.get('button[data-icon="mdi-chevron-right"]').trigger('click');
    await nextTick();

    const expandedFieldDocs = wrapper.findAll('.field-doc').map((node) => node.text());
    expect(expandedFieldDocs).toContain('Current customer record');
    expect(expandedFieldDocs).not.toContain('Legacy field');
    expect(expandedFieldDocs).toContain('Primary contact address');
  });
});
