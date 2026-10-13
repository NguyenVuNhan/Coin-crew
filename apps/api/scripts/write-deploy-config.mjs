// Writes wrangler.deploy.jsonc (git-ignored): wrangler.jsonc with the real D1 database ID taken from
// the D1_DATABASE_ID environment variable, so the ID stays out of the repo.
// Used by `npm run deploy` and `npm run db:migrate:remote`.
import { readFileSync, writeFileSync } from 'node:fs';

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const id = process.env.D1_DATABASE_ID?.trim();
if (!id || !UUID.test(id)) {
  console.error('D1_DATABASE_ID is missing or not a database ID. Copy it from Cloudflare → Storage & databases → D1 → fsl.');
  process.exit(1);
}

const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
if (!config.includes(PLACEHOLDER)) {
  console.error(`wrangler.jsonc no longer contains the placeholder database_id ${PLACEHOLDER}.`);
  process.exit(1);
}

writeFileSync(new URL('../wrangler.deploy.jsonc', import.meta.url), config.replace(PLACEHOLDER, id));
console.log('Wrote wrangler.deploy.jsonc');
