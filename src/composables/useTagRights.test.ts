import { describe, expect, it, vi } from 'vitest';

vi.mock('../plugins/functions', () => ({ useFunctions: () => ({}) }));
vi.mock('./useCatalogPermissions', () => ({ useConfig: () => ({}) }));

import { tagRefusal } from './useTagRights';

describe('tagRefusal', () => {
  it('reports an authorizer failure as a server-side error, not a refusal', () => {
    const msg = tagRefusal(
      {
        error: {
          code: 500,
          type: 'AuthorizationInternalError',
          message: 'Authorization failed due to an internal error',
        },
      },
      'list projects',
    );
    expect(msg).toMatch(/^Could not list projects: /);
    expect(msg).toMatch(/server-side error, not a missing permission/);
    expect(msg).not.toContain('Authorization failed due to an internal error');
  });

  it('keeps a refusal a refusal', () => {
    expect(tagRefusal({ error: { code: 403, message: 'no' } }, 'list projects')).toBe(
      'You are not allowed to list projects.',
    );
  });
});
