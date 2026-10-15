// Seeds the local e2e D1 database with 30 trips x 10 people and benchmarks GET /api/me/people and filterRecentPeople.
// Run server first: npm run e2e:server -w @fsl/api
// Then: node scripts/seed-recent-people.mjs [--web http://localhost:5173]

import child_process from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let base = 'http://localhost:8787';
let web;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--base' && process.argv[i + 1]) base = process.argv[++i];
  else if (process.argv[i] === '--web' && process.argv[i + 1]) web = process.argv[++i];
}
base = base.replace(/\/+$/, '');
if (web) web = web.replace(/\/+$/, '');

const pad2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replaceAll("'", "''");
const normalizeName = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

const family = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'];
const given = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Linh', 'My', 'Nam', 'Phúc', 'Quân', 'Thảo', 'Trang', 'Vy'];

const users = [];
for (let i = 0; i < 60; i++) {
  const u = i + 1;
  const name = `${family[i % 10]} ${given[Math.floor(i / 10)]}`;
  users.push({ id: `seed-user-${pad2(u)}`, sub: `seed-sub-${pad2(u)}`, email: `seed${pad2(u)}@example.com`, name });
}

const baseTime = Date.now();
const nowIso = new Date(baseTime).toISOString();
const sql = [];

sql.push(`INSERT OR IGNORE INTO users (id, google_sub, email, name, consent_at, created_at) VALUES ('seed-user-minh', 'e2e-minh', 'minh@example.com', 'Minh', NULL, '${nowIso}');`);
for (const u of users) {
  sql.push(`INSERT OR IGNORE INTO users (id, google_sub, email, name, consent_at, created_at) VALUES ('${u.id}', '${u.sub}', '${u.email}', '${esc(u.name)}', NULL, '${nowIso}');`);
}

for (let t = 0; t < 30; t++) {
  const tripNum = t + 1;
  const tt = pad2(tripNum);
  const tripTime = new Date(baseTime - (30 - tripNum) * 86400000).toISOString();
  sql.push(`INSERT OR IGNORE INTO trips (id, name, organiser_user_id, group_token, view_token, created_at) VALUES ('seed-trip-${tt}', 'Seed trip ${tt}', (SELECT id FROM users WHERE google_sub = 'e2e-minh'), 'seed-group-${tt}', 'seed-view-${tt}', '${tripTime}');`);
  sql.push(`INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('seed-p-${tt}-00', 'seed-trip-${tt}', 'Minh', 'minh', (SELECT id FROM users WHERE google_sub = 'e2e-minh'), 'active', 0, '${tripTime}');`);
  for (let j = 1; j <= 9; j++) {
    const jj = pad2(j);
    const uNum = ((t * 9 + j - 1) % 60) + 1;
    const user = users[uNum - 1];
    sql.push(`INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('seed-p-${tt}-${jj}', 'seed-trip-${tt}', '${esc(user.name)}', '${esc(normalizeName(user.name))}', 'seed-user-${pad2(uNum)}', 'active', ${j}, '${tripTime}');`);
  }
}

const sqlDir = path.resolve('apps/api/.wrangler');
fs.mkdirSync(sqlDir, { recursive: true });
fs.writeFileSync(path.join(sqlDir, 'seed-recent-people.sql'), sql.join('\n') + '\n', 'utf8');

// Wrangler prints the result of every statement; keep it for when something goes wrong.
const d1Result = child_process.spawnSync(
  'npx wrangler d1 execute fsl --local --persist-to .wrangler/e2e --file .wrangler/seed-recent-people.sql --yes',
  { cwd: path.resolve('apps/api'), shell: true, encoding: 'utf8' }
);
if (d1Result.status !== 0) {
  console.error(d1Result.stdout, d1Result.stderr);
  console.error('Failed to execute D1 seed SQL');
  process.exit(1);
}
console.log(`Seeded 30 trips x 10 people (${sql.length} statements) into apps/api/.wrangler/e2e`);

const failures = [];

let token;
try {
  const loginRes = await fetch(`${base}/api/test/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: 'e2e-minh', name: 'Minh', email: 'minh@example.com' }),
  });
  if (!loginRes.ok) throw new Error(`HTTP ${loginRes.status}`);
  const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
  for (const c of cookies) {
    const match = c.match(/sid=([^;]+)/);
    if (match) {
      token = match[1];
      break;
    }
  }
  if (!token) throw new Error('Missing sid cookie');
} catch (err) {
  console.error(`Login failed at ${base}: ${err.message}`);
  process.exit(1);
}

const tmpFile = path.join(os.tmpdir(), `fsl-seed-recent-people-${Date.now()}.json`);
try {
  for (let i = 1; i <= 5; i++) {
    const res = child_process.spawnSync(
      'curl',
      ['-s', '-o', tmpFile, '-w', '%{time_total}', '-H', 'Cookie: sid=' + token, base + '/api/me/people'],
      { encoding: 'utf8' }
    );
    const seconds = parseFloat(res.stdout.trim());
    let data;
    try {
      data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    } catch {
      data = [];
    }
    console.log(`run ${i}: ${seconds}s, ${data.length} people`);
    if (!(seconds < 0.3 && data.length === 50)) {
      failures.push(`run ${i} (${seconds}s, ${data.length} people)`);
    }
  }
} finally {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
}

if (web) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    await context.request.post(web + '/api/test/login', {
      data: { sub: 'e2e-minh', name: 'Minh', email: 'minh@example.com' },
    });
    const page = await context.newPage();
    await page.goto(web + '/');
    const { people, avgMs } = await page.evaluate(async () => {
      const res = await fetch('/api/me/people');
      const people = await res.json();
      const { filterRecentPeople } = await import('/src/lib/recentPeople.ts');
      const queries = ['a', 'ng', 'tr', 'linh', 'nguyen v', 'zz'];
      const exclude = new Set();
      const start = performance.now();
      for (let i = 0; i < 1000; i++) filterRecentPeople(queries[i % queries.length], people, exclude);
      const avgMs = (performance.now() - start) / 1000;
      return { people: people.length, avgMs };
    });
    console.log(`filterRecentPeople: ${avgMs} ms average over 1000 runs (${people} people)`);
    if (avgMs >= 1) failures.push(`filterRecentPeople average time ${avgMs} ms >= 1 ms`);
  } finally {
    await browser.close();
  }
}

if (failures.length === 0) {
  console.log('PASS');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures.join(', ')}`);
  process.exit(1);
}
