import { Namespace, PageToken } from '../gen/iceberg/types.gen';
import {
  AdlsProfile,
  AzCredential,
  GcsCredential,
  GcsProfile,
  OneLakeProfile,
  NamespaceAssignment,
  ProjectAssignment,
  RoleAssignment,
  S3Credential,
  S3Profile,
  ServerAssignment,
  TableAssignment,
  ViewAssignment,
  GenericTableAssignment,
  WarehouseAssignment,
} from '../gen/management/types.gen';
import { Type } from './enums';

export interface Project {
  'project-id': string;
  'project-name': string;
}

export interface User {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_expires_at: number;
  email: string;
  preferred_username: string;
  family_name: string;
  given_name: string;
}

export interface SnackbarMsg {
  function?: string;
  text: string;
  ttl: number;
  ts: number;
  type: Type;
}

export interface NamespaceResponse {
  namespaceMap: Record<string, string>;
  namespaces: Namespace[];
  'next-page-token'?: PageToken;
}

export enum RelationType {
  Role = 'role',
  Project = 'project',
  Server = 'server',
  Warehouse = 'warehouse',
  Namespace = 'namespace',
  View = 'view',
  Table = 'table',
  GenericTable = 'generic-table',
  Tag = 'tag',
}

export type AssignmentCollection =
  | RoleAssignment[]
  | ServerAssignment[]
  | ProjectAssignment[]
  | WarehouseAssignment[]
  | NamespaceAssignment[]
  | TableAssignment[]
  | ViewAssignment[]
  | GenericTableAssignment[];

export interface Item {
  name: string;
  id?: string;
  type: string;
  parentPath: string[];
  actions: string[];
}

export interface Breadcrumb {
  title: string;
  disabled?: boolean;
  href?: string;
}

type CustomStringType =
  (string & {}) | 'data-table-group' | 'data-table-select' | 'data-table-expand';

export interface Header {
  readonly key?: CustomStringType;
  readonly title?: string;
  readonly align?: 'end' | 'center' | 'start';
}

export interface WarehousObject {
  'storage-profile':
    | (S3Profile & { type: string })
    | (AdlsProfile & { type: string })
    | (OneLakeProfile & { type: string })
    | (GcsProfile & { type: string });
  'storage-credential':
    | (S3Credential & { type: string })
    | (AzCredential & { type: string })
    | (GcsCredential & { type: string });
}

export type Options = {
  page: number;
  itemsPerPage: number;
  sortBy: [
    {
      key: string;
      order: string;
    },
  ];
  groupBy: [];
};

// Task-related interfaces have been moved to generated types
// Import task types from: '../gen/management/types.gen'

export interface SearchTabularRequest {
  [key: string]: any;
}

export interface SearchTabularResponse {
  tabulars: any[];
}

export interface QueueOption {
  title: string;
  value: string;
}

export interface SoftDeletionQueueConfig {
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Grants [Preview]
// ---------------------------------------------------------------------------

/**
 * Narrows a grant listing to a single principal. Exactly one of the two may be
 * set: the API rejects both, and the project-wide listing rejects neither.
 */
export interface GrantPrincipalFilter {
  principalUser?: string;
  principalRole?: string;
}

/** A page request against one of the grant listings. */
export interface GrantListOptions extends GrantPrincipalFilter {
  pageToken?: string;
  pageSize?: number;
}

/**
 * A resource a grant can be held on, in the shape the console addresses it.
 *
 * Mirrors the API's `GrantResourceResponse` but in camelCase, because it is
 * built by callers rather than parsed from a response. `type` carries the same
 * spelling the API uses, so it doubles as the key into the grantable-privilege
 * vocabulary.
 */
export type GrantResourceRef =
  | { type: 'server' }
  /**
   * The project endpoints carry no path segment — `x-project-id` is what
   * addresses them — so this is sent as that header. Omit it to read whichever
   * project is currently selected.
   */
  | { type: 'project'; projectId?: string }
  | { type: 'warehouse'; warehouseId: string }
  | { type: 'namespace'; warehouseId: string; namespaceId: string }
  | { type: 'table'; warehouseId: string; tableId: string }
  | { type: 'view'; warehouseId: string; viewId: string }
  | { type: 'generic-table'; warehouseId: string; genericTableId: string }
  | { type: 'tag-definition'; tagDefinitionId: string };
