import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';

const duckdbFiles = [
  'duckdb-browser-coi.pthread.worker.js',
  'duckdb-browser-coi.worker.js',
  'duckdb-browser-eh.worker.js',
  'duckdb-browser-mvp.worker.js',
  'duckdb-coi.wasm',
  'duckdb-eh.wasm',
  'duckdb-mvp.wasm',
];

// Copy DuckDB WASM files from @duckdb/duckdb-wasm npm package into public/duckdb/
// so Vite includes them in dist/ output. This avoids committing ~100MB of binaries to git.
function copyDuckDBFiles() {
  return {
    name: 'copy-duckdb-files',
    buildStart() {
      const srcDir = resolve(__dirname, 'node_modules/@duckdb/duckdb-wasm/dist');
      const destDir = resolve(__dirname, 'public/duckdb');

      if (!existsSync(srcDir)) {
        throw new Error(
          `DuckDB WASM package not found at ${srcDir}. Run "npm install" first.`,
        );
      }

      const missing = duckdbFiles.filter(
        (file) => !existsSync(resolve(srcDir, file)),
      );
      if (missing.length > 0) {
        throw new Error(
          `Missing DuckDB WASM files in ${srcDir}:\n  - ${missing.join('\n  - ')}`,
        );
      }

      mkdirSync(destDir, { recursive: true });
      duckdbFiles.forEach((file) => {
        copyFileSync(resolve(srcDir, file), resolve(destDir, file));
      });
      console.log('Copied DuckDB WASM files from @duckdb/duckdb-wasm');
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    copyDuckDBFiles(),
    vue({
      template: {
        compilerOptions: {
          hoistStatic: false,
          prefixIdentifiers: true,
          // ldrs web components (l-helix, l-hourglass, etc.)
          isCustomElement: (tag) => tag.startsWith('l-'),
        },
      },
    }),
    dts({
      // Generate .d.ts files
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.stories.ts'],
      // Output directory for type declarations
      outDir: 'dist/types',
      //Don't bundle into single file - keep structure
      rollupTypes: false,
      // Log level
      logLevel: 'warn',
      // Static import
      staticImport: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ConsoleComponents',
      fileName: (format) => `console-components.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [
        'vue',
        'vuetify',
        /^vuetify\//,
        'vue-router',
        'pinia',
        'oidc-client-ts',
        /^virtual:/,
        'json-bigint',
        '@wdns/vue-code-block',
        'chart.js',
        'vue-chartjs',
        'date-fns',
        'vue-json-pretty',
        /^vue-json-pretty\/.*$/,
        '@duckdb/duckdb-wasm',
        'apache-arrow',
      ],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          vuetify: 'Vuetify',
          'vuetify/components': 'VuetifyComponents',
          'vue-router': 'VueRouter',
          pinia: 'Pinia',
          'oidc-client-ts': 'OidcClient',
          'json-bigint': 'JSONBig',
          'date-fns': 'dateFns',
          'vue-json-pretty': 'VueJsonPretty',
          'chart.js': 'Chart',
          'vue-chartjs': 'VueChartjs',
          '@wdns/vue-code-block': 'VueCodeBlock',
          '@duckdb/duckdb-wasm': 'DuckDB',
          'apache-arrow': 'Arrow',
        },
        manualChunks: undefined,
        generatedCode: {
          symbols: true,
        },
      },
    },
    cssCodeSplit: false,
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    keepNames: false,
    minifyIdentifiers: true,
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
});
