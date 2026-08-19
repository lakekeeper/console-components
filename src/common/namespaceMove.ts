/**
 * When a warehouse's storage layout refuses a namespace move.
 *
 * Mirrors `StorageLayout::move_desyncs_location` on the server, verified against
 * its integration tests (`test_move_namespace_refused_for_hierarchy_deriving_
 * storage_layout`) rather than inferred from the predicate's name — which is how
 * an earlier version of this mirror got the rule wrong and refused every move on
 * a `full-hierarchy` warehouse.
 *
 * It lives here because two surfaces ask the same question — the move dialog and
 * the rename field in namespace settings — and they must not answer it
 * differently. A rename and a re-parent are refused under *different* conditions,
 * so each caller passes what it is actually doing.
 *
 * Note what the rule is not about. A namespace's location is frozen when it is
 * created, so a move never relocates or invalidates data already written. The
 * refusal concerns namespaces created *afterwards*: they would render their path
 * from the new ancestor chain and land outside the moved namespace, fragmenting
 * the layout silently.
 */

/** Only the parts of a storage layout that bear on a move. */
export interface StorageLayoutInfo {
  type?: string;
  /** Segment template for a namespace directory, e.g. `{name}-{uuid}`. */
  namespace?: string;
}

/**
 * What this layout permits at all, independent of any particular destination.
 *
 * The two answers are independent, and that is the whole subtlety: a
 * `full-hierarchy` warehouse with a `{uuid}` template permits renaming but never
 * re-parenting, and one whose template interpolates `{name}` permits neither.
 */
export function namespaceMoveCapability(layout: StorageLayoutInfo | null | undefined): {
  canRename: boolean;
  canReparent: boolean;
} {
  const type = layout?.type;
  // Only the namespace template matters; the tabular one never renders a
  // namespace directory.
  const usesName = (layout?.namespace ?? '').includes('{name}');
  const derivesFromName = type === 'full-hierarchy' || type === 'parent-namespace-and-tabular';
  return {
    // The namespace's own directory is rendered from the template, so the name
    // only matters when the template interpolates it.
    canRename: !(derivesFromName && usesName),
    // `full-hierarchy` renders one directory per ancestor level, so the path
    // changes on a re-parent whatever the template says.
    canReparent: type !== 'full-hierarchy',
  };
}

/**
 * The reason this move is refused, or null when it is allowed.
 *
 * `renamed` and `reparented` are independent: a move can be either, both, or —
 * for a no-op destination — neither.
 *
 * Each message ends by saying what *is* still possible, and that has to be
 * computed rather than assumed. An earlier version hardcoded the consolation
 * ("renaming in place is still allowed"), which was simply false on a layout
 * that forbids both — the case a customised `full-hierarchy` template produces.
 */
export function namespaceMoveRefusal(
  layout: StorageLayoutInfo | null | undefined,
  renamed: boolean,
  reparented: boolean,
): string | null {
  const { canRename, canReparent } = namespaceMoveCapability(layout);
  const blocked = (reparented && !canReparent) || (renamed && !canRename);
  if (!blocked) return null;

  const template = layout?.namespace;

  // Nothing is possible here, so there is no alternative to offer and no point
  // distinguishing which half the caller asked for.
  if (!canRename && !canReparent)
    return `This warehouse's storage layout writes one directory per namespace level and builds each from the namespace name (template "${template}"). Namespaces here can be neither renamed nor moved: data already written would stay valid, but anything created afterwards would be written outside it.`;

  if (reparented && !canReparent)
    return 'This warehouse writes one directory per namespace level. Existing data would not move or break, but namespaces created here afterwards would be written outside this one — so the server refuses this re-parent. Renaming in place is still allowed.';

  return `This warehouse builds namespace directories from the name (template "${template}"). Existing data would stay where it is, but anything created here afterwards would be written under the new name and split from it — so the server refuses this rename. Moving to another parent without renaming is still allowed.`;
}

/**
 * Whether the ancestors differ, matching how the server compares them.
 *
 * The server resolves the destination's parent under a case-insensitive
 * collation, and `unique_namespace_per_warehouse` makes two collation-equal
 * paths impossible — so comparing byte-wise would report a re-parent the catalog
 * does not have. The leaf is the opposite: a casing change *is* a rename, and
 * really does re-render a `{name}` directory, so callers compare it exactly.
 */
export function isReparent(fromParent: string[], toParent: string[]): boolean {
  return fromParent.join('\x1F').toLowerCase() !== toParent.join('\x1F').toLowerCase();
}
