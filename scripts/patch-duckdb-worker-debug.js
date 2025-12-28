#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(__dirname, '../public/duckdb/duckdb-browser-eh.worker.js');

// The current FIXED code (to find and replace)
const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);return n}`;

// The BUGGY code WITH DEBUG LOGGING
const BUGGY_DEBUG_CODE = `Wc=function(o,e,t){var r;console.log("[DUCKDB DEBUG Wc] Function called with:",{o:o,e:e,t:t});r=o==null?void 0:o.endpoint;console.log("[DUCKDB DEBUG Wc] r (endpoint) =",r);if(r!=null&&r.startsWith("http")){console.log("[DUCKDB DEBUG Wc] Endpoint starts with http");let n="".concat(o==null?void 0:o.endpoint);console.log("[DUCKDB DEBUG Wc] n (concatenated) =",n);let a=n.indexOf("://")+3;console.log("[DUCKDB DEBUG Wc] a (indexOf + 3) =",a);let result=n.substring(a);console.log("[DUCKDB DEBUG Wc] BUGGY result (substring) =",result);return result}`;

console.log('🐛 Creating BUGGY DEBUG version of DuckDB worker...');

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

// Check if currently fixed
if (!content.includes(FIXED_CODE)) {
  console.log('⚠️  Fixed code not found. File may already be modified or different version.');
  console.log('    Looking for any Wc function...');
  
  // Try to find ANY Wc function
  const wcMatch = content.match(/Wc=function\(o,e,t\)\{[^}]+\}/);
  if (wcMatch) {
    console.log('    Found Wc function:', wcMatch[0].substring(0, 100) + '...');
  }
  process.exit(1);
}

// Apply the patch
content = content.replace(FIXED_CODE, BUGGY_DEBUG_CODE);
fs.writeFileSync(WORKER_PATH, content);

console.log('✅ Successfully applied BUGGY DEBUG version');
console.log('   Open browser console to see detailed URL transformation logs');
console.log('   Look for lines starting with: [DUCKDB DEBUG Wc]');
console.log('');
console.log('⚠️  This is a DEBUG version - revert after testing!');
console.log('   To revert: node scripts/patch-duckdb-worker.js');
