import { beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS!);

// Storage is shared by the tests in a file, so every test starts from empty tables.
beforeEach(async () => {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>();
  // Delete referencing tables first to respect SQLite foreign key constraints
  const deleteFirst = new Set(['notification_logs', 'user_notification_settings']);
  const ordered = [
    ...tables.results.filter((t) => deleteFirst.has(t.name)),
    ...tables.results.filter((t) => !deleteFirst.has(t.name)),
  ];
  await env.DB.batch(ordered.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`)));
});
