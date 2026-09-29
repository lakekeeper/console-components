/**
 * Key a persisted catalog by project as well as by name.
 *
 * Warehouse names are unique within a project, not across them: two projects can
 * each hold a `sales` warehouse. The DuckDB alias stays the bare warehouse name —
 * LoQE keeps only the selected project's catalogs attached, so it is unambiguous
 * there — but persistence outlives project switches and has to tell them apart.
 */
export const persistedCatalogKey = (projectId: string | undefined, catalogName: string): string =>
  `${projectId ?? ''}|${catalogName}`;
