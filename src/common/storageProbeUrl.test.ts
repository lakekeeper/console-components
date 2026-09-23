import { describe, it, expect } from 'vitest';
import { storageProbeUrl, PROBE_KEY } from './storageProbeUrl';

describe('storageProbeUrl', () => {
  it('addresses an AWS bucket virtual-host style by default', () => {
    const t = storageProbeUrl({ type: 's3', bucket: 'my-bucket', region: 'eu-central-1' });
    expect(t?.url).toBe(`https://my-bucket.s3.eu-central-1.amazonaws.com/${PROBE_KEY}`);
    expect(t?.preflightHeader).toBe('x-amz-content-sha256');
  });

  it('uses path style only when the profile asks for it', () => {
    const t = storageProbeUrl({
      type: 's3',
      bucket: 'my-bucket',
      region: 'local',
      endpoint: 'http://minio:9000/',
      'path-style-access': true,
    });
    expect(t?.url).toBe(`http://minio:9000/my-bucket/${PROBE_KEY}`);
  });

  it('keeps a non-default port on the endpoint', () => {
    const t = storageProbeUrl({
      type: 's3',
      bucket: 'b',
      region: 'local',
      endpoint: 'https://storage.example.com:9021',
    });
    expect(t?.url).toBe(`https://b.storage.example.com:9021/${PROBE_KEY}`);
  });

  it('derives the STACKIT endpoint from the region, virtual-host style', () => {
    const t = storageProbeUrl({ type: 'stackit', bucket: 'warehouse', region: 'eu01' });
    expect(t?.url).toBe(`https://warehouse.object.storage.eu01.onstackit.cloud/${PROBE_KEY}`);
  });

  it('probes the ADLS blob endpoint, not dfs — that is the service whose CORS applies', () => {
    const t = storageProbeUrl({ type: 'adls', 'account-name': 'acct', filesystem: 'fs' });
    expect(t?.url).toBe(`https://acct.blob.core.windows.net/fs/${PROBE_KEY}`);

    const overridden = storageProbeUrl({
      type: 'adls',
      'account-name': 'acct',
      filesystem: 'fs',
      host: 'dfs.core.windows.net',
    });
    expect(overridden?.url).toBe(`https://acct.blob.core.windows.net/fs/${PROBE_KEY}`);
  });

  it('builds a GCS URL from the bucket', () => {
    const t = storageProbeUrl({ type: 'gcs', bucket: 'my-bucket' });
    expect(t?.url).toBe(`https://storage.googleapis.com/my-bucket/${PROBE_KEY}`);
  });

  it('has no target for storage the browser does not read directly', () => {
    expect(storageProbeUrl({ type: 'onelake', 'workspace-id': 'w' })).toBeNull();
    expect(storageProbeUrl(null)).toBeNull();
    expect(storageProbeUrl({ type: 's3' })).toBeNull();
  });
});
