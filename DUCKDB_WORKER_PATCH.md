# DuckDB Worker Patch for HTTP Endpoints

## Problem

The DuckDB WASM worker (`duckdb-browser-eh.worker.js`) has a bug in version `1.32.1-dev1.0` where it malforms HTTP URLs:

**Input**: `http://localhost:8181/catalog`  
**Output**: `https://http//localhost:8181/catalog` ❌

This happens because the worker:

1. Strips the protocol from endpoints that start with "http"
2. Then prepends "https://" elsewhere in the code
3. Results in double protocol: `https://` + `http//...`

## Solution

We've patched the `Wc` function in the worker file to preserve the full URL including protocol.

### Original Code (Buggy)

```javascript
Wc = function (o, e, t) {
  var r;
  if ((r = o == null ? void 0 : o.endpoint) != null && r.startsWith('http')) {
    let n = ''.concat(o == null ? void 0 : o.endpoint),
      a = n.indexOf('://') + 3;
    return n.substring(a); // ← STRIPS PROTOCOL!
  }
  // ... rest
};
```

### Patched Code (Fixed)

```javascript
Wc = function (o, e, t) {
  var r;
  if ((r = o == null ? void 0 : o.endpoint) != null && r.startsWith('http')) {
    let n = ''.concat(o == null ? void 0 : o.endpoint);
    return n; // ← PRESERVES FULL URL!
  }
  // ... rest
};
```

## How to Apply the Patch

### Automatic

```bash
node scripts/patch-duckdb-worker.js
```

### Manual

1. Backup: `cp public/duckdb/duckdb-browser-eh.worker.js public/duckdb/duckdb-browser-eh.worker.js.backup`
2. Edit `public/duckdb/duckdb-browser-eh.worker.js`
3. Find: `a=n.indexOf("://")+3;return n.substring(a)}`
4. Replace with: `return n}`

## How to Restore Original

```bash
cp public/duckdb/duckdb-browser-eh.worker.js.backup public/duckdb/duckdb-browser-eh.worker.js
```

## When to Re-apply

You'll need to re-apply this patch:

- ✅ After upgrading `@duckdb/duckdb-wasm` package
- ✅ After copying new worker files from `node_modules`
- ✅ After running `npm install` if worker files are regenerated

## Verification

After patching, test with:

```typescript
import { useIcebergDuckDB } from '@/composables/useIcebergDuckDB';

const db = useIcebergDuckDB();
await db.configureCatalog({
  catalogName: 'demo',
  restUri: 'http://localhost:8181/catalog', // ← HTTP works now!
  accessToken: 'your-token',
});
```

Check the network tab - you should see:

- ✅ `http://localhost:8181/catalog/v1/config` (correct!)
- ❌ NOT `https://http//localhost:8181/catalog/v1/config`

## Files

- **Patch script**: `scripts/patch-duckdb-worker.js`
- **Worker file**: `public/duckdb/duckdb-browser-eh.worker.js`
- **Backup**: `public/duckdb/duckdb-browser-eh.worker.js.backup` (auto-created)

## Future

This patch is a temporary workaround. The proper fix should be:

1. Report bug to DuckDB team
2. Wait for official fix in future release
3. Remove this patch once fixed upstream

## Affected Versions

- ✅ Tested on: `@duckdb/duckdb-wasm@1.32.1-dev1.0`
- ❓ May work on: Other 1.32.x versions
- ❌ Will NOT work if: DuckDB changes minification or function names

## Alternative Solutions

If this patch doesn't work or you want to avoid modifying vendored code:

1. **Use HTTPS**: Configure your catalog to use HTTPS instead of HTTP
2. **Use REST API**: Use `useIcebergRestAPI` composable (bypasses DuckDB entirely)
3. **Backend Service**: Run native DuckDB on server, expose API to frontend
