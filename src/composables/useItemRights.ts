import { computed, reactive } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useConfig } from './useCatalogPermissions';

/**
 * Rights on the rows of a list, and on the namespace that holds them.
 *
 * A list of tables offers Rename and Delete on every row, but the rights are
 * per row: `drop` and `rename` on the table, and `create_table` on the
 * namespace for the new name. The list endpoints return names, not ids, so the
 * per-object composables cannot be used; the batch check takes names. Answers
 * are shared across every instance for a minute, and only asked for what is
 * on screen: `can()` queues an unknown answer and the queue is sent in one
 * batch on the next tick.
 */
export type ItemKind = 'warehouse' | 'namespace' | 'table' | 'view' | 'generic-table';

export type ItemTarget = {
  kind: ItemKind;
  warehouseId: string;
  /** Namespace path as segments; for a namespace target, the namespace itself; `[]` for a warehouse. */
  namespace: string[];
  /** Name of the table, view or generic table. Absent for a namespace. */
  name?: string;
  /** Id, when the caller has one (e.g. a soft-deleted tabular, which has no name lookup). */
  id?: string;
};

const TTL_MS = 60_000;
const MAX_CHECKS = 1000; // the endpoint's own cap

// key → { at, allowed }. Reactive so a template re-renders when its answer lands.
const answers = reactive(new Map<string, { at: number; allowed: boolean }>());
const inFlight = new Set<string>();
const queue = new Map<string, { target: ItemTarget; action: string }>();
let flushScheduled: Promise<void> | null = null;

function keyOf(t: ItemTarget, action: string): string {
  const where = t.id ? `id:${t.id}` : `${t.namespace.join('\x1F')}\x1E${t.name ?? ''}`;
  return `${t.kind}|${t.warehouseId}|${where}|${action}`;
}

function operationOf(t: ItemTarget, action: string): any {
  const act = { action };
  if (t.kind === 'warehouse') {
    return { warehouse: { action: act, 'warehouse-id': t.warehouseId } };
  }
  if (t.kind === 'namespace') {
    return { namespace: { action: act, namespace: t.namespace, 'warehouse-id': t.warehouseId } };
  }
  // The check takes `table` / `table-id` for every tabular kind.
  const ident = t.id
    ? { 'table-id': t.id, 'warehouse-id': t.warehouseId }
    : { namespace: t.namespace, table: t.name, 'warehouse-id': t.warehouseId };
  return { [t.kind]: { action: act, ...ident } };
}

export function useItemRights() {
  const functions = useFunctions();
  const config = useConfig();

  // Without authentication or an authorizer, there is nothing to ask.
  const unrestricted = computed(
    () => !config.enabledAuthentication.value || !config.enabledPermissions.value,
  );

  async function send(items: Array<{ key: string; target: ItemTarget; action: string }>) {
    for (let i = 0; i < items.length; i += MAX_CHECKS) {
      const chunk = items.slice(i, i + MAX_CHECKS);
      chunk.forEach((c) => inFlight.add(c.key));
      try {
        const results = await functions.batchCheckActions(
          chunk.map((c, idx) => ({ id: String(idx), operation: operationOf(c.target, c.action) })),
          false,
          false,
        );
        const now = Date.now();
        chunk.forEach((c, idx) => {
          const r = results.find((x) => x.id === String(idx)) ?? results[idx];
          answers.set(c.key, { at: now, allowed: !!r?.allowed });
        });
      } catch {
        // The check itself failed (an older server, a network error): offer the
        // action as before and let the server's answer be reported in place,
        // rather than hiding every control on a question nobody answered.
        const now = Date.now();
        chunk.forEach((c) => answers.set(c.key, { at: now, allowed: true }));
      } finally {
        chunk.forEach((c) => inFlight.delete(c.key));
      }
    }
  }

  function fresh(key: string): boolean {
    const hit = answers.get(key);
    return !!hit && Date.now() - hit.at < TTL_MS;
  }

  function flush(): Promise<void> {
    if (!flushScheduled) {
      flushScheduled = Promise.resolve().then(async () => {
        const items = [...queue.entries()].map(([key, v]) => ({ key, ...v }));
        queue.clear();
        flushScheduled = null;
        await send(items);
      });
    }
    return flushScheduled;
  }

  /** Ask about these targets now. Resolves when every answer is in. */
  async function ensure(targets: ItemTarget[], actions: string[]) {
    if (unrestricted.value) return;
    const items: Array<{ key: string; target: ItemTarget; action: string }> = [];
    for (const target of targets) {
      for (const action of actions) {
        const key = keyOf(target, action);
        if (!fresh(key) && !inFlight.has(key)) items.push({ key, target, action });
      }
    }
    await send(items);
  }

  /**
   * true / false once answered, undefined while not yet known. An unknown
   * answer is queued, so calling this from a row's template is what asks for
   * the rows on screen.
   */
  function can(target: ItemTarget | undefined, action: string): boolean | undefined {
    if (unrestricted.value) return true;
    if (!target || !target.warehouseId) return undefined;
    const key = keyOf(target, action);
    const hit = answers.get(key);
    if (!fresh(key) && !inFlight.has(key) && !queue.has(key)) {
      queue.set(key, { target, action });
      // Never write reactive state during the render that asked.
      void flush();
    }
    return hit?.allowed;
  }

  /** Drop cached answers, e.g. after a rename changed which names exist. */
  function forget() {
    answers.clear();
  }

  return { can, ensure, forget, unrestricted };
}
