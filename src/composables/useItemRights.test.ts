import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { useItemRights } from './useItemRights';

const batchCheckActions = vi.fn();
vi.mock('../plugins/functions', () => ({
  useFunctions: () => ({
    batchCheckActions: (...a: unknown[]) => batchCheckActions(...a),
  }),
}));

const restricted = ref(true);
vi.mock('./useCatalogPermissions', () => ({
  useConfig: () => ({
    enabledAuthentication: computed(() => restricted.value),
    enabledPermissions: computed(() => restricted.value),
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));
let n = 0;
// Unique names per test: answers are cached module-wide for a minute.
const table = (name = `t${n++}`) => ({
  kind: 'table' as const,
  warehouseId: 'wh',
  namespace: ['a', 'b'],
  name,
});

describe('useItemRights', () => {
  beforeEach(() => {
    batchCheckActions.mockReset();
    restricted.value = true;
  });

  it('is unknown until asked, then answers from one batch', async () => {
    batchCheckActions.mockResolvedValue([
      { id: '0', allowed: true },
      { id: '1', allowed: false },
    ]);
    const rights = useItemRights();
    const t = table();
    expect(rights.can(t, 'drop')).toBeUndefined();
    expect(rights.can(t, 'rename')).toBeUndefined();
    await flush();
    expect(batchCheckActions).toHaveBeenCalledTimes(1);
    const [checks, errorOnNotFound, notify] = batchCheckActions.mock.calls[0];
    expect(errorOnNotFound).toBe(false);
    expect(notify).toBe(false);
    expect(checks[0].operation).toEqual({
      table: {
        action: { action: 'drop' },
        namespace: ['a', 'b'],
        table: t.name,
        'warehouse-id': 'wh',
      },
    });
    expect(rights.can(t, 'drop')).toBe(true);
    expect(rights.can(t, 'rename')).toBe(false);
  });

  it('asks a namespace and a soft-deleted item in their own shapes', async () => {
    batchCheckActions.mockResolvedValue([{ id: '0', allowed: true }]);
    const rights = useItemRights();
    await rights.ensure(
      [{ kind: 'namespace', warehouseId: 'wh', namespace: ['x', `n${n++}`] }],
      ['create_table'],
    );
    expect(batchCheckActions.mock.calls[0][0][0].operation.namespace['warehouse-id']).toBe('wh');
    await rights.ensure(
      [{ kind: 'view', warehouseId: 'wh', namespace: [], id: `id-${n++}` }],
      ['undrop'],
    );
    expect(batchCheckActions.mock.calls[1][0][0].operation.view['table-id']).toMatch(/^id-/);
  });

  it('offers the action when the check itself fails', async () => {
    batchCheckActions.mockRejectedValue({ error: { code: 500 } });
    const rights = useItemRights();
    const t = table();
    rights.can(t, 'drop');
    await flush();
    expect(rights.can(t, 'drop')).toBe(true);
  });

  it('allows everything without an authorizer and asks nothing', async () => {
    restricted.value = false;
    const rights = useItemRights();
    expect(rights.can(table(), 'drop')).toBe(true);
    await flush();
    expect(batchCheckActions).not.toHaveBeenCalled();
  });
});
