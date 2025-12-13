import { Namespace, PageToken } from '../gen/iceberg/types.gen';
import {
  AdlsProfile,
  AzCredential,
  GcsCredential,
  GcsProfile,
  NamespaceAssignment,
  ProjectAssignment,
  RoleAssignment,
  S3Credential,
  S3Profile,
  ServerAssignment,
  TableAssignment,
  ViewAssignment,
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
}

export type AssignmentCollection =
  | RoleAssignment[]
  | ServerAssignment[]
  | ProjectAssignment[]
  | WarehouseAssignment[]
  | NamespaceAssignment[]
  | TableAssignment[]
  | ViewAssignment[];

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
  | (string & {})
  | 'data-table-group'
  | 'data-table-select'
  | 'data-table-expand';

export interface Header {
  readonly key?: CustomStringType;
  readonly title?: string;
  readonly align?: 'end' | 'center' | 'start';
}

export interface WarehousObject {
  'storage-profile':
    | (S3Profile & { type: string })
    | (AdlsProfile & { type: string })
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

export interface TabularExpirationQueueConfig {
  [key: string]: any;
}
