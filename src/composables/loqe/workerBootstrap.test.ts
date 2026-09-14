// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerBootstrap } from './workerBootstrap';

describe('DuckDB worker bootstrap', () => {
  it('suppresses request headers before importing the worker and during later reads', () => {
    const log = vi.fn();
    const workerConsole = { log };
    const importScripts = vi.fn(() => {
      workerConsole.log('HEAD', 'Authorization', 'AWS4-HMAC-SHA256 test-signature');
      workerConsole.log('HEAD', 'x-amz-security-token', 'test-session-token');
    });

    runInNewContext(createWorkerBootstrap('/duckdb/worker.js'), {
      console: workerConsole,
      importScripts,
    });
    workerConsole.log('HEAD', 'x-amz-security-token', 'refreshed-test-token');

    expect(importScripts).toHaveBeenCalledExactlyOnceWith('/duckdb/worker.js');
    expect(log).not.toHaveBeenCalled();
  });

  it('preserves normal logs, their console receiver, warnings, and errors', () => {
    const log = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const workerConsole = { log, warn, error };
    runInNewContext(createWorkerBootstrap('/duckdb/worker.js'), {
      console: workerConsole,
      importScripts: () => {},
    });

    workerConsole.log('DuckDB ready');
    workerConsole.log('query', 'SELECT 1', { rows: 1 });
    workerConsole.log('HEAD', 'request completed');
    workerConsole.warn('extension warning');
    workerConsole.error('query failed');

    expect(log.mock.calls).toEqual([
      ['DuckDB ready'],
      ['query', 'SELECT 1', { rows: 1 }],
      ['HEAD', 'request completed'],
    ]);
    expect(log.mock.contexts).toEqual([workerConsole, workerConsole, workerConsole]);
    expect(warn).toHaveBeenCalledExactlyOnceWith('extension warning');
    expect(error).toHaveBeenCalledExactlyOnceWith('query failed');
  });

  it('quotes the worker URL as a JavaScript string literal', () => {
    const workerUrl = '/duckdb/worker.js?value="quoted"\\path\n';
    const importScripts = vi.fn();
    runInNewContext(createWorkerBootstrap(workerUrl), {
      console: { log: vi.fn() },
      importScripts,
    });

    expect(importScripts).toHaveBeenCalledExactlyOnceWith(workerUrl);
  });
});
