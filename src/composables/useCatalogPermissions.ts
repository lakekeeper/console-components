import { ref, computed, onMounted, watch, inject } from 'vue';
import type {
  LakekeeperProjectAction,
  LakekeeperWarehouseAction,
  LakekeeperNamespaceAction,
  LakekeeperServerAction,
  LakekeeperRoleAction,
  LakekeeperTableAction,
  LakekeeperViewAction,
} from '@/gen/management/types.gen';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Helper function to extract action name from LakekeeperAction object
 */
function getActionName(
  action:
    | LakekeeperServerAction
    | LakekeeperProjectAction
    | LakekeeperWarehouseAction
    | LakekeeperNamespaceAction
    | LakekeeperTableAction
    | LakekeeperViewAction
    | LakekeeperRoleAction,
): string {
  return action.action;
}

/**
 * Helper to check if an action exists in a list of actions
 */
function hasAction<T extends { action: string }>(actions: T[], actionName: string | T): boolean {
  const searchName = typeof actionName === 'string' ? actionName : actionName.action;
  return actions.some((a) => a.action === searchName);
}

// Helper to get config values via inject with fallback
export function useConfig() {
  const config = inject<any>('appConfig', null);
  const functions = useFunctions();
  const authzBackend = ref<string>('');

  // Load server info to determine permissions backend
  onMounted(async () => {
    if (functions?.getServerInfo) {
      try {
        const serverInfo = await functions.getServerInfo();
        authzBackend.value = serverInfo['authz-backend'] || '';
      } catch (error) {
        console.warn('Failed to load server info for permissions config:', error);
      }
    }
  });

  return {
    enabledAuthentication: computed(() => config?.enabledAuthentication ?? false),
    enabledPermissions: computed(() => {
      // Check server's authz-backend instead of frontend config
      return authzBackend.value !== 'allow-all' && authzBackend.value !== '';
    }),
  };
}
import type { Ref } from 'vue';

