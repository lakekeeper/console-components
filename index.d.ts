// Component exports
export { default as ServerOverview } from './src/components/ServerOverview.vue';
export { default as PermissionManager } from './src/components/PermissionManager.vue';
export { default as UserManager } from './src/components/UserManager.vue';
export { default as WarehouseAddDialog } from './src/components/WarehouseAddDialog.vue';
export { default as TaskManager } from './src/components/TaskManager.vue';
export { default as TaskDetails } from './src/components/TaskDetails.vue';

// Permission composables
export interface PermissionComposable {
  loading: import('vue').Ref<boolean>;
  permissions: import('vue').Ref<any[]>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  canManageGrants: import('vue').ComputedRef<boolean>;
  canReadAssignments: import('vue').ComputedRef<boolean>;
  canDelete: import('vue').ComputedRef<boolean>;
  canUpdate: import('vue').ComputedRef<boolean>;
  canControlAllTasks: import('vue').ComputedRef<boolean>;
  canCreateNamespace: import('vue').ComputedRef<boolean>;
  canListRoles: import('vue').ComputedRef<boolean>;
  canCreateRole: import('vue').ComputedRef<boolean>;
  canCreateProject: import('vue').ComputedRef<boolean>;
  showPermissionsTab: import('vue').ComputedRef<boolean>;
  showTasksTab: import('vue').ComputedRef<boolean>;
  showUsersTab: import('vue').ComputedRef<boolean>;
}

export function useServerPermissions(
  serverId: import('vue').Ref<string> | string,
): PermissionComposable;
export function useWarehousePermissions(
  warehouseId: import('vue').Ref<string> | string,
): PermissionComposable;
export function useNamespacePermissions(
  namespaceId: import('vue').Ref<string> | string,
  warehouseId: import('vue').Ref<string> | string,
): PermissionComposable;
export function useProjectPermissions(
  projectId: import('vue').Ref<string> | string,
): PermissionComposable;
export function useRolePermissions(
  roleId: import('vue').Ref<string> | string,
): PermissionComposable;

// Enum exports
export { Type } from './src/common/enums';
