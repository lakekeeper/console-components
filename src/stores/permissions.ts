import { defineStore } from 'pinia';
import type {
  LakekeeperProjectAction,
  LakekeeperWarehouseAction,
  LakekeeperNamespaceAction,
  LakekeeperServerAction,
  LakekeeperRoleAction,
} from '@/gen/management/types.gen';
import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from './visual';

export const usePermissionStore = defineStore('permissions', () => {
  const functions = useFunctions();

  // Server Permissions - returns catalog (operational) actions
  async function getServerPermissions(): Promise<LakekeeperServerAction[]> {
    try {
      const permissions = await functions.getServerCatalogActions();
      return permissions;
    } catch (error) {
      console.error('Failed to load server permissions:', error);
      return [];
    }
  }

  // Role Permissions - returns catalog (operational) actions
  async function getRolePermissions(
    roleId: string,
    projectId?: string,
  ): Promise<LakekeeperRoleAction[]> {
    try {
      const permissions = await functions.getRoleCatalogActions(roleId, projectId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load role permissions for ${roleId}:`, error);
      return [];
    }
  }

  // Project Permissions - returns catalog (operational) actions
  async function getProjectPermissions(): Promise<LakekeeperProjectAction[]> {
    try {
      const permissions = await functions.getProjectCatalogActions();
      return permissions;
    } catch (error) {
      console.error('Failed to load project permissions:', error);
      return [];
    }
  }

  // Warehouse Permissions - returns catalog (operational) actions
  async function getWarehousePermissions(
    warehouseId: string,
  ): Promise<LakekeeperWarehouseAction[]> {
    try {
      const permissions = await functions.getWarehouseCatalogActions(warehouseId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load warehouse permissions for ${warehouseId}:`, error);
      return [];
    }
  }

  // Namespace Permissions - returns catalog (operational) actions
  async function getNamespacePermissions(
    namespaceId: string,
    warehouseId?: string,
  ): Promise<LakekeeperNamespaceAction[]> {
    try {
      // Get warehouseId from visual store if not provided
      const visual = useVisualStore();
      const whId = warehouseId || visual.whId;

      if (!whId) {
        console.error('Failed to load namespace permissions: warehouseId not available');
        return [];
      }

      const permissions = await functions.getNamespaceCatalogActions(whId, namespaceId);
      return permissions;
    } catch (error) {
      console.error(`Failed to load namespace permissions for ${namespaceId}:`, error);
      return [];
    }
  }

  return {
    getServerPermissions,
    getRolePermissions,
    getProjectPermissions,
    getWarehousePermissions,
    getNamespacePermissions,
  };
});
