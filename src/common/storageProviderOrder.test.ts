import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyStorageProviderPreferences,
  parseStorageProviders,
  resetStorageProviderWarnings,
} from './storageProviderOrder';

/**
 * The rail as `WarehouseAddDialog` declares it — order matters here, since
 * "everything not named keeps its declared order" is half of what is tested.
 */
const RAIL = [
  { value: 'S3' },
  { value: 'STACKIT' },
  { value: 'AZURE' },
  { value: 'ONELAKE' },
  { value: 'S3_COMPAT' },
  { value: 'GCS' },
  { value: 'R2' },
  { value: 'ALIYUN_OSS' },
];

const values = (providers: { value: string }[]) => providers.map((p) => p.value);

beforeEach(() => {
  resetStorageProviderWarnings();
});

describe('parseStorageProviders', () => {
  it('maps the documented product names onto rail values', () => {
    expect(parseStorageProviders('aws,stackit,adls,onelake', 'ORDER')).toEqual([
      'S3',
      'STACKIT',
      'AZURE',
      'ONELAKE',
    ]);
    expect(parseStorageProviders('s3_compat,gcs,r2,aliyun_oss', 'ORDER')).toEqual([
      'S3_COMPAT',
      'GCS',
      'R2',
      'ALIYUN_OSS',
    ]);
  });

  it('accepts the storage-profile spellings as aliases', () => {
    expect(parseStorageProviders('s3,azure', 'ORDER')).toEqual(['S3', 'AZURE']);
  });

  it('normalizes case, whitespace and hyphens', () => {
    expect(parseStorageProviders(' STACKIT , s3-compat ,Aliyun-OSS', 'ORDER')).toEqual([
      'STACKIT',
      'S3_COMPAT',
      'ALIYUN_OSS',
    ]);
  });

  it('collapses duplicates to the first occurrence and skips empty entries', () => {
    expect(parseStorageProviders('stackit,,aws,stackit,', 'ORDER')).toEqual(['STACKIT', 'S3']);
  });

  it('drops unknown names with a single warning and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStorageProviders('stackit,minio', 'ORDER')).toEqual(['STACKIT']);
    // Same value parsed again (a computed re-run) must not log twice.
    expect(parseStorageProviders('stackit,minio', 'ORDER')).toEqual(['STACKIT']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('minio');
    warn.mockRestore();
  });

  it('treats an unset or empty hint as no preference', () => {
    expect(parseStorageProviders(undefined, 'ORDER')).toEqual([]);
    expect(parseStorageProviders(null, 'ORDER')).toEqual([]);
    expect(parseStorageProviders('', 'ORDER')).toEqual([]);
  });

  it('treats an unsubstituted placeholder as unset, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStorageProviders('VITE_STORAGE_PROVIDERS_ORDER_PLACEHOLDER', 'ORDER')).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('applyStorageProviderPreferences', () => {
  it('leaves the rail untouched when neither hint is set', () => {
    expect(values(applyStorageProviderPreferences(RAIL))).toEqual(values(RAIL));
  });

  it('leads with the named providers and keeps the rest in declared order', () => {
    expect(values(applyStorageProviderPreferences(RAIL, 'stackit'))).toEqual([
      'STACKIT',
      'S3',
      'AZURE',
      'ONELAKE',
      'S3_COMPAT',
      'GCS',
      'R2',
      'ALIYUN_OSS',
    ]);
    expect(values(applyStorageProviderPreferences(RAIL, 'stackit,gcs,aws'))).toEqual([
      'STACKIT',
      'GCS',
      'S3',
      'AZURE',
      'ONELAKE',
      'S3_COMPAT',
      'R2',
      'ALIYUN_OSS',
    ]);
  });

  it('removes hidden providers', () => {
    expect(values(applyStorageProviderPreferences(RAIL, null, 'r2,aliyun_oss,onelake'))).toEqual([
      'S3',
      'STACKIT',
      'AZURE',
      'S3_COMPAT',
      'GCS',
    ]);
  });

  it('applies both hints, with hidden winning over order', () => {
    expect(values(applyStorageProviderPreferences(RAIL, 'stackit,r2,aws', 'r2'))).toEqual([
      'STACKIT',
      'S3',
      'AZURE',
      'ONELAKE',
      'S3_COMPAT',
      'GCS',
      'ALIYUN_OSS',
    ]);
  });

  it('ignores a hidden hint that would empty the rail', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hideAll = 'aws,stackit,adls,onelake,s3_compat,gcs,r2,aliyun_oss';
    expect(values(applyStorageProviderPreferences(RAIL, 'stackit', hideAll))).toEqual([
      'STACKIT',
      'S3',
      'AZURE',
      'ONELAKE',
      'S3_COMPAT',
      'GCS',
      'R2',
      'ALIYUN_OSS',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('ignores names that are not on the rail at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The settings flow passes a single-provider rail; a hint naming the others
    // must not resurrect them.
    expect(values(applyStorageProviderPreferences([{ value: 'STACKIT' }], 'aws,stackit'))).toEqual([
      'STACKIT',
    ]);
    warn.mockRestore();
  });
});
