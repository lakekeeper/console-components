-- Prepend common.sql and run the entire batch. Attach your warehouse as "playground" in LoQE.
CREATE OR REPLACE TEMP TABLE table_preview_fixture_v3 AS
SELECT *,
    CASE sample
        WHEN 'min' THEN '1678-01-01 00:00:00.000000000'::TIMESTAMP_NS
        WHEN 'max' THEN '2262-04-11 23:47:16.854775806'::TIMESTAMP_NS
        WHEN 'null' THEN NULL::TIMESTAMP_NS
        ELSE '2026-09-08 12:30:45.123456789'::TIMESTAMP_NS
    END AS timestamp_ns_value,
    CASE sample
        WHEN 'min' THEN '{"int":-2147483648,"long":-9223372036854775808}'::JSON::VARIANT
        WHEN 'max' THEN '{"int":2147483647,"long":9223372036854775807}'::JSON::VARIANT
        WHEN 'null' THEN NULL::VARIANT
        WHEN 'sample' THEN '["different shape",2,true,null,{"items":[1,2]}]'::JSON::VARIANT
        ELSE 'null'::JSON::VARIANT
    END AS variant_value
FROM table_preview_fixture;

-- Creation fails if the target already exists; it never replaces an Iceberg table.
CREATE TABLE playground.example.table_preview_fixes_v3
WITH ('format-version' = '3', 'example.writer' = 'duckdb-wasm')
AS SELECT * FROM table_preview_fixture_v3;

-- VARIANT is cast to JSON so the result is Arrow-serializable.
SELECT * EXCLUDE (variant_value), variant_value::JSON AS variant_value
FROM playground.example.table_preview_fixes_v3 ORDER BY id;
