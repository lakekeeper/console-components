import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginPrettier from 'eslint-plugin-prettier';

// SQL for DuckDB is an `Sql` built with `src/composables/loqe/sql.ts`; these keep
// string-built SQL from coming back.
const sqlRestrictions = [
  {
    selector:
      'CallExpression[callee.property.name=/^(query|queryBuffer)$/] > TemplateLiteral[expressions.length>0]',
    message:
      'Build SQL with the sql`…` template and ident()/literal()/num(), not a template string.',
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(query|queryBuffer)$/] > BinaryExpression[operator='+']",
    message:
      'Build SQL with the sql`…` template and ident()/literal()/num(), not by concatenation.',
  },
  {
    selector:
      "CallExpression[callee.name='userSql'] > :matches(TemplateLiteral[expressions.length>0], BinaryExpression[operator='+'])",
    message: 'userSql() takes the text the user typed as it is, not text built here.',
  },
  {
    selector:
      "TSAsExpression[typeAnnotation.typeName.name='Sql'], TSTypeAssertion[typeAnnotation.typeName.name='Sql']",
    message: 'Do not cast to Sql: build it with sql`…`, ident(), literal(), num() or userSql().',
  },
];
// `userSql` is for text the user typed; each file that may take such text is listed below.
const userSqlRestriction = {
  selector: "CallExpression[callee.name='userSql']",
  message: 'userSql() is only for SQL the user typed. Build SQL from names and values with sql`…`.',
};
const userSqlFiles = ['src/components/LoQEExplorer.vue', 'src/composables/loqe/sql.test.ts'];

/** @type {import('eslint').Linter.Config[]} */
export default [
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      prettier: pluginPrettier,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'script',
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    ignores: [
      '**/*.gen.ts',
      'src/gen/**',
      'openapi',
      '.github',
      'justfile',
      'CHANGELOG.md',
      '.vscode/*',
      '!.vscode/settings.json',
      '!.vscode/tasks.json',
      '!.vscode/launch.json',
      '!.vscode/extensions.json',
      '!.vscode/*.code-snippets',
      '.history/',
      '*.vsix',
      '.ionide',
      'test/',
      'node_modules/',
      'npm-debug.log',
      'dist/',
      '.DS_Store',
      'debug/',
      '*.pdb',
      '.env.azure',
      'public/**',
      '**/duckdb-worker-wrapper.js',
      '**/duckdb*.js',
      '**/duckdb*.wasm',
    ],
  },
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/valid-v-slot': 'off',
      // Vuetify's `crossfade` puts a permanent `mix-blend-mode: plus-lighter` on
      // every window item (VWindow.css), not only during the transition. Inside
      // the isolated container that blends the pane against the surface behind
      // it: harmless on a dark ground, but white plus anything is white, so the
      // pane renders invisible in light theme. Removed three times before this
      // rule; ban it rather than find out again.
      'vue/no-restricted-static-attribute': [
        'error',
        {
          key: 'crossfade',
          message:
            '`crossfade` makes window panes invisible on a light surface (permanent mix-blend-mode: plus-lighter). Omit it.',
        },
      ],
      'no-restricted-syntax': ['error', ...sqlRestrictions, userSqlRestriction],
    },
  },
  {
    files: userSqlFiles,
    rules: {
      'no-restricted-syntax': ['error', ...sqlRestrictions],
    },
  },
];
