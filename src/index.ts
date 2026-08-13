import type { App, Plugin } from 'vue';

// Import core working components
import AppFooter from './components/AppFooter.vue';
import PermissionManager from './components/PermissionManager.vue';
import PermissionAssignDialog from './components/PermissionAssignDialog.vue';
import UserRenameDialog from './components/UserRenameDialog.vue';
import ProjectDialog from './components/ProjectDialog.vue';
import ProjectManager from './components/ProjectManager.vue';
import ProjectStatistics from './components/ProjectStatistics.vue';
import NamespaceAddDialog from './components/NamespaceAddDialog.vue';
import RoleDialog from './components/RoleDialog.vue';
import RoleManager from './components/RoleManager.vue';
import TagDefinitionManager from './components/TagDefinitionManager.vue';
import PermissionExplorer from './components/PermissionExplorer.vue';
import TagDefinitionDialog from './components/TagDefinitionDialog.vue';
import TagAttachmentsPanel from './components/TagAttachmentsPanel.vue';
import TagPermissionsPanel from './components/TagPermissionsPanel.vue';
import TagDetail from './components/TagDetail.vue';
import EntityTagsChips from './components/EntityTagsChips.vue';
import EntityTagsManageDialog from './components/EntityTagsManageDialog.vue';
import TableTagsManageDialog from './components/TableTagsManageDialog.vue';
import EntitySettingsDialog from './components/EntitySettingsDialog.vue';
import EntityTagsManagePanel from './components/EntityTagsManagePanel.vue';
import TagPickerList from './components/TagPickerList.vue';
import ColumnTagsManagePanel from './components/ColumnTagsManagePanel.vue';
import ColumnTags from './components/ColumnTags.vue';
import RoleMembers from './components/RoleMembers.vue';
import RoleOwners from './components/RoleOwners.vue';
import RoleDetail from './components/RoleDetail.vue';
import RoleOverviewEdit from './components/RoleOverviewEdit.vue';
import ProjectNameAddOrEditDialog from './components/ProjectNameAddOrEditDialog.vue';
import AuthenticationDisabledWarningBanner from './components/AuthenticationDisabledWarningBanner.vue';
import WarehouseRenameDialog from './components/WarehouseRenameDialog.vue';
import WarehouseActionsMenu from './components/WarehouseActionsMenu.vue';
import WarehouseAddDialog from './components/WarehouseAddDialog.vue';
import WarehouseStorageFormS3 from './components/WarehouseStorageFormS3.vue';
import WarehouseStorageFormAzure from './components/WarehouseStorageFormAzure.vue';
import WarehouseStorageFormOneLake from './components/WarehouseStorageFormOneLake.vue';
import WarehouseStorageFormGCS from './components/WarehouseStorageFormGCS.vue';
import WarehouseStorageJSON from './components/WarehouseStorageJSON.vue';
import WarehouseValidationReport from './components/WarehouseValidationReport.vue';
import DeleteConfirmDialog from './components/DeleteConfirmDialog.vue';
import WarehouseDetails from './components/WarehouseDetails.vue';
import TaskManager from './components/TaskManager.vue';
import TaskDetails from './components/TaskDetails.vue';
import WarehouseManager from './components/WarehouseManager.vue';
import WarehouseHeader from './components/WarehouseHeader.vue';
import WarehouseStatistics from './components/WarehouseStatistics.vue';
import HomeStatistics from './components/HomeStatistics.vue';
import WarehouseNamespaces from './components/WarehouseNamespaces.vue';
import NamespaceNamespaces from './components/NamespaceNamespaces.vue';
import NamespaceTables from './components/NamespaceTables.vue';
import NamespaceGenericTables from './components/NamespaceGenericTables.vue';
import NamespaceDeleted from './components/NamespaceDeleted.vue';
import NamespaceViews from './components/NamespaceViews.vue';
import NamespaceHeader from './components/NamespaceHeader.vue';
import NamespaceDetails from './components/NamespaceDetails.vue';
import NamespaceActionsMenu from './components/NamespaceActionsMenu.vue';
import NamespacePropertiesDialog from './components/NamespacePropertiesDialog.vue';
import TableHeader from './components/TableHeader.vue';
import TableActionsMenu from './components/TableActionsMenu.vue';
import GenericTableHeader from './components/GenericTableHeader.vue';
import GenericTableOverview from './components/GenericTableOverview.vue';
import TableDetails from './components/TableDetails.vue';
import TableHealth from './components/TableHealth.vue';
import TableHealthActions from './components/TableHealthActions.vue';
import TableColumnProfiler from './components/TableColumnProfiler.vue';
import TableVersioningVisualization from './components/TableVersioningVisualization.vue';
import TableSnapshotDetails from './components/TableSnapshotDetails.vue';
import SnapshotCompare from './components/SnapshotCompare.vue';
import TableOverview from './components/TableOverview.vue';
import TableRaw from './components/TableRaw.vue';
import TableVersioning from './components/TableVersioning.vue';
import TablePreview from './components/TablePreview.vue';
import TableCreate from './components/TableCreate.vue';
import TableRegister from './components/TableRegister.vue';
import WarehousesNavigationTree from './components/WarehousesNavigationTree.vue';
import LoQEExplorer from './components/LoQEExplorer.vue';
import ViewHeader from './components/ViewHeader.vue';
import ViewActionsMenu from './components/ViewActionsMenu.vue';
import GenericTableActionsMenu from './components/GenericTableActionsMenu.vue';
import StorageExplorer from './components/StorageExplorer.vue';
import StorageNavigationTree from './components/StorageNavigationTree.vue';
import DatasetCreate from './components/DatasetCreate.vue';
import DatasetsList from './components/DatasetsList.vue';
import DatasetDetail from './components/DatasetDetail.vue';
import ViewHistoryTab from './components/ViewHistoryTab.vue';
import ViewOverview from './components/ViewOverview.vue';
import ViewRaw from './components/ViewRaw.vue';
import ViewHistory from './components/ViewHistory.vue';
import ViewDetails from './components/ViewDetails.vue';

