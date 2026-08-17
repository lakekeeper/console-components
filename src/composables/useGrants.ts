import { computed, ref, watch } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { useUserStore } from '../stores/user';
import { getErrorCode } from '../common/errorUtils';
import type {
  GrantListOptions,
  GrantPrincipalFilter,
  GrantResourceRef,
} from '../common/interfaces';
import type {
  GrantEntry,
  GrantResourceResponse,
  GrantResponse,
  GrantablePrivilege,
  ListGrantsResponse,
  PrivilegeDescriptor,
  ResourceType,
} from '../gen/management/types.gen';

/**
 * The server applies `writes` and `deletes` in one transaction and caps the two
 * together at this many entries. It is not a schema constraint — a `maxItems` on
 * each array would wrongly permit twice as many — so the UI enforces it rather
 * than discovering it as a 400.
 */
export const GRANT_APPLY_LIMIT = 100;

/**
 * Fixed column order for the privilege groups Lakekeeper's own authorizers use.
 * The `category` field is authorizer-supplied and open, so anything unrecognized
 * sorts after these as its own group rather than being treated as an error, and
 * `null` collects into "other".
 */
export const PRIVILEGE_CATEGORY_ORDER = [
  'create',
  'read',
  'update',
  'delete',
  'metadata',
  'write',
  'security',
  'administration',
];

/**
 * A CRUD bucket inferred from a privilege's name.
 *
 * Only used where the authorizer publishes no `category` of its own — several
 * report none, and one undifferentiated "Other" group tells a reader nothing.
 * The authorizer's own grouping always wins when it exists: it knows what its
 * privileges mean, and this only knows how they are spelled.
 *
 * Order matters. `grant_*` and ownership are security before anything else
 * claims them, and `undrop` is a restore rather than a delete.
 */
export function derivePrivilegeCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(^|_)grant|ownership|^assume|admin|security/.test(n)) return 'security';
  // Cedar's `manage` is full functional control of a level and everything
  // beneath it — rename, configure, delete, protection — not an update among
  // others. Only the bare name: `manage_tags` and friends are ordinary updates.
  if (n === 'manage') return 'administration';
  if (/^create|^register/.test(n)) return 'create';
  if (/^delete|^drop|^purge|^remove/.test(n)) return 'delete';
  if (/^get|^list|^read|^select|^describe|^search|^use$|include_in_list/.test(n)) return 'read';
  // Attaching a tag changes the object it is attached to.
  if (n === 'apply') return 'update';
  if (
    /^update|^modify|^set|^rename|^commit|^write|^activate|^deactivate|^undrop|^control|^manage/.test(
      n,
    )
  ) {
    return 'update';
  }
  return 'other';
}

/** Rank a category for display: the known ones first, then anything else, then ungrouped. */
export function privilegeCategoryRank(name: string): number {
  const i = PRIVILEGE_CATEGORY_ORDER.indexOf(name);
  if (i !== -1) return i;
  return PRIVILEGE_CATEGORY_ORDER.length + (name === 'other' ? 1 : 0);
}

/**
 * Lays a vocabulary out in groups, so a picker can show columns instead of one
 * long list. An unrecognized category becomes its own group rather than an
 * error, and `null` collects into "other" — the categories are authorizer-
 * supplied and open.
 */
export function groupPrivileges(privileges: GrantablePrivilege[]): {
  name: string;
  label: string;
  privileges: GrantablePrivilege[];
}[] {
  const byCategory = new Map<string, GrantablePrivilege[]>();
  for (const p of privileges) {
    const key = p.privilege.category ?? derivePrivilegeCategory(p.privilege.name);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(p);
  }
  return [...byCategory.entries()]
    .sort(
      (a, b) =>
        privilegeCategoryRank(a[0]) - privilegeCategoryRank(b[0]) || a[0].localeCompare(b[0]),
    )
    .map(([name, list]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      privileges: list,
    }));
}

/**
 * The resource types in hierarchy order, for views that walk all of them. The
 * API publishes its vocabulary as an unordered map, and alphabetical would put
 * a table above a warehouse.
 */
export const RESOURCE_TYPE_ORDER = [
  'server',
  'project',
  'warehouse',
  'namespace',
  'table',
  'view',
  'generic-table',
  'tag-definition',
];

