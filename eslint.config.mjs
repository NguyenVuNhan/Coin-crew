// Import rules only (spec docs/superpowers/specs/2026-11-02-nx-workspace-design.md §7). No style or general lint rules.
// Run through Nx only (`npm run lint`): the boundary rule reads Nx's cached project graph, and bare `npx eslint .`
// silently skips it when that cache is missing.
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

const ZMP_ONLY = 'Only apps/zalo may import zmp-sdk.';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/api/public/**',
      '**/.wrangler/**',
      'migration-baseline/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: [],
          // Nx's "lazy-loaded library" check is about bundle splitting, not layering: one test's
          // `await import('@cc/web-util/qr')` would otherwise flag every static import of @cc/web-util.
          checkDynamicDependenciesExceptions: ['@cc/**'],
          depConstraints: [
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
            { sourceTag: 'scope:relay', onlyDependOnLibsWithTags: [] },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'zmp-sdk', message: ZMP_ONLY }],
          patterns: [{ group: ['zmp-sdk/*'], message: ZMP_ONLY }],
        },
      ],
    },
  },
  {
    files: ['apps/zalo/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
