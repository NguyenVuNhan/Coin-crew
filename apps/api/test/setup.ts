import { beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS!);

// Storage is shared by the tests in a file, so every test starts from empty tables.
beforeEach(async () => {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>();
  await env.DB.batch(tables.results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`)));
});