/**
 * A one-line "when was this granted" for a set of grants.
 *
 * Privileges applied in one atomic diff share a timestamp, which is the common
 * case, so that collapses to a single date; a set assembled over time reports
 * its range instead of pretending to a single moment. `created-at` is optional,
 * so a set with none reports nothing rather than a guess.
 */
export function formatGrantedSummary(values: (string | null | undefined)[]): string {
  const times = values
    .filter((v): v is string => !!v)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!times.length) return '';
  const first = times[0].toLocaleDateString();
  const last = times[times.length - 1].toLocaleDateString();
  return first === last ? `Granted ${first}` : `Granted ${first} – ${last}`;
}

/**
 * Authorizers whose grants the console manages.
 *
 * A list rather than a single name so another backend can be added without
 * hunting down call sites — every grants surface gates on this one check. The
 * catalog's other authorizers express access through assignments instead, which
 * the permissions UI covers.
 *
 * `allow-all` is here for development: it publishes the full vocabulary and
 * permits everything, so it is the only backend the grants UI can currently be
 * exercised against end to end. Cedar is the intended home. OpenFGA is listed
 * because grants are becoming its model too — until its authorizer implements
 * `grantable_privileges` it reports an empty vocabulary, and every surface stays
 * hidden on that answer rather than on this list.
 */
export const GRANT_ENABLED_AUTHZ_BACKENDS = ['cedar', 'openfga', 'allow-all'];

/** Whether this server's authorizer is one whose grants the console manages. */
export function isGrantEnabledBackend(authzBackend: string | undefined | null): boolean {
  return !!authzBackend && GRANT_ENABLED_AUTHZ_BACKENDS.includes(authzBackend.toLowerCase());
}

/**
 * Authorizers that can answer "what does this principal hold anywhere".
 *
 * The reverse question of every other grants view, and a strictly harder one: it
 * needs an index by principal. OpenFGA keeps none — it stores permissions per
 * resource and declines the project-wide listing with 501 rather than reading
 * its whole store — so the principal-scoped surfaces are not offered there at
 * all. Granting *to* a user or role works under every backend on this list;
 * only the aggregate listing is missing.
 */
export const GRANT_PRINCIPAL_LISTING_BACKENDS = ['cedar', 'allow-all'];

/** Whether this server's authorizer can list one principal's grants project-wide. */
export function supportsPrincipalGrantListing(authzBackend: string | undefined | null): boolean {
  return !!authzBackend && GRANT_PRINCIPAL_LISTING_BACKENDS.includes(authzBackend.toLowerCase());
}

/**
 * Principal id -> display name, shared for the session.
 *
 * Grants carry ids; every view of them wants names. Resolving is one request
 * per distinct principal, so the answers are kept rather than re-fetched by
 * each panel that happens to list the same person.
 */
const principalNameCache = new Map<string, { name: string; subtitle: string }>();

/** A page walk that never terminates would hang the pane rather than fail it. */
const MAX_PAGES = 200;

/**
 * Asked for on every listing. The server is free to return fewer — a short page
 * says nothing about whether more remain — but requesting a sensible number
 * keeps a resource with many grants from being walked a handful at a time.
 */
const GRANT_PAGE_SIZE = 200;

/**
 * The static vocabulary is identical for every caller and changes only when the
 * server does, so it is fetched once per session. The per-caller `allowed`
 * decision deliberately does *not* live here — that comes from the per-resource
 * endpoints and differs by principal.
 */
let vocabularyCache: Record<string, PrivilegeDescriptor[]> | null = null;
let vocabularyInFlight: Promise<Record<string, PrivilegeDescriptor[]>> | null = null;

/**
 * One uuid -> path index per warehouse, built by walking it once.
 *
 * Grants name resources by id and every route names them by path, with no
 * reverse lookup in the API. Resolving row by row would repeat the same walk
 * for every grant on the same warehouse, so the walk is done once and shared —
 * and cached for the session, since a rename is far rarer than a re-render.
 */
const warehouseIndexCache = new Map<
  string,
  Promise<{
    warehouseName: string;
    namespaces: Map<string, string>;
    tabulars: Map<string, { namespace: string; name: string; kind: string }>;
  }>
>();

/** Drops every cached lookup — call when the server or project changes. */
export function resetGrantVocabulary() {
  vocabularyCache = null;
  vocabularyInFlight = null;
  warehouseIndexCache.clear();
  supportedResolved = false;
  supportedRef.value = null;
}

