import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.wrangler', '.drizzle'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: '../../tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` is allowed in this codebase for Worker bindings, SDK shims, and migration paths.
      '@typescript-eslint/no-explicit-any': 'off',
      
      // Standard quality-of-life adjustments for Cloudflare Workers
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  }
);
