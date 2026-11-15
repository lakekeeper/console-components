import { ident, tableIdent } from './sql';

/** A table, view or field as the LoQE tree hands it over. */
export interface TreeItemRef {
  type: string;
  warehouseName?: string;
  namespaceId?: string;
  name: string;
  /** A field's name and those of the fields it is nested in, outermost first. */
  fieldPath?: string[];
}

/**
 * What a tree item puts in the editor, whether clicked or dragged: a table or
 * view as its quoted `"warehouse"."namespace"."table"` path, a field as its
 * quoted name — the whole path for a nested one, since `"street"` alone would
 * not resolve where `"address"."street"` does. Empty for anything else.
 */
export function treeItemSql(item: TreeItemRef): string {
  if (item.type === 'field') return String(ident(...(item.fieldPath ?? [item.name])));
  if ((item.type === 'table' || item.type === 'view') && item.warehouseName && item.namespaceId) {
    return String(tableIdent(item.warehouseName, item.namespaceId, item.name));
  }
  return '';
}