/**
 * Composable for managing server permissions
 * @param serverId - The server ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useServerPermissions(serverId: Ref<string> | string) {
  const permissionStore = usePermissionStore();
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<LakekeeperServerAction[]>([]);

  const serverIdRef = computed(() => (typeof serverId === 'string' ? serverId : serverId.value));

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getServerPermissions();
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperServerAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperServerAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperServerAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canCreateProject = computed(() => hasPermission('create_project'));
  const canUpdateUsers = computed(() => hasPermission('update_users'));
  const canDeleteUsers = computed(() => hasPermission('delete_users'));
  const canListUsers = computed(() => hasPermission('list_users'));
  const canProvisionUsers = computed(() => hasPermission('provision_users'));

  // UI visibility helpers
  const showUsersTab = computed(() => canListUsers.value && config.enabledAuthentication.value);

  // Auto-load on mount
  onMounted(() => {
    if (serverIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    serverIdRef,
    (newId, oldId) => {
      if (newId && newId !== oldId) {
        loadPermissions();
      }
    },
    { flush: 'post' },
  );

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canCreateProject,
    canUpdateUsers,
    canDeleteUsers,
    canListUsers,
    canProvisionUsers,
    showUsersTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing role permissions
 * @param roleId - The role ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useRolePermissions(roleId: Ref<string> | string) {
  const permissionStore = usePermissionStore();
  const loading = ref(false);
  const permissions = ref<LakekeeperRoleAction[]>([]);

  const roleIdRef = computed(() => (typeof roleId === 'string' ? roleId : roleId.value));

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getRolePermissions(roleIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperRoleAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperRoleAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperRoleAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canDelete = computed(() => hasPermission('delete'));
  const canUpdate = computed(() => hasPermission('update'));
  const canRead = computed(() => hasPermission('read'));

  // Auto-load on mount
  onMounted(() => {
    if (roleIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    roleIdRef,
    (newId, oldId) => {
      if (newId && newId !== oldId) {
        loadPermissions();
      }
    },
    { flush: 'post' },
  );

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canDelete,
    canUpdate,
    canRead,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing project permissions
 * @param projectId - The project ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useProjectPermissions(projectId: Ref<string> | string) {
  const permissionStore = usePermissionStore();
  const loading = ref(false);
  const permissions = ref<LakekeeperProjectAction[]>([]);

  const projectIdRef = computed(() =>
    typeof projectId === 'string' ? projectId : projectId.value,
  );

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getProjectPermissions();
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperProjectAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperProjectAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperProjectAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canCreateWarehouse = computed(() => hasPermission('create_warehouse'));
  const canListWarehouses = computed(() => hasPermission('list_warehouses'));
  const canCreateRole = computed(() => hasPermission('create_role'));
  const canListRoles = computed(() => hasPermission('list_roles'));
  const canSearchRoles = computed(() => hasPermission('search_roles'));
  const canDelete = computed(() => hasPermission('delete'));
  const canGetEndpointStatistics = computed(() => hasPermission('get_endpoint_statistics'));

  // UI visibility helpers
  const showStatisticsTab = computed(() => canGetEndpointStatistics.value);

  // Auto-load on mount
  onMounted(() => {
    if (projectIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    projectIdRef,
    (newId, oldId) => {
      if (newId && newId !== oldId) {
        loadPermissions();
      }
    },
    { flush: 'post' },
  );

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canCreateWarehouse,
    canListWarehouses,
    canCreateRole,
    canListRoles,
    canSearchRoles,
    canDelete,
    canGetEndpointStatistics,
    showStatisticsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing warehouse permissions
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useWarehousePermissions(warehouseId: Ref<string> | string) {
  const permissionStore = usePermissionStore();
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<LakekeeperWarehouseAction[]>([]);

  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getWarehousePermissions(warehouseIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperWarehouseAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperWarehouseAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperWarehouseAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canCreateNamespace = computed(() => hasPermission('create_namespace'));
  const canDelete = computed(() => hasPermission('delete'));
  const canUpdateStorage = computed(() => hasPermission('update_storage'));
  const canUpdateStorageCredential = computed(() => hasPermission('update_storage_credential'));
  const canRename = computed(() => hasPermission('rename'));
  const canGetAllTasks = computed(() => hasPermission('get_all_tasks'));
  const canControlAllTasks = computed(() => hasPermission('control_all_tasks'));
  const canGetEndpointStatistics = computed(() => hasPermission('get_endpoint_statistics'));
  const canSetProtection = computed(
    () =>
      hasPermission('set_protection') ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );
  const canModifyWarehouse = computed(() =>
    hasAnyPermission('update_storage', 'update_storage_credential', 'rename'),
  );

  // UI visibility helpers
  const showTasksTab = computed(
    () =>
      canGetAllTasks.value ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );
  const canControlTasks = computed(
    () =>
      canControlAllTasks.value ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    warehouseIdRef,
    (newId, oldId) => {
      // Only reload if ID actually changed (not initial mount)
      if (newId && newId !== oldId) {
        loadPermissions();
      }
    },
    { flush: 'post' },
  );

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canCreateNamespace,
    canDelete,
    canUpdateStorage,
    canUpdateStorageCredential,
    canModifyWarehouse,
    canGetAllTasks,
    canControlAllTasks,
    canRename,
    canSetProtection,
    canGetEndpointStatistics,
    showTasksTab,
    canControlTasks,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing namespace permissions
 * @param namespaceId - The namespace ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useNamespacePermissions(
  namespaceId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const permissionStore = usePermissionStore();
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<LakekeeperNamespaceAction[]>([]);

  const namespaceIdRef = computed(() =>
    typeof namespaceId === 'string' ? namespaceId : namespaceId.value,
  );
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!namespaceIdRef.value || !warehouseIdRef.value) return;

    loading.value = true;
    try {
      permissions.value = await permissionStore.getNamespacePermissions(
        namespaceIdRef.value,
        warehouseIdRef.value,
      );
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperNamespaceAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperNamespaceAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperNamespaceAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canCreateTable = computed(() => hasPermission('create_table'));
  const canCreateNamespace = computed(() => hasPermission('create_namespace'));
  const canCreateView = computed(() => hasPermission('create_view'));
  const canGetMetadata = computed(() => hasPermission('get_metadata'));
  const canSetProtection = computed(
    () =>
      hasPermission('set_protection') ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (namespaceIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    [namespaceIdRef, warehouseIdRef],
    ([newNsId, newWhId], [oldNsId, oldWhId]) => {
      if (newNsId && newWhId && (newNsId !== oldNsId || newWhId !== oldWhId)) {
        loadPermissions();
      }
    },
    { flush: 'post' },
  );

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canCreateTable,
    canCreateNamespace,
    canCreateView,
    canGetMetadata,
    canSetProtection,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing table permissions
 * @param tableId - The table ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useTablePermissions(
  tableId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const functions = useFunctions();
  const loading = ref(false);
  const permissions = ref<LakekeeperTableAction[]>([]);
  const config = useConfig();

  const tableIdRef = computed(() => (typeof tableId === 'string' ? tableId : tableId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!tableIdRef.value || !warehouseIdRef.value) return;

    loading.value = true;
    try {
      permissions.value = await functions.getTableCatalogActions(
        tableIdRef.value,
        warehouseIdRef.value,
      );
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperTableAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperTableAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperTableAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canGetTasks = computed(() => hasPermission('get_tasks'));
  const canControlTasks = computed(() => hasPermission('control_tasks'));
  const canSetProtection = computed(
    () =>
      hasPermission('set_protection') ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );
  const canDrop = computed(() => hasPermission('drop'));
  const canWriteData = computed(() => hasPermission('write_data'));
  const canReadData = computed(() => hasPermission('read_data'));

  // UI helpers
  const showTasksTab = computed(
    () =>
      canGetTasks.value || !config.enabledAuthentication.value || !config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (tableIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
  watch([tableIdRef, warehouseIdRef], ([newTableId, newWarehouseId]) => {
    if (newTableId && newWarehouseId) {
      loadPermissions();
    }
  });

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canGetTasks,
    canControlTasks,
    canSetProtection,
    canDrop,
    canWriteData,
    canReadData,
    showTasksTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing view permissions
 * @param viewId - The view ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useViewPermissions(
  viewId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const functions = useFunctions();
  const loading = ref(false);
  const permissions = ref<LakekeeperViewAction[]>([]);
  const config = useConfig();

  const viewIdRef = computed(() => (typeof viewId === 'string' ? viewId : viewId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!viewIdRef.value || !warehouseIdRef.value) return;

    loading.value = true;
    try {
      permissions.value = await functions.getViewCatalogActions(
        viewIdRef.value,
        warehouseIdRef.value,
      );
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: LakekeeperViewAction | string): boolean {
    return hasAction(permissions.value, action);
  }

  function hasAnyPermission(...actions: (LakekeeperViewAction | string)[]): boolean {
    return actions.some((action) => hasAction(permissions.value, action));
  }

  function hasAllPermissions(...actions: (LakekeeperViewAction | string)[]): boolean {
    return actions.every((action) => hasAction(permissions.value, action));
  }

  // Specific permission checks - CATALOG/OPERATIONAL only
  const canGetTasks = computed(() => hasPermission('get_tasks'));
  const canControlTasks = computed(() => hasPermission('control_tasks'));
  const canSetProtection = computed(
    () =>
      hasPermission('set_protection') ||
      !config.enabledAuthentication.value ||
      !config.enabledPermissions.value,
  );
  const canDrop = computed(() => hasPermission('drop'));

  // UI helpers
  const showTasksTab = computed(
    () =>
      canGetTasks.value || !config.enabledAuthentication.value || !config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (viewIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
  watch([viewIdRef, warehouseIdRef], ([newViewId, newWarehouseId]) => {
    if (newViewId && newWarehouseId) {
      loadPermissions();
    }
  });

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canGetTasks,
    canControlTasks,
    canSetProtection,
    canDrop,
    showTasksTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for accessing injected functions
 * Functions should be provided by the application at mount
 */
export function useFunctions() {
  const functions = inject<any>('functions', null);
  if (!functions) {
    console.warn('functions not provided - functions may not work correctly');
  }
  return functions;
}
