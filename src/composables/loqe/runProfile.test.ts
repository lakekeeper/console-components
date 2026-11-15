import { describe, expect, it } from 'vitest';
import { firstJsonObject, parseRunProfile } from './runProfile';

// The shape DuckDB 1.5 writes with PRAGMA enable_profiling='json', trimmed.
const profile = {
  query_name: "select g, count(*) from 't.parquet' where a > 400000 group by g",
  latency: 0.0418,
  cpu_time: 0.0202,
  cumulative_rows_scanned: 500000,
  system_peak_buffer_memory: 11158987,
  system_peak_temp_dir_size: 0,
  total_bytes_read: 4025,
  children: [
    {
      operator_name: 'PERFECT_HASH_GROUP_BY',
      operator_cardinality: 100,
      operator_rows_scanned: 0,
      operator_timing: 0.0014,
      extra_info: { Groups: '#0', Aggregates: ['count_star()'] },
      children: [
        {
          operator_name: 'PARQUET_SCAN ',
          operator_cardinality: 99999,
          operator_rows_scanned: 500000,
          operator_timing: 0.0183,
          extra_info: {
            Function: 'PARQUET_SCAN',
            Projections: ['g', 's'],
            Filters: 'a>400000',
            'Estimated Cardinality': '100000',
            'Total Files Read': '3',
            'Filename(s)': Array.from({ length: 25 }, (_, i) => `s3://b/data/${i}.parquet`),
          },
          children: [],
        },
      ],
    },
  ],
};

describe('parseRunProfile', () => {
  it('summarises the run and keeps the plan as it ran', () => {
    const p = parseRunProfile(JSON.stringify(profile))!;
    expect(p.queryName).toBe(profile.query_name);
    expect(p.stats).toEqual({
      rowsScanned: 500000,
      filesRead: 3,
      peakMemoryBytes: 11158987,
      spilledBytes: 0,
      latencyMs: 41.8,
      cpuMs: 20.2,
    });
    const scan = p.plan!.children[0];
    expect(p.plan!.name).toBe('PERFECT_HASH_GROUP_BY');
    expect(scan).toMatchObject({ name: 'PARQUET_SCAN', rows: 99999, scanned: 500000 });
    expect(scan.timeMs).toBeCloseTo(18.3);
    expect(scan.info.Filters).toBe('a>400000');
    expect(scan.info.Projections).toEqual(['g', 's']);
  });

  it('cuts a long file list rather than storing every data file', () => {
    const files = parseRunProfile(JSON.stringify(profile))!.plan!.children[0].info['Filename(s)'];
    expect(files).toHaveLength(21);
    expect(files[20]).toBe('… 5 more');
  });

  it('answers null for anything that is not a profile', () => {
    expect(parseRunProfile('')).toBeNull();
    expect(parseRunProfile('not json')).toBeNull();
    expect(parseRunProfile('null')).toBeNull();
  });

  it('a statement without operators still has its totals', () => {
    const p = parseRunProfile(JSON.stringify({ query_name: 'SET x = 1', latency: 0.001 }))!;
    expect(p.plan).toBeNull();
    expect(p.stats.latencyMs).toBe(1);
    expect(p.stats.filesRead).toBe(0);
  });

  it('reads the profile and ignores bytes after it', () => {
    const text = JSON.stringify(profile) + '\n  "latency": 9 }\n}\u0000\u0000';
    expect(parseRunProfile(text)!.queryName).toBe(profile.query_name);
  });
});

describe('firstJsonObject', () => {
  it('stops at the brace that closes the first object, not one inside a string', () => {
    expect(firstJsonObject('{"a":"}{","b":{"c":1}} trailing }')).toBe('{"a":"}{","b":{"c":1}}');
    expect(firstJsonObject('{"q":"say \\"}\\""} x')).toBe('{"q":"say \\"}\\""}');
  });
});
