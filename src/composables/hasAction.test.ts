import { describe, it, expect } from 'vitest';
import { hasAction } from './useCatalogPermissions';

// hasAction is the primitive every permission check is built on (hasPermission,
// hasAnyPermission, canCreate*, the show*Tab flags). If it's wrong, the whole
// permission UI gates incorrectly — so it's worth pinning down.

describe('hasAction', () => {
  const perms = [{ action: 'create_warehouse' }, { action: 'select' }, { action: 'modify' }];

  it('returns true when the action is present (by name)', () => {
    expect(hasAction(perms, 'select')).toBe(true);
  });

  it('returns false when the action is absent', () => {
    expect(hasAction(perms, 'delete')).toBe(false);
  });

  it('accepts an action object, not just a string', () => {
    expect(hasAction(perms, { action: 'modify' })).toBe(true);
    expect(hasAction(perms, { action: 'nope' })).toBe(false);
  });

  it('returns false on empty permissions (no grants ⇒ nothing allowed)', () => {
    expect(hasAction([], 'select')).toBe(false);
  });

  it('is exact-match, not substring (avoids granting "select" via "selectable")', () => {
    expect(hasAction([{ action: 'selectable' }], 'select')).toBe(false);
  });
});
