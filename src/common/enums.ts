export enum StatusIntent {
  INACTIVE = 'INACTIVE',
  STARTING = 'STARTING',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export enum Intent {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  READ = 'READ',
}

export enum ObjectType {
  WAREHOUSE = 'Warehouse',
  STORAGE_PROFILE = 'StorageProfile',
  STORAGE_CREDENTIAL = 'StorageCredential',
  DELETION_PROFILE = 'DeletionProfile',
}

export enum TokenType {
  ACCESS_TOKEN = 'access_token',
  ID_TOKEN = 'id_token',
}

export enum Type {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success',
}
