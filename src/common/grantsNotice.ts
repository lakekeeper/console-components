import type { InjectionKey, Component } from 'vue';

/**
 * A component the app can register to annotate every grants pane.
 *
 * Whether a stored grant actually takes effect is not the catalog's question:
 * an authorizer can read grants through policies that a scope has switched off,
 * leaving a valid grant inert. Only the deployment knows that — Plus knows it
 * for Cedar — and `GrantsPanel` has four hosts, so the knowledge arrives by
 * injection rather than through a slot threaded down every one of them.
 *
 * The component receives the pane's `resource`; it decides for itself whether
 * to render anything. Unprovided in OSS, where nothing can answer the question.
 *
 * ```ts
 * app.provide(GrantsNoticeKey, CedarGrantEffectNotice);
 * ```
 */
export const GrantsNoticeKey: InjectionKey<Component | null> = Symbol('grantsNotice');
