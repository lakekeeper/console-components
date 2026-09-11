/**
 * Whether a warehouse hands short-lived storage credentials to its clients.
 *
 * The browser-side query engine (DuckDB-WASM via LoQE) reads object storage
 * directly, and a vended credential is its only way in: remote signing needs
 * every request signed by Lakekeeper, which DuckDB cannot do. So `sts-enabled:
 * false` is not a misconfiguration to diagnose — it puts the warehouse out of
 * scope for those surfaces, and answering "configure CORS" sends the operator to
 * fix a bucket that is already correct.
 *
 * Only `sts-enabled` is consulted. The storage types LoQE supports (s3, gcs, and
 * stackit) all carry the flag, and absent reads as on: for s3 the schema makes it
 * required, and for the others it defaults to true — so a missing value means the
 * profile has not loaded yet, never "off".
 */
export function stsDisabled(profile: Record<string, any> | null | undefined): boolean {
  return profile?.['sts-enabled'] === false;
}

/** Why the local query engine cannot read this warehouse, or null when it can. */
export function loqeVendingReason(profile: Record<string, any> | null | undefined): string | null {
  if (!stsDisabled(profile)) return null;
  // Names remote signing explicitly: a warehouse with STS off normally has
  // remote signing on, so the operator reasonably expects clients to be covered.
  return (
    'This warehouse has vended credentials (STS) disabled, so the local query engine cannot ' +
    'read its data: DuckDB reads object storage directly in the browser and cannot use ' +
    'remote signing, which requires every request to be signed by Lakekeeper. Enable STS on ' +
    'the warehouse to query it here — the bucket’s CORS configuration is not the problem.'
  );
}
