import { computed, ref } from 'vue';
import {
  checkBrowserStorageReachability,
  type BrowserStorageCheck,
} from '@/common/browserStorageReachability';

/**
 * The browser-reachability verdict for a warehouse.
 *
 * Runs on open and is remembered for the session, so the cost is one request per
 * warehouse per session rather than one per visit — cheap enough to just answer
 * the question instead of offering to. The answer is stable anyway: a bucket's
 * CORS rule does not drift between page loads, which is also why an explicit
 * refresh exists for the case where someone has just changed one.
 *
 * The cache key includes the origin because the verdict is about this console's
 * origin, not the warehouse: the same warehouse checked from a dev server and
 * from the deployed console can legitimately disagree, and that disagreement is
 * the whole reason the check exists outside the create flow.
 */
const cache = new Map<string, BrowserStorageCheck>();

function cacheKey(warehouseId: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return `${warehouseId}|${origin}`;
}

export function useBrowserStorageCheck() {
  const result = ref<BrowserStorageCheck | null>(null);
  const loading = ref(false);
  /** True before the first run, so the UI can offer it rather than report it. */
  const checked = computed(() => result.value !== null || loading.value);

  /**
   * Reads the cache unless `force`. A refresh is the point of the button: a
   * bucket policy edited in another tab should be observable without a reload.
   */
  async function run(
    warehouseId: string,
    profile: Record<string, any> | null | undefined,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    if (!warehouseId) return;
    const key = cacheKey(warehouseId);
    if (!force) {
      const hit = cache.get(key);
      if (hit) {
        result.value = hit;
        return;
      }
    }
    loading.value = true;
    try {
      const verdict = await checkBrowserStorageReachability(profile);
      cache.set(key, verdict);
      result.value = verdict;
    } finally {
      loading.value = false;
    }
  }

  /** Drops the remembered verdict, e.g. when the storage profile was edited. */
  function invalidate(warehouseId: string): void {
    cache.delete(cacheKey(warehouseId));
    result.value = null;
  }

  return { result, loading, checked, run, invalidate };
}
