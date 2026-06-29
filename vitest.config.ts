import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import * as path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // Hand-written source only — exclude the generated SDK clients (gen/), tests,
      // the barrel index, and type decls, so the % reflects code we actually own.
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/gen/**', 'src/**/*.{test,spec}.ts', 'src/index.ts', 'src/**/*.d.ts'],
      all: true, // count untested files as 0%, not just files touched by a test
    },
  },
});
