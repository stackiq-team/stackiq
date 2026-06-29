import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**'],
      thresholds: { // SET THRESHOLDS FOR COVERAGE.
        statements: 0,
        functions: 0,
        lines: 0,
        branches: 0
      }
    }
  }
})
