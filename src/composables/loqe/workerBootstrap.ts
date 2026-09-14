/**
 * DuckDB-WASM 1.33.x logs sync-XHR request headers directly, bypassing LogLevel.
 * Filter those messages in the worker before loading DuckDB so S3 credentials
 * never reach the browser console. Other logging stays available for debugging.
 */
export function createWorkerBootstrap(workerUrl: string): string {
  return `
    {
      const log = console.log.bind(console);
      console.log = (...args) => {
        if (args[0] === 'HEAD' && args.length === 3) return;
        log(...args);
      };
    }
    importScripts(${JSON.stringify(workerUrl)});
  `;
}
