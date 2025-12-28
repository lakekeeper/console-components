#!/usr/bin/env node

/**
 * Patch DuckDB worker to fix HTTP endpoint URL malformation bug
 *
 * Bug: DuckDB prepends "https://" to endpoints that already have "http://"
 * Result: https://http//localhost:8181/...
 *
 * This script patches the worker to NOT strip the protocol when it's already there
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(__dirname, '../public/duckdb/duckdb-browser-eh.worker.js');
const BACKUP_PATH = path.join(__dirname, '../public/duckdb/duckdb-browser-eh.worker.js.backup');

console.log('🔧 Patching DuckDB worker for HTTP endpoint support...');

// Read the worker file
let content = fs.readFileSync(WORKER_PATH, 'utf8');

// Create backup if it doesn't exist
if (!fs.existsSync(BACKUP_PATH)) {
  console.log('💾 Creating backup at:', BACKUP_PATH);
  fs.writeFileSync(BACKUP_PATH, content);
}

// The buggy function - use simple string replacement instead of regex
const BUGGY_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint),a=n.indexOf("://")+3;return n.substring(a)}`;

const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);console.log("[DuckDB PATCHED] Endpoint URL:",n);return n}`;

if (!content.includes(BUGGY_CODE)) {
  console.log(
    '⚠️  Could not find the buggy code. Worker may already be patched or DuckDB version changed.',
  );
  console.log('❌ Patching failed');
  process.exit(1);
}

// Apply the patch
const patchedContent = content.replace(BUGGY_CODE, FIXED_CODE);

// Verify the patch was applied
if (patchedContent === content) {
  console.log('❌ Patch was not applied');
  process.exit(1);
}

// Write the patched file
fs.writeFileSync(WORKER_PATH, patchedContent);

console.log('✅ Successfully patched DuckDB worker!');
console.log('');
console.log('Changes made:');
console.log('  - Modified Wc function to preserve full HTTP/HTTPS URL');
console.log('  - Now supports both http:// and https:// endpoints');
console.log('');
console.log('To restore original:');
console.log(`  cp ${BACKUP_PATH} ${WORKER_PATH}`);
