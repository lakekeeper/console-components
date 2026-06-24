import { h, type VNode } from 'vue';
import { VIcon, VImg } from 'vuetify/components';
import type { GetWarehouseResponse } from '@/gen/management/types.gen';
import cfIcon from '@/assets/cf.svg';
import oneLakeIcon from '@/assets/onelake.png';

/**
 * Render the storage-provider icon (AWS / Azure / GCS / OneLake / Cloudflare R2
 * / generic S3) for a warehouse, based on its storage profile. Returns `null`
 * when the provider can't be determined so callers can fall back.
 */
export function storageProviderIcon(
  warehouse: Pick<GetWarehouseResponse, 'storage-profile'> | null | undefined,
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
  return null;
}
