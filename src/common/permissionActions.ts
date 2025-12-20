import {
  LakekeeperServerAction,
  LakekeeperProjectAction,
  LakekeeperWarehouseAction,
  LakekeeperNamespaceAction,
  LakekeeperTableAction,
  LakekeeperViewAction,
  LakekeeperRoleAction,
  LakekeeperUserAction,
  OpenFgaServerAction,
  OpenFgaProjectAction,
  OpenFgaWarehouseAction,
  OpenFgaNamespaceAction,
  OpenFgaTableAction,
  OpenFgaViewAction,
  OpenFgaRoleAction,
} from '@/gen/management/types.gen';

// Catalog Actions - Operational permissions (what you can DO with resources)
// These work with ALL authorization backends (allow-all, openfga, future)
const catalogServerActions: LakekeeperServerAction[] = [
  { action: 'create_project' },
  { action: 'update_users' },
  { action: 'delete_users' },
  { action: 'list_users' },
  { action: 'provision_users' },
];

const catalogProjectActions: LakekeeperProjectAction[] = [
  { action: 'create_warehouse' },
  { action: 'delete' },
  { action: 'rename' },
  { action: 'get_metadata' },
  { action: 'list_warehouses' },
  { action: 'include_in_list' },
  { action: 'create_role' },
  { action: 'list_roles' },
  { action: 'search_roles' },
  { action: 'get_endpoint_statistics' },
];

const catalogWarehouseActions: LakekeeperWarehouseAction[] = [
  { action: 'create_namespace' },
  { action: 'delete' },
  { action: 'update_storage' },
  { action: 'update_storage_credential' },
  { action: 'get_metadata' },
  { action: 'get_config' },
  { action: 'list_namespaces' },
  { action: 'list_everything' },
  { action: 'use' },
  { action: 'include_in_list' },
  { action: 'deactivate' },
  { action: 'activate' },
  { action: 'rename' },
  { action: 'list_deleted_tabulars' },
  { action: 'modify_soft_deletion' },
  { action: 'get_task_queue_config' },
  { action: 'modify_task_queue_config' },
  { action: 'get_all_tasks' },
  { action: 'control_all_tasks' },
  { action: 'set_protection' },
  { action: 'get_endpoint_statistics' },
];

const catalogNamespaceActions: LakekeeperNamespaceAction[] = [
  { action: 'create_table' },
  { action: 'create_view' },
  { action: 'create_namespace' },
  { action: 'delete' },
  { action: 'update_properties' },
  { action: 'get_metadata' },
  { action: 'list_tables' },
  { action: 'list_views' },
  { action: 'list_namespaces' },
  { action: 'list_everything' },
  { action: 'set_protection' },
  { action: 'include_in_list' },
];

const catalogTableActions: LakekeeperTableAction[] = [
  { action: 'drop' },
  { action: 'write_data' },
  { action: 'read_data' },
  { action: 'get_metadata' },
  { action: 'commit' },
  { action: 'rename' },
  { action: 'include_in_list' },
  { action: 'undrop' },
  { action: 'get_tasks' },
  { action: 'control_tasks' },
  { action: 'set_protection' },
];

const catalogViewActions: LakekeeperViewAction[] = [
  { action: 'drop' },
  { action: 'get_metadata' },
  { action: 'commit' },
  { action: 'include_in_list' },
  { action: 'rename' },
  { action: 'undrop' },
  { action: 'get_tasks' },
  { action: 'control_tasks' },
  { action: 'set_protection' },
];

const catalogRoleActions: LakekeeperRoleAction[] = [
  { action: 'read' },
  { action: 'delete' },
  { action: 'update' },
];

const catalogUserActions: LakekeeperUserAction[] = [
  { action: 'read' },
  { action: 'update' },
  { action: 'delete' },
];

// Authorizer Actions - OpenFGA relations for permission delegation
// These work with ALL authorization backends (allow-all, openfga, future)
const authorizerServerActions: OpenFgaServerAction[] = ['read_assignments', 'grant_admin'];

const authorizerProjectActions: OpenFgaProjectAction[] = [
  'read_assignments',
  'grant_role_creator',
  'grant_create',
  'grant_describe',
  'grant_modify',
  'grant_select',
  'grant_project_admin',
  'grant_security_admin',
  'grant_data_admin',
];

const authorizerWarehouseActions: OpenFgaWarehouseAction[] = [
  'read_assignments',
  'grant_create',
  'grant_describe',
  'grant_modify',
  'grant_select',
  'grant_pass_grants',
  'grant_manage_grants',
  'change_ownership',
];

const authorizerNamespaceActions: OpenFgaNamespaceAction[] = [
  'read_assignments',
  'grant_create',
  'grant_describe',
  'grant_modify',
  'grant_select',
  'grant_pass_grants',
  'grant_manage_grants',
];

const authorizerTableActions: OpenFgaTableAction[] = [
  'read_assignments',
  'grant_pass_grants',
  'grant_manage_grants',
  'grant_describe',
  'grant_select',
  'grant_modify',
  'change_ownership',
];

const authorizerViewActions: OpenFgaViewAction[] = [
  'read_assignments',
  'grant_pass_grants',
  'grant_manage_grants',
  'grant_describe',
  'grant_modify',
  'change_ownership',
];

const authorizerRoleActions: OpenFgaRoleAction[] = [
  'assume',
  'can_grant_assignee',
  'can_change_ownership',
  'read_assignments',
];

export const permissionActions = {
  // Catalog actions (operational)
  catalogServerActions,
  catalogProjectActions,
  catalogWarehouseActions,
  catalogNamespaceActions,
  catalogTableActions,
  catalogViewActions,
  catalogRoleActions,
  catalogUserActions,
  // Authorizer actions (permission delegation)
  authorizerServerActions,
  authorizerProjectActions,
  authorizerWarehouseActions,
  authorizerNamespaceActions,
  authorizerTableActions,
  authorizerViewActions,
  authorizerRoleActions,
};

export default permissionActions;
