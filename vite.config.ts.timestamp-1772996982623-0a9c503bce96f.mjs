// vite.config.ts
import { defineConfig } from 'file:///Users/viktor/Biz/frontend/console-components/node_modules/vite/dist/node/index.js';
import vue from 'file:///Users/viktor/Biz/frontend/console-components/node_modules/@vitejs/plugin-vue/dist/index.mjs';
import dts from 'file:///Users/viktor/Biz/frontend/console-components/node_modules/vite-plugin-dts/dist/index.mjs';
import { resolve } from 'path';
var __vite_injected_original_dirname = '/Users/viktor/Biz/frontend/console-components';
var vite_config_default = defineConfig({
  resolve: {
    alias: {
      '@': resolve(__vite_injected_original_dirname, 'src'),
    },
  },
  plugins: [
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
      entry: resolve(__vite_injected_original_dirname, 'src/index.ts'),
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
        manualChunks: void 0,
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
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdmlrdG9yL0Jpei9mcm9udGVuZC9jb25zb2xlLWNvbXBvbmVudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy92aWt0b3IvQml6L2Zyb250ZW5kL2NvbnNvbGUtY29tcG9uZW50cy92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvdmlrdG9yL0Jpei9mcm9udGVuZC9jb25zb2xlLWNvbXBvbmVudHMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB2dWUgZnJvbSAnQHZpdGVqcy9wbHVnaW4tdnVlJztcbmltcG9ydCBkdHMgZnJvbSAndml0ZS1wbHVnaW4tZHRzJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHZ1ZSh7XG4gICAgICB0ZW1wbGF0ZToge1xuICAgICAgICBjb21waWxlck9wdGlvbnM6IHtcbiAgICAgICAgICBob2lzdFN0YXRpYzogZmFsc2UsXG4gICAgICAgICAgcHJlZml4SWRlbnRpZmllcnM6IHRydWUsXG4gICAgICAgICAgLy8gbGRycyB3ZWIgY29tcG9uZW50cyAobC1oZWxpeCwgbC1ob3VyZ2xhc3MsIGV0Yy4pXG4gICAgICAgICAgaXNDdXN0b21FbGVtZW50OiAodGFnKSA9PiB0YWcuc3RhcnRzV2l0aCgnbC0nKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICAgZHRzKHtcbiAgICAgIC8vIEdlbmVyYXRlIC5kLnRzIGZpbGVzXG4gICAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnRzJywgJ3NyYy8qKi8qLnZ1ZSddLFxuICAgICAgZXhjbHVkZTogWydzcmMvKiovKi5zcGVjLnRzJywgJ3NyYy8qKi8qLnRlc3QudHMnLCAnc3JjLyoqLyouc3Rvcmllcy50cyddLFxuICAgICAgLy8gT3V0cHV0IGRpcmVjdG9yeSBmb3IgdHlwZSBkZWNsYXJhdGlvbnNcbiAgICAgIG91dERpcjogJ2Rpc3QvdHlwZXMnLFxuICAgICAgLy9Eb24ndCBidW5kbGUgaW50byBzaW5nbGUgZmlsZSAtIGtlZXAgc3RydWN0dXJlXG4gICAgICByb2xsdXBUeXBlczogZmFsc2UsXG4gICAgICAvLyBMb2cgbGV2ZWxcbiAgICAgIGxvZ0xldmVsOiAnd2FybicsXG4gICAgICAvLyBTdGF0aWMgaW1wb3J0XG4gICAgICBzdGF0aWNJbXBvcnQ6IHRydWUsXG4gICAgfSksXG4gIF0sXG4gIGJ1aWxkOiB7XG4gICAgbGliOiB7XG4gICAgICBlbnRyeTogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvaW5kZXgudHMnKSxcbiAgICAgIG5hbWU6ICdDb25zb2xlQ29tcG9uZW50cycsXG4gICAgICBmaWxlTmFtZTogKGZvcm1hdCkgPT4gYGNvbnNvbGUtY29tcG9uZW50cy4ke2Zvcm1hdH0uanNgLFxuICAgICAgZm9ybWF0czogWydlcycsICd1bWQnXSxcbiAgICB9LFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGV4dGVybmFsOiBbXG4gICAgICAgICd2dWUnLFxuICAgICAgICAndnVldGlmeScsXG4gICAgICAgIC9ednVldGlmeVxcLy8sXG4gICAgICAgICd2dWUtcm91dGVyJyxcbiAgICAgICAgJ3BpbmlhJyxcbiAgICAgICAgJ29pZGMtY2xpZW50LXRzJyxcbiAgICAgICAgL152aXJ0dWFsOi8sXG4gICAgICAgICdqc29uLWJpZ2ludCcsXG4gICAgICAgICdAd2Rucy92dWUtY29kZS1ibG9jaycsXG4gICAgICAgICdjaGFydC5qcycsXG4gICAgICAgICd2dWUtY2hhcnRqcycsXG4gICAgICAgICdkYXRlLWZucycsXG4gICAgICAgICd2dWUtanNvbi1wcmV0dHknLFxuICAgICAgICAvXnZ1ZS1qc29uLXByZXR0eVxcLy4qJC8sXG4gICAgICAgICdAZHVja2RiL2R1Y2tkYi13YXNtJyxcbiAgICAgICAgJ2FwYWNoZS1hcnJvdycsXG4gICAgICBdLFxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGV4cG9ydHM6ICduYW1lZCcsXG4gICAgICAgIGdsb2JhbHM6IHtcbiAgICAgICAgICB2dWU6ICdWdWUnLFxuICAgICAgICAgIHZ1ZXRpZnk6ICdWdWV0aWZ5JyxcbiAgICAgICAgICAndnVlLXJvdXRlcic6ICdWdWVSb3V0ZXInLFxuICAgICAgICAgIHBpbmlhOiAnUGluaWEnLFxuICAgICAgICAgICdvaWRjLWNsaWVudC10cyc6ICdPaWRjQ2xpZW50JyxcbiAgICAgICAgICAnQGR1Y2tkYi9kdWNrZGItd2FzbSc6ICdEdWNrREInLFxuICAgICAgICAgICdhcGFjaGUtYXJyb3cnOiAnQXJyb3cnLFxuICAgICAgICB9LFxuICAgICAgICBtYW51YWxDaHVua3M6IHVuZGVmaW5lZCxcbiAgICAgICAgZ2VuZXJhdGVkQ29kZToge1xuICAgICAgICAgIHN5bWJvbHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgY3NzQ29kZVNwbGl0OiBmYWxzZSxcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICB0YXJnZXQ6ICdlc25leHQnLFxuICB9LFxuICBlc2J1aWxkOiB7XG4gICAga2VlcE5hbWVzOiBmYWxzZSxcbiAgICBtaW5pZnlJZGVudGlmaWVyczogdHJ1ZSxcbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydAZHVja2RiL2R1Y2tkYi13YXNtJ10sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVQsU0FBUyxvQkFBb0I7QUFDdFYsT0FBTyxTQUFTO0FBQ2hCLE9BQU8sU0FBUztBQUNoQixTQUFTLGVBQWU7QUFIeEIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxRQUFRLGtDQUFXLEtBQUs7QUFBQSxJQUMvQjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLElBQUk7QUFBQSxNQUNGLFVBQVU7QUFBQSxRQUNSLGlCQUFpQjtBQUFBLFVBQ2YsYUFBYTtBQUFBLFVBQ2IsbUJBQW1CO0FBQUE7QUFBQSxVQUVuQixpQkFBaUIsQ0FBQyxRQUFRLElBQUksV0FBVyxJQUFJO0FBQUEsUUFDL0M7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsSUFDRCxJQUFJO0FBQUE7QUFBQSxNQUVGLFNBQVMsQ0FBQyxlQUFlLGNBQWM7QUFBQSxNQUN2QyxTQUFTLENBQUMsb0JBQW9CLG9CQUFvQixxQkFBcUI7QUFBQTtBQUFBLE1BRXZFLFFBQVE7QUFBQTtBQUFBLE1BRVIsYUFBYTtBQUFBO0FBQUEsTUFFYixVQUFVO0FBQUE7QUFBQSxNQUVWLGNBQWM7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsS0FBSztBQUFBLE1BQ0gsT0FBTyxRQUFRLGtDQUFXLGNBQWM7QUFBQSxNQUN4QyxNQUFNO0FBQUEsTUFDTixVQUFVLENBQUMsV0FBVyxzQkFBc0IsTUFBTTtBQUFBLE1BQ2xELFNBQVMsQ0FBQyxNQUFNLEtBQUs7QUFBQSxJQUN2QjtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1I7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsVUFDUCxLQUFLO0FBQUEsVUFDTCxTQUFTO0FBQUEsVUFDVCxjQUFjO0FBQUEsVUFDZCxPQUFPO0FBQUEsVUFDUCxrQkFBa0I7QUFBQSxVQUNsQix1QkFBdUI7QUFBQSxVQUN2QixnQkFBZ0I7QUFBQSxRQUNsQjtBQUFBLFFBQ0EsY0FBYztBQUFBLFFBQ2QsZUFBZTtBQUFBLFVBQ2IsU0FBUztBQUFBLFFBQ1g7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0EsY0FBYztBQUFBLElBQ2QsUUFBUTtBQUFBLElBQ1IsUUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLFdBQVc7QUFBQSxJQUNYLG1CQUFtQjtBQUFBLEVBQ3JCO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMscUJBQXFCO0FBQUEsRUFDakM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
