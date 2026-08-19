import { computed, readonly, ref } from 'vue';

export type ConnectivityStatus = 'pending' | 'online' | 'offline';

/**
 * The probe target doubles as the AppBar's GitHub star source, so a session
 * makes one outbound request rather than one per interested surface.
 */
const PROBE_URL = 'https://api.github.com/repos/lakekeeper/lakekeeper';
const PROBE_TIMEOUT_MS = 3000;

const status = ref<ConnectivityStatus>('pending');
let probe: Promise<Record<string, any> | null> | null = null;

async function runProbe(): Promise<Record<string, any> | null> {
  // Authoritative for "no network at all", and saves an outbound request in
  // air-gapped deployments.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    status.value = 'offline';
    return null;
  }

  const controller = new AbortController();
  // Without this, a blackholing proxy — common in air-gapped setups — leaves
  // the request, and every surface waiting on it, pending forever.
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(PROBE_URL, { signal: controller.signal });
    // A non-ok response (rate limit, proxy error page) still means the network
    // is up, which is all the link-rendering decision depends on.
    status.value = 'online';
    if (!res.ok) return null;
    // The status is already decided: the network answered. A body we cannot
    // parse says nothing about reachability, so it must not fall through to the
    // outer catch and demote a live connection to offline.
    try {
      return await res.json();
    } catch {
      return null;
    }
  } catch {
    status.value = 'offline';
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Session-wide internet reachability.
 *
 * Air-gapped deployments are a first-class case: any surface that renders an
 * external link (vakamo.com, zcal, GitHub) gates it on `isOnline` and falls
 * back to an offline-safe path — normally the mailto contact — so a dead link
 * is never shown. `isOnline` stays false while the probe is pending, which
 * also avoids a flash of links that are about to be removed.
 */
export function useConnectivity() {
  /** Starts the probe on first call; later callers share the same result. */
  function checkConnectivity(): Promise<Record<string, any> | null> {
    if (!probe) probe = runProbe();
    return probe;
  }

  // Self-starting, so a surface that only reads `isOnline` still resolves —
  // otherwise deep-linking to a page rendered without the AppBar would leave
  // the status pending forever and hide every external link.
  checkConnectivity();

  return {
    status: readonly(status),
    isOnline: computed(() => status.value === 'online'),
    isPending: computed(() => status.value === 'pending'),
    checkConnectivity,
  };
}
