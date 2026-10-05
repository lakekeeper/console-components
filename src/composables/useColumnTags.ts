import { computed, reactive, ref, watch, type Ref } from 'vue';
import { useFunctions } from '../plugins/functions';
import { useVisualStore } from '../stores/visual';
import { Type } from '../common/enums';
import { isForbiddenError } from '../common/errorUtils';
import { tagRefusal, useTagRights } from './useTagRights';
import type { TagDefinition, TargetTag } from '../gen/management/types.gen';

/** A schema field as the API addresses it: dotted path for writes, field-id for reads. */
export interface ColumnTagField {
  path: string;
  fieldId?: number;
}

/**
 * Column tags for one table: read in a single request, matched to the current
 * schema by field-id (which survives renames), and written one column at a time
 * because the API has no bulk write.
 */
export function useColumnTags(opts: {
  warehouseId: Ref<string | undefined>;
  tableId: Ref<string | undefined>;
  fields: Ref<ColumnTagField[]>;
  // Definitions are only listed for someone who can apply them.
  canManage: Ref<boolean>;
}) {
  const functions = useFunctions();
  const visual = useVisualStore();

  const tagsByPath = reactive<Record<string, TargetTag[]>>({});
  const loading = ref(false);
  const busy = ref<string | null>(null);
  // Tags whose field-id is no longer in the current schema: the column was
  // dropped but its tags outlived it, and there is no name left to address them by.
  const orphanTagCount = ref(0);
  const definitions = ref<TagDefinition[]>([]);
  // Refusals, said where they happened: the whole listing, the definitions the
  // picker offers, and a write on one row (keyed by its path).
  const readError = ref<string | null>(null);
  const definitionsError = ref<string | null>(null);
  const cellErrors = reactive<Record<string, string>>({});
  const rights = useTagRights();

  const columnDefinitions = computed(() =>
    definitions.value
      .filter((d) => d.scope.includes('column'))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const definitionByName = computed(() => {
    const map = new Map<string, TagDefinition>();
    for (const d of definitions.value) map.set(d.name, d);
    return map;
  });

  function tagsFor(path: string): TargetTag[] {
    return tagsByPath[path] ?? [];
  }

  // Guards against a slower, now-stale request (from the previous table)
  // writing after the user switched tables — column names recur across tables,
  // so a stale write would silently show the wrong tags.
  let token = 0;

  async function load() {
    const w = opts.warehouseId.value;
    const t = opts.tableId.value;
    if (!w || !t) return;
    const mine = ++token;
    loading.value = true;
    try {
      const columns = await functions.listAllColumnTags(w, t, false);
      if (mine !== token) return;
      const byFieldId = new Map<number, TargetTag[]>();
      for (const entry of columns) byFieldId.set(entry['field-id'], entry.tags ?? []);
      for (const key of Object.keys(tagsByPath)) delete tagsByPath[key];
      const matched = new Set<number>();
      for (const field of opts.fields.value) {
        if (field.fieldId === undefined) continue;
        const tags = byFieldId.get(field.fieldId);
        if (!tags?.length) continue;
        tagsByPath[field.path] = tags;
        matched.add(field.fieldId);
      }
      orphanTagCount.value = columns
        .filter((entry) => !matched.has(entry['field-id']))
        .reduce((sum, entry) => sum + (entry.tags?.length ?? 0), 0);
      readError.value = null;
      ensureShownRights();
    } catch (e) {
      if (mine !== token) return;
      for (const key of Object.keys(tagsByPath)) delete tagsByPath[key];
      readError.value = isForbiddenError(e)
        ? 'The column tags of this table are not visible to you.'
        : tagRefusal(e, 'read the column tags');
    } finally {
      if (mine === token) loading.value = false;
    }
  }

  let definitionsLoaded = false;
  async function loadDefinitions() {
    if (definitionsLoaded || !opts.canManage.value) return;
    definitionsLoaded = true;
    try {
      definitions.value = await functions.listAllTagDefinitions(undefined, false);
      definitionsError.value = null;
    } catch (e) {
      definitionsLoaded = false;
      definitionsError.value = isForbiddenError(e)
        ? 'You are not allowed to list the tags of this project, so none can be offered.'
        : tagRefusal(e, 'list the tags');
    }
  }

  // The ✕ and the value edit on a chip wait for that tag's own answer.
  function ensureShownRights() {
    if (!opts.canManage.value) return;
    const ids = new Set<string>();
    for (const tags of Object.values(tagsByPath))
      for (const t of tags) ids.add(t['tag-definition-id']);
    rights.ensure([...ids]);
  }

  function done(fn: string, text: string) {
    visual.setSnackbarMsg({ function: fn, text, ttl: 3000, ts: Date.now(), type: Type.SUCCESS });
    // Other displays (and this one, through the watcher below) reload on it.
    visual.bumpTagsRefresh();
  }

  async function apply(paths: string[], tagName: string, value?: string | null) {
    const w = opts.warehouseId.value;
    const t = opts.tableId.value;
    if (busy.value || !paths.length || !w || !t) return;
    busy.value = tagName;
    const payload =
      definitionByName.value.get(tagName)?.['value-kind'] === 'marker' ? undefined : value;
    for (const path of paths) delete cellErrors[path];
    try {
      if (paths.length === 1) {
        // Quiet on refusal, so the refusal can be said on the row instead.
        await functions.setTableColumnTag(w, t, paths[0], tagName, payload, false);
        visual.bumpTagsRefresh();
        return;
      }
      // The silent wrapper: N columns raise one snackbar, not N.
      for (const path of paths) {
        await functions.setTableColumnTagSilent(w, t, path, tagName, payload);
      }
      done(
        'setTableColumnTag',
        paths.length === 1
          ? `Tag '${tagName}' applied to ${paths[0]}`
          : `Tag '${tagName}' applied to ${paths.length} columns`,
      );
    } catch (e) {
      const text = tagRefusal(e, `apply '${tagName}' here`);
      if (paths.length === 1) cellErrors[paths[0]] = text;
      // Whatever went on before the refusal is real; show it.
      if (paths.length > 1) visual.bumpTagsRefresh();
    } finally {
      busy.value = null;
    }
  }

  async function remove(path: string, tagName: string) {
    const w = opts.warehouseId.value;
    const t = opts.tableId.value;
    if (busy.value || !w || !t) return;
    busy.value = tagName;
    delete cellErrors[path];
    try {
      // Quiet on refusal, so the refusal can be said on the row instead.
      await functions.deleteTableColumnTag(w, t, path, tagName, false);
      visual.bumpTagsRefresh();
    } catch (e) {
      cellErrors[path] = tagRefusal(e, `remove '${tagName}' here`);
    } finally {
      busy.value = null;
    }
  }

  watch(() => [opts.warehouseId.value, opts.tableId.value, opts.fields.value], load, {
    immediate: true,
  });
  watch(() => visual.tagsRefresh, load);
  watch(
    opts.canManage,
    () => {
      loadDefinitions();
      ensureShownRights();
    },
    { immediate: true },
  );

  return {
    tagsByPath,
    tagsFor,
    loading,
    busy,
    orphanTagCount,
    columnDefinitions,
    definitionByName,
    readError,
    definitionsError,
    cellErrors,
    canApply: rights.canApply,
    canRemove: rights.canRemove,
    ensureRights: rights.ensure,
    apply,
    remove,
    reload: load,
  };
}
