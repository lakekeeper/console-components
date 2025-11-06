import type { App, Plugin } from 'vue';

// Import core working components
import AppFooter from './components/AppFooter.vue';
import PermissionManager from './components/PermissionManager.vue';
import PermissionAssignDialog from './components/PermissionAssignDialog.vue';
import UserRenameDialog from './components/UserRenameDialog.vue';
import ProjectDialog from './components/ProjectDialog.vue';
import ProjectManager from './components/ProjectManager.vue';
import ProjectStatistics from './components/ProjectStatistics.vue';
import AddOrEditProjectNameDialog from './components/AddOrEditProjectNameDialog.vue';
import NamespaceAddDialog from './components/NamespaceAddDialog.vue';
import RoleDialog from './components/RoleDialog.vue';
import RoleManager from './components/RoleManager.vue';
import RoleOverviewEdit from './components/RoleOverviewEdit.vue';
import ProjectNameAddOrEditDialog from './components/ProjectNameAddOrEditDialog.vue';
import AuthenticationDisabledWarningBanner from './components/AuthenticationDisabledWarningBanner.vue';
import WarehouseRenameDialog from './components/WarehouseRenameDialog.vue';
import WarehouseActionsMenu from './components/WarehouseActionsMenu.vue';
import WarehouseAddDialog from './components/WarehouseAddDialog.vue';
import WarehouseStorageS3 from './components/WarehouseStorageS3.vue';
import WarehouseStorageAzure from './components/WarehouseStorageAzure.vue';
import WarehouseStorageGCS from './components/WarehouseStorageGCS.vue';
import WarehouseStorageJSON from './components/WarehouseStorageJSON.vue';
import DeleteConfirmDialog from './components/DeleteConfirmDialog.vue';
import WarehouseDetails from './components/WarehouseDetails.vue';
import TaskManager from './components/TaskManager.vue';
import TaskDetails from './components/TaskDetails.vue';
import WarehouseManager from './components/WarehouseManager.vue';
import WarehouseHeader from './components/WarehouseHeader.vue';
import WarehouseStatisticsDialog from './components/WarehouseStatisticsDialog.vue';
import SearchTabular from './components/SearchTabular.vue';
import WarehouseNamespaces from './components/WarehouseNamespaces.vue';
import NamespaceNamespaces from './components/NamespaceNamespaces.vue';
import NamespaceTables from './components/NamespaceTables.vue';
import NamespaceDeleted from './components/NamespaceDeleted.vue';
import NamespaceViews from './components/NamespaceViews.vue';
import NamespaceHeader from './components/NamespaceHeader.vue';
import TableHeader from './components/TableHeader.vue';
import TableDetails from './components/TableDetails.vue';
import TableBranchVisualization from './components/TableBranchVisualization.vue';
import TableSnapshotDetails from './components/TableSnapshotDetails.vue';
import TableOverview from './components/TableOverview.vue';
import TableRaw from './components/TableRaw.vue';
import TableBranch from './components/TableBranch.vue';
import TablePreview from './components/TablePreview.vue';
import TableCreate from './components/TableCreate.vue';
import WarehouseSqlQuery from './components/WarehouseSqlQuery.vue';
import WarehouseNavigationTree from './components/WarehouseNavigationTree.vue';
import ViewHeader from './components/ViewHeader.vue';
import ViewHistoryTab from './components/ViewHistoryTab.vue';
import ViewOverview from './components/ViewOverview.vue';
import ViewRaw from './components/ViewRaw.vue';
import ViewHistory from './components/ViewHistory.vue';
import ViewDetails from './components/ViewDetails.vue';

// Import navigation components
import AppBar from './components/AppBar.vue';
import NavigationBar from './components/NavigationBar.vue';

// Import utility components
import WarningBanner from './components/WarningBanner.vue';
import SnackbarMessage from './components/SnackbarMessage.vue';
import BreadcrumbsFromUrl from './components/BreadcrumbsFromUrl.vue';
import DeleteDialog from './components/DeleteDialog.vue';
import TaskConfigDialog from './components/TaskConfigDialog.vue';
import ServerInformation from './components/ServerInformation.vue';
import ServerOverview from './components/ServerOverview.vue';
import UserManager from './components/UserManager.vue';
import StatisticsDialog from './components/StatisticsDialog.vue';
import StatisticsProject from './components/StatisticsProject.vue';
import ComputeConnectDialog from './components/ComputeConnectDialog.vue';

