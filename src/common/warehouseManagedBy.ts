import type { GetWarehouseResponse } from '@/gen/management/types.gen';

/**
 * Whether the warehouse is marked `managed-by: instance-admin`. Its spec — and
 * whether it exists at all — is then the instance admins' alone: the server
 * refuses every other caller with "warehouse spec locked", whatever grants they
 * hold (lakekeeper#1828).
 */
export function isAdminManaged(warehouse: Pick<GetWarehouseResponse, 'managed-by'>): boolean {
  return (warehouse['managed-by'] as string | undefined) === 'instance-admin';
}

/**
 * Whether the Delete action may be offered for this warehouse. `canDelete` is
 * the reader's `delete` right on it; an admin-managed warehouse additionally
 * needs a confirmed instance admin (whoami `is-instance-admin`). Unknown counts
 * as no, so the control never shows before a refusal it would earn.
 */
export function canOfferWarehouseDelete(
  warehouse: Pick<GetWarehouseResponse, 'managed-by'>,
  canDelete: boolean | undefined,
  isInstanceAdmin: boolean | undefined,
): boolean {
  if (canDelete !== true) return false;
  return !isAdminManaged(warehouse) || isInstanceAdmin === true;
}
