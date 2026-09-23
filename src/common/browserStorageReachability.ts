/**
 * Can *this browser* reach the warehouse's object storage?
 *
 * Every check the management API runs is about the path from Lakekeeper to the
 * bucket (`lakekeeper-read-write`, `vended-credentials-read-write`). None of them
 * can answer this one: CORS is evaluated in the browser, against the console's
 * own origin, and a server-side preflight would have to guess that origin and
 * still would not prove the browser's verdict. So this check runs client-side,
 * talks only to the storage endpoint, and never touches the Lakekeeper API.
 *
 * It is advisory by construction. It reports `passed` or `warning` and never
 * `failed`: the browser path is not required for a correct warehouse — plenty of
 * warehouses are only ever read by engines outside the browser — so a bad result
 * here must not make a configuration invalid or block a create.
 */

import { diagnoseReachability, staticVerdict } from './storageReachability';
import { storageProbeUrl } from './storageProbeUrl';
import { stsDisabled } from './vendedCredentials';

export type BrowserCheckStatus = 'passed' | 'warning' | 'skipped';

export interface BrowserStorageCheck {
  status: BrowserCheckStatus;
  /** One sentence, safe to show verbatim. */
  detail: string;
  /** The URL the verdict is about, when one could be derived. */
  url?: string;
  /**
   * A bucket CORS rule is the likely cause, so offering the configuration
   * snippet is useful rather than misleading. False for every verdict that
   * proves the request never reached the storage at all.
   */
  corsLikely: boolean;
  /** Wall-clock duration, to match how backend checks report themselves. */
  durationMs?: number;
}

/**
 * One request, and only its success or failure is read. `mode: 'cors'` is the
 * point: an opaque (`no-cors`) request cannot fail on CORS, so it would answer a
 * different question — that is what `diagnoseReachability` uses it for, after the
 * fact, to tell "rejected" apart from "never arrived".
 *
 * A 403 or 404 counts as success. The probe key does not exist and the request
 * carries no credentials, so an error status is the expected answer; what it
 * proves is that the browser was allowed to read the response at all.
 */
async function probeCors(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers,
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const PROBE_TIMEOUT_MS = 5_000;

function skipped(detail: string): BrowserStorageCheck {
  return { status: 'skipped', detail, corsLikely: false };
}

/**
 * `profile` is the warehouse's storage profile — the stored one, or the one a
 * form is about to submit; both work, since nothing here is looked up by id.
 */
export async function checkBrowserStorageReachability(
  profile: Record<string, any> | null | undefined,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<BrowserStorageCheck> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;

  if (!profile) return skipped('No storage profile to check.');

  // Asked before anything is sent: with vended credentials off, the browser
  // never holds a credential for this storage, so it would not read it even from
  // a perfectly configured bucket. Probing anyway would produce a CORS warning
  // about a bucket that is not the problem.
  if (stsDisabled(profile)) {
    return skipped(
      'Vended credentials (STS) are disabled, so the browser never reads this storage directly ' +
        'and its CORS configuration does not apply.',
    );
  }

  const target = storageProbeUrl(profile);
  if (!target) {
    return skipped(
      `Browser access to ${String(profile.type ?? 'this storage').toUpperCase()} storage is not ` +
        'checked — the console does not read it directly from the browser.',
    );
  }

  // Cheapest first, and the only verdicts that are provable rather than likely:
  // a browser-blocked port or plain http on an https page means nothing will
  // leave the browser, so sending the probes would waste two timeouts to learn
  // what the URL already said (lakekeeper/lakekeeper#2010).
  const upfront = staticVerdict(target.url);
  if (upfront) {
    return {
      status: 'warning',
      url: target.url,
      corsLikely: false,
      detail: upfront.message,
    };
  }

  const started = Date.now();
  const preflighted = await probeCors(
    target.url,
    { [target.preflightHeader]: 'probe' },
    fetchImpl,
    timeoutMs,
  );
  if (preflighted) {
    return {
      status: 'passed',
      url: target.url,
      corsLikely: false,
      durationMs: Date.now() - started,
      detail:
        'The storage endpoint answered a cross-origin request from this console, including the ' +
        'preflight. Reads from the browser should work. This does not cover writes — those need ' +
        'PUT, POST and DELETE in the same CORS rule, which cannot be tested without writing.',
    };
  }

  // The preflighted request failed. A plain request separates "this origin is
  // not allowed at all" from "the origin is allowed, but not the headers the
  // real client sends" — two different bucket edits, and worth the extra
  // round-trip only here, on the failure path.
  const simple = await probeCors(target.url, {}, fetchImpl, timeoutMs);
  if (simple) {
    return {
      status: 'warning',
      url: target.url,
      corsLikely: true,
      durationMs: Date.now() - started,
      detail:
        'The bucket allows simple requests from this console, but the preflight for the ' +
        `${target.preflightHeader} header was rejected. Real clients sign every request with ` +
        'that header, so reads will still fail — widen the rule’s AllowedHeaders, for which "*" ' +
        'is the usual setting.',
    };
  }

  // Neither got through. Hand off to the ladder that establishes *why* rather
  // than blaming CORS by default — a blocked port or a plain http endpoint on an
  // https page never reaches the network at all.
  const verdict = await diagnoseReachability(target.url, {
    fetchImpl,
    operation: 'read',
  });
  return {
    status: 'warning',
    url: target.url,
    corsLikely: verdict.kind === 'blocked',
    durationMs: Date.now() - started,
    detail: verdict.message,
  };
}
