import { ref } from 'vue';
import { useFunctions } from '../plugins/functions';
import { storageProbeUrl } from '@/common/storageProbeUrl';
import type { ValidationCheck } from '@/gen/management/types.gen';

/**
 * The catalog's `cors-origin-allowed` verdict for a warehouse's stored storage.
 *
 * Runs on open and is remembered for the session, so the cost is one validation
 * per warehouse per session rather than one per visit. That cadence is not a
 * nicety here: `validateStorageAccess` re-runs the whole storage suite, which
 * writes test objects into the bucket, reads them back, issues vended
 * credentials and cleans up after itself. One of those per page view — on the
 * landing view of a warehouse — would be abusive; one per session is the same
 * bargain the client-side probe this replaced used to strike.
 *
 * An explicit refresh exists for the case the cache is wrong about: someone has
 * just changed a bucket's CORS rule and wants to see it.
 */
const cache = new Map<string, ValidationCheck | null>();

function cacheKey(warehouseId: string, profile: Record<string, any> | null | undefined): string {
  // The target URL too: editing a warehouse's endpoint, bucket or region changes
  // what the verdict is about, and a hit keyed only by id would answer for the
  // storage that was there before the edit.
  const target = storageProbeUrl(profile)?.url ?? '';
  return `${warehouseId}|${target}`;
}

export function useStorageCorsCheck() {
  const functions = useFunctions();
  const result = ref<ValidationCheck | null>(null);
  /** True once a verdict has been sought, so the UI reports rather than offers. */
  const ran = ref(false);
  const loading = ref(false);

  /**
   * Reads the cache unless `force`. A cached `null` is a real answer — this
   * Lakekeeper ran the validation and reported no CORS check — so absence from
   * the map, not a null value, is what means "not asked yet".
   */
  async function run(
    warehouseId: string,
    profile: Record<string, any> | null | undefined,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    if (!warehouseId) return;
    const key = cacheKey(warehouseId, profile);
    if (!force && cache.has(key)) {
      result.value = cache.get(key) ?? null;
      ran.value = true;
      return;
    }
    loading.value = true;
    try {
      const report = await functions.validateStorageAccess(warehouseId, false);
      const check =
        report.checks.find((c: ValidationCheck) => c.name === 'cors-origin-allowed') ?? null;
      cache.set(key, check);
      result.value = check;
    } catch {
      // A failed request is not a verdict, so it is not cached: the next open
      // should try again rather than inherit a transient outage.
      result.value = null;
    } finally {
      ran.value = true;
      loading.value = false;
    }
  }

  return { result, ran, loading, run };
}
