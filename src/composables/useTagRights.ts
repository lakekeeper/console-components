import { computed, reactive } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useConfig } from './useCatalogPermissions';
import {
  errorMessage,
  getErrorCode,
  isForbiddenError,
  isNotFoundError,
} from '../common/errorUtils';
import type { LakekeeperTagAction } from '../gen/management/types.gen';

/**
 * Writing a tag takes two rights: manage_tags on the object, which the host
 * already knows, and a right on the tag itself — `apply` to put it on or change
 * its value, `remove` to take it off. The batch check has no tag target, so the
 * second is one request per definition. Answers are shared across every
 * instance for a minute, and only asked for what is on screen.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; actions: Promise<Set<string>> }>();

// Any id whose answer is in, for every instance at once.
const answers = reactive(new Map<string, Set<string>>());

const MAX_IN_FLIGHT = 6;

export function useTagRights() {
  const functions = useFunctions();
  const config = useConfig();

  // Without authentication or an authorizer, there is nothing to ask.
  const unrestricted = computed(
    () => !config.enabledAuthentication.value || !config.enabledPermissions.value,
  );

  function fetchOne(id: string): Promise<Set<string>> {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.actions;
    const actions = functions
      .getTagCatalogActions(id, false)
      .then((list: LakekeeperTagAction[]) => {
        const set = new Set<string>(list.map((a: any) => a?.action ?? a));
        answers.set(id, set);
        return set;
      })
      .catch((e: unknown) => {
        const none = new Set<string>();
        // A refusal is an answer: hold nothing. Anything else is not, so it
        // stays unknown and the next ensure asks again.
        if (isForbiddenError(e)) answers.set(id, none);
        else cache.delete(id);
        return none;
      });
    cache.set(id, { at: Date.now(), actions });
    return actions;
  }

  /** Ask about these definitions, a few at a time. Resolves when all have answered. */
  async function ensure(ids: string[]) {
    if (unrestricted.value) return;
    const queue = [...new Set(ids)].filter((id) => {
      const hit = cache.get(id);
      return !hit || Date.now() - hit.at >= TTL_MS;
    });
    const workers = Array.from({ length: Math.min(MAX_IN_FLIGHT, queue.length) }, async () => {
      while (queue.length) await fetchOne(queue.shift()!);
    });
    await Promise.all(workers);
  }

  /** true / false once answered, undefined while not yet known. */
  function can(id: string | undefined, action: 'apply' | 'remove'): boolean | undefined {
    if (unrestricted.value) return true;
    if (!id) return false;
    const set = answers.get(id);
    return set ? set.has(action) : undefined;
  }

  return {
    ensure,
    canApply: (id?: string) => can(id, 'apply'),
    canRemove: (id?: string) => can(id, 'remove'),
  };
}

/** A refused or failed request, in words that say which of the three it is. */
export function tagRefusal(error: any, what: string): string {
  if (isForbiddenError(error)) return `You are not allowed to ${what}.`;
  if (isNotFoundError(error)) return `Could not ${what}: it no longer exists.`;
  const message = errorMessage(error);
  const code = getErrorCode(error);
  return `Could not ${what}${message ? `: ${message}` : code ? ` (${code})` : ''}.`;
}
