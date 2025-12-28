#!/usr/bin/env node

/**
 * Patch DuckDB worker files in the console app
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to console app (adjust if needed)
const CONSOLE_APP_PATH = path.join(__dirname, '../../console');

const WORKER_FILES = [
  path.join(CONSOLE_APP_PATH, 'public/duckdb/duckdb-browser-eh.worker.js'),
  path.join(CONSOLE_APP_PATH, 'public/duckdb/duckdb-browser-mvp.worker.js'),
  path.join(CONSOLE_APP_PATH, 'public/duckdb/duckdb-browser-coi.worker.js'),
];

// The buggy code
const BUGGY_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint),a=n.indexOf("://")+3;return n.substring(a)}`;

// The fixed code
const FIXED_CODE = `Wc=function(o,e,t){var r;if((r=o==null?void 0:o.endpoint)!=null&&r.startsWith("http")){let n="".concat(o==null?void 0:o.endpoint);return n}`;

console.log('🔧 Patching DuckDB workers in console app...');
console.log(`📁 Console app path: ${CONSOLE_APP_PATH}\n`);

if (!fs.existsSync(CONSOLE_APP_PATH)) {
  console.error(`❌ Console app not found at: ${CONSOLE_APP_PATH}`);
  console.log('\nPlease run this script from console-components directory, or adjust the path.');
  process.exit(1);
}

let patchedCount = 0;
let alreadyPatchedCount = 0;
let notFoundCount = 0;
let skippedCount = 0;

for (const workerPath of WORKER_FILES) {
  const fileName = path.basename(workerPath);

  if (!fs.existsSync(workerPath)) {
    console.log(`⏭️  ${fileName} (not found)`);
    notFoundCount++;
    continue;
  }

  // Read the worker file
  let content = fs.readFileSync(workerPath, 'utf8');

  // Check if already patched
  if (!content.includes(BUGGY_CODE)) {
    if (content.includes(FIXED_CODE)) {
      console.log(`✅ ${fileName} (already patched)`);
      alreadyPatchedCount++;
    } else {
      console.log(`⏭️  ${fileName} (different version, skipping)`);
      skippedCount++;
    }
    continue;
  }

  // Create backup
  const backupPath = workerPath + '.backup';
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content);
    console.log(`💾 Created backup: ${fileName}.backup`);
  }

  // Apply the patch
  const patchedContent = content.replace(BUGGY_CODE, FIXED_CODE);

  // Verify the patch was applied
  if (patchedContent === content) {
    console.log(`❌ Failed to patch ${fileName}`);
    continue;
  }

  // Write the patched file
  fs.writeFileSync(workerPath, patchedContent);
  console.log(`✅ Patched ${fileName}`);
  patchedCount++;
}

console.log('\n📊 Summary:');
console.log(`  - Patched: ${patchedCount}`);
console.log(`  - Already patched: ${alreadyPatchedCount}`);
console.log(`  - Not found: ${notFoundCount}`);
console.log(`  - Skipped (different version): ${skippedCount}`);

if (patchedCount > 0 || alreadyPatchedCount > 0) {
  console.log('\n✅ Console app DuckDB workers are ready!');
  console.log('   HTTP endpoints (http://...) will now work correctly.');
  console.log('\n🔄 Restart your console app dev server to use the patched workers.');
} else if (skippedCount > 0) {
  console.log('\n⚠️  Workers have a different version/structure.');
  console.log('   The patch may not be needed, or the code has changed.');
} else {
  console.log('\n❌ No workers were found or patched.');
  process.exit(1);
}
