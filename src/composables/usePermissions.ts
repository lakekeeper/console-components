import { ref, computed, onMounted, watch, inject } from 'vue';
import type {
  ProjectAction,
  WarehouseAction,
  NamespaceAction,
  ServerAction,
  RoleAction,
  TableAction,
  ViewAction,
} from '@/gen/management/types.gen';
import { usePermissionStore } from '@/stores/permissions';
// Helper to get config values via inject with fallback
export function useConfig() {
  const config = inject<any>('appConfig', null);
  return {
    enabledAuthentication: computed(() => config?.enabledAuthentication ?? false),
    enabledPermissions: computed(() => config?.enabledPermissions ?? false),
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
  const permissions = ref<ServerAction[]>([]);

  const serverIdRef = computed(() => (typeof serverId === 'string' ? serverId : serverId.value));

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getServerPermissions(serverIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: ServerAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: ServerAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: ServerAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canCreateProject = computed(() => hasPermission('create_project'));
  const canUpdateUsers = computed(() => hasPermission('update_users'));
  const canDeleteUsers = computed(() => hasPermission('delete_users'));
  const canListUsers = computed(() => hasPermission('list_users'));
  const canGrantAdmin = computed(() => hasPermission('grant_admin'));
  const canProvisionUsers = computed(() => hasPermission('provision_users'));
  const canReadAssignments = computed(() => hasPermission('read_assignments'));

  // UI visibility helpers that include auth checks
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );
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
    canGrantAdmin,
    canProvisionUsers,
    canReadAssignments,
    showPermissionsTab,
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
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<RoleAction[]>([]);

  const roleIdRef = computed(() => (typeof roleId === 'string' ? roleId : roleId.value));

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getRolePermissions(roleIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: RoleAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: RoleAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: RoleAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canAssume = computed(() => hasPermission('assume'));
  const canGrantAssignee = computed(() => hasPermission('can_grant_assignee'));
  const canChangeOwnership = computed(() => hasPermission('can_change_ownership'));
  const canDelete = computed(() => hasPermission('delete'));
  const canUpdate = computed(() => hasPermission('update'));
  const canRead = computed(() => hasPermission('read'));
  const canReadAssignments = computed(() => hasPermission('read_assignments'));

  // UI visibility helpers that include auth checks
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

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
    canAssume,
    canGrantAssignee,
    canChangeOwnership,
    canDelete,
    canUpdate,
    canRead,
    canReadAssignments,
    showPermissionsTab,
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
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<ProjectAction[]>([]);

  const projectIdRef = computed(() =>
    typeof projectId === 'string' ? projectId : projectId.value,
  );

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getProjectPermissions(projectIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: ProjectAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: ProjectAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: ProjectAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canCreateWarehouse = computed(() => hasPermission('create_warehouse'));
  const canListWarehouses = computed(() => hasPermission('list_warehouses'));
  const canCreateRole = computed(() => hasPermission('create_role'));
  const canListRoles = computed(() => hasPermission('list_roles'));
  const canSearchRoles = computed(() => hasPermission('search_roles'));
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canDelete = computed(() => hasPermission('delete'));
  const canGetEndpointStatistics = computed(() => {
    const result = hasPermission('get_endpoint_statistics');
    console.log('🔍 canGetEndpointStatistics DEBUG:', {
      result,
      searchingFor: 'get_endpoint_statistics',
      userPermissions: permissions.value,
    });
    return result;
  });

  // UI visibility helpers that include auth checks
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );
  const showStatisticsTab = computed(() => {
    const hasPermission = canGetEndpointStatistics.value;
    const authDisabled = !config.enabledAuthentication.value;
    const permissionsDisabled = !config.enabledPermissions.value;
    const shouldShow = hasPermission || authDisabled || permissionsDisabled;

    console.log('📊 showStatisticsTab DEBUG:', {
      hasPermission,
      authDisabled,
      permissionsDisabled,
      shouldShow,
      permissions: permissions.value,
      enabledAuthentication: config.enabledAuthentication.value,
      enabledPermissions: config.enabledPermissions.value,
    });

    return shouldShow;
  });

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
    canReadAssignments,
    canDelete,
    canGetEndpointStatistics,
    showPermissionsTab,
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
  const permissions = ref<WarehouseAction[]>([]);

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

  function hasPermission(action: WarehouseAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: WarehouseAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: WarehouseAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canCreateNamespace = computed(() => hasPermission('create_namespace'));
  const canDelete = computed(() => hasPermission('delete'));
  const canReadPermissions = computed(() => hasPermission('read_assignments'));
  const canModifyWarehouse = computed(() =>
    hasAnyPermission(
      'modify_storage',
      'modify_storage_credential',
      'rename',
      'grant_create',
      'grant_modify',
    ),
  );
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));
  const canGetAllTasks = computed(() => hasPermission('get_all_tasks'));
  const canControlAllTasks = computed(() => hasPermission('control_all_tasks'));
  const canModifyStorage = computed(() => hasPermission('modify_storage'));
  const canModifyCredentials = computed(() => hasPermission('modify_storage_credential'));
  const canRename = computed(() => hasPermission('rename'));
  const canSetWarehouseProtection = computed(() => hasPermission('set_warehouse_protection'));
  const canGetEndpointStatistics = computed(() => hasPermission('get_endpoint_statistics'));

  // UI visibility helpers that include auth checks
  const showPermissionsTab = computed(
    () =>
      canReadPermissions.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );
  const showTasksTab = computed(
    () =>
      canGetAllTasks.value ||
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
    canReadPermissions,
    canModifyWarehouse,
    canGetAllTasks,
    canManageGrants,
    canControlAllTasks,
    canModifyStorage,
    canModifyCredentials,
    canRename,
    canSetWarehouseProtection,
    canGetEndpointStatistics,
    showPermissionsTab,
    showTasksTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing namespace permissions
 * @param namespaceId - The namespace ID (can be a ref or static string)
 * @returns Reactive permission state and helper functions
 */
export function useNamespacePermissions(namespaceId: Ref<string> | string) {
  const permissionStore = usePermissionStore();
  const config = useConfig();
  const loading = ref(false);
  const permissions = ref<NamespaceAction[]>([]);

  const namespaceIdRef = computed(() =>
    typeof namespaceId === 'string' ? namespaceId : namespaceId.value,
  );

  async function loadPermissions() {
    loading.value = true;
    try {
      permissions.value = await permissionStore.getNamespacePermissions(namespaceIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: NamespaceAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: NamespaceAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: NamespaceAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canCreateTable = computed(() => hasPermission('create_table'));
  const canCreateNamespace = computed(() => hasPermission('create_namespace'));
  const canReadPermissions = computed(() => hasPermission('read_assignments'));
  const canCreateView = computed(() => hasPermission('create_view'));
  const canGetMetadata = computed(() => hasPermission('get_metadata'));
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));

  // UI helpers
  const showPermissionsTab = computed(
    () =>
      canReadPermissions.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (namespaceIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes (skip immediate to avoid double-load on mount)
  watch(
    namespaceIdRef,
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
    canCreateTable,
    canCreateNamespace,
    canReadPermissions,
    canCreateView,
    canGetMetadata,
    canManageGrants,
    showPermissionsTab,
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
  const permissions = ref<TableAction[]>([]);
  const config = useConfig();

  const tableIdRef = computed(() => (typeof tableId === 'string' ? tableId : tableId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!tableIdRef.value || !warehouseIdRef.value) return;

    loading.value = true;
    try {
      const serverInfo = await functions.getServerInfo();
      if (serverInfo['authz-backend'] !== 'allow-all') {
        permissions.value = await functions.getTableAccessById(
          tableIdRef.value,
          warehouseIdRef.value,
        );
      }
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: TableAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: TableAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: TableAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canReadPermissions = computed(() => hasPermission('read_assignments'));
  const canGetTasks = computed(() => hasPermission('get_tasks'));
  const canControlTasks = computed(() => hasPermission('control_tasks'));

  // UI helpers
  const showPermissionsTab = computed(
    () =>
      canReadPermissions.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );
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
    canReadPermissions,
    canGetTasks,
    canControlTasks,
    showPermissionsTab,
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
  const permissions = ref<ViewAction[]>([]);
  const config = useConfig();

  const viewIdRef = computed(() => (typeof viewId === 'string' ? viewId : viewId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!viewIdRef.value || !warehouseIdRef.value) return;

    loading.value = true;
    try {
      const serverInfo = await functions.getServerInfo();
      if (serverInfo['authz-backend'] !== 'allow-all') {
        permissions.value = await functions.getViewAccessById(
          viewIdRef.value,
          warehouseIdRef.value,
        );
      }
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: ViewAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: ViewAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: ViewAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific permission checks
  const canReadPermissions = computed(() => hasPermission('read_assignments'));
  const canGetTasks = computed(() => hasPermission('get_tasks'));
  const canControlTasks = computed(() => hasPermission('control_tasks'));

  // UI helpers
  const showPermissionsTab = computed(
    () =>
      canReadPermissions.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );
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
    canReadPermissions,
    canGetTasks,
    canControlTasks,
    showPermissionsTab,
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
