/**
 * Deployment-controlled ordering and hiding of the storage providers offered in
 * the Add-Warehouse rail.
 *
 * A deployment that only ever provisions one cloud still gets the full provider
 * list in the order the library happens to declare it, which puts the one
 * provider its users need somewhere in the middle. These two hints let the
 * operator lead with their own provider, and drop the ones their platform
 * cannot back at all.
 *
 * The hints arrive as plain comma-separated strings on `appConfig`
 * (`storageProvidersOrder` / `storageProvidersHidden`), injected at container
 * start from `LAKEKEEPER__UI__STORAGE_PROVIDERS_ORDER` and
 * `LAKEKEEPER__UI__STORAGE_PROVIDERS_HIDDEN`. Only the enterprise app provides
 * them — the OSS app never sets the fields, so this is inert there.
 *
 * Both are cosmetic: hiding a provider removes a choice from the console, it
 * does not stop anyone creating that storage profile through the API.
 */

/** The rail's own provider values, as `WarehouseAddDialog` declares them. */
export type StorageProviderValue =
  'S3' | 'STACKIT' | 'AZURE' | 'ONELAKE' | 'S3_COMPAT' | 'GCS' | 'R2' | 'ALIYUN_OSS';

/**
 * The vocabulary an operator writes, mapped onto the rail values.
 *
 * Providers are named after the product, because the storage-profile type is
 * ambiguous where it is shared: `aws`, `s3_compat`, `r2` and `aliyun_oss` are
 * all `type: 's3'` to the backend. `adls` does match the backend's own profile
 * type. `s3` and `azure` are accepted as undocumented aliases so the profile
 * types people already know do not silently do nothing.
 */
const PROVIDER_ALIASES: Readonly<Record<string, StorageProviderValue>> = {
  aws: 'S3',
  stackit: 'STACKIT',
  adls: 'AZURE',
  onelake: 'ONELAKE',
  s3_compat: 'S3_COMPAT',
  gcs: 'GCS',
  r2: 'R2',
  aliyun_oss: 'ALIYUN_OSS',
  // Aliases: the backend's storage-profile spelling.
  s3: 'S3',
  azure: 'AZURE',
};

/** The documented names, for the warning that names what was accepted. */
const DOCUMENTED_NAMES = 'aws, stackit, adls, onelake, s3_compat, gcs, r2, aliyun_oss';

/**
 * Warnings are emitted from a pure helper that a `computed` re-runs (the rail
 * recomputes on a theme change, because two provider marks are themed), so the
 * same misconfiguration would otherwise be logged repeatedly. The operator only
 * needs to be told once per distinct value.
 */
const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Test seam: the warning dedupe is module state and would leak between cases. */
export function resetStorageProviderWarnings() {
  warned.clear();
}

/**
 * Parses one comma-separated hint into rail values, dropping (and reporting)
 * names that match no provider. Separators are normalized so `s3-compat` and
 * `S3_COMPAT` both land, and duplicates collapse to the first occurrence.
 */
export function parseStorageProviders(
  value: string | null | undefined,
  hint: string,
): StorageProviderValue[] {
  if (!value) return [];
  // An unsubstituted `VITE_…_PLACEHOLDER` reads as unset: the deployment either
  // serves the built assets without the server-side substitution, or runs a
  // binary that predates these hints. The check lives here rather than in the
  // app's config module because the value is a runtime variable by the time it
  // arrives — in the app it sits next to the placeholder literal, where the
  // bundler can fold the comparison away and take the token with it.
  if (value.includes('PLACEHOLDER')) return [];

  const parsed: StorageProviderValue[] = [];
  const unknown: string[] = [];

  for (const raw of value.split(',')) {
    const name = raw.trim().toLowerCase().replace(/-/g, '_');
    if (!name) continue;

    const provider = PROVIDER_ALIASES[name];
    if (!provider) {
      unknown.push(raw.trim());
      continue;
    }
    if (!parsed.includes(provider)) parsed.push(provider);
  }

  if (unknown.length) {
    warnOnce(
      `${hint}: ignoring unknown storage provider(s) ${unknown.join(', ')}. Known providers: ${DOCUMENTED_NAMES}.`,
    );
  }

  return parsed;
}

/**
 * Applies both hints to the provider rail: listed providers first in the order
 * given, everything else after in the order it was declared, then the hidden
 * ones removed.
 *
 * A `hidden` hint that would leave nothing to choose from is ignored rather
 * than honoured — an empty rail is an unusable create flow, and a typo in a
 * deployment's environment should not be able to produce one.
 */
export function applyStorageProviderPreferences<T extends { value: string }>(
  providers: readonly T[],
  order?: string | null,
  hidden?: string | null,
): T[] {
  const remaining = [...providers];
  const ordered: T[] = [];

  for (const value of parseStorageProviders(order, 'STORAGE_PROVIDERS_ORDER')) {
    const index = remaining.findIndex((provider) => provider.value === value);
    if (index !== -1) ordered.push(...remaining.splice(index, 1));
  }
  ordered.push(...remaining);

  const hiddenValues = parseStorageProviders(hidden, 'STORAGE_PROVIDERS_HIDDEN');
  if (!hiddenValues.length) return ordered;

  const visible = ordered.filter(
    (provider) => !hiddenValues.includes(provider.value as StorageProviderValue),
  );
  if (!visible.length) {
    warnOnce(
      'STORAGE_PROVIDERS_HIDDEN: hiding every storage provider would leave no way to add a warehouse; ignoring it.',
    );
    return ordered;
  }

  return visible;
}
