import { describe, expect, it, vi } from 'vitest';
import { hasVendedCredentials, useVendedCredentials } from './useVendedCredentials';

const getTableCatalogActions = vi.fn();
vi.mock('@/plugins/functions', () => ({
  useFunctions: () => ({
    getTableCatalogActions: (...a: unknown[]) => getTableCatalogActions(...a),
  }),
}));

describe('hasVendedCredentials', () => {
  it('accepts the spec location', () => {
    expect(hasVendedCredentials({ 'storage-credentials': [{}] })).toBe(true);
  });

  it('accepts credentials an older catalog put in config', () => {
    expect(hasVendedCredentials({ config: { 's3.access-key-id': 'AK' } })).toBe(true);
  });

  // A config is not a credential just by existing — these are client hints, and
  // treating them as credentials sends the pane on to sign requests with nothing.
  it('does not mistake client hints for credentials', () => {
    expect(hasVendedCredentials({ config: { 'overwrite-simple': 'true' } })).toBe(false);
    expect(hasVendedCredentials({ 'storage-credentials': [] })).toBe(false);
    expect(hasVendedCredentials(null)).toBe(false);
  });

  // Encryption settings are configuration, not a grant: a warehouse that vends
  // nothing still sends these, and reading them as credentials sent the pane on
  // to read data files with nothing to authenticate with.
  it('does not mistake an encryption key for a vended credential', () => {
    expect(hasVendedCredentials({ config: { 's3.sse.key': 'kms-key' } })).toBe(false);
    expect(hasVendedCredentials({ config: { 's3.sse.type': 'kms', 's3.sse.md5': 'x' } })).toBe(
      false,
    );
  });

  it('accepts the credential keys each storage actually vends', () => {
    expect(hasVendedCredentials({ config: { 's3.session-token': 'tok' } })).toBe(true);
    expect(hasVendedCredentials({ config: { 's3.secret-access-key': 'sk' } })).toBe(true);
    expect(hasVendedCredentials({ config: { 'gcs.oauth2.token': 'tok' } })).toBe(true);
    // ADLS suffixes the account onto the key.
    expect(hasVendedCredentials({ config: { 'adls.sas-token.myaccount': 'sig' } })).toBe(true);
  });
});

describe('explainMissingCredentials', () => {
  it('states the missing privilege when the catalog confirms it', async () => {
    getTableCatalogActions.mockResolvedValue([{ action: 'get_metadata' }]);
    const { explainMissingCredentials } = useVendedCredentials();

    const msg = await explainMissingCredentials('wh', 'uuid');
    expect(msg).toContain('do not have permission');
    expect(msg).not.toMatch(/normally means/i);
  });

  it('points at the warehouse when the privilege is held', async () => {
    getTableCatalogActions.mockResolvedValue([{ action: 'get_metadata' }, { action: 'read_data' }]);
    const { explainMissingCredentials } = useVendedCredentials();

    const msg = await explainMissingCredentials('wh', 'uuid');
    expect(msg).toContain('STS');
  });

  // An empty list means the question failed — a reader who got this far holds
  // `get_metadata`, so a real answer is never empty.
  it('hedges when the catalog did not answer', async () => {
    getTableCatalogActions.mockResolvedValue([]);
    const { explainMissingCredentials } = useVendedCredentials();

    expect(await explainMissingCredentials('wh', 'uuid')).toMatch(/normally means/i);
    expect(await explainMissingCredentials('wh', undefined)).toMatch(/normally means/i);
  });
});
