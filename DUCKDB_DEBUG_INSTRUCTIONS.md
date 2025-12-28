# DuckDB Worker Debug Instructions

## Purpose

This debug version of the DuckDB worker reverts to the **BUGGY** code but adds extensive `console.log()` statements to trace exactly how HTTP URLs are transformed.

## What You Applied

The `Wc` function has been replaced with a debug version that logs every step of the URL transformation:

```javascript
Wc = function (o, e, t) {
  var r;
  console.log('[DUCKDB DEBUG Wc] Function called with:', { o: o, e: e, t: t });

  r = o == null ? void 0 : o.endpoint;
  console.log('[DUCKDB DEBUG Wc] r (endpoint) =', r);

  if (r != null && r.startsWith('http')) {
    console.log('[DUCKDB DEBUG Wc] Endpoint starts with http');

    let n = ''.concat(o == null ? void 0 : o.endpoint);
    console.log('[DUCKDB DEBUG Wc] n (concatenated) =', n);

    let a = n.indexOf('://') + 3;
    console.log('[DUCKDB DEBUG Wc] a (indexOf + 3) =', a);

    let result = n.substring(a);
    console.log('[DUCKDB DEBUG Wc] BUGGY result (substring) =', result);

    return result; // ❌ BUGGY: Strips protocol
  }
  // ... else branches unchanged
};
```

## How to Test

### 1. Start Your Application

```bash
# In console-components
npm run dev

# In console app
cd ../console
npm run dev
```

### 2. Open Browser DevTools

- Press `F12` or `Cmd+Option+I` (Mac)
- Go to the **Console** tab
- Clear the console for clean output

### 3. Trigger Iceberg Query

Run a query that uses an HTTP Iceberg endpoint:

```sql
LOAD iceberg;
CALL iceberg_scan('http://localhost:8181/catalog', 'warehouse', 'namespace.table');
```

### 4. Observe Debug Output

Look for log entries like:

```
[DUCKDB DEBUG Wc] Function called with: {o: {...}, e: ..., t: "warehouse"}
[DUCKDB DEBUG Wc] r (endpoint) = "http://localhost:8181/catalog"
[DUCKDB DEBUG Wc] Endpoint starts with http
[DUCKDB DEBUG Wc] n (concatenated) = "http://localhost:8181/catalog"
[DUCKDB DEBUG Wc] a (indexOf + 3) = 7
[DUCKDB DEBUG Wc] BUGGY result (substring) = "localhost:8181/catalog"
```

### 5. Find Where "https://" Gets Prepended

After the `Wc` function logs, look for:

- Network requests in the Network tab
- Other console logs that might show URL construction
- The final malformed URL: `https://http//localhost:8181/catalog` or `https://localhost:8181/catalog`

## What to Look For

### Key Questions:

1. **What is the input?** Check the `o.endpoint` value
2. **What does substring return?** The log shows the stripped result
3. **Where does `https://` get added?** Look for subsequent logs or network requests
4. **Is the protocol change the only issue?** Or is there also a double-protocol problem?

### Expected Observations:

**Scenario 1: Protocol Change**

```
Input:  "http://localhost:8181/catalog"
Wc returns: "localhost:8181/catalog"
Final URL: "https://localhost:8181/catalog"  ← Wrong protocol!
```

**Scenario 2: Double Protocol (if it happens)**

```
Input:  "http://localhost:8181/catalog"
Wc returns: "http//localhost:8181/catalog"  ← Missing first slash?
Final URL: "https://http//localhost:8181/catalog"  ← Double protocol!
```

## Revert to Fixed Version

After testing, **ALWAYS** revert to the fixed version:

```bash
# Method 1: Run the regular patch script
node scripts/patch-duckdb-worker.js

# Method 2: Restore from backup
cp public/duckdb/duckdb-browser-eh.worker.js.backup public/duckdb/duckdb-browser-eh.worker.js

# Method 3: Rebuild from node_modules
npm run build
```

## Important Notes

⚠️ **This is a BUGGY version** - it WILL FAIL to connect to HTTP endpoints!

⚠️ **Don't commit this version** - it's for debugging only

⚠️ **Revert after testing** - use the fixed version for actual work

## Troubleshooting

### No Debug Logs Appear

- Check that the browser is actually loading the worker from `/public/duckdb/`
- Clear browser cache: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
- Verify the worker file was patched: `grep -c 'DUCKDB DEBUG' public/duckdb/duckdb-browser-eh.worker.js`

### Worker Not Loading

- Check browser console for worker loading errors
- Verify the file path in your application code
- Make sure DuckDB is initialized before running queries

### Still Seeing Fixed Behavior

- The console app might have cached the old worker
- Rebuild console-components: `npm run build`
- Clear the console app's public folder and re-copy

## Next Steps

After identifying where `https://` gets prepended:

1. Document the exact location in the code
2. Update the bug report with findings
3. Consider if additional patches are needed
4. Revert to the fixed version for normal development
