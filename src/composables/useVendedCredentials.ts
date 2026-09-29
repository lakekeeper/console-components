import { useFunctions } from '@/plugins/functions';
import { hasAction } from '@/composables/useCatalogPermissions';

/** A `loadTable` body, as far as the credential question is concerned. */
export interface CredentialBearing {
  'storage-credentials'?: unknown[] | null;
  config?: Record<string, string> | null;
}

/**
 * Whether the catalog vended anything to read the data files with.
 *
 * Per the Iceberg spec credentials live in `storage-credentials`; older catalogs
 * put them in `config`, which also carries plain client hints — so a config is
 * only evidence of a credential when one of its keys looks like one.
 */
export function hasVendedCredentials(res: CredentialBearing | null | undefined): boolean {
  if (!res) return false;
  if (res['storage-credentials']?.length) return true;
  return Object.keys(res.config ?? {}).some((k) => /token|key|sas|credential|secret/i.test(k));
}

/**
 * Why nothing was vended — as a fact where the catalog can establish one.
 *
 * `read_data` is exactly the privilege Lakekeeper vends on, so it can be asked
 * outright instead of the reader being told what a missing credential "normally
 * means". Only the query path has to hedge: there the same failure arrives as
 * DuckDB complaining about an absent region, and DuckDB cannot tell a privilege
 * from a misconfiguration.
 *
 * An empty answer is not "nothing is allowed": a reader who got this far holds
 * `get_metadata`, so a successful reply always lists something. Empty means the
 * question itself failed, and the hedged wording stands.
 */
export function useVendedCredentials() {
  const functions = useFunctions();

  async function explainMissingCredentials(
    warehouseId: string,
    tableUuid: string | undefined,
  ): Promise<string> {
    const actions = tableUuid
      ? await functions.getTableCatalogActions(tableUuid, warehouseId, false)
      : [];

    if (actions.length === 0) {
      return (
        'The catalog returned no storage credentials for this table, so its data files cannot be ' +
        'read. This normally means you lack the `read_data` privilege on the table (or on a ' +
        'namespace or warehouse above it) — ask an administrator to grant it.'
      );
    }

    if (!hasAction(actions, 'read_data')) {
      return (
        'You do not have permission to read this table’s data. The catalog returned its metadata ' +
        'but no storage credentials, and confirms you lack the `read_data` privilege on the table ' +
        '(or on a namespace or warehouse above it) — ask an administrator to grant it.'
      );
    }

    return (
      'The catalog returned no storage credentials for this table, so its data files cannot be ' +
      'read — although you do hold `read_data` on it. The warehouse is most likely not vending ' +
      'credentials: check that its storage profile has STS (vended credentials) enabled.'
    );
  }

  return { explainMissingCredentials };
}