// Import navigation components
import AppBar from './components/AppBar.vue';

// Import utility components
import WarningBanner from './components/WarningBanner.vue';
import SnackbarMessage from './components/SnackbarMessage.vue';
import BreadcrumbsFromUrl from './components/BreadcrumbsFromUrl.vue';
import DateTimePicker from './components/DateTimePicker.vue';
import StyleGuide from './components/StyleGuide.vue';
import DeleteDialog from './components/DeleteDialog.vue';
import EntityPropertiesPanel from './components/EntityPropertiesPanel.vue';
import TaskConfigDialog from './components/TaskConfigDialog.vue';
import ServerOverview from './components/ServerOverview.vue';
import SupportBundleDialog from './components/SupportBundleDialog.vue';
import UsageDatumDialog from './components/UsageDatumDialog.vue';
import FeedbackDialog from './components/FeedbackDialog.vue';
import UserManager from './components/UserManager.vue';
import StatisticsDialog from './components/StatisticsDialog.vue';
import StatisticsProject from './components/StatisticsProject.vue';
import StackedAreaChart from './components/StackedAreaChart.vue';
import ComputeConnectDialog from './components/ComputeConnectDialog.vue';
import ComputeConnectPanel from './components/ComputeConnectPanel.vue';
import NotificationButton from './components/NotificationButton.vue';
import NotificationPanel from './components/NotificationPanel.vue';
import ReportBuilderPanel from './components/ReportBuilderPanel.vue';

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
  TagDefinitionManager,
  PermissionExplorer,
  TagDefinitionDialog,
  TagAttachmentsPanel,
  TagPermissionsPanel,
  TagDetail,
  EntityTagsChips,
  EntityTagsManageDialog,
  TableTagsManageDialog,
  EntitySettingsDialog,
  EntityTagsManagePanel,
  TagPickerList,
  ColumnTagsManagePanel,
  ColumnTags,
  RoleMembers,
  RoleOwners,
  RoleDetail,
  RoleOverviewEdit,
  AppBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DateTimePicker,
  StyleGuide,
  DeleteDialog,
  EntityPropertiesPanel,
  TaskConfigDialog,
  ServerOverview,
  SupportBundleDialog,
  UsageDatumDialog,
  FeedbackDialog,
  UserManager,
  ProjectNameAddOrEditDialog,
  AuthenticationDisabledWarningBanner,
  WarehouseRenameDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  WarehouseStorageFormS3,
  WarehouseStorageFormAzure,
  WarehouseStorageFormOneLake,
  WarehouseStorageFormGCS,
  WarehouseStorageJSON,
  WarehouseValidationReport,
  DeleteConfirmDialog,
  StatisticsDialog,
  StatisticsProject,
  StackedAreaChart,
  ComputeConnectDialog,
  ComputeConnectPanel,
  ProjectManager,
  ProjectStatistics,
  WarehouseDetails,
  TaskManager,
  TaskDetails,
  WarehouseManager,
  WarehouseHeader,
  WarehouseStatistics,
  HomeStatistics,
  WarehouseNamespaces,
  NamespaceNamespaces,
  NamespaceTables,
  NamespaceGenericTables,
  NamespaceDeleted,
  NamespaceViews,
  NamespaceHeader,
  NamespaceDetails,
  NamespaceActionsMenu,
  NamespacePropertiesDialog,
  TableHeader,
  TableActionsMenu,
  GenericTableHeader,
  GenericTableOverview,
  TableDetails,
  TableHealth,
  TableHealthActions,
  TableColumnProfiler,
  TableVersioningVisualization,
  TableSnapshotDetails,
  SnapshotCompare,
  TableOverview,
  TableRaw,
  TableVersioning,
  TablePreview,
  TableCreate,
  TableRegister,
  ViewHeader,
  ViewActionsMenu,
  GenericTableActionsMenu,
  StorageExplorer,
  ViewHistoryTab,
  ViewOverview,
  ViewRaw,
  ViewHistory,
  ViewDetails,
  NotificationButton,
  NotificationPanel,
  WarehousesNavigationTree,
  StorageNavigationTree,
  DatasetCreate,
  DatasetsList,
  DatasetDetail,
  LoQEExplorer,
  ReportBuilderPanel,
};

