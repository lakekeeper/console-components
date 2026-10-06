import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSnackbarMsg = vi.fn();
vi.mock('@/stores/visual', () => ({ useVisualStore: () => ({ setSnackbarMsg }) }));
vi.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ addNotification: vi.fn() }),
}));
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ unsetUser: vi.fn() }) }));

import { handleError } from './functions';

beforeEach(() => setSnackbarMsg.mockReset());

describe('handleError snackbar text', () => {
  it('shows an authorizer failure as a server-side error', () => {
    handleError(
      {
        error: {
          code: 500,
          type: 'AuthorizationInternalError',
          message: 'Authorization failed due to an internal error',
        },
      },
      'getProjectCatalogActions',
    );
    expect(setSnackbarMsg).toHaveBeenCalledTimes(1);
    const text: string = setSnackbarMsg.mock.calls[0][0].text;
    expect(text).toMatch(/server-side error, not a missing permission/);
    expect(text).not.toContain('Authorization failed due to an internal error');
  });

  it("shows the server's message for other errors", () => {
    handleError(
      { error: { code: 409, type: 'WarehouseAlreadyExists', message: 'Already exists' } },
      'createWarehouse',
    );
    expect(setSnackbarMsg.mock.calls[0][0].text).toBe('WarehouseAlreadyExists: Already exists');
  });
});
