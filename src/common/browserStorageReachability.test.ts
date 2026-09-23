import { describe, it, expect, vi } from 'vitest';
import { checkBrowserStorageReachability } from './browserStorageReachability';

const s3 = { type: 's3', bucket: 'b', region: 'eu-central-1', 'sts-enabled': true };

describe('checkBrowserStorageReachability', () => {
  it('passes when the preflighted request gets a response, whatever its status', async () => {
    // 403 is the expected answer: the probe key does not exist and the request
    // is unsigned. What matters is that the browser could read the response.
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied', { status: 403 }));
    const result = await checkBrowserStorageReachability(s3, { fetchImpl: fetchImpl as any });
    expect(result.status).toBe('passed');
    expect(result.corsLikely).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never reports failed — only a warning, so it cannot invalidate a config', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await checkBrowserStorageReachability(s3, { fetchImpl: fetchImpl as any });
    expect(result.status).toBe('warning');
  });

  it('separates a too-narrow AllowedHeaders from an origin that is not allowed', async () => {
    // The preflighted probe fails, the plain one succeeds: the origin is fine,
    // the header the real client signs with is not.
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      if (init?.headers && Object.keys(init.headers).length > 0)
        throw new TypeError('Failed to fetch');
      return new Response('', { status: 404 });
    });
    const result = await checkBrowserStorageReachability(s3, { fetchImpl: fetchImpl as any });
    expect(result.status).toBe('warning');
    expect(result.corsLikely).toBe(true);
    expect(result.detail).toContain('x-amz-content-sha256');
  });

  it('does not blame CORS when the request never left the browser', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await checkBrowserStorageReachability(
      { ...s3, endpoint: 'https://storage.example.com:10080' },
      { fetchImpl: fetchImpl as any },
    );
    expect(result.status).toBe('warning');
    expect(result.corsLikely).toBe(false);
    expect(result.detail).toContain('blocked-port list');
    // A blocked port is provable from the URL alone; nothing should be sent.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips a warehouse whose browser clients get no credential', async () => {
    const fetchImpl = vi.fn();
    const result = await checkBrowserStorageReachability(
      { ...s3, 'sts-enabled': false },
      { fetchImpl: fetchImpl as any },
    );
    expect(result.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips storage the browser never reads directly', async () => {
    const fetchImpl = vi.fn();
    const result = await checkBrowserStorageReachability(
      { type: 'onelake', 'workspace-id': 'w' },
      { fetchImpl: fetchImpl as any },
    );
    expect(result.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
