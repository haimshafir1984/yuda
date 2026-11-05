import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    env: { DATABASE_URL: 'file:./test.db', AUTH_DISABLED: '1' },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
