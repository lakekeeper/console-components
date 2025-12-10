import { ref, computed, onMounted, watch, inject } from 'vue';
import type {
  OpenFgaProjectAction,
  OpenFgaWarehouseAction,
  OpenFgaNamespaceAction,
  OpenFgaServerAction,
  OpenFgaRoleAction,
  OpenFgaTableAction,
  OpenFgaViewAction,
} from '@/gen/management/types.gen';
import type { Ref } from 'vue';
import { useVisualStore } from '@/stores/visual';

// Helper to get config values
function usePermissionsConfig() {
  const appConfig = inject<any>('appConfig', null);
  const visual = useVisualStore();

  const enabledPermissions = computed(() => {
    const serverInfo = visual.getServerInfo();
    // Only enable authorizer permissions when backend is OpenFGA
    return serverInfo['authz-backend'] === 'openfga';
  });

  const enabledAuthentication = computed(() => appConfig?.enabledAuthentication ?? false);

  return {
    enabledPermissions,
    enabledAuthentication,
  };
}

/**
 * Composable for managing server authorizer permissions (OpenFGA delegation)
 * @param serverId - The server ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useServerAuthorizerPermissions(serverId: Ref<string> | string) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaServerAction[]>([]);

  const serverIdRef = computed(() => (typeof serverId === 'string' ? serverId : serverId.value));

  async function loadPermissions() {
    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerServerActions();
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaServerAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaServerAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaServerAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canGrantAdmin = computed(() => hasPermission('grant_admin'));

  // Check if user can manage grants (has grant_admin permission)
  const canManageGrants = computed(() => canGrantAdmin.value);

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    loadPermissions();
  });

  // Note: No watch needed - server permissions are global and don't depend on serverId

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canReadAssignments,
    canGrantAdmin,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing role authorizer permissions (OpenFGA delegation)
 * @param roleId - The role ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useRoleAuthorizerPermissions(roleId: Ref<string> | string) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaRoleAction[]>([]);

  const roleIdRef = computed(() => (typeof roleId === 'string' ? roleId : roleId.value));

  async function loadPermissions() {
    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerRoleActions(roleIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaRoleAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaRoleAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaRoleAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canGrantAssignee = computed(() => hasPermission('can_grant_assignee'));
  const canChangeOwnership = computed(() => hasPermission('can_change_ownership'));
  const canAssume = computed(() => hasPermission('assume'));

  // Can manage grants = can grant assignee OR can change ownership
  const canManageGrants = computed(() =>
    hasAnyPermission('can_grant_assignee', 'can_change_ownership'),
  );

  // UI visibility helpers
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

  // Watch for ID changes
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
    canReadAssignments,
    canGrantAssignee,
    canChangeOwnership,
    canAssume,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing project authorizer permissions (OpenFGA delegation)
 * @param projectId - The project ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useProjectAuthorizerPermissions(projectId: Ref<string> | string) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaProjectAction[]>([]);

  const projectIdRef = computed(() =>
    typeof projectId === 'string' ? projectId : projectId.value,
  );

  async function loadPermissions() {
    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerProjectActions();
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaProjectAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaProjectAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaProjectAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canGrantCreate = computed(() => hasPermission('grant_create'));
  const canGrantRoleCreator = computed(() => hasPermission('grant_role_creator'));
  const canGrantProjectAdmin = computed(() => hasPermission('grant_project_admin'));

  // Check if user can manage grants (has any grant permission)
  const canManageGrants = computed(() =>
    hasAnyPermission(
      'grant_role_creator',
      'grant_create',
      'grant_describe',
      'grant_modify',
      'grant_select',
      'grant_project_admin',
      'grant_security_admin',
      'grant_data_admin',
    ),
  );

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    loadPermissions();
  });

  // Note: No watch needed - project permissions are contextual (current project) and don't depend on projectId parameter

  return {
    loading,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canReadAssignments,
    canGrantCreate,
    canGrantRoleCreator,
    canGrantProjectAdmin,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing warehouse authorizer permissions (OpenFGA delegation)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useWarehouseAuthorizerPermissions(warehouseId: Ref<string> | string) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaWarehouseAction[]>([]);

  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerWarehouseActions(warehouseIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaWarehouseAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaWarehouseAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaWarehouseAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canGrantCreate = computed(() => hasPermission('grant_create'));
  const canGrantModify = computed(() => hasPermission('grant_modify'));
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));
  const canChangeOwnership = computed(() => hasPermission('change_ownership'));

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
  watch(
    warehouseIdRef,
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
    canReadAssignments,
    canGrantCreate,
    canGrantModify,
    canManageGrants,
    canChangeOwnership,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing namespace authorizer permissions (OpenFGA delegation)
 * @param namespaceId - The namespace ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useNamespaceAuthorizerPermissions(
  namespaceId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaNamespaceAction[]>([]);

  const namespaceIdRef = computed(() =>
    typeof namespaceId === 'string' ? namespaceId : namespaceId.value,
  );
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!namespaceIdRef.value || !warehouseIdRef.value) return;

    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerNamespaceActions(namespaceIdRef.value);
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaNamespaceAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaNamespaceAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaNamespaceAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canGrantCreate = computed(() => hasPermission('grant_create'));
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (namespaceIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
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
    canReadAssignments,
    canGrantCreate,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing table authorizer permissions (OpenFGA delegation)
 * @param tableId - The table ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useTableAuthorizerPermissions(
  tableId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaTableAction[]>([]);

  const tableIdRef = computed(() => (typeof tableId === 'string' ? tableId : tableId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!tableIdRef.value || !warehouseIdRef.value) return;

    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerTableActions(
        tableIdRef.value,
        warehouseIdRef.value,
      );
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaTableAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaTableAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaTableAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (tableIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
  watch(
    [tableIdRef, warehouseIdRef],
    ([newTableId, newWhId], [oldTableId, oldWhId]) => {
      if (newTableId && newWhId && (newTableId !== oldTableId || newWhId !== oldWhId)) {
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
    canReadAssignments,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for managing view authorizer permissions (OpenFGA delegation)
 * @param viewId - The view ID (can be a ref or static string)
 * @param warehouseId - The warehouse ID (can be a ref or static string)
 * @returns Reactive authorizer permission state and helper functions
 */
