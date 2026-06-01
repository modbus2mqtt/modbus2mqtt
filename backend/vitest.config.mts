import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
      '@tests': path.resolve(__dirname, 'tests'),
      '@jest/globals': path.resolve(__dirname, 'tests/setup/jest-globals-shim.ts'),
    },
  },
  esbuild: {
    sourcemap: 'inline',
  },
  test: {
    environment: 'node',
    globals: true,
    // modbus-serial/@serialport bindings are native N-API addons that are not
    // context-aware and cannot be loaded inside Node worker threads (they fail
    // with "Module did not self-register"). Use the forks pool (child processes)
    // so these tests can run. Files still run in parallel across forks.
    pool: 'forks',
    include: ['tests/**/*_test.ts?(x)', 'tests/**/*.test.ts?(x)'],
    exclude: ['tests/**/testhelper.ts', 'tests/**/configsbase.ts', 'tests/setup/**', 'tests/integration/**'],
    hookTimeout: 30000,
    setupFiles: ['tests/setup/vitest.setup.ts'],
  },
})