/**
 * True when the project-wide listing is unavailable on this deployment rather
 * than failing for this caller. An authorizer that stores permissions per
 * resource cannot answer "everything this principal holds" without reading its
 * whole store, so it declines with 501 instead.
 */
export function isGrantListingNotImplemented(error: any): boolean {
  return getErrorCode(error) === 501 || error?.error?.type === 'GrantListingNotImplemented';
}

/** True when the request named no principal and the endpoint requires one. */
export function isMissingGrantPrincipal(error: any): boolean {
  return error?.error?.type === 'MissingGrantPrincipal';
}

/**
 * True when the server could not reach its authorizer at all.
 *
 * Distinct from "you may not" and from "this authorizer cannot answer that":
 * nothing is wrong with the request, the authorization service is simply down,
 * so the honest response is to say so and offer a retry rather than to render
 * an empty matrix that reads as "no one holds anything".
 */
export function isAuthorizationBackendUnavailable(error: any): boolean {
  return getErrorCode(error) === 503 || error?.error?.type === 'AuthorizationBackendError';
}

/** Stable identity for a principal, matching the `UserOrRole` union. */
export function principalKey(p: { user?: string; role?: string } | any): string {
  return p?.user ? `user:${p.user}` : `role:${p.role}`;
}

/** Stable identity for one grant, used to diff an edited matrix against its snapshot. */
export function grantKey(principal: any, privilege: string): string {
  return `${principalKey(principal)}|${privilege}`;
}

/** A resource ref reduced to a string, for keying caches and rail panes. */
export function resourceKey(ref: GrantResourceRef): string {
  switch (ref.type) {
    case 'server':
      return 'server';
    case 'project':
      return `project:${ref.projectId ?? 'current'}`;
    case 'warehouse':
      return `warehouse:${ref.warehouseId}`;
    case 'namespace':
      return `namespace:${ref.warehouseId}:${ref.namespaceId}`;
    case 'table':
      return `table:${ref.warehouseId}:${ref.tableId}`;
    case 'view':
      return `view:${ref.warehouseId}:${ref.viewId}`;
    case 'generic-table':
      return `generic-table:${ref.warehouseId}:${ref.genericTableId}`;
    case 'tag-definition':
      return `tag-definition:${ref.tagDefinitionId}`;
  }
}

/**
 * Turns a listed grant's resource back into a ref the console can address.
 *
 * The API deliberately spells `type` the same way the URL segment does, so this
 * is a rename rather than a translation table. Returns null for a shape this
 * build does not know, so a newer server cannot break an older console.
 */
export function refFromResponse(resource: GrantResourceResponse): GrantResourceRef | null {
  const r = resource as any;
  switch (r?.type) {
    case 'server':
      return { type: 'server' };
    case 'project':
      return { type: 'project', projectId: r['project-id'] };
    case 'warehouse':
      return { type: 'warehouse', warehouseId: r['warehouse-id'] };
    case 'namespace':
      return {
        type: 'namespace',
        warehouseId: r['warehouse-id'],
        namespaceId: r['namespace-id'],
      };
    case 'table':
      return { type: 'table', warehouseId: r['warehouse-id'], tableId: r['table-id'] };
    case 'view':
      return { type: 'view', warehouseId: r['warehouse-id'], viewId: r['view-id'] };
    case 'generic-table':
      return {
        type: 'generic-table',
        warehouseId: r['warehouse-id'],
        genericTableId: r['generic-table-id'],
      };
    case 'tag-definition':
      return { type: 'tag-definition', tagDefinitionId: r['tag-definition-id'] };
    default:
      return null;
  }
}

/** Human-readable noun for a resource level, for rail labels and messages. */
export function resourceLabel(type: ResourceType | string): string {
  switch (type) {
    case 'generic-table':
      // The API's own spelling. The console says "dataset" in places, but that
      // endpoint does not exist yet, so grants use the name the server uses.
      return 'Generic table';
    case 'tag-definition':
      return 'Tag';
    default:
      return String(type).charAt(0).toUpperCase() + String(type).slice(1);
  }
}

/** Icon per resource level, so the rail reads as a hierarchy at a glance. */
export function resourceIcon(type: ResourceType | string): string {
  switch (type) {
    case 'server':
      return 'mdi-server';
    case 'project':
      return 'mdi-folder-account-outline';
    case 'warehouse':
      return 'mdi-database-outline';
    case 'namespace':
      return 'mdi-folder-outline';
    case 'table':
      return 'mdi-table';
    case 'view':
      return 'mdi-table-eye';
    case 'generic-table':
      return 'mdi-file-table-outline';
    case 'tag-definition':
      return 'mdi-tag-outline';
    default:
      return 'mdi-shield-key-outline';
  }
}

