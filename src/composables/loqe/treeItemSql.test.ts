import { describe, expect, it } from 'vitest';
import { treeItemSql } from './treeItemSql';

describe('treeItemSql', () => {
  it('a table or view is its quoted three-part path', () => {
    const t = { type: 'table', warehouseName: 'demo-sts', namespaceId: 'test', name: 'orders' };
    expect(treeItemSql(t)).toBe('"demo-sts"."test"."orders"');
    expect(treeItemSql({ ...t, type: 'view' })).toBe('"demo-sts"."test"."orders"');
  });

  it('a field is its quoted name, a nested one its whole path', () => {
    expect(treeItemSql({ type: 'field', name: 'amount' })).toBe('"amount"');
    expect(treeItemSql({ type: 'field', name: 'street', fieldPath: ['address', 'street'] })).toBe(
      '"address"."street"',
    );
  });

  it('nothing for a namespace, a warehouse, or a table without its path', () => {
    expect(treeItemSql({ type: 'namespace', name: 'test' })).toBe('');
    expect(treeItemSql({ type: 'table', name: 'orders' })).toBe('');
  });
});
