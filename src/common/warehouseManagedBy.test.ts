import { describe, expect, it } from 'vitest';
import { canOfferWarehouseDelete, isAdminManaged } from './warehouseManagedBy';

const managed = { 'managed-by': 'instance-admin' as const };
const selfManaged = { 'managed-by': 'self-managed' as const };
const unmarked = {};

describe('isAdminManaged', () => {
  it('is true only for instance-admin', () => {
    expect(isAdminManaged(managed)).toBe(true);
    expect(isAdminManaged(selfManaged)).toBe(false);
    expect(isAdminManaged(unmarked)).toBe(false);
  });
});

describe('canOfferWarehouseDelete', () => {
  it('keeps the delete right as the only gate on unmanaged warehouses', () => {
    for (const wh of [selfManaged, unmarked]) {
      expect(canOfferWarehouseDelete(wh, true, false)).toBe(true);
      expect(canOfferWarehouseDelete(wh, true, undefined)).toBe(true);
      expect(canOfferWarehouseDelete(wh, false, true)).toBe(false);
      expect(canOfferWarehouseDelete(wh, undefined, true)).toBe(false);
    }
  });

  it('offers delete on a managed warehouse only to an instance admin', () => {
    expect(canOfferWarehouseDelete(managed, true, true)).toBe(true);
    expect(canOfferWarehouseDelete(managed, true, false)).toBe(false);
    expect(canOfferWarehouseDelete(managed, true, undefined)).toBe(false);
  });

  it('still needs the delete right for an instance admin', () => {
    expect(canOfferWarehouseDelete(managed, false, true)).toBe(false);
    expect(canOfferWarehouseDelete(managed, undefined, true)).toBe(false);
  });
});
