import { defineConfig } from 'drizzle-kit';

export default defineConfig({ dialect: 'sqlite', schema: '../../libs/api/db/src/schema.ts', out: './migrations' });
