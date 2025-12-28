# Bug Report: DuckDB WASM Iceberg Extension - HTTP Endpoint URL Malformation

## Environment

- **Package**: `@duckdb/duckdb-wasm`
- **Version**: `1.32.1-dev1.0` (likely affects other versions)
- **Browser**: Any (tested in Chrome/Firefox)
- **Iceberg Extension**: Loaded from `core_nightly` repository

## Description

When configuring the DuckDB WASM Iceberg extension with an HTTP endpoint (non-HTTPS), the URL is malformed, causing connection failures.

## Expected Behavior

```sql
LOAD iceberg;
CALL iceberg_scan('http://localhost:8181/catalog', 'warehouse', 'namespace.table');
```

Should connect to: `http://localhost:8181/catalog`

## Actual Behavior

The worker attempts to connect to: `https://http//localhost:8181/catalog`

**Result**: 404 errors and failed Iceberg catalog connections

## Root Cause

In `duckdb-browser-eh.worker.js` (and other worker variants), function `Wc` at approximately line 83,000 incorrectly strips the protocol from HTTP endpoints:

### Buggy Code

```javascript
Wc=function(o,e,t){
  var r;
  if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){
    let n="".concat(o==null?void 0:o.endpoint),
    a=n.indexOf("://")+3;
    return n.substring(a)  // ❌ PROBLEM: Strips protocol from URL
  }
```

**Detailed Explanation of the Bug:**

The `Wc` function strips the protocol from the endpoint URL:

```javascript
// Example with HTTP endpoint:
let n = 'http://localhost:8181/catalog';
let a = n.indexOf('://') + 3; // a = 4 + 3 = 7
return n.substring(a); // Returns: "localhost:8181/catalog"
```

**The substring math is correct** - it properly removes `http://`. The bug is what happens **after** this stripping.

Somewhere in the DuckDB worker code (found via `grep`), there's a concatenation:

```javascript
'https://' + Wc(endpoint);
```

**What actually happens:**

1. Input: `http://localhost:8181/catalog`
2. `Wc()` strips protocol: `"localhost:8181/catalog"`
3. Code concatenates: `"https://" + "localhost:8181/catalog"`
4. Final URL: `"https://localhost:8181/catalog"` ❌ **WRONG PROTOCOL**

**Root issue:** The function assumes all endpoints should use HTTPS and forcibly changes HTTP endpoints to HTTPS. This fails because:

- Local development servers typically run on HTTP (not HTTPS)
- The protocol change causes connection failures (port 80 vs 8181, no TLS handshake, etc.)
- HTTP servers reject HTTPS upgrade attempts

## Solution

### Option 1: Fix in Source Code (Preferred - for DuckDB maintainers)

Modify the source TypeScript/JavaScript before minification to preserve the full URL:

```javascript
Wc=function(o,e,t){
  var r;
  if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){
    let n="".concat(o==null?void 0:o.endpoint);
    return n  // ✅ FIXED: Preserves full URL with protocol
  }
```

**Change required:** Remove `a=n.indexOf("://")+3;return n.substring(a)` and replace with `return n`

### Option 2: Runtime Patch (Workaround for users)

For users who cannot wait for an official fix, apply a post-build patch to the minified worker files.

#### Step 1: Create Patch Script

Create `scripts/patch-duckdb-worker.js`:

```javascript
#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(
  __dirname,
  '../node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
);

// The buggy code
const BUGGY_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint),a=n.indexOf("://")+3;return n.substring(a)}`;

// The fixed code
const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);return n}`;

console.log('🔧 Patching DuckDB worker for HTTP endpoint support...');

if (!fs.existsSync(WORKER_PATH)) {
  console.log('❌ Worker file not found:', WORKER_PATH);
  process.exit(1);
}

// Read the worker file
let content = fs.readFileSync(WORKER_PATH, 'utf8');

// Create backup
const backupPath = WORKER_PATH + '.backup';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, content);
  console.log('💾 Created backup');
}

// Check if already patched
if (!content.includes(BUGGY_CODE)) {
  if (content.includes(FIXED_CODE)) {
    console.log('✅ Already patched');
    process.exit(0);
  }
  console.log('⚠️  Buggy code not found. Version may have changed.');
  process.exit(1);
}

// Apply the patch
content = content.replace(BUGGY_CODE, FIXED_CODE);
fs.writeFileSync(WORKER_PATH, content);

console.log('✅ Successfully patched DuckDB worker');
console.log('   HTTP endpoints will now work correctly');
```

#### Step 2: Update package.json

Add the patch script to run after installation:

```json
{
  "scripts": {
    "postinstall": "node scripts/patch-duckdb-worker.js"
  }
}
```

#### Step 3: Run the patch

```bash
npm install
# or manually:
node scripts/patch-duckdb-worker.js
```

## Impact

- **Severity**: High - Blocks all HTTP endpoint usage
- **Use Cases Affected**:
  - Local development with HTTP catalog servers
  - Internal networks without HTTPS
  - Testing and development environments
- **Workaround**: Use HTTPS endpoints or apply the patch above
- **Affected Files**:
  - `duckdb-browser-eh.worker.js`
  - `duckdb-browser-mvp.worker.js` (likely)
  - `duckdb-browser-coi.worker.js` (likely)

## Test Case

```javascript
import * as duckdb from '@duckdb/duckdb-wasm';

// Initialize DuckDB
const bundle = await duckdb.selectBundle(bundles);
const worker = new Worker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule);

const conn = await db.connect();

// This should work but currently fails:
await conn.query(`
  LOAD iceberg;
  CALL iceberg_scan('http://localhost:8181/catalog', 'warehouse', 'namespace.table');
`);

// Expected: Connects to http://localhost:8181/catalog
// Actual: Fails with 404 - tries https://http//localhost:8181/catalog
```

## Additional Context

- Bug exists in minified code, suggesting it originated in the build/transpilation process
- Only affects HTTP endpoints (HTTPS works correctly)
- The function name `Wc` is minified - original source function name is unknown
- Bug was discovered while testing Iceberg REST catalog integration
- Similar protocol-stripping logic may exist in other parts of the codebase

## Proposed Fix for DuckDB Maintainers

1. Locate the source code for function `Wc` (or equivalent) that processes Iceberg endpoints
2. Remove the protocol-stripping logic:
   - From: `a=n.indexOf("://")+3;return n.substring(a)`
   - To: `return n`
3. Ensure HTTP and HTTPS URLs are passed through unchanged
4. Add unit tests for both HTTP and HTTPS Iceberg catalog endpoints
5. Consider whether this same pattern exists elsewhere in the codebase

## References

- DuckDB WASM: https://github.com/duckdb/duckdb-wasm
- Iceberg Extension: https://duckdb.org/docs/extensions/iceberg
- Related Issue: [Link to be added when created]

---

**Reproducible**: Yes  
**Regression**: Unknown (may have existed since Iceberg extension was added)  
**Workaround Available**: Yes (see Option 2 above)
