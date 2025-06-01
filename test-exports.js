// Test script to verify exports
import {
  PermissionManager,
  PermissionAssignDialog,
  AppFooter,
  AppBar,
  NavigationBar,
  WarningBanner,
  SnackbarMessage,
  BreadcrumbsFromUrl,
  DialogDelete,
  ServerInformation,
  UserManager,
  UserRenameDialog,
  ProjectDialog,
  AddNamespaceDialog,
  RoleDialog,
  AppFunctions,
  FUNCTIONS_INJECTION_KEY,
} from './dist/console-components.es.js';

console.log('✅ Exports verification:');
console.log('PermissionManager:', PermissionManager ? '✅ Available' : '❌ Missing');
console.log('PermissionAssignDialog:', PermissionAssignDialog ? '✅ Available' : '❌ Missing');
console.log(
  'AppFunctions (type):',
  typeof FUNCTIONS_INJECTION_KEY !== 'undefined' ? '✅ Available' : '❌ Missing',
);
console.log('FUNCTIONS_INJECTION_KEY:', FUNCTIONS_INJECTION_KEY ? '✅ Available' : '❌ Missing');
