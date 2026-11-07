-- Run this first in LoQE. This table is local to DuckDB WASM.
CREATE OR REPLACE TEMP TABLE table_preview_fixture (
    id INTEGER,
    sample VARCHAR,
    boolean_value BOOLEAN,
    int_value INTEGER,
    long_value BIGINT,
    float_value FLOAT,
    double_value DOUBLE,
    decimal_value DECIMAL(38, 9),
    date_value DATE,
    time_value TIME,
    timestamp_value TIMESTAMP,
    timestamptz_value TIMESTAMPTZ,
    string_value VARCHAR,
    uuid_value UUID,
    binary_value BLOB,
    list_value INTEGER[],
    map_value MAP(VARCHAR, BIGINT),
    struct_value STRUCT(name VARCHAR, value INTEGER)
);

INSERT INTO table_preview_fixture VALUES
(
    1, 'min', false,
    -2147483648,
    -9223372036854775808,
    -3.4028234663852886e38,
    -1.7976931348623157e308,
    '-99999999999999999999999999999.999999999',
    DATE '0001-01-01', TIME '00:00:00',
    TIMESTAMP '0001-01-01 00:00:00',
    TIMESTAMPTZ '0001-01-01 00:00:00+00:00',
    '', '00000000-0000-0000-0000-000000000000',
    from_hex(''), [], map(), {'name': '', 'value': -2147483648}
),
(
    2, 'max', true,
    2147483647,
    9223372036854775807,
    3.4028234663852886e38,
    1.7976931348623157e308,
    '99999999999999999999999999999.999999999',
    DATE '9999-12-31', TIME '23:59:59.999999',
    TIMESTAMP '9999-12-31 23:59:59.999999',
    TIMESTAMPTZ '9999-12-31 23:59:59.999999+00:00',
    E'Unicode: žluťoučký 🦆; quote: "\nsecond line',
    'ffffffff-ffff-ffff-ffff-ffffffffffff', from_hex('0069636562657267ff'),
    [-2147483648, NULL, 2147483647],
    map(['min', 'max', 'missing'], [-9223372036854775808, 9223372036854775807, NULL]),
    {'name': 'max', 'value': 2147483647}
),
(
    3, 'sample', true, 0, 0, 1.25, -2.5, '12345678901234567890123456789.123456789',
    DATE '2026-09-08', TIME '12:30:45.123456',
    TIMESTAMP '2026-09-08 12:30:45.123456',
    TIMESTAMPTZ '2026-09-08 12:30:45.123456+00:00',
    'sample', '12345678-1234-5678-9abc-def012345678', from_hex('0102'),
    [1, NULL, 3], map(['sample'], [42]), {'name': 'sample', 'value': 42}
),
(
    4, 'null', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
);

-- The same wall-clock time with four offsets represents four different instants.
INSERT INTO table_preview_fixture (id, sample, timestamp_value, timestamptz_value) VALUES
    (5, 'utc', TIMESTAMP '2026-09-08 12:30:45.123456',
        TIMESTAMPTZ '2026-09-08 12:30:45.123456+00:00'),
    (6, 'prague_summer', TIMESTAMP '2026-09-08 12:30:45.123456',
        TIMESTAMPTZ '2026-09-08 12:30:45.123456+02:00'),
    (7, 'new_york_summer', TIMESTAMP '2026-09-08 12:30:45.123456',
        TIMESTAMPTZ '2026-09-08 12:30:45.123456-04:00'),
    (8, 'offset_0530', TIMESTAMP '2026-09-08 12:30:45.123456',
        TIMESTAMPTZ '2026-09-08 12:30:45.123456+05:30');
