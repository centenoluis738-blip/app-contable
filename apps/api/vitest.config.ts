import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://contable:contable@localhost:5432/contable_test',
      JWT_SECRET: 'secreto-de-pruebas',
      UPLOAD_DIR: './uploads-test',
    },
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 20000,
  },
});
