// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // safari/ is the generated Xcode wrapper app; its Resources/ are built JS bundles.
    ignores: ['.output/', '.wxt/', 'coverage/', 'node_modules/', 'safari/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Turn off stylistic rules that would fight Prettier. Keep last.
  prettier,
);
