# Agent Instructions — console-components

## Project Overview

`@lakekeeper/console-components` is an open-source Vue 3 + Vuetify 3 component library that provides the entire UI foundation for the Lakekeeper console — a web application for managing [Lakekeeper](https://github.com/lakekeeper/lakekeeper), an Apache Iceberg REST catalog server.

It exports **60+ Vue components**, **7 Pinia stores**, **14 permission composables**, an **OIDC auth plugin**, a **functions plugin** (~100 API wrappers), a **local query engine** (DuckDB WASM), and all generated OpenAPI types.

It is consumed by apps as a GitHub dependency:

```json
"@lakekeeper/console-components": "github:lakekeeper/console-components#v0.2.28"
```

Backend server: [lakekeeper/lakekeeper](https://github.com/lakekeeper/lakekeeper)  
License: Apache-2.0

---

## Architecture

```
src/
  index.ts                          # Main entry (~340 lines) — exports everything
  theme.ts                          # Custom Vuetify light theme (myCustomLightTheme)
  plugins/
    functions.ts                    # API layer (~3900 lines) — ~100+ endpoint wrappers
    auth.ts                         # OIDC auth factory (oidc-client-ts wrapper)
    vuetify.ts                      # Vuetify setup with custom theme
  components/                       # 60+ Vue SFC components (see full list below)
  composables/
    useCatalogPermissions.ts        # 7 catalog permission composables + useConfig(), hasAction()
    useAuthorizerPermissions.ts     # 7 authorizer (OpenFGA) permission composables
    useAuth.ts                      # useAuth() composable (re-export from auth plugin)
    useLoQE.ts                      # DuckDB WASM local query engine composable
    useStorageValidation.ts         # Storage URL validation for DuckDB
    loqe/
      LoQEEngine.ts                 # DuckDB WASM engine class (init, query, attach catalogs)
  stores/
    index.ts                        # Pinia setup + persistedstate plugin
    visual.ts                       # Theme, project, server info, snackbar, SQL tabs, PolicyBuilderState
    user.ts                         # User auth state (tokens, profile)
    permissions.ts                  # Permission cache store
    notifications.ts                # Notification state
    navigation.ts                   # Route tracking for post-auth redirect
    duckdbSettings.ts               # DuckDB WASM settings (row limits, etc.)
    loqe.ts                         # LoQE persisted state (extensions, catalogs, query history)
  common/
    interfaces.ts                   # Shared TypeScript interfaces (Header, Breadcrumb, NamespaceResponse, etc.)
    enums.ts                        # Shared enums (Type, Intent, ObjectType, etc.)
    permissionActions.ts            # Permission action constants
  gen/
    iceberg/                        # Auto-generated Iceberg REST Catalog API client (DO NOT EDIT)
      sdk.gen.ts                    # Typed SDK functions
      types.gen.ts                  # Generated TypeScript types
      client.gen.ts                 # Client config
      client/                       # HTTP client internals
    management/                     # Auto-generated Management API client (DO NOT EDIT)
      sdk.gen.ts                    # Typed SDK functions (~2100 lines)
      types.gen.ts                  # Generated TypeScript types (~1700 lines)
      client.gen.ts                 # Client config
      client/                       # HTTP client internals
  assets/                           # SVG logos, icons
  router/                           # Shared routing utilities
openapi/
  management-open-api.yaml          # Lakekeeper Management API OpenAPI spec
  rest-catalog-open-api.yaml        # Iceberg REST Catalog API OpenAPI spec
```

### Key relationships

- `functions.ts` is the **central API layer** — all components call API methods through `useFunctions()` (dependency injection via Vue `provide/inject`)
- Components use Pinia stores (`useVisualStore`, `useUserStore`, etc.) for shared state
- Two generated SDK clients: `gen/iceberg/` (Iceberg REST API) and `gen/management/` (Lakekeeper Management API)
- Auth handled by `oidc-client-ts` with a custom factory pattern (`createAuth(config)`)
- Premium features live in a separate repo (`@lakekeeper/console-plus-components`) that extends this library

---

## Stores (Pinia, persisted via pinia-plugin-persistedstate-2)

| Store | Key state / methods |
| --- | --- |
| `useVisualStore()` | `themeLight` (auto-detects system pref), `navBarShow`, `showAppOrNavBar`, `projectSelected` (`project-id`, `project-name`), `projectList`, `snackbarMsg`, `serverInfo` (version, bootstrapped, server-id, default-project-id, authz-backend, license-status, queues), `isNavigationCollapsed`, `warehouseTreeState`, `warehouseSqlData` (multi-tab SQL editor), `policyBuilderDraft`. Methods: `toggleThemeLight()`, `setServerInfo()`, `getServerInfo()`, `setProjectSelected()`, `setProjectList()`, `setSnackbarMsg()`, `getSnackbarMsg()`, `setPolicyBuilderDraft()`, `resetPolicyBuilderDraft()`, SQL tab CRUD (`addSqlTab`, `removeSqlTab`, `updateSqlTabContent`, `setActiveSqlTab`, `getActiveSqlTab`, `getSqlTabs`) |
| `useUserStore()` | `user` (reactive: `access_token`, `id_token`, `refresh_token`, `token_expires_at`, `email`, `preferred_username`, `family_name`, `given_name`), `isAuthenticated`, `setUser()`, `getUser()`, `unsetUser()`, `renewAT()` |
| `usePermissionStore()` | Permission cache with getters for every entity type: `getServerPermissions()`, `getProjectPermissions()`, `getWarehousePermissions()`, `getRolePermissions()`, `getNamespacePermissions()`, `getTablePermissions()`, `getViewPermissions()` |
| `useNotificationStore()` | Notification management for the app |
| `useNavigationStore()` | `updateCurrentLocation()` — tracks current route for restoration after re-authentication |
| `useDuckDBSettingsStore()` | DuckDB WASM settings — `DUCKDB_DEFAULTS`, `ROW_LIMIT_OPTIONS` exported |
| `useLoQEStore()` | Local Query Engine persisted state (extensions, catalogs, query history) |

### PolicyBuilderState (in visual store)

```typescript
interface PolicyBuilderState {
  effect: 'permit' | 'forbid';
  principalOp: 'any' | '==' | 'in' | 'is';
  principalType: string | null;
  principalId: string | null;
  actionOp: 'any' | '==' | 'in';
  actionNames: string[];
  resourceOp: 'any' | '==' | 'in' | 'is';
  resourceType: string | null;
  resourceId: string | null;
  conditionKind: 'when' | 'unless' | null;
  conditionBody: string;
  annotationId: string;
  annotationMessage: string;
}
```

---

## Functions Plugin (`useFunctions()`)

The `useFunctions()` composable (from `plugins/functions.ts`, ~3900 lines) wraps the **entire** Lakekeeper Management + Iceberg Catalog API. It is the single API layer for all components.

### Initialization pattern

```typescript
// In consuming app's main.ts:
app.provide('appConfig', {
  icebergCatalogUrl: 'http://localhost:8181',
  enabledAuthentication: true,
  enabledPermissions: true,
});
app.provide('functions', useFunctions(appConfig));
```

Internally, `init()` configures both SDK clients with:
- `baseUrl` from `icebergCatalogUrl` (via `appConfig`)
- `x-project-id` header from `useVisualStore().projectSelected['project-id']` or fallback to `serverInfo['default-project-id']`
- Request interceptor: attaches `Authorization: Bearer <token>` from `useUserStore().user.access_token`

### Plugin install

```typescript
// Default export installs via:
app.provide('functions', functions);
app.config.globalProperties.$functions = functions;
```

### API methods by domain

**Server**: `getServerInfo()`, `bootstrapServer()`

**Projects**: `loadProjectList()`, `getProject(projectId)`, `createProject(name)`, `deleteProject(projectId)`, `renameProject(body, projectId)`, `getEndpointStatistics(warehouseFilter, range?, statusCodes?)`

**Warehouses**: `listWarehouses()`, `getWarehouse(warehouseId)`, `createWarehouse(body)`, `deleteWarehouse(warehouseId)`, `renameWarehouse(warehouseId, newName)`, `activateWarehouse(warehouseId)`, `deactivateWarehouse(warehouseId)`, `getWarehouseStatistics(warehouseId)`, `getWarehouseById(warehouseId)`, `updateStorageCredential(warehouseId, body)`, `updateStorageProfile(warehouseId, body)`, `updateWarehouseDeleteProfile(warehouseId, body)`, `setWarehouseManagedAccess(warehouseId, managedAccess)`

**Namespaces**: `listNamespaces(warehouseId, parent?)`, `createNamespace(warehouseId, name, parent?)`, `dropNamespace(warehouseId, nsName)`, `loadNamespaceMetadata(warehouseId, ns)`, `getNamespaceById(nsId, whId)`, `setNamespaceManagedAccess(nsId, whId, managedAccess)`

**Tables**: `listTables(warehouseId, namespace)`, `loadTable(warehouseId, ns, tableName)`, `loadTableCustomized(warehouseId, tableId)`, `dropTable(warehouseId, ns, tableName, purge?)`, `registerTable(warehouseId, ns, body)`

**Views**: `listViews(warehouseId, namespace)`, `loadView(warehouseId, ns, viewName)`, `dropView(warehouseId, ns, viewName)`

**Tabular search**: `searchTabular(body)`, `listDeletedTabulars()`, `undropTabular(tabularId)`

**Users**: `createUser(body)`, `whoAmI()`, `getUser(userId)`, `listUser()`, `deleteUser(userId)`, `searchUser(query)`, `updateUserById(userId, body)`

**Roles**: `listRoles()`, `getRole(roleId)`, `createRole(body)`, `updateRole(roleId, body)`, `deleteRole(roleId)`, `searchRole(query)`, `getRoleMetadata(roleId)`, `updateRoleSourceSystem(roleId, sourceId)`

**Permissions (Catalog)**: For each entity (server, project, warehouse, namespace, table, view, role):
- `get*CatalogActions(id?)` — get allowed actions
- `get*AssignmentsById(id)` — get permission assignments
- `update*AssignmentsById(id, body)` — update assignments

**Permissions (Authorizer/OpenFGA)**: `get*AuthorizerActions(id?)` for each entity type

**Permission checks**: `batchCheckActions(checks, errorOnNotFound?)`, `checkAction(operation)`

**Protection**: `setWarehouseProtection(whId, protected)`, `setNamespaceProtection(whId, nsId, protected)`, `setTableProtection(whId, tableId, protected)`, `setViewProtection(whId, viewId, protected)` + corresponding getters

**Tasks**: `listTasks(warehouseId, request)`, `getTaskDetails(taskId)`, `controlTasks(warehouseId, request)`, `listProjectTasks(request)`, `getProjectTaskDetails(taskId)`, `controlProjectTasks(request)`, task queue config get/set for tabular expiration, purge, log cleanup

**Utility**: `icebergCatalogUrl()`, `icebergCatalogUrlSuffixed(suffix)`, `handleError(error, context)`, `setError(error)`, `copyToClipboard(text)`, `getNewToken(auth, tokenDialog?)`

---

## Permission Composables

### Catalog Permissions (useCatalogPermissions.ts)

Each returns a `PermissionComposable` with `loading`, `permissions`, `hasPermission()`, and role-specific booleans:

| Composable | Params | Extra booleans |
| --- | --- | --- |
| `useServerPermissions(serverId)` | serverId (optional) | `canManageGrants`, `canDelete`, `canUpdate`, `showPermissionsTab`, `showUsersTab`, `showTasksTab` |
| `useProjectPermissions(projectId)` | projectId | `canListWarehouses`, `canCreateRole`, `canGetEndpointStatistics`, `showStatisticsTab` |
| `useWarehousePermissions(warehouseId)` | warehouseId | `canCreateNamespace`, `canControlAllTasks` |
| `useNamespacePermissions(nsId, whId)` | nsId, warehouseId | Standard set |
| `useTablePermissions(tableId, whId)` | tableId, warehouseId | Standard set |
| `useViewPermissions(viewId, whId)` | viewId, warehouseId | Standard set |
| `useRolePermissions(roleId)` | roleId | Standard set |

Helper composables: `useConfig()` (returns injected `appConfig`), `hasAction(action, permissions)` (checks if action is in permission set).

### Authorizer Permissions (useAuthorizerPermissions.ts)

Same pattern but for OpenFGA delegation/grant relations:
`useServerAuthorizerPermissions`, `useProjectAuthorizerPermissions`, `useWarehouseAuthorizerPermissions`, `useNamespaceAuthorizerPermissions`, `useTableAuthorizerPermissions`, `useViewAuthorizerPermissions`, `useRoleAuthorizerPermissions`

---

## Auth Plugin

```typescript
import { createAuth, type AuthConfig } from '@lakekeeper/console-components';

const auth = createAuth({
  idpAuthority: 'https://idp.example.com/realms/lakekeeper',
  idpClientId: 'lakekeeper',
  idpRedirectPath: '/callback',
  idpScope: 'openid profile email',
  idpResource: '',
  idpTokenType: 'Bearer',
  idpLogoutRedirectPath: '/logout',
  baseUrlPrefix: '',
  enabledAuthentication: true,
});

app.use(auth);
```

- Factory returns `{ install, useAuth }` via `oidc-client-ts` `UserManager`
- `useAuth()` composable: `signIn()`, `signOut()`, `initUser()`, `refreshToken()`, `isAuthenticated`, `access_token`
- Token stored in `sessionStorage`
- Automatic silent renewal supported
- Auth page components exported: `LoginPage`, `LogoutPage`, `CallbackPage`

---

## Components (60+)

### Layout & Chrome
`AppBar` (top navigation bar with project selector, theme toggle, user menu), `AppFooter` (copyright bar with logo), `WarningBanner`, `AuthenticationDisabledWarningBanner`, `SnackbarMessage`, `BreadcrumbsFromUrl`, `NotificationButton`, `NotificationPanel`

### Auth Pages
`LoginPage`, `LogoutPage`, `CallbackPage` (OIDC flow pages)

### Server
`ServerOverview` (server info, bootstrap status, license, UI configuration, CORS), `UserManager` (user list, search, create, delete)

### Project
`ProjectManager` (project list with CRUD), `ProjectDialog` (create/edit project), `ProjectNameAddOrEditDialog`, `ProjectStatistics` (endpoint stats with charts), `ProjectTaskManager` (project-level task management)

### Warehouse
`WarehouseManager` (warehouse list), `WarehouseHeader` (warehouse detail header), `WarehouseDetails` (warehouse settings), `WarehouseAddDialog` (multi-step create), `WarehouseRenameDialog`, `WarehouseActionsMenu` (context menu), `WarehouseNamespaces` (namespace tree), `WarehousesNavigationTree` (sidebar nav tree), `WarehouseStorageS3`, `WarehouseStorageAzure`, `WarehouseStorageGCS`, `WarehouseStorageJSON` (storage config forms), `WarehouseStatisticsDialog` (usage charts)

### Namespace
`NamespaceAddDialog`, `NamespaceNamespaces` (nested namespaces), `NamespaceTables`, `NamespaceDeleted` (soft-deleted tabulars), `NamespaceViews`, `NamespaceHeader`

### Table
`TableCreate`, `TableRegister` (register external table), `TableHeader`, `TableDetails`, `TableOverview`, `TableRaw` (raw JSON metadata), `TablePreview` (data preview via DuckDB), `TableBranch`, `TableBranchVisualization` (branch/ref graph), `TableSnapshotDetails`, `TableHealth` (health assessment), `TableHealthActions` (recommended actions: compaction, partition optimization, etc.)

### View
`ViewHeader`, `ViewDetails`, `ViewOverview`, `ViewRaw`, `ViewHistory`, `ViewHistoryTab`

### Permissions
`PermissionManager` (entity-level permission UI), `PermissionAssignDialog` (role/user assignment dialog), `UserRenameDialog`

### Roles
`RoleManager`, `RoleDialog` (create/edit), `RoleOverviewEdit`

### Tasks
`TaskManager` (warehouse task list), `TaskDetails`, `TaskConfigDialog` (queue config)

### SQL / LoQE
`SqlEditor` (multi-tab SQL editor for DuckDB queries), `LoQEExplorer` (local query engine explorer), `LoQENavigationTree` (catalog/schema/table tree for SQL), `DuckDBSettingsDialog` (row limits, extensions)

### Misc
`DeleteDialog`, `DeleteConfirmDialog`, `StatisticsDialog`, `StatisticsProject`, `ComputeConnectDialog` (Spark/Trino/DuckDB/Starrocks connection strings), `CorsConfigDialog`

---

## LoQE — Local Query Engine

LoQE (Local Query Engine) provides in-browser SQL queries via DuckDB WASM:

- **`LoQEEngine`** class (`composables/loqe/LoQEEngine.ts`): initializes DuckDB WASM, attaches Iceberg catalogs via `ATTACH`, manages connection pool
- **`useLoQE(config)`** composable: wraps engine with Vue reactivity — `executeQuery()`, `fetchCompletions()`, `attachCatalog()`, `detachCatalog()`, `isInitialized`
- **`useLoQEStore()`**: persists extensions, attached catalogs, query history
- **`useDuckDBSettingsStore()`**: row limits, DuckDB settings
- Bundles served from app's public directory (`/duckdb/duckdb-*.wasm`)
- Completions: catalog → schema → table → column with smart entity resolution

---

## Generated SDKs

Two auto-generated API clients under `src/gen/`:

| Directory | API | Source spec |
| --- | --- | --- |
| `gen/iceberg/` | Apache Iceberg REST Catalog API | `openapi/rest-catalog-open-api.yaml` |
| `gen/management/` | Lakekeeper Management API | `openapi/management-open-api.yaml` |

Generated with `@hey-api/openapi-ts` + `@hey-api/client-fetch`.

**Never edit files under `src/gen/` manually.** To regenerate:

```sh
# Both at once
just generate-clients

# Or individually
just generate-management-client
just generate-iceberg-client

# Manual
npx @hey-api/openapi-ts -i ./openapi/management-open-api.yaml -o ./src/gen/management -c @hey-api/client-fetch
npx @hey-api/openapi-ts -i ./openapi/rest-catalog-open-api.yaml -o ./src/gen/iceberg -c @hey-api/client-fetch
```

To update OpenAPI specs from upstream:
```sh
just update-openapi-management   # Fetches from lakekeeper/lakekeeper main branch
just update-openapi-catalog      # Fetches from lakekeeper/lakekeeper main branch
```

---

## Exported Types & Enums

**From `common/enums.ts`**: `Type` (ERROR, INFO, etc.), `Intent`, `ObjectType`, and other shared enums.

**From `common/interfaces.ts`**: `Header`, `Breadcrumb`, `NamespaceResponse`, `SearchTabularRequest/Response`, `TabularExpirationQueueConfig`, `User`, `Project`, `SnackbarMsg`, `Item`.

**From `stores/visual.ts`**: `PolicyBuilderState`, `SqlTab`, `WarehouseSqlData`.

**From `gen/management/types.gen.ts`**: All management API types — `ServerInfo`, `GetProjectResponse`, `WarehouseStatistics`, `Role`, `RoleMetadata`, `ProtectionResponse`, task types, permission types, storage types, etc.

**From `gen/iceberg/types.gen.ts`**: All Iceberg REST types — `LoadTableResultWritable`, `LoadViewResultWritable`, `Namespace`, `PageToken`, `ListTablesResponse`, `TableUpdate`, `ViewUpdate`, schema types, partition types, etc.

**Relation types**: `RelationType` enum (`Role`, `Project`, `Server`, `Warehouse`, `Namespace`, `View`, `Table`), individual relation types: `ServerRelation`, `ProjectRelation`, `WarehouseRelation`, `NamespaceRelation`, `TableRelation`, `ViewRelation`, `RoleRelation`.

**Permission action types**: `LakekeeperServerAction`, `LakekeeperProjectAction`, `LakekeeperWarehouseAction`, `LakekeeperNamespaceAction`, `LakekeeperTableAction`, `LakekeeperViewAction`, `LakekeeperRoleAction`, `LakekeeperUserAction`, plus authorizer action types.

**Index.d.ts**: `PermissionComposable` interface.

---

## Build Configuration

- **Vite** library mode, entry at `src/index.ts`
- Outputs: ES module (`.es.js`) + UMD (`.umd.js`) + types (`dist/types/`)
- `vite-plugin-dts` generates `.d.ts` files (structure preserved, not rolled up)
- Path alias: `@` → `src`

### External dependencies (not bundled)

```
vue, vuetify, vuetify/*, vue-router, pinia, oidc-client-ts,
json-bigint, @wdns/vue-code-block, chart.js, vue-chartjs,
date-fns, vue-json-pretty, vue-json-pretty/*,
@duckdb/duckdb-wasm, apache-arrow, virtual:*
```

### UMD globals

```
vue → Vue, vuetify → Vuetify, vue-router → VueRouter,
pinia → Pinia, oidc-client-ts → OidcClient,
@duckdb/duckdb-wasm → DuckDB, apache-arrow → Arrow
```

- CSS: single file (`style.css`), `cssCodeSplit: false`
- Target: `esnext`, minified with esbuild
- `optimizeDeps.exclude`: `['@duckdb/duckdb-wasm']`
- Custom elements: `l-*` tags treated as web components (ldrs loading spinners)

---

## How Consuming Apps Use This Library

### main.ts setup

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createAuth, useFunctions } from '@lakekeeper/console-components';
import ConsoleComponentsPlugin from '@lakekeeper/console-components';
import '@lakekeeper/console-components/style.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);                                     // Pinia first (stores depend on it)
app.use(ConsoleComponentsPlugin);                   // Registers all components globally

const appConfig = {
  icebergCatalogUrl: import.meta.env.VITE_BACKEND_URL,
  enabledAuthentication: import.meta.env.VITE_ENABLED_AUTHENTICATION === 'true',
  enabledPermissions: true,
};

app.provide('appConfig', appConfig);
app.provide('functions', useFunctions(appConfig));  // DI for API functions

const auth = createAuth({
  idpAuthority: import.meta.env.VITE_IDP_AUTHORITY,
  idpClientId: import.meta.env.VITE_IDP_CLIENT_ID,
  idpRedirectPath: '/callback',
  // ... other OIDC settings
  enabledAuthentication: appConfig.enabledAuthentication,
});
app.use(auth);

app.mount('#app');
```

### Required router routes

```typescript
import { LoginPage, LogoutPage, CallbackPage } from '@lakekeeper/console-components';

const routes = [
  { path: '/login', component: LoginPage },
  { path: '/logout', component: LogoutPage },
  { path: '/callback', component: CallbackPage },
  // ... app routes
];
```

### Environment variables

```bash
VITE_BACKEND_URL=http://localhost:8181
VITE_IDP_AUTHORITY=http://localhost:30080/realms/iceberg
VITE_IDP_CLIENT_ID=lakekeeper
VITE_ENABLED_AUTHENTICATION=true
VITE_BASE_URL_PREFIX=
```

---

## Component Patterns

### Common component setup

```vue
<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useVisualStore } from '@/stores/visual';
import { useUserStore } from '@/stores/user';
import { useConfig } from '@/composables/useCatalogPermissions';
import { useFunctions } from '@/plugins/functions';

