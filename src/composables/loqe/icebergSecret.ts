/**
 * SQL for the DuckDB `SECRET` that authenticates the Iceberg REST catalog.
 *
 * Besides the bearer token the secret carries `EXTRA_HTTP_HEADERS`, which is the
 * only place DuckDB lets us put a header on the catalog's REST calls. Lakekeeper
 * resolves a request's project from `x-project-id` — the warehouse prefix alone
 * is not enough — and a request that names no project is read against the default
 * project, so every catalog call for a warehouse in another project comes back
 * `403 ... Send 'x-project-id: <project>'`.
 *
 * NB: `EXTRA_HTTP_HEADERS` is an oauth2 option. DuckDB rejects it as an ATTACH
 * option whenever ATTACH also names a `SECRET` ("these are mutually exclusive"),
 * so it has to live on the secret.
 */
export function icebergSecretSql(
  secretName: string,
  token: string,
  projectId?: string,
  type = 'iceberg',
): string {
  const headers = projectId
    ? `,\n      EXTRA_HTTP_HEADERS MAP{'x-project-id': '${q(projectId)}'}`
    : '';
  return `CREATE OR REPLACE SECRET ${secretName} (
      TYPE ${type},
      TOKEN '${q(token)}'${headers}
    )`;
}

const q = (value: string): string => value.replace(/'/g, "''");
