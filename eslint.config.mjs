import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', '.wrangler/', 'worker-configuration.d.ts', '**/*.mjs', '**/*.cjs', 'frontend/'],
  },
  {
    languageOptions: {
        parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-irregular-whitespace': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        'no-undef': 'off',
        'no-redeclare': 'off',
        'no-extra-semi': 'off'
    }
  }
);