// Null until the server has answered. A plain `false` would be indistinguishable
// from "not supported", and callers that act on that — restoring a bookmarked
// tab, say — would act on an answer that has not arrived yet.
const supportedRef = ref<boolean | null>(null);
let supportedResolved = false;

/**
 * Whether this deployment manages grants, as a ref a menu can bind to directly.
 *
 * Only the server decides. Grants were briefly gated on the build edition as
 * well — they were a Lakekeeper+ capability — but they are the access model for
 * OpenFGA too, so a server that publishes a grant vocabulary gets the UI
 * whichever console is talking to it.
 *
 * Resolves once per session and is shared, so the dozen action menus on a page
 * ask the server between them exactly once.
 */
export function useGrantsSupported() {
  if (!supportedResolved) {
    supportedResolved = true;
    const visual = useVisualStore();
    const user = useUserStore();
    const grants = useGrants();

    // This runs wherever a gated control might appear — including the app bar,
    // which the login and bootstrap pages also render. Asking the server
    // anything there costs a 401 (management calls are refused before
    // bootstrap) and the global handler turns that into a redirect to login, so
    // the question waits until there is someone to ask for and a server willing
    // to be asked.
    //
    // Unknown is not the same answer as unsupported: staying null keeps a
    // bookmarked ?tab=grants alive until the real answer lands.
    watch(
      () => [
        visual.getServerInfo()?.['authz-backend'],
        visual.getServerInfo()?.bootstrapped,
        user.isAuthenticated,
      ],
      ([backend, bootstrapped, authenticated]) => {
        if (!backend || !bootstrapped || !authenticated) {
          supportedRef.value = null;
          return;
        }
        if (!isGrantEnabledBackend(backend as string)) {
          supportedRef.value = false;
          return;
        }
        grants
          .grantsSupported()
          .then((ok) => (supportedRef.value = ok))
          .catch(() => (supportedRef.value = false));
      },
      { immediate: true },
    );
  }
  return supportedRef;
}

/**
 * Whether to offer the principal-scoped grants surfaces — a user's or role's own
 * Grants tab, and the explorer's Principal scope.
 *
 * Both ask the reverse question, which not every authorizer indexes for. Gating
 * on the backend keeps a tab that could only ever report "not available on this
 * authorizer" from being offered at all; the panel keeps its own 501 handling
 * for an authorizer that surprises us.
 */
export function useGrantPrincipalListingSupported() {
  const visual = useVisualStore();
  const supported = useGrantsSupported();
  return computed(
    () =>
      supported.value === true &&
      supportsPrincipalGrantListing(visual.getServerInfo()?.['authz-backend']),
  );
}

/**
 * The grants API, addressed by resource rather than by endpoint.
 *
 * Every level publishes the same triad, so the components work against one
 * interface and this composable owns the dispatch. It also owns the two things
 * every caller would otherwise have to remember: that listings page until the
 * token is *absent* (a short or empty page does not mean the end), and that
 * `apply` answers 204 with no body, so state comes from a re-read.
 */
