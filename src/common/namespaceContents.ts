/** A type the namespace page's Contents tab can narrow to. */
export type ContentKind = 'namespaces' | 'tables' | 'generic' | 'views' | 'datasets' | 'deleted';

/**
 * What Contents shows: the chosen types, several at once. Empty means "All".
 */
export type ContentSelection = ContentKind[];

/** A chip's value: a type, or `all` for the empty selection. */
export type ContentType = 'all' | ContentKind;

export const CONTENT_KINDS: readonly ContentKind[] = [
  'namespaces',
  'tables',
  'generic',
  'views',
  'datasets',
  'deleted',
];

/**
 * The namespace page once had a tab per type. Links still carry those names —
 * the nav tree's per-type entries, the redirect after a drop, bookmarks — so an
 * old `?tab=` opens Contents on that type instead of being dropped.
 */
export const LEGACY_CONTENT_TABS: Readonly<Record<string, ContentKind>> = {
  namespaces: 'namespaces',
  tables: 'tables',
  views: 'views',
  datasets: 'datasets',
  deleted: 'deleted',
};

/** Keeps a selection valid: known types, each once, in chip order. */
export function normalizeSelection(kinds: readonly string[]): ContentSelection {
  const set = new Set(kinds);
  return CONTENT_KINDS.filter((k) => set.has(k));
}

/**
 * Reads the Contents selection from a page's query: an old per-type `?tab=`
 * wins, then `?type=` (comma-separated; `all` or empty is everything), else
 * `null` (the caller keeps what it has).
 */
export function contentSelectionFromQuery(tab: unknown, type: unknown): ContentSelection | null {
  // Own keys only: an inherited name such as `toString` is not a tab.
  if (typeof tab === 'string' && Object.hasOwn(LEGACY_CONTENT_TABS, tab)) {
    return [LEGACY_CONTENT_TABS[tab]];
  }
  if (typeof type !== 'string') return null;
  if (type === '' || type === 'all') return [];
  const parts = type.split(',').map((p) => p.trim());
  const picked = normalizeSelection(parts);
  return picked.length ? picked : null;
}

/** The `?type=` value for a selection; undefined for "All". */
export function contentSelectionToQuery(selection: ContentSelection): string | undefined {
  return selection.length ? selection.join(',') : undefined;
}
