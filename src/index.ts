import type { App, Plugin } from 'vue';

// Import all components
import AppFooter from './components/AppFooter.vue';
import UserManager from './components/UserManager.vue';
import UserRenameDialog from './components/UserRenameDialog.vue';
import ServerInformation from './components/ServerInformation.vue';
import PermissionManager from './components/PermissionManager.vue';
import PermissionAssignDialog from './components/PermissionAssignDialog.vue';

// Export individual components
export {
  AppFooter,
  UserManager,
  UserRenameDialog,
  ServerInformation,
  PermissionManager,
  PermissionAssignDialog,
};

export * from './types';

// Register all components in an object
const components = {
  AppFooter,
  UserManager,
  UserRenameDialog,
  ServerInformation,
  PermissionManager,
  PermissionAssignDialog,
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
