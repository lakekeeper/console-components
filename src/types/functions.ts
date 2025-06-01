import {
  User,
  Role,
  CreateWarehouseRequest,
  CreateWarehouseResponse,
  GetWarehouseResponse,
} from '@/gen/management/types.gen';

export interface AppFunctions {
  getUser(id: string): Promise<User>;
  getRole(id: string): Promise<Role>;
  searchUser(search: string): Promise<User[]>;
  searchRole(search: string): Promise<Role[]>;
  // Optional warehouse/namespace functions with flexible signatures
  setWarehouseManagedAccess?: (id: string, managed: boolean) => Promise<any>;
  setNamespaceManagedAccess?: (id: string, managed: boolean) => Promise<any>;
  getWarehouseById?: (id: string) => Promise<GetWarehouseResponse>;
  getWarehouse?: (name: string) => Promise<GetWarehouseResponse>; // Get warehouse by name/identifier
  getNamespaceById?: (id: string) => Promise<any>;
  createWarehouse?: (request: CreateWarehouseRequest) => Promise<CreateWarehouseResponse>;
  // Additional utility functions
  copyToClipboard?: (text: string) => void;
  icebergCatalogUrlSuffixed?: () => string;
}

export const FUNCTIONS_INJECTION_KEY = Symbol('functions');