const visual = useVisualStore();
const user = useUserStore();
const config = useConfig();           // returns injected appConfig
const functions = useFunctions();     // returns API methods
</script>
```

### Permission-gated UI

```vue
<script setup lang="ts">
import { useWarehousePermissions } from '@/composables/useCatalogPermissions';
const perms = useWarehousePermissions(props.warehouseId);
</script>

<template>
  <v-btn v-if="perms.canCreateNamespace" @click="createNs">New Namespace</v-btn>
</template>
```

### Error handling

Components delegate to `functions.handleError(error, context)`. Functions use `handleError(error, functionName, notify?)` internally with `visualStore.setSnackbarMsg()` for user feedback.

### BigInt / json-bigint

Some API responses contain i64 values exceeding `Number.MAX_SAFE_INTEGER` (e.g., `max-ref-age-ms: 9223372036854775807`). These use raw `fetch` + `JSONBig({ storeAsString: true })` instead of the SDK. The `json-bigint` package is a runtime dependency.

---

## Build & Dev Commands

| Command | Purpose |
| --- | --- |
| `just reviewable` | install + fix-all + build (run before committing) |
| `just build` | `npm run build` via Vite (outputs to `dist/`) |
| `just install` | `npm install` |
| `just dev` | `npm run dev` — Vite dev server |
| `just fix-lint` | `npm run lint` |
| `just check-lint` | `npm run lint:check` |
| `just format` | `npm run format` |
| `just check-format` | `npm run format:check` |
| `just fix-all` | format + fix-lint |
| `just check-all` | check-format + fix-lint |
| `just generate-clients` | Regenerate both SDK clients from OpenAPI specs |
| `just generate-management-client` | Management API SDK only |
| `just generate-iceberg-client` | Iceberg API SDK only |
| `just update-openapi-management` | Fetch latest management OpenAPI spec |
| `just update-openapi-catalog` | Fetch latest catalog OpenAPI spec |

---

## ESLint & Formatting

- ESLint flat config (`eslint.config.mjs`): `@eslint/js` + `typescript-eslint` + `eslint-plugin-vue` (flat/essential) + Prettier integration
- Vue files parsed with `typescript-eslint` parser
- Generated code (`src/gen/**`) is excluded from lint
- Prettier enforced via `eslint-plugin-prettier` + `eslint-config-prettier`

---

## Critical Constraints

### Generated code

Everything under `src/gen/` is auto-generated from OpenAPI specs in `openapi/`. **Never edit these files manually.** Always regenerate with `just generate-clients`.

### BigInt precision

API responses with i64 values must use raw `fetch` + `json-bigint`. Do NOT use the standard SDK for these — `response.json()` silently loses precision beyond `Number.MAX_SAFE_INTEGER`.

### DuckDB WASM

- `@duckdb/duckdb-wasm` is excluded from Vite's dep optimizer (`optimizeDeps.exclude`)
- WASM bundles must be served from the consuming app's public directory
- The `LoQEEngine` resolves bundle paths relative to `window.location.origin`

### Peer dependencies

The consuming app must provide: `vue ^3.5`, `vuetify ^3.8`, `pinia ^2.3`, `vue-router ^4.5`, `oidc-client-ts ^3.2`

---

## Conventions

- **Conventional commits** required (feat:, fix:, chore:, etc.) — release-please manages versioning
- **`just reviewable`** before every commit (install + format + lint + build)
- **Never edit `src/gen/`** — always regenerate from OpenAPI specs
- **Error handling**: use `handleError(error, context, notify?)` → snackbar notification
- **Vue composable pattern**: stores and composables called at component setup level, not inside async callbacks
- **Theme**: system default auto-detected; user can toggle in AppBar
- **Icons**: `@mdi/font` (Material Design Icons)
- **Custom elements**: `l-*` tags (from `ldrs` library) configured as custom elements in Vue compiler

---

## Extending This Library

### Adding a new component

1. Create the `.vue` file in `src/components/`
2. Import and export it in `src/index.ts` (both in the exports block and the `ConsoleComponentsPlugin.install()` registration)
3. Use `useFunctions()` for API calls, stores for shared state
4. Add permission gating if appropriate

### Adding a new API wrapper

1. Implement the function in `src/plugins/functions.ts`
2. Add it to the `useFunctions()` return object
3. If it involves i64 values, use raw fetch + json-bigint

### Adding a new store

1. Create the store in `src/stores/`
2. Export from `src/stores/index.ts` and `src/index.ts`
3. Use `pinia-plugin-persistedstate-2` for persistence if needed

### Updating API types

1. Fetch latest specs: `just update-openapi-management` / `just update-openapi-catalog`
2. Regenerate clients: `just generate-clients`
3. Update any wrapper functions in `functions.ts` if types changed