// Export composables
// Catalog Permissions (operational actions)
export {
  useServerPermissions,
  useProjectPermissions,
  useWarehousePermissions,
  useNamespacePermissions,
  useTablePermissions,
  useViewPermissions,
  useGenericTablePermissions,
  useRolePermissions,
} from './composables/useCatalogPermissions';

// Authorizer Permissions (OpenFGA delegation/grant permissions)
export {
  useServerAuthorizerPermissions,
  useProjectAuthorizerPermissions,
  useWarehouseAuthorizerPermissions,
  useNamespaceAuthorizerPermissions,
  useTableAuthorizerPermissions,
  useViewAuthorizerPermissions,
  useGenericTableAuthorizerPermissions,
  useRoleAuthorizerPermissions, // ← Note: singular "Role", not "Roles"
} from './composables/useAuthorizerPermissions';

// Auth composables
export * from './composables/useAuth';

// Export stores
export { useVisualStore, type PolicyBuilderState, type OfflineReason } from './stores/visual';
export { usePermissionStore } from './stores/permissions';
export { useUserStore } from './stores/user';
export { useNotificationStore } from './stores/notifications';
export { useNavigationStore } from './stores/navigation';
export type { NavigationState } from './stores/navigation';
export { useReportsStore } from './stores/reports';
export type { SavedReport, ChartConfig, ChartType } from './stores/reports';

// Export common types and enums
export * from './common/interfaces';
export * from './common/enums';
export * from './common/errorUtils';

// Export generated OpenAPI types for permissions
export type {
  // Catalog/Operational Action Types
  LakekeeperServerAction,
  LakekeeperProjectAction,
  LakekeeperWarehouseAction,
  LakekeeperNamespaceAction,
  LakekeeperTableAction,
  LakekeeperViewAction,
  LakekeeperGenericTableAction,
  LakekeeperRoleActionKind,
  LakekeeperUserAction,
  // Authorizer/Delegation Action Types (OpenFGA)
  OpenFgaServerAction,
  OpenFgaProjectAction,
  OpenFgaWarehouseAction,
  OpenFgaNamespaceAction,
  OpenFgaTableAction,
  OpenFgaViewAction,
  OpenFgaGenericTableAction,
  OpenFgaRoleAction,
  // Assignment Types
  ServerAssignment,
  ProjectAssignment,
  WarehouseAssignment,
  NamespaceAssignment,
  TableAssignment,
  ViewAssignment,
  GenericTableAssignment,
  RoleAssignment,
  // Response Types
  GetServerAssignmentsResponse,
  GetProjectAssignmentsResponse,
  GetWarehouseAssignmentsResponse,
  GetNamespaceAssignmentsResponse,
  GetTableAssignmentsResponse,
  GetViewAssignmentsResponse,
  GetGenericTableAssignmentsResponse,
  GetRoleAssignmentsResponse,
  GetProjectResponse,
  GetWarehouseResponse,
  // Entity Types
  Role,
  User,
  ServerInfo,
  WarehouseTaskInfo,
  ProjectTaskInfo,
  TaskStatus,
  // Governance Tags
  TagDefinition,
  TagScope,
  TagValueKind,
  TagSource,
  TargetTag,
  AppliedTag,
  TagAttachment,
  TagAttachmentTarget,
  TagInheritanceSource,
  CreateTagDefinitionRequest,
  UpdateTagDefinitionRequest,
  SetTagRequest,
  ListTagDefinitionsResponse,
  ListTagAttachmentsResponse,
  ListTagsResponse,
} from './gen/management/types.gen';