// Export individual components
export {
  AppFooter,
  PermissionManager,
  PermissionAssignDialog,
  UserRenameDialog,
  ProjectDialog,
  NamespaceAddDialog,
  RoleDialog,
  RoleManager,
  RoleOverviewEdit,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DeleteDialog,
  TaskConfigDialog,
  ServerInformation,
  ServerOverview,
  UserManager,
  ProjectNameAddOrEditDialog,
  AuthenticationDisabledWarningBanner,
  WarehouseRenameDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  WarehouseStorageS3,
  WarehouseStorageAzure,
  WarehouseStorageGCS,
  WarehouseStorageJSON,
  DeleteConfirmDialog,
  StatisticsDialog,
  StatisticsProject,
  ComputeConnectDialog,
  ProjectManager,
  WarehouseDetails,
  TaskManager,
  TaskDetails,
  WarehouseManager,
  WarehouseHeader,
  WarehouseStatisticsDialog,
  SearchTabular,
  WarehouseNamespaces,
  NamespaceNamespaces,
  NamespaceTables,
  NamespaceHeader,
  TableHeader,
  ViewHeader,
  ViewHistoryTab,
  ViewOverview,
  ViewRaw,
  ViewHistory,
  ViewDetails,
};

// Export composables
export * from './composables/usePermissions';
export * from './composables/useAuth';

// Export stores
export { useVisualStore } from './stores/visual';
export { usePermissionStore } from './stores/permissions';
export { useUserStore } from './stores/user';

// Export common types and enums
export * from './common/interfaces';
export * from './common/enums';

// Register all components in an object
const components = {
  AppFooter,
  PermissionManager,
  PermissionAssignDialog,
  UserRenameDialog,
  ProjectDialog,
  NamespaceAddDialog,
  ProjectNameAddOrEditDialog,
  RoleDialog,
  RoleManager,
  RoleOverviewEdit,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DeleteDialog,
  TaskConfigDialog,
  ServerInformation,
  ServerOverview,
  UserManager,
  AuthenticationDisabledWarningBanner,
  WarehouseRenameDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  WarehouseStorageS3,
  WarehouseStorageAzure,
  WarehouseStorageGCS,
  WarehouseStorageJSON,
  DeleteConfirmDialog,
  StatisticsDialog,
  StatisticsProject,
  ComputeConnectDialog,
  ProjectManager,
  ProjectStatistics,
  AddOrEditProjectNameDialog,
  WarehouseDetails,
  TaskManager,
  TaskDetails,
  WarehouseManager,
  WarehouseHeader,
  WarehouseStatisticsDialog,
  SearchTabular,
  WarehouseNamespaces,
  NamespaceNamespaces,
  NamespaceTables,
  NamespaceDeleted,
  NamespaceViews,
  NamespaceHeader,
  TableHeader,
  TableDetails,
  TableBranchVisualization,
  TableSnapshotDetails,
  TableOverview,
  TableRaw,
  TablePreview,
  TableCreate,
  TableBranch,
  WarehouseSqlQuery,
  WarehouseNavigationTree,
  ViewHeader,
  ViewHistoryTab,
  ViewOverview,
  ViewRaw,
  ViewHistory,
  ViewDetails,
};

// Create the plugin
const ConsoleComponentsPlugin: Plugin = {
  install(app: App) {
    // Register all components globally
    Object.entries(components).forEach(([name, component]) => {
      app.component(name, component);
    });
  },
};

// Export the plugin as default
export default ConsoleComponentsPlugin;

// Export the plugin with a named export as well
export { ConsoleComponentsPlugin };

// Export functions plugin
export { default as functionsPlugin } from './plugins/functions';
export { useFunctions as useFunctionsImplementation } from './plugins/functions';

// Export auth factory and types
export { createAuth, type AuthConfig } from './plugins/auth';

// Export vuetify theme
export { myCustomLightTheme } from './theme';

// Export auth-related page components
export { default as LoginPage } from './components/LoginPage.vue';
export { default as LogoutPage } from './components/LogoutPage.vue';
export { default as CallbackPage } from './components/CallbackPage.vue';

// Export DuckDB composable
export { useDuckDB } from './composables/useDuckDB';
export type { QueryResult } from './composables/useDuckDB';

// Export Iceberg DuckDB integration
export { useIcebergDuckDB } from './composables/useIcebergDuckDB';
export type {} from './composables/useIcebergDuckDB';
