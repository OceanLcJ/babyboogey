import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/config/db/migrations-d1',
  schema: './src/config/db/schema.sqlite.ts',
  dialect: 'sqlite',
});
