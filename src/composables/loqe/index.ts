// LoQE — Local Query Engine DuckDB
// Barrel exports for the engine internals.

export { LoQEEngine } from './LoQEEngine';
export { ConnectionPool } from './ConnectionPool';
export { TokenManager } from './TokenManager';
export { CatalogManager } from './CatalogManager';

export type {
  LoQEConfig,
  LoQEQueryResult,
  LoQECatalogConfig,
  LoQEExtension,
  LoQEHistoryEntry,
  LoQEPersistedCatalog,
  AttachedCatalog,
  PooledConnection,
} from './types';
