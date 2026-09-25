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
export interface SubtreeGrantSource {
  /**
   * Strictly below the named resource. The pane lists that resource's own
   * grants itself, as the leaf of its chain, so an implementation that also
   * returned them would have every one of them appear twice.
   */
  list(
    resource: GrantResourceRef,
    options: { pageToken?: string; pageSize?: number },
  ): Promise<SubtreeGrantPage>;
  /** Rendered in the review toolbar, with `resource`, `resourceName`, `asOf`. */
  actions?: Component | null;
}

/**
 * The extension point itself. Unprovided in OSS, where nothing can answer the
 * question — the review pane then shows the levels above and says nothing
 * about what lies below.
 */
export const GrantsSubtreeKey: InjectionKey<SubtreeGrantSource | null> = Symbol('grantsSubtree');
