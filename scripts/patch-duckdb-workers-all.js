#!/usr/bin/env node

/**
 * Patch DuckDB worker files in both public and dist folders
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_FILES = [
  path.join(__dirname, '../public/duckdb/duckdb-browser-eh.worker.js'),
  path.join(__dirname, '../dist/duckdb/duckdb-browser-eh.worker.js'),
];

// The buggy code
const BUGGY_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint),a=n.indexOf("://")+3;return n.substring(a)}`;

// The fixed code with debug logging
const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);console.log("[DuckDB PATCHED] Endpoint URL:",n);return n}`;

console.log('🔧 Patching DuckDB workers for HTTP endpoint support...\n');

let patchedCount = 0;
let alreadyPatchedCount = 0;
let notFoundCount = 0;

for (const workerPath of WORKER_FILES) {
  const relativePath = path.relative(process.cwd(), workerPath);

  if (!fs.existsSync(workerPath)) {
    console.log(`⏭️  Skipping ${relativePath} (file not found)`);
    notFoundCount++;
    continue;
  }

  // Read the worker file
  let content = fs.readFileSync(workerPath, 'utf8');

  // Check if already patched
  if (!content.includes(BUGGY_CODE)) {
    if (content.includes(FIXED_CODE)) {
      console.log(`✅ ${relativePath} (already patched)`);
      alreadyPatchedCount++;
    } else {
      console.log(`⚠️  ${relativePath} (different version, skipping)`);
      notFoundCount++;
    }
    continue;
  }

  // Create backup
  const backupPath = workerPath + '.backup';
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content);
    console.log(`💾 Created backup: ${relativePath}.backup`);
  }

  // Apply the patch
  const patchedContent = content.replace(BUGGY_CODE, FIXED_CODE);

  // Verify the patch was applied
  if (patchedContent === content) {
    console.log(`❌ Failed to patch ${relativePath}`);
    continue;
  }

  // Write the patched file
  fs.writeFileSync(workerPath, patchedContent);
  console.log(`✅ Patched ${relativePath}`);
  patchedCount++;
}

console.log('\n📊 Summary:');
console.log(`  - Patched: ${patchedCount}`);
console.log(`  - Already patched: ${alreadyPatchedCount}`);
console.log(`  - Skipped: ${notFoundCount}`);

if (patchedCount > 0) {
  console.log('\n✅ DuckDB workers patched successfully!');
  console.log('   HTTP endpoints (http://...) will now work correctly.');
} else if (alreadyPatchedCount > 0) {
  console.log('\n✅ All workers already patched!');
} else {
  console.log('\n⚠️  No workers were patched. Version may have changed.');
  process.exit(1);
}
