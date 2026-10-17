# Table preview fixtures (DuckDB WASM)

These scripts use the DuckDB WASM engine already shipped with LoQE. No Python,
PyIceberg or additional npm dependency is needed. They create two **new** Iceberg
tables: `example.table_preview_fixes_v2` and `example.table_preview_fixes_v3`.

## Run in LoQE

1. Attach the intended warehouse as `playground`, with write access to `example`.
   If you use a different catalog or namespace, change the targets in `v2.sql`
   and `v3.sql`.
2. Paste [common.sql](common.sql), [v2.sql](v2.sql), then [v3.sql](v3.sql) into
   one SQL tab, in that order, and run the **entire batch**. This prepares eight
   local rows, creates both Iceberg tables and reads the v3 result.
3. To create only one version, run `common.sql` followed by that version's script
   as one batch.

Running preparation and creation in one batch keeps them on the same pooled
DuckDB connection, where temporary tables are visible. The common preparation
is safe to repeat. Remote creation deliberately fails when a target already exists, to
avoid overwriting a table or appending duplicate fixtures. Both tables use
`CREATE TABLE ... AS SELECT` with an explicit `format-version` property. The
[DuckDB Iceberg writer](https://duckdb.org/docs/current/core_extensions/iceberg/writing_to_iceberg)
supports v2 and v3, including `TIMESTAMP_NS` and `VARIANT` in v3.

Check the resulting format version on each table's **Details** page. Open
**Preview** to check timestamp formatting and nested cells. Use **Analyze** on
`int_value`, `long_value`, `float_value`, `double_value` and `decimal_value` to
exercise ranges that previously caused overflow.

## Coverage and expected output

Each table has `min`, `max`, `sample`, `null` and four time-zone rows:

- INTEGER and BIGINT: exact signed 32-bit and 64-bit minimum and maximum.
- FLOAT and DOUBLE: largest finite positive and negative values.
- DECIMAL(38,9): exact positive and negative precision limits.
- BOOLEAN: false, true and NULL.
- DATE and microsecond timestamps: years 0001–9999. TIME: midnight through
  `23:59:59.999999`. Extended calendar ranges are deliberately omitted.
- UUID: all-zero and all-`ff` values.
- VARCHAR, BLOB, LIST, MAP and STRUCT: empty values, Unicode, quotes, nested NULLs
  and nested integer limits. These types do not all have a single finite maximum;
  the fixtures exercise representative edge cases.
- V3 additionally includes nanosecond timestamps from
  `1678-01-01T00:00:00.000000000` through
  `2262-04-11T23:47:16.854775806`, plus
  `2026-09-08T12:30:45.123456789`. These are finite test bounds supported by the
  DuckDB writer, rather than an assertion about Iceberg's absolute lower bound.
- V3 VARIANT covers exact large integers, mixed arrays, nested objects, JSON null
  and SQL NULL inputs (both become a null VARIANT in DuckDB). The read query
  casts it to JSON for Arrow output.

DuckDB DDL does not expose Iceberg `fixed(N)` or a nanosecond timestamp with time
zone. Those types are not claimed as covered; BLOB becomes Iceberg `binary`.

A naive timestamp displays as `2026-09-08T12:30:45.123456`. TIMESTAMPTZ preserves
the instant and displays in UTC; it does not retain the input zone or offset:

| Sample          | Input offset | Expected preview              |
| --------------- | ------------ | ----------------------------- |
| utc             | +00:00       | `2026-09-08T12:30:45.123456Z` |
| prague_summer   | +02:00       | `2026-09-08T10:30:45.123456Z` |
| new_york_summer | -04:00       | `2026-09-08T16:30:45.123456Z` |
| offset_0530     | +05:30       | `2026-09-08T07:00:45.123456Z` |

The automated fixture test executes local SQL preparation in DuckDB WASM and
checks exact bounds, histogram overflow, nested rendering and timestamp
precision, and writes/reads both datasets as Parquet without losing values. It
performs no remote writes. An authenticated catalog connection
and a working WASM Iceberg/storage extension are required for the remote steps.
