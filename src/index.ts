import type { App, Plugin } from 'vue';

// Import core working components
import AppFooter from './components/AppFooter.vue';
import PermissionManager from './components/PermissionManager.vue';
import PermissionAssignDialog from './components/PermissionAssignDialog.vue';
import UserRenameDialog from './components/UserRenameDialog.vue';
import ProjectDialog from './components/ProjectDialog.vue';
import ProjectManager from './components/ProjectManager.vue';
import AddNamespaceDialog from './components/AddNamespaceDialog.vue';
import RoleDialog from './components/RoleDialog.vue';
import ProjectNameAddOrEditDialog from './components/ProjectNameAddOrEditDialog.vue';
import AuthenticationDisabledWarningBanner from './components/AuthenticationDisabledWarningBanner.vue';
import RenameWarehouseDialog from './components/WarehouseRenameDialog.vue';
import WarehouseActionsMenu from './components/WarehouseActionsMenu.vue';
import WarehouseAddDialog from './components/WarehouseAddDialog.vue';

// Import navigation components
import AppBar from './components/AppBar.vue';
import NavigationBar from './components/NavigationBar.vue';

// Import utility components
import WarningBanner from './components/WarningBanner.vue';
import SnackbarMessage from './components/SnackbarMessage.vue';
import BreadcrumbsFromUrl from './components/BreadcrumbsFromUrl.vue';
import DialogDelete from './components/DialogDelete.vue';
import ServerInformation from './components/ServerInformation.vue';
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
  AddNamespaceDialog,
  RoleDialog,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DialogDelete,
  ServerInformation,
  UserManager,
  ProjectNameAddOrEditDialog,
  AuthenticationDisabledWarningBanner,
  RenameWarehouseDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  StatisticsDialog,
  StatisticsProject,
  ComputeConnectDialog,
  ProjectManager,
};

export * from './types';

// Register all components in an object
const components = {
  AppFooter,
  PermissionManager,
  PermissionAssignDialog,
  UserRenameDialog,
  ProjectDialog,
  AddNamespaceDialog,
  ProjectNameAddOrEditDialog,
  RoleDialog,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DialogDelete,
  ServerInformation,
  UserManager,
  AuthenticationDisabledWarningBanner,
  RenameWarehouseDialog,
  WarehouseActionsMenu,
  WarehouseAddDialog,
  StatisticsDialog,
  StatisticsProject,
  ComputeConnectDialog,
  ProjectManager,
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
