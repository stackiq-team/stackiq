import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.tsx', 'src/**/*.ts'],
      exclude: ['src/tests/**', 'src/main.tsx'],
      thresholds: {// SET THRESHOLDS FOR COVERAGE.
        statements: 0,
        functions: 0,
        lines: 0,
        branches: 0
      }
    }
  }
})