import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './drizzle/schema.ts',
  dialect: 'postgresql',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.POSTGRES_URL,
    database: process.env.POSTGRES_DB,
  },
});