export function useGrants() {
  const functions = useFunctions();

  /** Whether this deployment's authorizer manages grants at all. */
  const supported = ref<boolean | null>(null);

  async function loadVocabulary(): Promise<Record<string, PrivilegeDescriptor[]>> {
    if (vocabularyCache) return vocabularyCache;
    // Concurrent panes opening at once should share one request, not race.
    if (!vocabularyInFlight) {
      vocabularyInFlight = functions
        // Silent: the first caller is the capability probe, which now runs on
        // every OpenFGA server — including ones whose authorizer predates
        // `grantable_privileges`. That answer is "no grants UI", not an error to
        // put in front of someone. Callers that need to say something (the
        // panels) render their own state from the rejection.
        .getGrantablePrivilegesVocabulary(false)
        .then((res: any) => {
          vocabularyCache = res?.privileges ?? {};
          return vocabularyCache!;
        })
        .catch((e: any) => {
          vocabularyInFlight = null;
          throw e;
        });
    }
    return vocabularyInFlight;
  }

  /**
   * False when no resource type publishes a privilege — the documented signal
   * for an authorizer that manages no grants, which is what `allow-all` reports.
   * Surfaces that as "hide the UI" rather than as an error state.
   */
  async function grantsSupported(): Promise<boolean> {
    if (supported.value !== null) return supported.value;
    // Backend first: on an authorizer the console does not manage grants for,
    // this answers without asking the server anything.
    if (!isGrantEnabledBackend(useVisualStore().getServerInfo()?.['authz-backend'])) {
      supported.value = false;
      return false;
    }
    try {
      const vocab = await loadVocabulary();
      supported.value = Object.values(vocab).some((list) => (list?.length ?? 0) > 0);
    } catch {
      supported.value = false;
    }
    return supported.value;
  }

  /** The vocabulary for one resource type, without the per-caller decision. */
  async function vocabularyFor(type: ResourceType | string): Promise<PrivilegeDescriptor[]> {
    const vocab = await loadVocabulary();
    return vocab[type] ?? [];
  }

  /**
   * The whole published vocabulary, keyed by resource type — what *can* be
   * granted anywhere on this server, as opposed to what anyone holds. Every
   * resource type the API knows is present, so an empty list distinguishes
   * "nothing is grantable here" from "unknown type".
   */
  async function vocabulary(): Promise<Record<string, PrivilegeDescriptor[]>> {
    return loadVocabulary();
  }

  /**
   * Walks a paged listing to the end.
   *
   * Stops on an absent token, never on a short or empty page — those say
   * nothing about whether more remain. A server that keeps handing back the
   * same token would otherwise spin, so a repeat ends the walk too.
   */
  async function walkPages(
    fetchPage: (pageToken?: string) => Promise<ListGrantsResponse>,
  ): Promise<GrantResponse[]> {
    const out: GrantResponse[] = [];
    const seenTokens = new Set<string>();
    let token: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchPage(token);
      out.push(...(res?.grants ?? []));
      const next = res?.['next-page-token'];
      if (!next || seenTokens.has(next)) break;
      seenTokens.add(next);
      token = next;
    }
    return out;
  }

  /** Every grant held directly on one resource, across all pages. */
  async function listGrants(
    ref: GrantResourceRef,
    filter?: GrantPrincipalFilter,
  ): Promise<GrantResponse[]> {
    return walkPages((pageToken) => {
      const options: GrantListOptions = { ...filter, pageToken, pageSize: GRANT_PAGE_SIZE };
      switch (ref.type) {
        case 'server':
          return functions.listServerGrants(options);
        case 'project':
          return functions.listProjectGrants(options, ref.projectId);
        case 'warehouse':
          return functions.listWarehouseGrants(ref.warehouseId, options);
        case 'namespace':
          return functions.listNamespaceGrants(ref.warehouseId, ref.namespaceId, options);
        case 'table':
          return functions.listTableGrants(ref.warehouseId, ref.tableId, options);
        case 'view':
          return functions.listViewGrants(ref.warehouseId, ref.viewId, options);
        case 'generic-table':
          return functions.listGenericTableGrants(ref.warehouseId, ref.genericTableId, options);
        case 'tag-definition':
          return functions.listTagGrants(ref.tagDefinitionId, options);
      }
    });
  }

  /**
   * Everything one principal holds across the project.
   *
   * Server grants belong to no project and are not included, and an authorizer
   * that cannot answer this reports 501 — callers check with
   * `isGrantListingNotImplemented` and fall back to the per-resource listings.
   */
  async function listPrincipalGrants(
    principal: GrantPrincipalFilter,
    projectId?: string,
  ): Promise<GrantResponse[]> {
    return walkPages((pageToken) =>
      functions.listGrantsForPrincipal(
        { ...principal, pageToken, pageSize: GRANT_PAGE_SIZE },
        projectId,
      ),
    );
  }

  /**
   * The privileges a resource publishes, each carrying whether this caller may
   * grant it.
   *
   * Deliberately unfiltered by the server: a picker has to render what it
   * cannot offer, greyed out, so a withheld privilege does not read as a
   * missing one. `allowed` is also the *only* signal of grant authority —
   * action introspection does not report it — so this doubles as the gate on
   * whether the pane is editable at all.
   */
  async function grantablePrivileges(
    ref: GrantResourceRef,
    principal?: GrantPrincipalFilter,
  ): Promise<GrantablePrivilege[]> {
    let res;
    switch (ref.type) {
      case 'server':
        res = await functions.getServerGrantablePrivileges(principal);
        break;
      case 'project':
        res = await functions.getProjectGrantablePrivileges(principal, ref.projectId);
        break;
      case 'warehouse':
        res = await functions.getWarehouseGrantablePrivileges(ref.warehouseId, principal);
        break;
      case 'namespace':
        res = await functions.getNamespaceGrantablePrivileges(
          ref.warehouseId,
          ref.namespaceId,
          principal,
        );
        break;
      case 'table':
        res = await functions.getTableGrantablePrivileges(ref.warehouseId, ref.tableId, principal);
        break;
      case 'view':
        res = await functions.getViewGrantablePrivileges(ref.warehouseId, ref.viewId, principal);
        break;
      case 'generic-table':
        res = await functions.getGenericTableGrantablePrivileges(
          ref.warehouseId,
          ref.genericTableId,
          principal,
        );
        break;
      case 'tag-definition':
        res = await functions.getTagGrantablePrivileges(ref.tagDefinitionId, principal);
        break;
    }
    return res?.privileges ?? [];
  }

  /**
   * Applies a grant diff to one resource.
   *
   * Atomic and idempotent, and answers 204 with no body — whether an entry was
   * already in the requested state is not reported, so callers re-read rather
   * than assuming. Rejects a diff the server would refuse: the same entry may
   * not appear in both lists, and the two together may not exceed the limit.
   */
  async function applyGrants(
    ref: GrantResourceRef,
    diff: { writes?: GrantEntry[]; deletes?: GrantEntry[] },
  ): Promise<void> {
    const writes = diff.writes ?? [];
    const deletes = diff.deletes ?? [];

    if (writes.length + deletes.length === 0) return;
    if (writes.length + deletes.length > GRANT_APPLY_LIMIT) {
      throw new Error(
        `${writes.length + deletes.length} changes exceeds the ${GRANT_APPLY_LIMIT}-entry limit for a single atomic apply.`,
      );
    }
    // The server rejects an entry present in both lists rather than resolving
    // it, because either reading would be a guess. Cell-level diffing cannot
    // produce one, but a revoke-all followed by a re-add can.
    const written = new Set(writes.map((w) => grantKey(w.principal, w.privilege)));
    const conflict = deletes.find((d) => written.has(grantKey(d.principal, d.privilege)));
    if (conflict) {
      throw new Error(
        `“${conflict.privilege}” is both granted and revoked in the same change — remove one.`,
      );
    }

    const body = {
      ...(writes.length ? { writes } : {}),
      ...(deletes.length ? { deletes } : {}),
    };

    switch (ref.type) {
      case 'server':
        return functions.applyServerGrants(body, true);
      case 'project':
        return functions.applyProjectGrants(body, ref.projectId, true);
      case 'warehouse':
        return functions.applyWarehouseGrants(ref.warehouseId, body, true);
      case 'namespace':
        return functions.applyNamespaceGrants(ref.warehouseId, ref.namespaceId, body, true);
      case 'table':
        return functions.applyTableGrants(ref.warehouseId, ref.tableId, body, true);
      case 'view':
        return functions.applyViewGrants(ref.warehouseId, ref.viewId, body, true);
      case 'generic-table':
        return functions.applyGenericTableGrants(ref.warehouseId, ref.genericTableId, body, true);
      case 'tag-definition':
        return functions.applyTagGrants(ref.tagDefinitionId, body, true);
    }
  }

  /**
   * Walks one warehouse once and indexes everything in it by uuid.
   *
   * A namespace listing plus one tabular listing per namespace. Expensive the
   * first time and free afterwards, which is what makes resolving a whole
   * listing of grants affordable — they nearly always share a warehouse.
   */
  function warehouseIndex(warehouseId: string) {
    const cached = warehouseIndexCache.get(warehouseId);
    if (cached) return cached;

    const built = (async () => {
      const namespaces = new Map<string, string>();
      const tabulars = new Map<string, { namespace: string; name: string; kind: string }>();

      const wh: any = await functions.getWarehouse(warehouseId, false).catch(() => null);
      const warehouseName = wh?.name || warehouseId;

      const listing: any = await functions
        .listNamespaces(warehouseId, undefined, undefined, false)
        .catch(() => null);
      const namespaceMap: Record<string, string> = listing?.namespaceMap ?? {};
      for (const [path, id] of Object.entries(namespaceMap)) namespaces.set(id, path);

      await Promise.all(
        Object.keys(namespaceMap).map(async (nsPath) => {
          const apiNs = nsPath.split('.').join('\x1F');
          const add = (name: string, id: string, kind: string) =>
            tabulars.set(id, { namespace: nsPath, name, kind });
          // A namespace this caller cannot list simply contributes nothing.
          await Promise.all([
            functions
              .listTableUuids(warehouseId, apiNs, false)
              .then(({ names, uuids }) => uuids.forEach((id, i) => add(names[i], id, 'table')))
              .catch(() => undefined),
            functions
              .listViewUuids(warehouseId, apiNs, false)
              .then(({ names, uuids }) => uuids.forEach((id, i) => add(names[i], id, 'view')))
              .catch(() => undefined),
            functions
              .listGenericTables(warehouseId, apiNs, undefined, false)
              .then((res: any) =>
                (res?.identifiers ?? []).forEach((g: any) => add(g.name, g.id, 'generic-table')),
              )
              .catch(() => undefined),
          ]);
        }),
      );

      return { warehouseName, namespaces, tabulars };
    })();

    warehouseIndexCache.set(warehouseId, built);
    return built;
  }

  /**
   * Turns a grant's resource id into a path a person can read and a route they
   * can open. Falls back to the id where the object is dropped or invisible —
   * the grant is still real and still revocable either way.
   */
  async function resolveResourceLocation(
    ref: GrantResourceRef,
  ): Promise<{ path: string; route: string | null }> {
    if (ref.type === 'server') return { path: 'Server', route: null };
    if (ref.type === 'project') return { path: 'Project', route: null };

    if (ref.type === 'tag-definition') {
      const tag: any = await functions
        .getTagDefinition(ref.tagDefinitionId, false)
        .catch(() => null);
      return {
        path: tag?.name || ref.tagDefinitionId,
        route: `/governance/tags/${ref.tagDefinitionId}`,
      };
    }

    const warehouseId = (ref as any).warehouseId as string;
    const index = await warehouseIndex(warehouseId);
    const { warehouseName } = index;

    if (ref.type === 'warehouse') {
      return { path: warehouseName, route: `/warehouse/${warehouseId}` };
    }

    if (ref.type === 'namespace') {
      const nsPath = index.namespaces.get(ref.namespaceId);
      if (!nsPath) return { path: `${warehouseName} / ${ref.namespaceId}`, route: null };
      return {
        path: `${warehouseName} / ${nsPath}`,
        route: `/warehouse/${warehouseId}/namespace/${encodeURIComponent(nsPath)}`,
      };
    }

    const wantedId =
      ref.type === 'table' ? ref.tableId : ref.type === 'view' ? ref.viewId : ref.genericTableId;
    const hit = index.tabulars.get(wantedId);
    if (!hit) return { path: `${warehouseName} / ${wantedId}`, route: null };

    const segment = ref.type === 'table' ? 'table' : ref.type === 'view' ? 'view' : 'generic-table';
    return {
      path: `${warehouseName} / ${hit.namespace} / ${hit.name}`,
      route: `/warehouse/${warehouseId}/namespace/${encodeURIComponent(hit.namespace)}/${segment}/${encodeURIComponent(hit.name)}`,
    };
  }

  /**
   * A principal's display name, resolved once and remembered.
   *
   * A principal that can no longer be read keeps its row and shows its id: the
   * grant is still real, and still revocable.
   */
  async function resolvePrincipalName(
    kind: 'user' | 'role',
    id: string,
  ): Promise<{ name: string; subtitle: string }> {
    const key = `${kind}:${id}`;
    const cached = principalNameCache.get(key);
    if (cached) return cached;

    const out = { name: id, subtitle: kind === 'role' ? 'Role' : '' };
    try {
      if (kind === 'user') {
        const u: any = await functions.getUser(id);
        out.name = u?.name || u?.['preferred_username'] || id;
        out.subtitle = u?.email || '';
      } else {
        const r: any = await functions.getRoleMetadata(id);
        out.name = r?.name || id;
      }
    } catch {
      out.subtitle = kind === 'role' ? 'Role · unresolved' : 'Unresolved';
    }
    principalNameCache.set(key, out);
    return out;
  }

  return {
    supported,
    grantsSupported,
    resolvePrincipalName,
    resolveResourceLocation,
    vocabularyFor,
    vocabulary,
    listGrants,
    listPrincipalGrants,
    grantablePrivileges,
    applyGrants,
  };
}
