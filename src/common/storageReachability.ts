/**
 * Why a browser request to object storage failed — established, not guessed.
 *
 * The browser collapses every cross-origin failure into an opaque
 * `TypeError: Failed to fetch`: no status, no headers, no reason. A blocked
 * port, a DNS failure, a TLS error, an extension, being offline and a genuine
 * CORS rejection are indistinguishable at that point. Reporting all of them as
 * "probably CORS" (which is what we did) sends people to reconfigure a bucket
 * that was never asked anything — see lakekeeper/lakekeeper#2010, where the
 * request never left the browser because the endpoint used port 10080.
 *
 * So establish what we can, in order of cost:
 *   1. The URL alone — a port browsers refuse to connect to, or http content on
 *      an https page. Both are provable with no network at all.
 *   2. `navigator.onLine` — cheap, rules out the trivial case.
 *   3. A `mode: 'no-cors'` probe. CORS is enforced on the *response*, not on
 *      sending, so an opaque result proves the network path works and makes CORS
 *      a credible diagnosis; a failure proves the request never got out, and CORS
 *      should not be mentioned at all.
 *
 * Only `kind: 'blocked'` justifies talking about CORS, and even then it is a
 * likelihood, not a fact — proving it needs the response headers, which only the
 * server can read (a preflight run server-side).
 */

/**
 * Ports browsers refuse to fetch from, from the Fetch standard's "bad ports"
 * list. Hardcoded rather than probed: this is exactly the case where the
 * request never leaves the browser, so there is nothing to observe.
 */
const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

export type ReachabilityKind =
  /** The browser refuses this port outright; nothing was ever sent. */
  | 'blocked-port'
  /** An https page may not load http subresources; nothing was ever sent. */
  | 'mixed-content'
  /** The browser reports no network. */
  | 'offline'
  /** Even an opaque no-cors request failed: DNS, TLS, refused, filtered. */
  | 'unreachable'
  /** The host answered an opaque request, so the path works and the response was rejected. */
  | 'blocked'
  /** Same, but the operation that failed was a write — a narrower set of causes. */
  | 'write-blocked'
  /** Nothing could be established (no URL to probe, probe not run). */
  | 'unknown';

export interface Reachability {
  kind: ReachabilityKind;
  /** One sentence, safe to show verbatim. */
  message: string;
  /** The URL the verdict is about, when known. */
  url?: string;
}

/** The object URL a DuckDB/httpfs error mentions, so the probe has a target. */
export function extractUrl(text: string): string | undefined {
  const m = /https?:\/\/[^\s"'<>\\)]+/i.exec(text || '');
  return m ? m[0] : undefined;
}

function portOf(u: URL): number {
  if (u.port) return Number(u.port);
  return u.protocol === 'https:' ? 443 : 80;
}

/**
 * Verdict from the URL alone — no network, no async, always safe to run.
 * `pageProtocol` is injectable so this stays testable outside a browser.
 */
export function staticVerdict(
  rawUrl: string | undefined,
  pageProtocol: string = typeof location !== 'undefined' ? location.protocol : 'http:',
): Reachability | null {
  if (!rawUrl) return null;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const port = portOf(u);
  if (BAD_PORTS.has(port)) {
    return {
      kind: 'blocked-port',
      url: rawUrl,
      message:
        `The request never left the browser: browsers refuse to connect to port ${port} ` +
        `(it is on their blocked-port list). Expose the storage endpoint on a different port.`,
    };
  }

  // localhost is exempt from mixed-content blocking; everything else is not.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
  if (pageProtocol === 'https:' && u.protocol === 'http:' && !local) {
    return {
      kind: 'mixed-content',
      url: rawUrl,
      message:
        'The request never left the browser: this page is served over https and the storage ' +
        'endpoint uses plain http, which browsers block as mixed content. Serve the endpoint ' +
        'over https.',
    };
  }
  return null;
}

/**
 * Does an opaque request get through? Resolves true when the network path works
 * (the response is opaque, so its status is deliberately invisible — that is
 * fine, reachability is the whole question), false when it does not.
 */
export async function probeReachable(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    await fetchImpl(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Full ladder: static checks, then offline, then the probe. `url` may be
 * undefined (nothing to probe), in which case the verdict is `unknown` and
 * callers should stay vague rather than blame CORS.
 */
export async function diagnoseReachability(
  url: string | undefined,
  deps: {
    pageProtocol?: string;
    online?: boolean;
    fetchImpl?: typeof fetch;
    /**
     * What was being attempted. A failed write on a reachable endpoint has a
     * narrower set of causes than a failed read — the probe only proves that
     * GET-shaped traffic gets through, so saying "CORS" flat out would again be
     * claiming more than we know (lakekeeper/lakekeeper#2011).
     */
    operation?: 'read' | 'write';
  } = {},
): Promise<Reachability> {
  const pageProtocol =
    deps.pageProtocol ?? (typeof location !== 'undefined' ? location.protocol : 'http:');
  const online =
    deps.online ?? (typeof navigator !== 'undefined' ? navigator.onLine !== false : true);

  const stat = staticVerdict(url, pageProtocol);
  if (stat) return stat;

  if (!online) {
    return {
      kind: 'offline',
      url,
      message: 'The browser reports no network connection.',
    };
  }

  if (!url) {
    return {
      kind: 'unknown',
      message: 'The browser request failed before a response was received.',
    };
  }

  const reachable = await probeReachable(url, deps.fetchImpl);
  if (reachable && deps.operation === 'write') {
    return {
      kind: 'write-blocked',
      url,
      message:
        'The storage endpoint answered, so reads reach it — the write did not complete. Check ' +
        'that the bucket’s CORS rule lists PUT, POST and DELETE (not only GET and HEAD) and ' +
        'exposes ETag, and that the vended credentials carry write permission for this table.',
    };
  }
  return reachable
    ? {
        kind: 'blocked',
        url,
        message:
          'The storage endpoint is reachable, but the browser rejected the response. The bucket ' +
          'most likely has no CORS rule allowing this origin — or the vended credentials expired ' +
          'and a cached catalog response is being reused.',
      }
    : {
        kind: 'unreachable',
        url,
        message:
          `The storage endpoint (${new URL(url).origin}) could not be reached from this browser. ` +
          'The request produced no response at all — check that the host resolves, the port is ' +
          'open to the browser, TLS is valid, and no extension or proxy is filtering it. This is ' +
          'not a CORS problem: a CORS rejection still produces a response.',
      };
}
