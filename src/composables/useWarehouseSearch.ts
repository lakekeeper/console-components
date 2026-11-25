import { ref, toValue, type MaybeRefOrGetter } from 'vue';
import { useFunctions } from '@/plugins/functions';
import { errorMessage, isForbiddenError, logError } from '@/common/errorUtils';
import type { SearchTabular } from '@/gen/management/types.gen';

/** One hit of the backend's warehouse-wide fuzzy search. */
export interface WarehouseSearchHit {
  id: string;
  name: string;
  /** Namespace path segments, as the server returned them. */
  namespacePath: string[];
  /** Dotted namespace path, for display and for the tree's `namespaceId`. */
  namespace: string;
  /** `table`, `view` or `generic-table`. */
  type: string;
  /** Lower is closer; null when the server did not rank the hit. */
  distance: number | null;
  warehouseId: string;
}

/**
 * The backend's fuzzy search over every table, view and generic table of one
 * warehouse (`POST /management/v1/warehouse/{id}/search-tabular`), as the
 * warehouse navigation tree offers it.
 *
 * A refusal is kept in `error`, to be said beside the field, rather than
 * leaving an empty result list that reads as "nothing matched". The quiet
 * wrapper is used so it is said only there, not again as a snackbar.
 */
export function useWarehouseSearch(warehouseId: MaybeRefOrGetter<string | null | undefined>) {
  const functions = useFunctions();
  const query = ref('');
  const results = ref<WarehouseSearchHit[]>([]);
  const searching = ref(false);
  const searched = ref(false);
  const error = ref('');
  // A slow answer for an older query must not replace a newer one.
  let seq = 0;

  async function search() {
    const id = toValue(warehouseId);
    const text = query.value?.trim();
    if (!text || !id) return;
    const mine = ++seq;
    searching.value = true;
    searched.value = true;
    error.value = '';
    try {
      const response = await functions.searchTabularQuiet(id, { search: text });
      if (mine !== seq) return;
      results.value = (response.tabulars || []).map((r: SearchTabular) => ({
        id: r['tabular-id'].id,
        name: r['tabular-name'],
        namespacePath: r['namespace-name'],
        namespace: r['namespace-name'].join('.'),
        type: r['tabular-id'].type,
        distance: r.distance ?? null,
        warehouseId: id,
      }));
    } catch (e: any) {
      if (mine !== seq) return;
      logError('Warehouse search failed', e);
      results.value = [];
      error.value = isForbiddenError(e)
        ? 'Searching this warehouse is not allowed for you.'
        : `Search failed: ${errorMessage(e, 'unknown error')}`;
    } finally {
      if (mine === seq) searching.value = false;
    }
  }

  /** Forget the results but keep the text, e.g. after opening a hit. */
  function dismiss() {
    seq++;
    searching.value = false;
    searched.value = false;
    results.value = [];
    error.value = '';
  }

  function clear() {
    query.value = '';
    dismiss();
  }

  return { query, results, searching, searched, error, search, dismiss, clear };
}
