# Lakekeeper Console Roadmap

Track planned, in-progress, and completed features for the Lakekeeper console UI.

> **Want to propose a feature?** Use the [feature proposal template](FEATURE_PROPOSAL.md) and open a PR, or [open an issue](https://github.com/lakekeeper/console-components/issues/new?template=feature_request.yml) directly.

---

## Planned

| # | Feature | Priority | Scope | Backend needed | Description |
|---|---------|----------|-------|---------------|-------------|
| 1 | [Project Dashboard](#1-project-dashboard-with-cross-warehouse-statistics) | High | `console-components` | No | Aggregate stats across all warehouses |
| 2 | [Storage Usage Visualization](#2-storage-usage-visualization-per-table) | High | `console-components` | No | Chart storage growth per table from snapshot metadata |

### 1. Project Dashboard with Cross-Warehouse Statistics

Aggregate warehouse statistics across all warehouses at the project level. Provides a single overview page showing total tables, views, storage types, and health summary.

- Uses existing `getWarehouseStatistics` API — no backend changes needed
- Cross-warehouse totals (table count, view count, active/inactive)
- Storage type breakdown (S3, GCS, Azure, local)
- Warehouse health summary

### 2. Storage Usage Visualization per Table

Visualize storage usage over time for individual tables using snapshot metadata that is already loaded.

- Uses `snapshot.summary` fields (`total-data-files-size`, `total-records`, `total-data-files`, etc.)
- No additional API calls — data is already available in table metadata
- Chart showing size/file/record trends across snapshot history
- Helps identify tables with unusual growth or compaction needs

---

## In Progress

| # | Feature | PR | Owner | Description |
|---|---------|-----|-------|-------------|
| — | — | — | — | Nothing in progress right now |

---

## Done

| # | Feature | PR | Description |
|---|---------|-----|-------------|
| 1 | Snapshot Compare Dialog | [#87](https://github.com/lakekeeper/console-components/pull/87) | Side-by-side snapshot comparison with delta metrics, summary diff, schema diff |
| 2 | Warehouse Statistics | [#87](https://github.com/lakekeeper/console-components/pull/87) | Statistics section on warehouse details (table/view counts, storage info) |
| 3 | Versioning Viz Improvements | [#87](https://github.com/lakekeeper/console-components/pull/87) | D3 bug fix, consolidated Actions menu, refresh button |
| 4 | Rename Table / View | [#87](https://github.com/lakekeeper/console-components/pull/87) | Rename from namespace listing with storage layout check |
