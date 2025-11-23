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
  'create_project',
  'update_users',
  'delete_users',
  'list_users',
  'provision_users',
];

const catalogProjectActions: LakekeeperProjectAction[] = [
  'create_warehouse',
  'delete',
  'rename',
  'get_metadata',
  'list_warehouses',
  'include_in_list',
  'create_role',
  'list_roles',
  'search_roles',
  'get_endpoint_statistics',
];

const catalogWarehouseActions: LakekeeperWarehouseAction[] = [
  'create_namespace',
  'delete',
  'update_storage',
  'update_storage_credential',
  'get_metadata',
  'get_config',
  'list_namespaces',
  'list_everything',
  'use',
  'include_in_list',
  'deactivate',
  'activate',
  'rename',
  'list_deleted_tabulars',
  'modify_soft_deletion',
  'get_task_queue_config',
  'modify_task_queue_config',
  'get_all_tasks',
  'control_all_tasks',
  'set_protection',
  'get_endpoint_statistics',
];

const catalogNamespaceActions: LakekeeperNamespaceAction[] = [
  'create_table',
  'create_view',
  'create_namespace',
  'delete',
  'update_properties',
  'get_metadata',
  'list_tables',
  'list_views',
  'list_namespaces',
  'list_everything',
  'set_protection',
  'include_in_list',
];

const catalogTableActions: LakekeeperTableAction[] = [
  'drop',
  'write_data',
  'read_data',
  'get_metadata',
  'commit',
  'rename',
  'include_in_list',
  'undrop',
  'get_tasks',
  'control_tasks',
  'set_protection',
];

const catalogViewActions: LakekeeperViewAction[] = [
  'drop',
  'get_metadata',
  'commit',
  'include_in_list',
  'rename',
  'undrop',
  'get_tasks',
  'control_tasks',
  'set_protection',
];

const catalogRoleActions: LakekeeperRoleAction[] = ['read', 'delete', 'update'];

const catalogUserActions: LakekeeperUserAction[] = ['read', 'update', 'delete'];

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
