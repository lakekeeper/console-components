import {
  LakekeeperServerAction,
  LakekeeperProjectAction,
  LakekeeperWarehouseAction,
  LakekeeperNamespaceAction,
  LakekeeperTableAction,
  LakekeeperViewAction,
  LakekeeperGenericTableAction,
  LakekeeperRoleActionKind,
  LakekeeperTagAction,
  LakekeeperUserAction,
  OpenFgaServerAction,
  OpenFgaProjectAction,
  OpenFgaWarehouseAction,
  OpenFgaNamespaceAction,
  OpenFgaTableAction,
  OpenFgaViewAction,
  OpenFgaGenericTableAction,
  OpenFgaRoleAction,
} from '@/gen/management/types.gen';

// Catalog Actions - Operational permissions (what you can DO with resources)
// These work with ALL authorization backends (allow-all, openfga, future)
//
// With authentication disabled these lists ARE the answer: `functions.ts` returns
// them instead of asking the API, since there is no principal to ask about. So a
// missing entry is not a cosmetic gap — it removes the feature from the UI for
// every no-auth deployment, which is how tag definitions came to be invisible
// there while tag *attachment* worked (that check has its own authn fallback).
//
// They are hand-maintained because the generated client exposes these unions as
// types only, with no runtime value to enumerate. `permissionActions.test.ts`
// parses `types.gen.ts` and fails when a list drifts from the schema, so a
// regenerated client cannot silently leave a new action out.
const catalogServerActions: LakekeeperServerAction[] = [
  { action: 'create_project' },
  { action: 'update_users' },
  { action: 'delete_users' },
  { action: 'list_users' },
  { action: 'provision_users' },
  { action: 'read_grants' },
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
  { action: 'get_project_tasks' },
  { action: 'control_project_tasks' },
  { action: 'read_grants' },
  { action: 'create_tag' },
  { action: 'list_tags' },
  { action: 'get_task_queue_config' },
  { action: 'modify_task_queue_config' },
];

const catalogWarehouseActions: LakekeeperWarehouseAction[] = [
  { action: 'create_namespace' },
  { action: 'delete' },
  { action: 'update_storage' },
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
  { action: 'set_format_version_policy' },
  { action: 'get_endpoint_statistics' },
  { action: 'read_grants' },
  { action: 'manage_tags' },
  { action: 'accept_moved_namespace' },
];

const catalogNamespaceActions: LakekeeperNamespaceAction[] = [
  { action: 'create_table' },
  { action: 'create_view' },
  { action: 'create_generic_table' },
  { action: 'create_namespace' },
  { action: 'delete' },
  { action: 'update_properties' },
  { action: 'get_metadata' },
  { action: 'list_tables' },
  { action: 'list_views' },
  { action: 'list_generic_tables' },
  { action: 'list_namespaces' },
  { action: 'list_everything' },
  { action: 'set_protection' },
  { action: 'include_in_list' },
  { action: 'read_grants' },
  { action: 'manage_tags' },
  // `move` is deliberately absent: the schema requires a `destination` with it,
  // so it asks "may I move this namespace *there*" rather than naming a
  // capability, and it cannot be answered by a blanket list. The move menu entry
  // has its own authentication-disabled fallback.
  { action: 'accept_moved_namespace' },
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
  { action: 'read_grants' },
  { action: 'manage_tags' },
];

const catalogViewActions: LakekeeperViewAction[] = [
  { action: 'drop' },
  { action: 'get_metadata' },
  { action: 'select' },
  { action: 'commit' },
  { action: 'include_in_list' },
  { action: 'rename' },
  { action: 'undrop' },
  { action: 'get_tasks' },
  { action: 'control_tasks' },
  { action: 'set_protection' },
  { action: 'read_grants' },
  { action: 'manage_tags' },
];

const catalogGenericTableActions: LakekeeperGenericTableAction[] = [
  { action: 'drop' },
  { action: 'read_data' },
  { action: 'write_data' },
  { action: 'get_metadata' },
  { action: 'rename' },
  { action: 'include_in_list' },
  { action: 'undrop' },
  { action: 'get_tasks' },
  { action: 'control_tasks' },
  { action: 'set_protection' },
  { action: 'read_grants' },
  { action: 'manage_tags' },
];

const catalogRoleActions: LakekeeperRoleActionKind[] = [
  { action: 'read' },
  { action: 'delete' },
  { action: 'update' },
  { action: 'read_metadata' },
  { action: 'read_role_assignments' },
  { action: 'manage_role_assignments' },
  { action: 'update_source_system' },
];

const catalogTagActions: LakekeeperTagAction[] = [
  { action: 'read' },
  { action: 'update' },
  { action: 'delete' },
  { action: 'apply' },
  { action: 'remove' },
  { action: 'read_attachments' },
  { action: 'read_grants' },
];

const catalogUserActions: LakekeeperUserAction[] = [
  { action: 'read' },
  { action: 'update' },
  { action: 'delete' },
  { action: 'read_role_assignments' },
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

const authorizerGenericTableActions: OpenFgaGenericTableAction[] = [
  'read_assignments',
  'grant_pass_grants',
  'grant_manage_grants',
  'grant_describe',
  'grant_select',
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
  catalogGenericTableActions,
  catalogRoleActions,
  catalogTagActions,
  catalogUserActions,
  // Authorizer actions (permission delegation)
  authorizerServerActions,
  authorizerProjectActions,
  authorizerWarehouseActions,
  authorizerNamespaceActions,
  authorizerTableActions,
  authorizerViewActions,
  authorizerGenericTableActions,
  authorizerRoleActions,
};

export default permissionActions;
