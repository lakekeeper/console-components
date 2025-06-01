import { User, Role } from '@/gen/management/types.gen';

export interface AppFunctions {
  getUser(id: string): Promise<User>;
  getRole(id: string): Promise<Role>;
  searchUser(search: string): Promise<User[]>;
  searchRole(search: string): Promise<Role[]>;
  // Optional warehouse/namespace functions with flexible signatures
  setWarehouseManagedAccess?: (id: string, managed: boolean) => Promise<any>;
  setNamespaceManagedAccess?: (id: string, managed: boolean) => Promise<any>;
  getWarehouseById?: (id: string) => Promise<any>;
  getNamespaceById?: (id: string) => Promise<any>;
}

export const FUNCTIONS_INJECTION_KEY = Symbol('functions');
