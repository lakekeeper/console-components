import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          hoistStatic: false,
          prefixIdentifiers: true,
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
          'vue-router': 'VueRouter',
          pinia: 'Pinia',
          'oidc-client-ts': 'OidcClient',
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
