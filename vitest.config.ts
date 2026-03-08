import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './backend/src'),
      '@db': path.resolve(__dirname, './backend/src/db'),
      '@db/schema': path.resolve(__dirname, './backend/src/db/schemas/index.ts'),
    },
  },
})
