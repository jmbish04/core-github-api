import path from 'node:path';
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: '@db', replacement: path.resolve(__dirname, 'backend/src/db') },
      { find: '@agents', replacement: path.resolve(__dirname, 'backend/src/ai/agents') },
      { find: '@utils', replacement: path.resolve(__dirname, 'backend/src/utils') },
      { find: '@services', replacement: path.resolve(__dirname, 'backend/src/services') },
      { find: '@lib', replacement: path.resolve(__dirname, 'backend/src/lib') },
      { find: '@custom-types', replacement: path.resolve(__dirname, 'backend/src/types') },
      { find: '@alerts', replacement: path.resolve(__dirname, 'backend/src/alerts') },
      { find: '@', replacement: path.resolve(__dirname, 'backend/src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
