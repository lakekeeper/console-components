# Changelog

## [0.14.0](https://github.com/lakekeeper/console-components/compare/v0.13.1...v0.14.0) (2026-06-24)


### Features

* **ui:** add Datasets feature with storage explorer enhancements ([0835c10](https://github.com/lakekeeper/console-components/commit/0835c10a0ce0bc12e8b614ce755db5422aca2863))


### Bug Fixes

* **ui:** polish datasets file explorer and delete redirect ([0835c10](https://github.com/lakekeeper/console-components/commit/0835c10a0ce0bc12e8b614ce755db5422aca2863))

## [0.13.1](https://github.com/lakekeeper/console-components/compare/v0.13.0...v0.13.1) (2026-06-24)


### Bug Fixes

* **ui:** detach report-builder resize listeners on unmount ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** escape user report name in report builder print/PDF output ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** hide aggregation control for pie charts in the report builder ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** log non-permission warehouse-list errors in the usage dialog ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** never export plaintext bucket prefix while masking in the usage dialog ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** shell-quote storage endpoint in the generated usage script ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))
* **ui:** snapshot saved report chartConfig so it does not alias live UI state ([addcd8e](https://github.com/lakekeeper/console-components/commit/addcd8e2d14bb4ce130983f607e33a0c3e5c5c7e))

## [0.13.0](https://github.com/lakekeeper/console-components/compare/v0.12.0...v0.13.0) (2026-06-24)


### Features

* **ui:** add branch-aware snapshots table and schema view/compare dialogs ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** add entity action cog menus to tables, views, generic tables and namespaces (rename, delete protection, change properties, delete) ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** add storage Files explorer with DuckDB-powered preview (parquet/avro/csv/json), download and credential renewal for S3/ADLS/GCS ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** add usage report builder (configurable charts, PNG/PDF export) and usage datum dialog ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** expand Table Health with configuration, column statistics, storage composition and an on-demand column profiler ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** fold warehouse rename into the Warehouse Settings dialog and show the storage-provider icon in the header ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** move warehouse and table maintenance into the header cog with General/Security/Maintenance grouping ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** redesign view details with at-a-glance tiles, identity, SQL definition with version picker and schema evolution ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** refine navigation trees with indent lines, compact leaf rows, active-route highlight and OneLake icon ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))


### Bug Fixes

* **ui:** pin DuckDB to 1.4.x with builtin extensions to restore LoQE create/insert/delete ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** remove duplicate warehouse delete-protection toggle from namespaces view ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))
* **ui:** renew expired vended storage credentials and remove the redundant raw tab ([47ecd93](https://github.com/lakekeeper/console-components/commit/47ecd931114ad65a5d5c735eaf5474c655efd4c8))

## [0.12.0](https://github.com/lakekeeper/console-components/compare/v0.11.0...v0.12.0) (2026-06-19)


### Features

* **ui:** add multi-select bulk remove to role owners ([1153366](https://github.com/lakekeeper/console-components/commit/1153366c4d341c43911f6b4a500079ce6d5ef94e))


### Bug Fixes

* **ui:** show owners above members on role detail ([1153366](https://github.com/lakekeeper/console-components/commit/1153366c4d341c43911f6b4a500079ce6d5ef94e))

## [0.11.0](https://github.com/lakekeeper/console-components/compare/v0.10.1...v0.11.0) (2026-06-18)


### Features

* **ui:** id-aware member search ([08b7f9e](https://github.com/lakekeeper/console-components/commit/08b7f9eba930bc75c650b6ebe56b7242a80093fc))
* **ui:** single-page role detail with members, owners, and shared principal search ([08b7f9e](https://github.com/lakekeeper/console-components/commit/08b7f9eba930bc75c650b6ebe56b7242a80093fc))


### Bug Fixes

* **ui:** role Permissions manages ownership only, not membership ([08b7f9e](https://github.com/lakekeeper/console-components/commit/08b7f9eba930bc75c650b6ebe56b7242a80093fc))

## [0.10.1](https://github.com/lakekeeper/console-components/compare/v0.10.0...v0.10.1) (2026-06-18)


### Bug Fixes

* **ui:** re-vend LoQE storage credentials on table preview ([776b126](https://github.com/lakekeeper/console-components/commit/776b126f98a93506f0974461edb302b53f641923))

## [0.10.0](https://github.com/lakekeeper/console-components/compare/v0.9.0...v0.10.0) (2026-06-18)


### Features

* **ui:** functions wrappers for role membership and warehouse managed-by ([5ae9bec](https://github.com/lakekeeper/console-components/commit/5ae9becb1ed55544fdebab7e6090a05706ee5e26))
* **ui:** role Members component ([5ae9bec](https://github.com/lakekeeper/console-components/commit/5ae9becb1ed55544fdebab7e6090a05706ee5e26))
* **ui:** table details redesign, bulk table/view delete, activity chart, nav default-collapse ([5ae9bec](https://github.com/lakekeeper/console-components/commit/5ae9becb1ed55544fdebab7e6090a05706ee5e26))
* **ui:** warehouse managed-by controls + instance-admin gating ([5ae9bec](https://github.com/lakekeeper/console-components/commit/5ae9becb1ed55544fdebab7e6090a05706ee5e26))

## [0.9.0](https://github.com/lakekeeper/console-components/compare/v0.8.0...v0.9.0) (2026-06-17)


### Features

* **ui:** add Microsoft OneLake storage backend ([f51e5a3](https://github.com/lakekeeper/console-components/commit/f51e5a34997ceec2b2a6cf3df234b452a4293a8c))


### Bug Fixes

* **ui:** OneLake supports only client-credentials and system identity ([f51e5a3](https://github.com/lakekeeper/console-components/commit/f51e5a34997ceec2b2a6cf3df234b452a4293a8c))

## [0.8.0](https://github.com/lakekeeper/console-components/compare/v0.7.2...v0.8.0) (2026-06-08)


### Features

* **ui:** add \`pickable\` mode + \`+\` action button to WarehousesNavigationTree ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))
* **ui:** add generic-table (Lance/Delta/Vortex/…) support across navigation, list, detail, and search ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))
* **ui:** add Iceberg format-version policy editor to warehouse create and "Catalog Settings" dialogs ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))
* **ui:** add per-queue maintenance summary (last/next/run-now/reschedule/cancel) inside TaskManager ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))
* **ui:** rename "Change Deletion" to "Catalog Settings" combining deletion + format policy in one update ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))
* **ui:** unify Iceberg + generic tables under one Tables tab with format icons and type filter ([4fcbb4a](https://github.com/lakekeeper/console-components/commit/4fcbb4a1a47df1fcbe684ebe64f8bb1977764dc9))

## [0.7.2](https://github.com/lakekeeper/console-components/compare/v0.7.1...v0.7.2) (2026-05-27)


### Bug Fixes

* **ui:** improve Server Information version and commit SHA display ([c6cbeaf](https://github.com/lakekeeper/console-components/commit/c6cbeafbbf2f629e749e773303e4ff50aea845b3))

## [0.7.1](https://github.com/lakekeeper/console-components/compare/v0.7.0...v0.7.1) (2026-05-27)


### Bug Fixes

* **ui:** drop obsolete baseUrl and ignoreDeprecations from tsconfig ([3e6fe00](https://github.com/lakekeeper/console-components/commit/3e6fe00021170cc0173369e7885dea4a993d2d29))

## [0.7.0](https://github.com/lakekeeper/console-components/compare/v0.6.2...v0.7.0) (2026-05-25)


### Features

* **ui:** add multi-select provider filter and Provider column to role list, truncate description with tooltip ([bd7f56c](https://github.com/lakekeeper/console-components/commit/bd7f56c2e8282166f2ed2d8effcd37801ec7fd28))
* **ui:** redesign role detail card with avatar, chips, two-column metadata grid and scrollable description ([bd7f56c](https://github.com/lakekeeper/console-components/commit/bd7f56c2e8282166f2ed2d8effcd37801ec7fd28))


### Bug Fixes

* **ui:** encode listRoles array query params as key[]=value so serde_qs backend accepts provider/source filters ([bd7f56c](https://github.com/lakekeeper/console-components/commit/bd7f56c2e8282166f2ed2d8effcd37801ec7fd28))
* **ui:** remove frontend-only role name min length and description max length ([bd7f56c](https://github.com/lakekeeper/console-components/commit/bd7f56c2e8282166f2ed2d8effcd37801ec7fd28))

## [0.6.2](https://github.com/lakekeeper/console-components/compare/v0.6.1...v0.6.2) (2026-05-23)


### Bug Fixes

* **deps:** bump @hey-api/openapi-ts to ^0.97 and regenerate SDKs ([9161551](https://github.com/lakekeeper/console-components/commit/9161551cda9f561b8bf67c5cd667f45d7b3f37fe))

## [0.6.1](https://github.com/lakekeeper/console-components/compare/v0.6.0...v0.6.1) (2026-05-23)


### Bug Fixes

* **docs:** typos in README (backeend, browaser) ([8be40f1](https://github.com/lakekeeper/console-components/commit/8be40f1a53c029681eeb7eb944e9c6140ad00f30))

## [0.6.0](https://github.com/lakekeeper/console-components/compare/v0.5.7...v0.6.0) (2026-05-22)


### Features

* **ui:** edition-gated Lakekeeper / Enterprise Version row ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))
* **ui:** Export item added to AppBar help menu ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))
* **ui:** FeedbackDialog (OSS) wired to AppBar with mailto draft ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))
* **ui:** SupportBundleDialog with Copy and Download JSON actions ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))
* **ui:** two-column Server Information + Console layout in ServerOverview ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))
* **ui:** User Surveys row in UI Configuration ([11c766f](https://github.com/lakekeeper/console-components/commit/11c766f6d1c2f989cce22bcf9063d998cd6f8a93))

## [0.5.7](https://github.com/lakekeeper/console-components/compare/v0.5.6...v0.5.7) (2026-04-29)


### Bug Fixes

* **ui:** detach LoQE catalog on warehouse rename ([feee389](https://github.com/lakekeeper/console-components/commit/feee3892ae8ca2fdcd21d41071a5ffb1ea1d7f22))

## [0.5.6](https://github.com/lakekeeper/console-components/compare/v0.5.5...v0.5.6) (2026-04-24)


### Bug Fixes

* **ui:** normalize catalog URLs and add copy buttons in ServerOverview ([4fde698](https://github.com/lakekeeper/console-components/commit/4fde69843efec630ddfdc0f50937797e8916dd91))

## [0.5.5](https://github.com/lakekeeper/console-components/compare/v0.5.4...v0.5.5) (2026-04-21)


### Bug Fixes

* **ui:** fix stale warehouse name in TablePreview after rename ([5e6d843](https://github.com/lakekeeper/console-components/commit/5e6d8437b5fdbfff406d8efd08125143a671dd64))
* **ui:** refresh nav tree on warehouse rename and add ([5e6d843](https://github.com/lakekeeper/console-components/commit/5e6d8437b5fdbfff406d8efd08125143a671dd64))
* **ui:** replace JSON toggle with import warehouse button in add dialog ([5e6d843](https://github.com/lakekeeper/console-components/commit/5e6d8437b5fdbfff406d8efd08125143a671dd64))

## [0.5.4](https://github.com/lakekeeper/console-components/compare/v0.5.3...v0.5.4) (2026-04-20)


### Bug Fixes

* **ui:** add view select action and rename S3 credential key fields ([2ffbd4d](https://github.com/lakekeeper/console-components/commit/2ffbd4d9c59e406de3d43bcf079ca101a538a198))

## [0.5.3](https://github.com/lakekeeper/console-components/compare/v0.5.2...v0.5.3) (2026-04-20)


### Bug Fixes

* **ui:** correct types entry path for TypeScript 6 ([cee9bc5](https://github.com/lakekeeper/console-components/commit/cee9bc54adcf2abc6f18bc3d7bc9ed6e5fb267b1))

## [0.5.2](https://github.com/lakekeeper/console-components/compare/v0.5.1...v0.5.2) (2026-04-20)


### Bug Fixes

* **ui:** enlarge DDL dialog and respect custom extension repo for httpfs ([d3e1851](https://github.com/lakekeeper/console-components/commit/d3e18515d1ea5cf4855941a28977a0ea710e597b))

## [0.5.1](https://github.com/lakekeeper/console-components/compare/v0.5.0...v0.5.1) (2026-04-19)


### Bug Fixes

* **deps:** bump vite to ^7.3.2 (security), prettier to ^3.8.3, typescript-eslint to ^8.58.2 ([6357007](https://github.com/lakekeeper/console-components/commit/6357007f680ff22430af46e8e437d9d6485e0542))

## [0.5.0](https://github.com/lakekeeper/console-components/compare/v0.4.1...v0.5.0) (2026-03-30)


### Features

* **ui:** add memory card game to server-offline page ([86466b6](https://github.com/lakekeeper/console-components/commit/86466b6990001a908872adaddb90ce4c0be7e3d4))
* **ui:** show connection diagnostics on server-offline page ([86466b6](https://github.com/lakekeeper/console-components/commit/86466b6990001a908872adaddb90ce4c0be7e3d4))

## [0.4.1](https://github.com/lakekeeper/console-components/compare/v0.4.0...v0.4.1) (2026-03-24)


### Bug Fixes

* always show snackbar on 403 errors ([#113](https://github.com/lakekeeper/console-components/issues/113)) ([47e6994](https://github.com/lakekeeper/console-components/commit/47e699457f3332c5345e6a8b0aee6218b791b6e0))
* claude.md ([fda8b0a](https://github.com/lakekeeper/console-components/commit/fda8b0a79651ee8d29d1cd7aac6df7856f51b2dc))

## [0.4.0](https://github.com/lakekeeper/console-components/compare/v0.3.9...v0.4.0) (2026-03-22)


### Features

* **ui:** add kebab actions menu to LoQE tree and search results ([f9b1032](https://github.com/lakekeeper/console-components/commit/f9b10322d599770cb2d68e9cb9a54215ff1938e6))

## [0.3.9](https://github.com/lakekeeper/console-components/compare/v0.3.8...v0.3.9) (2026-03-22)


### Bug Fixes

* **ui:** reduce tree page size and add load-more pagination ([9dc5a90](https://github.com/lakekeeper/console-components/commit/9dc5a90cbeef6f94f523aa6fb873d545ddb862ef))

## [0.3.8](https://github.com/lakekeeper/console-components/compare/v0.3.7...v0.3.8) (2026-03-21)


### Bug Fixes

* trigger release 0.3.8 ([c3af6e1](https://github.com/lakekeeper/console-components/commit/c3af6e187d072646dc4d5edda2d284a772915fa8))
* **ui:** improve error handling for auth, navigation, and 403/404 responses ([d8c1b52](https://github.com/lakekeeper/console-components/commit/d8c1b523fcfe614d382a6ce0abb4aaf16ee03aeb))

## [0.3.7](https://github.com/lakekeeper/console-components/compare/v0.3.6...v0.3.7) (2026-03-21)


### Bug Fixes

* **ui:** hide only chart card on statistics 403 instead of showing error snackbar ([4e53dc8](https://github.com/lakekeeper/console-components/commit/4e53dc821c0bfd2b99c68ae27bee1b91a7dbdd0b))
* **ui:** improve error handling for auth, navigation, and 403/404 responses ([d8c1b52](https://github.com/lakekeeper/console-components/commit/d8c1b523fcfe614d382a6ce0abb4aaf16ee03aeb))
* **ui:** namespace permissions GRANT button missing due to missing warehouseId prop ([4e53dc8](https://github.com/lakekeeper/console-components/commit/4e53dc821c0bfd2b99c68ae27bee1b91a7dbdd0b))
* **ui:** navigation tree auto-expands to reflect current route ([4e53dc8](https://github.com/lakekeeper/console-components/commit/4e53dc821c0bfd2b99c68ae27bee1b91a7dbdd0b))
* **ui:** navigation tree auto-updates on namespace/table/view create and delete ([4e53dc8](https://github.com/lakekeeper/console-components/commit/4e53dc821c0bfd2b99c68ae27bee1b91a7dbdd0b))
* **ui:** refresh button preserves expanded tree state ([4e53dc8](https://github.com/lakekeeper/console-components/commit/4e53dc821c0bfd2b99c68ae27bee1b91a7dbdd0b))

## [0.3.6](https://github.com/lakekeeper/console-components/compare/v0.3.5...v0.3.6) (2026-03-15)


### Bug Fixes

* add sts endpoint ([#99](https://github.com/lakekeeper/console-components/issues/99)) ([4a14bbf](https://github.com/lakekeeper/console-components/commit/4a14bbf51284d9e27e083426a6e31ecb42e46017))

## [0.3.5](https://github.com/lakekeeper/console-components/compare/v0.3.4...v0.3.5) (2026-03-14)


### Bug Fixes

* **ui:** adapt component heights for 14-inch MacBook screens ([#97](https://github.com/lakekeeper/console-components/issues/97)) ([7cee696](https://github.com/lakekeeper/console-components/commit/7cee696e30960253d8b2030a19e0d163f7a91a8e))

## [0.3.4](https://github.com/lakekeeper/console-components/compare/v0.3.3...v0.3.4) (2026-03-13)


### Bug Fixes

* use snapshot-log for branch visualization row assignment ([#95](https://github.com/lakekeeper/console-components/issues/95)) ([3ffb227](https://github.com/lakekeeper/console-components/commit/3ffb2276f826e4d697b315898fb663c5ad519142))

## [0.3.3](https://github.com/lakekeeper/console-components/compare/v0.3.2...v0.3.3) (2026-03-09)


### Bug Fixes

* update CORS config to include write methods and wildcard headers ([#93](https://github.com/lakekeeper/console-components/issues/93)) ([d32b559](https://github.com/lakekeeper/console-components/commit/d32b55989645d5326a59523d7693b897ec51f2a0))

## [0.3.2](https://github.com/lakekeeper/console-components/compare/v0.3.1...v0.3.2) (2026-03-09)


### Bug Fixes

* correct style.css exports path to match actual build output ([#91](https://github.com/lakekeeper/console-components/issues/91)) ([5ab0f33](https://github.com/lakekeeper/console-components/commit/5ab0f3358c6ba506f41880fc006fffacfb11c95d))

## [0.3.1](https://github.com/lakekeeper/console-components/compare/v0.3.0...v0.3.1) (2026-03-09)


### Bug Fixes

* maintenance ([#89](https://github.com/lakekeeper/console-components/issues/89)) ([6b9ce9a](https://github.com/lakekeeper/console-components/commit/6b9ce9ae26267b7f0b195ea3582543e87d608189))

## [0.3.0](https://github.com/lakekeeper/console-components/compare/v0.2.31...v0.3.0) (2026-03-08)


### Features

* **ui:** add community action cards to Home page ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add CONTRIBUTING.md, ROADMAP.md, feature request template, and proposal workflow ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add GitHub stars button to AppBar linked to repository ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add HomeStatistics dashboard with project/warehouse/table/view counts and API calls area chart ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add ProjectStatistics with D3 interactive charts replacing Chart.js ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add server-side filtering and rename support to NamespaceTables and NamespaceViews ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add snapshot comparison dialog and warehouse statistics ([#87](https://github.com/lakekeeper/console-components/issues/87)) ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add SnapshotCompare component for side-by-side snapshot diff with delta metrics, summary changes table, and schema diff ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** add WarehouseStatistics component with D3 stacked area charts, server-side filtering, time aggregation, and vertical tab layout ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** refactor TableVersioningVisualization with refresh button and comparison panel ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** remove deprecated WarehouseStatisticsDialog and clean up dead code ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))


### Bug Fixes

* **ui:** collapse redundant getEndpointStatistics branches ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** compute uncategorized status codes for Other filter in WarehouseStatistics ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** disconnect previous ResizeObserver before creating new one in HomeStatistics ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** escape CSV fields and revoke object URLs in statistics downloads ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))
* **ui:** use handleError instead of console.error for statistics error handling ([a2adeb2](https://github.com/lakekeeper/console-components/commit/a2adeb2ea2f5ac94bfcd69a123c4c20f0f00f990))

## [0.2.31](https://github.com/lakekeeper/console-components/compare/v0.2.30...v0.2.31) (2026-03-07)


### Bug Fixes

* **ui:** correct versioning tab action menu behavior ([#85](https://github.com/lakekeeper/console-components/issues/85)) ([afeeb43](https://github.com/lakekeeper/console-components/commit/afeeb43f475c0a12074d912704a69a9359861796))

## [0.2.30](https://github.com/lakekeeper/console-components/compare/v0.2.29...v0.2.30) (2026-03-02)


### Bug Fixes

* **ui:** handle sub-namespaces with dots in API calls, DuckDB SQL, and SQL autocomplete ([373676b](https://github.com/lakekeeper/console-components/commit/373676b03f3648b398d3ae0262776d6e36ad27b7))

## [0.2.29](https://github.com/lakekeeper/console-components/compare/v0.2.28...v0.2.29) (2026-03-01)


### Bug Fixes

* added branch and props ([#81](https://github.com/lakekeeper/console-components/issues/81)) ([9685a87](https://github.com/lakekeeper/console-components/commit/9685a8710fe39709f47da7f25bd015f1233be70b))

## [0.2.28](https://github.com/lakekeeper/console-components/compare/v0.2.27...v0.2.28) (2026-03-01)


### Bug Fixes

* added storage location option ([#79](https://github.com/lakekeeper/console-components/issues/79)) ([ef1932b](https://github.com/lakekeeper/console-components/commit/ef1932b97a5e985bc1b38977a1ebd9d3915de753))

## [0.2.27](https://github.com/lakekeeper/console-components/compare/v0.2.26...v0.2.27) (2026-02-20)


### Bug Fixes

* add fuzzy search with scroll-to-node and active highlight ([#77](https://github.com/lakekeeper/console-components/issues/77)) ([7e1fd7b](https://github.com/lakekeeper/console-components/commit/7e1fd7b3a9121d157e706d001d9d22869450db90))

## [0.2.26](https://github.com/lakekeeper/console-components/compare/v0.2.25...v0.2.26) (2026-02-20)


### Bug Fixes

* query overload LoQE development ([#75](https://github.com/lakekeeper/console-components/issues/75)) ([0e681aa](https://github.com/lakekeeper/console-components/commit/0e681aad6e09a48b4b3e64a23b7c1e260a55c35a))

## [0.2.25](https://github.com/lakekeeper/console-components/compare/v0.2.24...v0.2.25) (2026-02-16)


### Bug Fixes

* ui improvements ([#73](https://github.com/lakekeeper/console-components/issues/73)) ([e90ff0d](https://github.com/lakekeeper/console-components/commit/e90ff0d916bd30c8784b53fa94c6455376137b98))

## [0.2.24](https://github.com/lakekeeper/console-components/compare/v0.2.23...v0.2.24) (2026-02-13)


### Bug Fixes

* register form ui ([#71](https://github.com/lakekeeper/console-components/issues/71)) ([5b257a8](https://github.com/lakekeeper/console-components/commit/5b257a86ed5374a0c1140851eb9a9d7203829694))

## [0.2.23](https://github.com/lakekeeper/console-components/compare/v0.2.22...v0.2.23) (2026-02-13)


### Bug Fixes

* added register table ([#69](https://github.com/lakekeeper/console-components/issues/69)) ([9e5198b](https://github.com/lakekeeper/console-components/commit/9e5198b3f861f222fe34c7f6385ef34ccd3507a3))

## [0.2.22](https://github.com/lakekeeper/console-components/compare/v0.2.21...v0.2.22) (2026-02-01)


### Bug Fixes

* token create and project task config ([#67](https://github.com/lakekeeper/console-components/issues/67)) ([ca5ca52](https://github.com/lakekeeper/console-components/commit/ca5ca5219259f45a238be8e09b1c611c781ae601))

## [0.2.21](https://github.com/lakekeeper/console-components/compare/v0.2.20...v0.2.21) (2026-01-29)


### Bug Fixes

* store/restore nav on reload ([#64](https://github.com/lakekeeper/console-components/issues/64)) ([2266414](https://github.com/lakekeeper/console-components/commit/2266414254f8c0115277f595b958af0da1f0ca8f))

## [0.2.20](https://github.com/lakekeeper/console-components/compare/v0.2.19...v0.2.20) (2026-01-29)


### Bug Fixes

* added duckdb improvements ([#61](https://github.com/lakekeeper/console-components/issues/61)) ([f1b559e](https://github.com/lakekeeper/console-components/commit/f1b559ed685902faa331251818aeb6226fe70cab))

## [0.2.19](https://github.com/lakekeeper/console-components/compare/v0.2.18...v0.2.19) (2025-12-31)


### Bug Fixes

* ui storage options s3 ([#58](https://github.com/lakekeeper/console-components/issues/58)) ([4c0f864](https://github.com/lakekeeper/console-components/commit/4c0f864be2d419eaaad37a83746f17672e030be0))

## [0.2.18](https://github.com/lakekeeper/console-components/compare/v0.2.17...v0.2.18) (2025-12-30)


### Bug Fixes

* error message ([#56](https://github.com/lakekeeper/console-components/issues/56)) ([54d3923](https://github.com/lakekeeper/console-components/commit/54d392377d6aaae09803217feaf998468e7ec8db))

## [0.2.17](https://github.com/lakekeeper/console-components/compare/v0.2.16...v0.2.17) (2025-12-30)


### Bug Fixes

* project task tab respecting permission ([#54](https://github.com/lakekeeper/console-components/issues/54)) ([63ffc44](https://github.com/lakekeeper/console-components/commit/63ffc44d9bcc97b34be6c2f25a07f08e0af69a34))

## [0.2.16](https://github.com/lakekeeper/console-components/compare/v0.2.15...v0.2.16) (2025-12-30)


### Bug Fixes

* added project tasks and gcs for duckdb ([#52](https://github.com/lakekeeper/console-components/issues/52)) ([9b754e0](https://github.com/lakekeeper/console-components/commit/9b754e05b8865a5a2307eca1d79fbaf1c0f17f71))

## [0.2.15](https://github.com/lakekeeper/console-components/compare/v0.2.14...v0.2.15) (2025-12-29)


### Bug Fixes

* loading duckdb worker ([#50](https://github.com/lakekeeper/console-components/issues/50)) ([c8ec473](https://github.com/lakekeeper/console-components/commit/c8ec4731a034798317ab399c47b15538379cf394))

## [0.2.14](https://github.com/lakekeeper/console-components/compare/v0.2.13...v0.2.14) (2025-12-28)


### Bug Fixes

* duckdb http wasm ([#48](https://github.com/lakekeeper/console-components/issues/48)) ([1f999b6](https://github.com/lakekeeper/console-components/commit/1f999b61aa1435728369dd9d4091c0dacc372de8))

## [0.2.13](https://github.com/lakekeeper/console-components/compare/v0.2.12...v0.2.13) (2025-12-21)


### Bug Fixes

* login slot ([#46](https://github.com/lakekeeper/console-components/issues/46)) ([e0eacef](https://github.com/lakekeeper/console-components/commit/e0eacef885e9b2a6d01b4e41d3c62bc21517bed8))

## [0.2.12](https://github.com/lakekeeper/console-components/compare/v0.2.11...v0.2.12) (2025-12-20)


### Bug Fixes

* ui and actions ([#44](https://github.com/lakekeeper/console-components/issues/44)) ([2004e2a](https://github.com/lakekeeper/console-components/commit/2004e2ae32fe07d80801e6f7f8d665d26d55fbf3))

## [0.2.11](https://github.com/lakekeeper/console-components/compare/v0.2.10...v0.2.11) (2025-12-17)


### Bug Fixes

* rremove http catalog from duckdb wasm ([#42](https://github.com/lakekeeper/console-components/issues/42)) ([dd4bc91](https://github.com/lakekeeper/console-components/commit/dd4bc9148800311f599ea1fb7863f30caf826bf9))

## [0.2.10](https://github.com/lakekeeper/console-components/compare/v0.2.9...v0.2.10) (2025-12-17)


### Bug Fixes

* release ([#40](https://github.com/lakekeeper/console-components/issues/40)) ([8766cc8](https://github.com/lakekeeper/console-components/commit/8766cc85ce48c2b02adc248dbcd8914cb20c4363))

## [0.2.9](https://github.com/lakekeeper/console-components/compare/v0.2.8...v0.2.9) (2025-12-17)


### Bug Fixes

* small issues with types and update duckdb ([#38](https://github.com/lakekeeper/console-components/issues/38)) ([aba048e](https://github.com/lakekeeper/console-components/commit/aba048edf0f3ee892ff8642325df5bc05a0183a9))

## [0.2.8](https://github.com/lakekeeper/console-components/compare/v0.2.7...v0.2.8) (2025-12-13)


### Bug Fixes

* authorization split catalog and authorizer ([#36](https://github.com/lakekeeper/console-components/issues/36)) ([8453907](https://github.com/lakekeeper/console-components/commit/845390763656c6b5b23b08335ba6972711309a1e))

## [0.2.7](https://github.com/lakekeeper/console-components/compare/v0.2.6...v0.2.7) (2025-11-13)


### Bug Fixes

* filter permissions and projects ([#34](https://github.com/lakekeeper/console-components/issues/34)) ([d506313](https://github.com/lakekeeper/console-components/commit/d506313c540380f02acdaf96b7ba1543b1b03d50))

## [0.2.6](https://github.com/lakekeeper/console-components/compare/v0.2.5...v0.2.6) (2025-11-13)


### Bug Fixes

* re-login on 401 ([#32](https://github.com/lakekeeper/console-components/issues/32)) ([30029d5](https://github.com/lakekeeper/console-components/commit/30029d57e8b59a4b058d0151b4c1d19420114828))

## [0.2.5](https://github.com/lakekeeper/console-components/compare/v0.2.4...v0.2.5) (2025-11-12)


### Bug Fixes

* added permissions check and role search ([#29](https://github.com/lakekeeper/console-components/issues/29)) ([b45046c](https://github.com/lakekeeper/console-components/commit/b45046ceaf46ba88e83cec8835affeabecb9f849))
* notifications ([#31](https://github.com/lakekeeper/console-components/issues/31)) ([9182b54](https://github.com/lakekeeper/console-components/commit/9182b549fc8a0d7186e4d2fc912a06b478c3e9ae))

## [0.2.4](https://github.com/lakekeeper/console-components/compare/v0.2.3...v0.2.4) (2025-11-09)


### Bug Fixes

* role permissions  ([#27](https://github.com/lakekeeper/console-components/issues/27)) ([46f96e8](https://github.com/lakekeeper/console-components/commit/46f96e83f2a06db31e736c86f8bde7b0c5b157de))

## [0.2.3](https://github.com/lakekeeper/console-components/compare/v0.2.2...v0.2.3) (2025-11-06)


### Bug Fixes

* external role visibility ([#25](https://github.com/lakekeeper/console-components/issues/25)) ([b4eba4a](https://github.com/lakekeeper/console-components/commit/b4eba4a76d834d71ab318331dfc51eaf0c38308e))

## [0.2.2](https://github.com/lakekeeper/console-components/compare/v0.2.1...v0.2.2) (2025-11-04)


### Bug Fixes

* update dependencies and resolve configuration issues ([#23](https://github.com/lakekeeper/console-components/issues/23)) ([f846412](https://github.com/lakekeeper/console-components/commit/f8464122644dbb243363d980d3d7d5a5394c269a))

## [0.2.1](https://github.com/lakekeeper/console-components/compare/v0.2.0...v0.2.1) (2025-11-02)


### Bug Fixes

* support https catalogs for duckdb wasm ([#18](https://github.com/lakekeeper/console-components/issues/18)) ([cc8004e](https://github.com/lakekeeper/console-components/commit/cc8004e68d8a912c09be588d35e75387fc1ee5f6))

## [0.2.0](https://github.com/lakekeeper/console-components/compare/v0.1.2...v0.2.0) (2025-11-01)


### Features

* DuckDB browser query  ([#16](https://github.com/lakekeeper/console-components/issues/16)) ([68ea6e5](https://github.com/lakekeeper/console-components/commit/68ea6e5819508d3a825027228985fa88f57462ad))

## [0.1.2](https://github.com/lakekeeper/console-components/compare/v0.1.1...v0.1.2) (2025-10-13)


### Bug Fixes

* add dark mode theme support with OS preference detection ([5b40894](https://github.com/lakekeeper/console-components/commit/5b4089439c69e66d8ed9fabb642f0261a700706d))

## [0.1.1](https://github.com/lakekeeper/console-components/compare/v0.1.0...v0.1.1) (2025-10-12)


### Bug Fixes

* use npm install --force to handle optional dependencies in CI ([5f89caf](https://github.com/lakekeeper/console-components/commit/5f89caf872c8ebeea74cfd15620231f746820f87))

## [0.1.0](https://github.com/lakekeeper/console-components/compare/v0.0.1...v0.1.0) (2025-10-12)


### Features

* release ([#3](https://github.com/lakekeeper/console-components/issues/3)) ([fd8efcd](https://github.com/lakekeeper/console-components/commit/fd8efcd59966c6783a6ac466ddbc0f4c08cfb2e5))
* release ([#5](https://github.com/lakekeeper/console-components/issues/5)) ([0253a55](https://github.com/lakekeeper/console-components/commit/0253a555380a52150f6969405780cd3fb43b93ff))
* release mechnics ([#4](https://github.com/lakekeeper/console-components/issues/4)) ([bbe8d3d](https://github.com/lakekeeper/console-components/commit/bbe8d3d9daccff4ea36c922c41ea3f216336b7d1))


### Bug Fixes

* add build job to create GitHub releases ([667fc78](https://github.com/lakekeeper/console-components/commit/667fc788aa79e14247c5093525cade9829869984))
* add pull_request trigger to release workflow ([1a8699f](https://github.com/lakekeeper/console-components/commit/1a8699f17242c24c6a5199295b71ba3df73ffe9c))
* update release manifest to match current version ([81c73f1](https://github.com/lakekeeper/console-components/commit/81c73f11f8338d2e16e7f9e15b56b7ed29987a21))
* update release manifest to match current version ([#7](https://github.com/lakekeeper/console-components/issues/7)) ([cdebe97](https://github.com/lakekeeper/console-components/commit/cdebe973d689909400742a369b4eda03ba990b60))
* use RELEASE_PLEASE_TOKEN for creating PRs ([f90d4a0](https://github.com/lakekeeper/console-components/commit/f90d4a078fc1fdb1d2c3c61149c57fcaec45d34b))
