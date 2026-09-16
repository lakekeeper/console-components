import { describe, expect, it, vi } from 'vitest';
import {
  diagnoseReachability,
  extractUrl,
  probeReachable,
  staticVerdict,
} from './storageReachability';

describe('staticVerdict', () => {
  it('names a browser-blocked port, the case that produced no request at all', () => {
    // lakekeeper/lakekeeper#2010: an S3 endpoint on 10080, blocked by browsers.
    const v = staticVerdict('http://minio.internal:10080/bucket/key', 'http:');
    expect(v?.kind).toBe('blocked-port');
    expect(v?.message).toContain('10080');
    expect(v?.message).not.toMatch(/cors/i);
  });

  it('accepts ordinary ports', () => {
    expect(staticVerdict('http://minio.internal:9000/bucket/key', 'http:')).toBeNull();
    expect(staticVerdict('https://s3.eu-central-1.amazonaws.com/b/k', 'https:')).toBeNull();
  });

  it('flags http storage on an https page as mixed content', () => {
    const v = staticVerdict('http://minio.internal:9000/bucket/key', 'https:');
    expect(v?.kind).toBe('mixed-content');
    expect(v?.message).not.toMatch(/cors/i);
  });

  it('exempts localhost from mixed content, as browsers do', () => {
    expect(staticVerdict('http://localhost:9000/b/k', 'https:')).toBeNull();
    expect(staticVerdict('http://127.0.0.1:9000/b/k', 'https:')).toBeNull();
  });

  it('is silent on input it cannot parse', () => {
    expect(staticVerdict('not a url', 'https:')).toBeNull();
    expect(staticVerdict(undefined, 'https:')).toBeNull();
  });
});

describe('extractUrl', () => {
  it('pulls the object URL out of a DuckDB download error', () => {
    const msg =
      'Full download failed for https://s3.eu-central-1.amazonaws.com/wh/ns/snap-1.avro : 404';
    expect(extractUrl(msg)).toBe('https://s3.eu-central-1.amazonaws.com/wh/ns/snap-1.avro');
  });

  it('returns undefined when there is no URL to probe', () => {
    expect(extractUrl('items is null')).toBeUndefined();
  });
});

describe('probeReachable', () => {
  it('treats an opaque response as proof the path works', async () => {
    const f = vi.fn().mockResolvedValue({ type: 'opaque' });
    await expect(probeReachable('https://host/x', f as unknown as typeof fetch)).resolves.toBe(
      true,
    );
    expect(f).toHaveBeenCalledWith(
      'https://host/x',
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
    );
  });

  it('reports failure when even the opaque request throws', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeReachable('https://host/x', f as unknown as typeof fetch)).resolves.toBe(
      false,
    );
  });
});

describe('diagnoseReachability', () => {
  const online = true;

  it('never mentions CORS when the request could not leave the browser', async () => {
    const v = await diagnoseReachability('http://host:10080/b/k', {
      online,
      pageProtocol: 'http:',
    });
    expect(v.kind).toBe('blocked-port');
    expect(v.message).not.toMatch(/cors/i);
  });

  it('reports offline before probing', async () => {
    const f = vi.fn();
    const v = await diagnoseReachability('https://host/b/k', {
      online: false,
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(v.kind).toBe('offline');
    expect(f).not.toHaveBeenCalled();
  });

  it('blames the response only when the host actually answered', async () => {
    const f = vi.fn().mockResolvedValue({ type: 'opaque' });
    const v = await diagnoseReachability('https://host/b/k', {
      online,
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(v.kind).toBe('blocked');
    expect(v.message).toMatch(/cors/i);
  });

  it('says unreachable — and says it is not CORS — when nothing answered', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const v = await diagnoseReachability('https://host:9000/b/k', {
      online,
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(v.kind).toBe('unreachable');
    expect(v.message).toContain('https://host:9000');
    expect(v.message).toMatch(/not a CORS problem/i);
  });

  it('narrows to the write path when a write failed on a reachable endpoint', async () => {
    // lakekeeper/lakekeeper#2011: INSERT failed while SELECT worked, and the old
    // message blamed CORS wholesale.
    const f = vi.fn().mockResolvedValue({ type: 'opaque' });
    const v = await diagnoseReachability('https://host/b/k', {
      online,
      operation: 'write',
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(v.kind).toBe('write-blocked');
    expect(v.message).toMatch(/PUT, POST and DELETE/);
    expect(v.message).toMatch(/write permission/);
  });

  it('keeps the read verdict for reads', async () => {
    const f = vi.fn().mockResolvedValue({ type: 'opaque' });
    const v = await diagnoseReachability('https://host/b/k', {
      online,
      operation: 'read',
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(v.kind).toBe('blocked');
  });

  it('stays vague when there is no URL to probe', async () => {
    const v = await diagnoseReachability(undefined, { online });
    expect(v.kind).toBe('unknown');
    expect(v.message).not.toMatch(/cors/i);
  });
});
