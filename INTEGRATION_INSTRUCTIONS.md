# Integration Instructions for Catalog App

Your catalog app copies DuckDB worker files during `npm run dev`, which **overwrites** the patched versions from this library. Here's how to fix it:

## Problem

When you run `npm run dev` in your catalog app, you see:

```
Copied DuckDB file: duckdb-browser-eh.worker.js
```

This copies the **original buggy** worker from `node_modules/@duckdb/duckdb-wasm`, overwriting the patched version from `@lakekeeper/console-components`.

## Solution: Patch After Copy

### Step 1: Copy the Patch Script

In your catalog app directory:

```bash
# Create scripts directory if it doesn't exist
mkdir -p scripts

# Copy the patch script from console-components
cp node_modules/@lakekeeper/console-components/scripts/patch-duckdb-workers-all.js scripts/
```

Or create `scripts/patch-duckdb-workers-all.js` with this content:

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths in your catalog app
const WORKER_FILES = [
  path.join(__dirname, '../public/duckdb/duckdb-browser-eh.worker.js'),
  // Add more paths if needed
];

const BUGGY_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint),a=n.indexOf("://")+3;return n.substring(a)}`;
const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);return n}`;

console.log('🔧 Patching DuckDB workers...');

for (const workerPath of WORKER_FILES) {
  if (!fs.existsSync(workerPath)) continue;

  let content = fs.readFileSync(workerPath, 'utf8');
  if (!content.includes(BUGGY_CODE)) continue;

  const patchedContent = content.replace(BUGGY_CODE, FIXED_CODE);
  fs.writeFileSync(workerPath, patchedContent);
  console.log(`✅ Patched ${path.basename(workerPath)}`);
}
```

### Step 2: Update package.json

Add a script that runs after the DuckDB files are copied:

```json
{
  "scripts": {
    "dev": "vite",
    "patch-duckdb": "node scripts/patch-duckdb-workers-all.js",
    "postinstall": "npm run patch-duckdb || true"
  }
}
```

### Step 3: Update Your Vite Config (Better Solution)

Find where the DuckDB files are being copied in your `vite.config.ts` and add a callback to patch them:

```typescript
import { execSync } from 'child_process';

export default defineConfig({
  plugins: [
    vue(),
    // ... other plugins
    {
      name: 'patch-duckdb-after-copy',
      buildStart() {
        // This runs after files are copied
        try {
          execSync('node scripts/patch-duckdb-workers-all.js', { stdio: 'inherit' });
        } catch (e) {
          console.warn('⚠️ Could not patch DuckDB workers:', e);
        }
      },
    },
  ],
});
```

## Verification

After patching, check the console when loading your app. The network requests should show:

✅ **Correct**: `http://localhost:8181/catalog/v1/config`  
❌ **Wrong**: `https://http//localhost:8181/catalog/v1/config`

## Alternative: Use HTTPS

If patching is too complicated, configure your local catalog server to use HTTPS:

```bash
# Option 1: Use mkcert for local HTTPS
brew install mkcert
mkcert -install
mkcert localhost 127.0.0.1 ::1

# Option 2: Use a reverse proxy (caddy, nginx, etc.)
```

Then change your catalog URL to `https://localhost:8181/catalog`

## Alternative: Use REST API Only

Skip DuckDB entirely and use the REST API composable:

```typescript
import { useIcebergRestAPI } from '@lakekeeper/console-components';

const api = useIcebergRestAPI();
api.configure({
  catalogUrl: 'http://localhost:8181/catalog',
  accessToken: yourToken,
});

// No DuckDB, no worker files, no patching needed!
const table = await api.getTable('namespace', 'table');
```

## Troubleshooting

### Patch doesn't work

- Check that the worker file exists in your catalog app's `public/duckdb/` folder
- Verify the file content matches the expected buggy code
- DuckDB version may be different - check version numbers

### Files keep getting overwritten

- The patch needs to run **after** Vite copies the files
- Use the Vite plugin approach (Step 3) for best results
- Or run `npm run patch-duckdb` manually after `npm run dev` starts

### Still seeing `https://http//`

- Clear browser cache
- Hard reload (Cmd+Shift+R)
- Check Network tab to verify which file is being loaded
