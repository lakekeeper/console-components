import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Ensure proper variable scoping in templates
          hoistStatic: false,
          // Use different variable names to avoid conflicts
          prefixIdentifiers: true,
        },
      },
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
      external: ['vue', 'vuetify', /^vuetify\//],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          vuetify: 'Vuetify',
        },
        // Add manualChunks to prevent variable conflicts
        manualChunks: undefined,
        // Configure variable naming
        generatedCode: {
          symbols: true,
        },
      },
    },
    cssCodeSplit: false,
    // Enable minification to handle variable renaming
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    // Configure esbuild to handle variable name conflicts
    keepNames: false,
    minifyIdentifiers: true,
  },
});