// Export generic-table data plane types
export type {
  GenericTableData,
  GenericTableIdentifier,
  CreateGenericTableRequest,
  ListGenericTablesResponse,
  LoadGenericTableResponse,
  LoadGenericTableCredentialsResponse,
  RenameGenericTableRequest,
} from './gen/generic-table/types.gen';

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
  TagDefinitionManager,
  PermissionExplorer,
  TagDefinitionDialog,
  TagAttachmentsPanel,
  TagPermissionsPanel,
  TagDetail,
  EntityTagsChips,
  EntityTagsManageDialog,
  TableTagsManageDialog,
  EntitySettingsDialog,
  EntityTagsManagePanel,
  TagPickerList,
  ColumnTagsManagePanel,
  ColumnTags,
  RoleMembers,
  RoleOwners,
  RoleDetail,
  RoleOverviewEdit,
  AppBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DateTimePicker,
  StyleGuide,
  DeleteDialog,
  EntityPropertiesPanel,
  TaskConfigDialog,
  ServerOverview,
  SupportBundleDialog,
  UsageDatumDialog,
  FeedbackDialog,
  UserManager,
  AuthenticationDisabledWarningBanner,
  WarehouseRenameDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  WarehouseStorageFormS3,
  WarehouseStorageFormAzure,
  WarehouseStorageFormOneLake,
  WarehouseStorageFormGCS,
  WarehouseStorageJSON,
  WarehouseValidationReport,
  DeleteConfirmDialog,
  StatisticsDialog,
  StatisticsProject,
  StackedAreaChart,
  ComputeConnectDialog,
  ComputeConnectPanel,
  ProjectManager,
  ProjectStatistics,
  WarehouseDetails,
  TaskManager,
  TaskDetails,
  WarehouseManager,
  WarehouseHeader,
  WarehouseStatistics,
  HomeStatistics,
  WarehouseNamespaces,
  WarehousesNavigationTree,
  NamespaceNamespaces,
  NamespaceTables,
  NamespaceGenericTables,
  NamespaceDeleted,
  NamespaceViews,
  NamespaceHeader,
  NamespaceDetails,
  NamespaceActionsMenu,
  NamespacePropertiesDialog,
  TableHeader,
  TableActionsMenu,
  GenericTableHeader,
  GenericTableOverview,
  TableDetails,
  TableHealth,
  TableHealthActions,
  TableColumnProfiler,
  TableVersioningVisualization,
  TableSnapshotDetails,
  SnapshotCompare,
  TableOverview,
  TableRaw,
  TablePreview,
  TableCreate,
  TableRegister,
  TableVersioning,
  ViewHeader,
  ViewActionsMenu,
  GenericTableActionsMenu,
  StorageExplorer,
  ViewHistoryTab,
  ViewOverview,
  ViewRaw,
  ViewHistory,
  ViewDetails,
  NotificationButton,
  NotificationPanel,
  LoQEExplorer,
  ReportBuilderPanel,
  StorageNavigationTree,
  DatasetCreate,
  DatasetsList,
  DatasetDetail,
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
export { useFunctions } from './plugins/functions';

// Export auth factory and types
export { createAuth, type AuthConfig } from './plugins/auth';

// Export vuetify themes (light + dark). myCustomLightTheme kept as a
// backward-compatible alias of lakekeeperLightTheme.
export { lakekeeperLightTheme, lakekeeperDarkTheme, myCustomLightTheme } from './theme';

// Export auth-related page components
export { default as LoginPage } from './components/LoginPage.vue';
export { default as LogoutPage } from './components/LogoutPage.vue';
export { default as CallbackPage } from './components/CallbackPage.vue';
export { default as NoAccessPage } from './components/NoAccessPage.vue';

// Export  settings store
export {
  useDuckDBSettingsStore,
  DUCKDB_DEFAULTS,
  ROW_LIMIT_OPTIONS,
  TIMEOUT_OPTIONS,
} from './stores/duckdbSettings';
export type { DuckDBSettings } from './stores/duckdbSettings';
export { default as DuckDBSettingsDialog } from './components/DuckDBSettingsDialog.vue';
export { default as CorsConfigDialog } from './components/CorsConfigDialog.vue';

// Export LoQE — Local Query Engine DuckDB
export { useLoQE } from './composables/useLoQE';
export { LoQEEngine } from './composables/loqe/LoQEEngine';
export { useLoQEStore } from './stores/loqe';
export type {
  LoQEConfig,
  LoQEQueryResult,
  LoQECatalogConfig,
  LoQEExtension,
  LoQEHistoryEntry,
  LoQEPersistedCatalog,
  AttachedCatalog,
} from './composables/loqe/types';
