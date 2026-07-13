import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import prettierPlugin from 'eslint-plugin-prettier'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'

export default [
  // Global ignores: an entry holding nothing but `ignores` applies to every config below.
  // Angular's build cache holds bundled vendor JS - linting it only produces parse errors.
  { ignores: ['**/.angular/**', '**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      'dist/**',
      'jest.config.ts',
      'jest.config.cjs',
      'vitest.config.ts',
      '**/vitest.config.ts',
      '*.js',
      '*.mjs',
      'specification/bin/**/*.js',
    ],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      jest,
      prettier: prettierPlugin,
      'unused-imports': unusedImportsPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['tsconfig.eslint.json'],
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      // Prefer plugin rule for unused imports/vars
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['tsconfig.eslint.json', 'frontend/tsconfig.angular.json'],
        },
      },
    },
  },
  {
    files: ['frontend/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      'no-case-declarations': 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['frontend/tsconfig.angular.json'],
      },
    },
  },
  {
    // Frontend tests live in tsconfig.spec.json, not in tsconfig.angular.json (which excludes *.spec.ts),
    // so they need their own project or the parser cannot resolve them.
    files: ['frontend/src/**/*.spec.ts', 'frontend/src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['frontend/tsconfig.spec.json'],
      },
    },
  },
  {
    files: ['backend/tests/**/*.ts', 'backend/tests/**/*.tsx', 'backend/tests/**/*.js'],
    rules: {
      // Relax strict TS/Jest rules in tests to reduce noise
      'unused-imports/no-unused-imports': 'off',
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-shadow-restricted-names': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-case-declarations': 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        sourceType: 'module',
        project: ['tsconfig.eslint.json'],
      },
    },
  },
  {
    ignores: ['*.js', '*.mjs'],
  },
]
