import { defineStore } from 'pinia';
import type {
  ProjectAction,
  WarehouseAction,
  NamespaceAction,
  ServerAction,
  RoleAction,
} from '@/gen/management/types.gen';
import { useFunctions } from '@/plugins/functions';
import { globals } from '../common/globals';

export const usePermissionStore = defineStore('permissions', () => {
  const functions = useFunctions();

  // Check if auth/permissions are enabled by fetching server info from API
  const isAuthEnabled = async () => {
    try {
      const serverInfo = await functions.getServerInfo();
      const authzBackend = serverInfo['authz-backend'];
      const isEnabled = authzBackend !== 'allow-all';
      return isEnabled;
    } catch (error) {
      console.error('[PermissionStore] Failed to get server info:', error);
      return false;
    }
  };

  // Server Permissions
  async function getServerPermissions(serverId: string): Promise<ServerAction[]> {
    // If auth is disabled, return all permissions
    if (!(await isAuthEnabled())) {
      return globals.serverActions as ServerAction[];
    }

    try {
      const permissions = await functions.getServerAccess();
      return permissions;
    } catch (error) {
      console.error(`Failed to load server permissions for ${serverId}:`, error);
      return [];
    }
  }

  // Role Permissions
  async function getRolePermissions(roleId: string): Promise<RoleAction[]> {
    // If auth is disabled, return all permissions
    if (!(await isAuthEnabled())) {
      return globals.roleActions as RoleAction[];
    }

    try {
      const permissions = await functions.getRoleAccessById(roleId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load role permissions for ${roleId}:`, error);
      return [];
    }
  }

  // Project Permissions
  async function getProjectPermissions(projectId: string): Promise<ProjectAction[]> {
    // If auth is disabled, return all permissions
    if (!(await isAuthEnabled())) {
      return globals.projectActions as ProjectAction[];
    }

    try {
      const permissions = await functions.getProjectAccess();
      return permissions;
    } catch (error) {
      console.error(`Failed to load project permissions for ${projectId}:`, error);
      return [];
    }
  }

  // Warehouse Permissions
  async function getWarehousePermissions(warehouseId: string): Promise<WarehouseAction[]> {
    // If auth is disabled, return all permissions
    if (!(await isAuthEnabled())) {
      return globals.warehouseActions as WarehouseAction[];
    }

    try {
      const permissions = await functions.getWarehouseAccessById(warehouseId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load warehouse permissions for ${warehouseId}:`, error);
      return [];
    }
  }

  // Namespace Permissions
  async function getNamespacePermissions(namespaceId: string): Promise<NamespaceAction[]> {
    // If auth is disabled, return all permissions
    if (!(await isAuthEnabled())) {
      return globals.namespaceActions as NamespaceAction[];
    }

    try {
      const permissions = await functions.getNamespaceAccessById(namespaceId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load namespace permissions for ${namespaceId}:`, error);
      return [];
    }
  }

  return {
    // Getters
    getServerPermissions,
    getRolePermissions,
    getProjectPermissions,
    getWarehousePermissions,
    getNamespacePermissions,

    // Auth check
    isAuthEnabled,
  };
});
