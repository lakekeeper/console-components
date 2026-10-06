import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  applyServerGrants: vi.fn(),
  applyProjectGrants: vi.fn(),
  applyWarehouseGrants: vi.fn(),
  applyNamespaceGrants: vi.fn(),
  applyTableGrants: vi.fn(),
  applyViewGrants: vi.fn(),
  applyGenericTableGrants: vi.fn(),
  applyTagGrants: vi.fn(),
}));

vi.mock('../plugins/functions', () => ({ useFunctions: () => api }));

import {
  allowsServerGrantToRole,
  answerableCatalogActions,
  grantErrorMessage,
  isAuthorizationBackendUnavailable,
  useGrants,
} from './useGrants';
import { isAuthorizationInternalError } from '../common/errorUtils';
import type { GrantResourceRef } from '../common/interfaces';

/** The shape the generated client rejects with: the server's `ErrorModel` under `error`. */
function apiError(code: number, type: string, message: string) {
  return { error: { code, type, message } };
}

describe('allowsServerGrantToRole', () => {
  it('accepts roles where the authorizer keeps its own grants', () => {
    expect(allowsServerGrantToRole('openfga')).toBe(true);
    expect(allowsServerGrantToRole('OpenFGA')).toBe(true);
  });

  it('offers users only where grants are stored in the catalog', () => {
    expect(allowsServerGrantToRole('cedar')).toBe(false);
    expect(allowsServerGrantToRole('allow-all')).toBe(false);
  });

  // Users-only is the choice the server never refuses.
  it('offers users only while the backend is unknown', () => {
    expect(allowsServerGrantToRole(undefined)).toBe(false);
    expect(allowsServerGrantToRole(null)).toBe(false);
    expect(allowsServerGrantToRole('')).toBe(false);
  });
});

describe('grantErrorMessage', () => {
  it('names the users-only rule for a server grant to a role', () => {
    const msg = grantErrorMessage(
      apiError(
        400,
        'ServerGrantToRole',
        'Role `00000000-0000-0000-0000-000000000001` cannot hold a server grant: grant server privileges to users',
      ),
      'Failed to apply grants',
    );
    expect(msg).toMatch(/users only/);
    expect(msg).not.toMatch(/not allowed/i);
  });

  it('keeps the missing user and says how they become grantable', () => {
    const msg = grantErrorMessage(
      apiError(400, 'GrantUserNotFound', 'User `oidc~example-user` does not exist'),
      'Failed to apply grants',
    );
    expect(msg).toContain('User `oidc~example-user` does not exist');
    expect(msg).toMatch(/sign in to the console once/);
    expect(msg).toMatch(/catalog client/);
  });

  it('reads a refused introspection as "cannot check others", not a crash', () => {
    const msg = grantErrorMessage(
      apiError(
        403,
        'CannotInspectPermissions',
        'Not allowed to inspect permissions for object server:x',
      ),
      'Failed to read grantable privileges',
    );
    expect(msg).toMatch(/not allowed to check what other users or roles may do/);
  });

  it('never presents an authorizer failure as a missing permission', () => {
    const error = apiError(
      500,
      'AuthorizationInternalError',
      'Authorization failed due to an internal error',
    );
    expect(isAuthorizationInternalError(error)).toBe(true);
    const msg = grantErrorMessage(error, 'Failed to apply grants');
    expect(msg).toMatch(/server-side error, not a missing permission/);
    expect(msg).not.toMatch(/not allowed/i);
  });

  it('says an unreachable authorizer is an outage', () => {
    const msg = grantErrorMessage(
      apiError(503, 'AuthorizationBackendError', 'backend unavailable'),
      'Failed to apply grants',
    );
    expect(msg).toMatch(/could not reach its authorizer/);
  });

  // The server answers 503 for more than an unreachable authorizer, and each of
  // those carries a message worth more than a guess.
  it("keeps the server's message for a 503 that is not about the authorizer", () => {
    const maintenance = apiError(
      503,
      'MaintenanceModeError',
      'Lakekeeper is in read-only maintenance mode. Retry after the maintenance window completes.',
    );
    expect(isAuthorizationBackendUnavailable(maintenance)).toBe(false);
    expect(grantErrorMessage(maintenance, 'Failed to apply grants')).toBe(
      'Lakekeeper is in read-only maintenance mode. Retry after the maintenance window completes.',
    );
    expect(
      grantErrorMessage(
        apiError(503, 'CatalogBackendError', 'Unexpected database error'),
        'Failed to apply grants',
      ),
    ).toBe('Unexpected database error');
  });

  it("shows the server's own message for everything else", () => {
    expect(
      grantErrorMessage(
        apiError(403, 'ProjectActionForbidden', 'Forbidden action on project'),
        'Failed to apply grants',
      ),
    ).toBe('Forbidden action on project');
    expect(grantErrorMessage(new Error('Failed to fetch'), 'Failed to apply grants')).toBe(
      'Failed to fetch',
    );
    expect(grantErrorMessage({}, 'Failed to apply grants')).toBe('Failed to apply grants');
  });
});

describe('answerableCatalogActions', () => {
  const warehouse = ['get_metadata', 'read_grants', 'read_subtree_grants', 'revoke_subtree_grants'];

  it('drops the subtree grant actions where the authorizer keeps its own grants', () => {
    expect(answerableCatalogActions(warehouse, 'openfga')).toEqual(['get_metadata', 'read_grants']);
  });

  it('keeps them where grants are stored in the catalog', () => {
    expect(answerableCatalogActions(warehouse, 'cedar')).toEqual(warehouse);
    expect(answerableCatalogActions(warehouse, 'allow-all')).toEqual(warehouse);
  });
});

describe('applyGrants reporting', () => {
  const entry = { principal: { user: 'oidc~example-user' }, privilege: 'select' } as any;
  const refs: Array<[GrantResourceRef, keyof typeof api]> = [
    [{ type: 'server' }, 'applyServerGrants'],
    [{ type: 'project', projectId: 'p1' }, 'applyProjectGrants'],
    [{ type: 'warehouse', warehouseId: 'w1' }, 'applyWarehouseGrants'],
    [{ type: 'namespace', warehouseId: 'w1', namespaceId: 'n1' }, 'applyNamespaceGrants'],
    [{ type: 'table', warehouseId: 'w1', tableId: 't1' }, 'applyTableGrants'],
    [{ type: 'view', warehouseId: 'w1', viewId: 'v1' }, 'applyViewGrants'],
    [{ type: 'generic-table', warehouseId: 'w1', genericTableId: 'g1' }, 'applyGenericTableGrants'],
    [{ type: 'tag-definition', tagDefinitionId: 'd1' }, 'applyTagGrants'],
  ];

  // Every caller shows a refused apply in place, in readable words; a snackbar
  // and a notification would repeat it raw.
  it('asks every level without a snackbar or notification', async () => {
    const grants = useGrants();
    for (const [ref, fn] of refs) {
      api[fn].mockReset().mockResolvedValue(undefined);
      await grants.applyGrants(ref, { writes: [entry] });
      expect(api[fn]).toHaveBeenCalledTimes(1);
      expect(api[fn].mock.calls[0].at(-1)).toBe(false);
    }
  });
});
