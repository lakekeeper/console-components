import { h, type VNode } from 'vue';
import { VIcon, VImg } from 'vuetify/components';
import type { GetWarehouseResponse } from '@/gen/management/types.gen';
import cfIcon from '@/assets/cf.svg';
import oneLakeIcon from '@/assets/onelake.png';
import aliyunIcon from '@/assets/aliyun.svg';
import stackitLightIcon from '@/assets/stackit-mark.svg';
import stackitDarkIcon from '@/assets/stackit-mark-dark.svg';

/**
 * True when an S3 endpoint is an Alibaba Cloud OSS host. Matches the documented
 * `oss-<region>.aliyuncs.com` hostname (also its `-internal` and bucket-prefixed
 * virtual-hosted forms) rather than a loose `aliyuncs` substring, so unrelated
 * custom endpoints that merely contain the string are not misclassified.
 */
export function isAliyunOssEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  let host = endpoint;
  try {
    host = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`).hostname;
  } catch {
    // Not a parseable URL — fall back to matching against the raw value.
  }
  return /(^|\.)oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(host);
}

/**
 * Render the storage-provider icon (AWS / Azure / GCS / OneLake / Cloudflare R2
 * / Aliyun OSS / STACKIT / generic S3) for a warehouse, based on its storage
 * profile. Returns `null` when the provider can't be determined so callers can
 * fall back.
 *
 * `themeLight` only matters for the ink-on-transparent marks; it is a parameter
 * rather than a store read so this stays a plain function callers can unit-test.
 */
export function storageProviderIcon(
  warehouse: Pick<GetWarehouseResponse, 'storage-profile'> | null | undefined,
  themeLight = true,
): VNode | null {
  const profile = warehouse?.['storage-profile'];
  if (!profile) return null;

  if (profile.type === 's3') {
    if (profile.flavor === 'aws') {
      return h(VIcon, { color: 'orange' }, () => 'mdi-aws');
    }
    if (profile.endpoint?.includes('cloudflarestorage')) {
      return h(VImg, { src: cfIcon, width: 24 });
    }
    if (isAliyunOssEndpoint(profile.endpoint)) {
      return h(VImg, { src: aliyunIcon, width: 24 });
    }
    return h(VIcon, { color: 'primary' }, () => 'mdi-bucket-outline');
  }
  if (profile.type === 'adls') {
    return h(VIcon, { color: 'primary' }, () => 'mdi-microsoft-azure');
  }
  if (profile.type === 'onelake') {
    return h(VImg, { src: oneLakeIcon, width: 24 });
  }
  if (profile.type === 'gcs') {
    return h(VIcon, { color: 'info' }, () => 'mdi-google-cloud');
  }
  if (profile.type === 'stackit') {
    return h(VImg, { src: themeLight ? stackitLightIcon : stackitDarkIcon, width: 24 });
  }
  return null;
}

/** A mark as data: an MDI glyph (`icon`, `color`) or a bundled logo (`src`). */
export interface IconSpec {
  icon?: string;
  color?: string;
  src?: string;
  /** Logo height when it is not square (STACKIT). */
  height?: number;
}

/**
 * Which mark a warehouse row wears, as data, so a tree can render it in a slot.
 * Same choices as `storageProviderIcon`, with a database glyph as the fallback.
 */
export function warehouseIconSpec(
  storage: { storageType?: string; storageFlavor?: string; storageEndpoint?: string },
  themeLight = true,
): IconSpec {
  switch (storage.storageType) {
    case 's3':
      if (storage.storageFlavor === 'aws') return { icon: 'mdi-aws', color: 'orange' };
      if (storage.storageEndpoint?.includes('cloudflarestorage')) return { src: cfIcon };
      if (isAliyunOssEndpoint(storage.storageEndpoint)) return { src: aliyunIcon };
      return { icon: 'mdi-bucket-outline', color: 'primary' };
    case 'adls':
      return { icon: 'mdi-microsoft-azure', color: 'primary' };
    case 'gcs':
      return { icon: 'mdi-google-cloud', color: 'info' };
    case 'onelake':
      return { src: oneLakeIcon };
    case 'stackit':
      return { src: themeLight ? stackitLightIcon : stackitDarkIcon, height: 14 };
    default:
      return { icon: 'mdi-database', color: 'blue-grey' };
  }
}
