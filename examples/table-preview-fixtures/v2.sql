-- Prepend common.sql and run the entire batch. Attach your warehouse as "playground" in LoQE.
-- Creation fails if the target already exists; it never replaces an Iceberg table.
CREATE TABLE playground.example.table_preview_fixes_v2
WITH ('format-version' = '2', 'example.writer' = 'duckdb-wasm')
AS SELECT * FROM table_preview_fixture;

SELECT * FROM playground.example.table_preview_fixes_v2 ORDER BY id;
