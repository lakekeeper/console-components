import { describe, expect, it } from 'vitest';
import { AUTHORIZATION_INTERNAL_ERROR_MESSAGE, errorMessage } from './errorUtils';

const internal = {
  error: {
    code: 500,
    type: 'AuthorizationInternalError',
    message: 'Authorization failed due to an internal error',
  },
};

describe('errorMessage', () => {
  // The server's own text reads like a denial.
  it('says an authorizer failure is a server-side error', () => {
    expect(errorMessage(internal)).toBe(AUTHORIZATION_INTERNAL_ERROR_MESSAGE);
    expect(errorMessage(internal)).toMatch(/server-side error, not a missing permission/);
  });

  it("keeps the server's message otherwise, then the fallback", () => {
    expect(
      errorMessage({ error: { code: 409, type: 'Conflict', message: 'Already exists' } }),
    ).toBe('Already exists');
    expect(errorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(errorMessage('plain text')).toBe('plain text');
    expect(errorMessage({}, 'Something failed')).toBe('Something failed');
  });
});
