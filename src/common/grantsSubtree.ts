import type { InjectionKey, Component } from 'vue';
import type { GrantResourceRef } from './interfaces';
import type { GrantResponse } from '../gen/management/types.gen';

/** One page of the grants held beneath a container. */
export interface SubtreeGrantPage {
  grants: GrantResponse[];
  /**
   * The instant this walk reads under. Every page of one walk sees it, and a
   * bulk revoke can be bound to it so it removes only what was reviewed.
   */
  asOf?: string | null;
  /** Present while another page may follow; follow it until it is absent. */
  nextPageToken?: string | null;
}

/**
 * The app's access to the grants held *beneath* a container.
 *
 * A data source rather than a component, because the review pane shows one
 * table: the levels above an object and everything below it are two endpoints
 * and two authorization decisions, but they answer one question — where does
 * access to this thing come from — and splitting them into two views made the
 * reader do the joining. So the pane owns the table and the app owns the
 * reach.
 *
 * `actions` is the exception: a bulk revoke across a subtree is destructive in
 * a way the shared pane has no business rendering — it needs a rehearsal, a
 * per-call limit and a typed confirmation — so the app contributes that as a
 * component, and the pane only gives it somewhere to sit.
 *
 * Not every authorizer offers this at all; one that does not declines with
 * 501, and `list` should surface that rather than swallowing it, so the pane
 * can say so once instead of looking empty.
 *
 * ```ts
 * app.provide(GrantsSubtreeKey, { list: listSubtreeGrantsPage, actions: SubtreeRevokeButton });
 * ```
 */
/**
 * How a subtree listing is narrowed.
 *
 * These are the server's own filters, not a view over what has been paged in:
 * a subtree can hold more grants than anyone wants to walk, so narrowing has to
 * happen where the walk does. The review pane applies the same values to the
 * levels above it in the client, since it already holds those rows — one filter,
 * applied where each half can.
 */
export interface SubtreeGrantFilter {
  /** Only this user's grants. Mutually exclusive with `principalRole`. */
  principalUser?: string | null;
  /** Only this role's grants. Mutually exclusive with `principalUser`. */
  principalRole?: string | null;
  /** Only grants carrying one of these privileges. Empty means every privilege. */
  privilege?: string[];
  /** Only grants on these resource kinds. Empty means every kind. */
  resourceType?: string[];
  /** Grants on tabulars in the recycle bin. On by default at the server. */
  includeSoftDeleted?: boolean;
  /** Read only grants created at or before this instant. */
  createdBefore?: string | null;
}

export interface SubtreeGrantSource {
  /**
   * Strictly below the named resource. The pane lists that resource's own
   * grants itself, as the leaf of its chain, so an implementation that also
   * returned them would have every one of them appear twice.
   */
  list(
    resource: GrantResourceRef,
    options: { pageToken?: string; pageSize?: number } & SubtreeGrantFilter,
  ): Promise<SubtreeGrantPage>;
  /**
   * Rendered in the review toolbar, with `resource`, `resourceName`, `asOf`,
   * `filter` and `disabled`. It is handed the filter the review is showing so
   * a bulk revoke starts on what was actually reviewed.
   */
  actions?: Component | null;
}

/**
 * The extension point itself. Unprovided in OSS, where nothing can answer the
 * question — the review pane then shows the levels above and says nothing
 * about what lies below.
 */
export const GrantsSubtreeKey: InjectionKey<SubtreeGrantSource | null> = Symbol('grantsSubtree');