export function useViewAuthorizerPermissions(
  viewId: Ref<string> | string,
  warehouseId: Ref<string> | string,
) {
  const functions = useFunctions();
  const config = usePermissionsConfig();
  const loading = ref(false);
  const permissions = ref<OpenFgaViewAction[]>([]);

  const viewIdRef = computed(() => (typeof viewId === 'string' ? viewId : viewId.value));
  const warehouseIdRef = computed(() =>
    typeof warehouseId === 'string' ? warehouseId : warehouseId.value,
  );

  async function loadPermissions() {
    if (!viewIdRef.value || !warehouseIdRef.value) return;

    // Only load authorizer permissions if OpenFGA is enabled
    if (!config.enabledPermissions.value) {
      permissions.value = [];
      return;
    }

    loading.value = true;
    try {
      permissions.value = await functions.getAuthorizerViewActions(
        viewIdRef.value,
        warehouseIdRef.value,
      );
    } finally {
      loading.value = false;
    }
  }

  function hasPermission(action: OpenFgaViewAction): boolean {
    return permissions.value.includes(action);
  }

  function hasAnyPermission(...actions: OpenFgaViewAction[]): boolean {
    return actions.some((action) => permissions.value.includes(action));
  }

  function hasAllPermissions(...actions: OpenFgaViewAction[]): boolean {
    return actions.every((action) => permissions.value.includes(action));
  }

  // Specific authorizer permission checks - DELEGATION only
  const canReadAssignments = computed(() => hasPermission('read_assignments'));
  const canManageGrants = computed(() => hasPermission('grant_manage_grants'));

  // UI visibility helpers
  const showPermissionsTab = computed(
    () =>
      canReadAssignments.value &&
      config.enabledAuthentication.value &&
      config.enabledPermissions.value,
  );

  // Auto-load on mount
  onMounted(() => {
    if (viewIdRef.value && warehouseIdRef.value) {
      loadPermissions();
    }
  });

  // Watch for ID changes
  watch(
    [viewIdRef, warehouseIdRef],
    ([newViewId, newWhId], [oldViewId, oldWhId]) => {
      if (newViewId && newWhId && (newViewId !== oldViewId || newWhId !== oldWhId)) {
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
    canReadAssignments,
    canManageGrants,
    showPermissionsTab,
    refresh: loadPermissions,
  };
}

/**
 * Composable for accessing injected functions
 * Functions should be provided by the application at mount
 */
function useFunctions() {
  const functions = inject<any>('functions', null);
  if (!functions) {
    console.warn('functions not provided - authorizer permissions may not work correctly');
  }
  return functions;
}
