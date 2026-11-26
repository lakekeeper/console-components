import { describe, expect, it, vi, beforeEach } from 'vitest';

const searchTabular = vi.fn();
vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({ searchTabularQuiet: searchTabular }),
}));

import { useWarehouseSearch } from './useWarehouseSearch';

describe('useWarehouseSearch', () => {
  beforeEach(() => {
    searchTabular.mockReset();
  });

  it('maps hits and keeps the namespace path segments', async () => {
    searchTabular.mockResolvedValue({
      tabulars: [
        {
          'tabular-id': { type: 'table', id: 't1' },
          'tabular-name': 'orders',
          'namespace-name': ['sales', 'eu'],
          distance: 0.1,
        },
      ],
    });
    const s = useWarehouseSearch('wh1');
    s.query.value = '  ord ';
    await s.search();
    expect(searchTabular).toHaveBeenCalledWith('wh1', { search: 'ord' });
    expect(s.results.value).toEqual([
      {
        id: 't1',
        name: 'orders',
        namespacePath: ['sales', 'eu'],
        namespace: 'sales.eu',
        type: 'table',
        distance: 0.1,
        warehouseId: 'wh1',
      },
    ]);
    expect(s.error.value).toBe('');
    expect(s.searching.value).toBe(false);
  });

  it('says a refusal in place instead of an empty result', async () => {
    searchTabular.mockImplementation(async () => {
      throw { error: { code: 403, message: 'denied' } };
    });
    const s = useWarehouseSearch('wh1');
    s.query.value = 'x';
    await s.search();
    expect(s.results.value).toEqual([]);
    expect(s.error.value).toBe('Searching this warehouse is not allowed for you.');
    expect(s.forbidden.value).toBe(true);
  });

  it('tells a failure apart from a refusal', async () => {
    searchTabular.mockImplementation(async () => {
      throw { error: { code: 500, message: 'boom' } };
    });
    const s = useWarehouseSearch('wh1');
    s.query.value = 'x';
    await s.search();
    expect(s.forbidden.value).toBe(false);
    expect(s.error.value).toMatch(/^Search failed: /);
    s.dismiss();
    expect(s.error.value).toBe('');
    expect(s.forbidden.value).toBe(false);
  });

  it('does nothing without a warehouse or a query', async () => {
    const s = useWarehouseSearch(null);
    s.query.value = 'x';
    await s.search();
    const t = useWarehouseSearch('wh1');
    t.query.value = '   ';
    await t.search();
    expect(searchTabular).not.toHaveBeenCalled();
  });
});
