import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { buildAttendanceSeedSql, buildPersonalSeedSql, buildSeedSql, buildUserCopySql, localD1File, readUsers } from './seed-local.mjs';

const NOW = '2026-11-12T10:00:00.000Z';
const owner = (id, extra = {}) => ({ id, name: 'Owner', google_sub: `g-${id}`, ...extra });

// Pulls the column -> value pairs out of one "INSERT OR IGNORE INTO t (a, b) VALUES (x, y);" statement.
function parseInsert(stmt) {
  const m = stmt.match(/^INSERT OR IGNORE INTO (\w+) \(([^)]*)\) VALUES \((.*)\);$/s);
  if (!m) return null;
  const cols = m[2].split(',').map((c) => c.trim());
  const vals = [];
  let i = 0;
  const s = m[3];
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === ',') { i++; continue; }
    if (s[i] === "'") {
      let v = '';
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { v += "'"; i += 2; continue; }
        if (s[i] === "'") { i++; break; }
        v += s[i++];
      }
      vals.push(v);
    } else {
      let j = i;
      while (j < s.length && s[j] !== ',') j++;
      const raw = s.slice(i, j).trim();
      vals.push(raw === 'NULL' ? null : Number(raw));
      i = j;
    }
  }
  return { table: m[1], row: Object.fromEntries(cols.map((c, k) => [c, vals[k]])) };
}

function rows(sql, table) {
  return sql.map(parseInsert).filter((r) => r && r.table === table).map((r) => r.row);
}

test('buildSeedSql: one owner -> contains a direct ledger insert unless owner already has one', () => {
  const fresh = buildSeedSql([owner('abcdef1234')], NOW);
  const direct = rows(fresh, 'trips').filter((t) => t.preset === 'direct' && t.organiser_user_id === 'abcdef1234');
  assert.equal(direct.length, 1);

  const existing = buildSeedSql([owner('abcdef1234', { ledgerTripId: 'real-ledger', ledgerOwnerPid: 'real-me' })], NOW);
  const direct2 = rows(existing, 'trips').filter((t) => t.preset === 'direct' && t.organiser_user_id === 'abcdef1234');
  assert.equal(direct2.length, 0);
  const an = rows(existing, 'participants').find((p) => p.name === 'An');
  assert.equal(an.trip_id, 'real-ledger');
  const lunch = rows(existing, 'transactions').find((t) => t.description === 'Lunch' && t.trip_id === 'real-ledger');
  assert.equal(lunch.payer_id, 'real-me');
});

test('buildSeedSql: every statement is INSERT OR IGNORE and every id starts with "seed-"', () => {
  const sql = buildSeedSql([owner('abcdef1234')], NOW);
  assert.ok(sql.length > 50);
  for (const stmt of sql) {
    assert.ok(stmt.startsWith('INSERT OR IGNORE INTO '), stmt);
    const { table, row } = parseInsert(stmt);
    if (table === 'transaction_shares') {
      assert.ok(row.transaction_id.startsWith('seed-'), stmt);
      assert.ok(row.participant_id.startsWith('seed-'), stmt);
    } else if (table === 'person_links') {
      assert.ok(row.participant_id.startsWith('seed-'), stmt);
    } else {
      assert.ok(row.id.startsWith('seed-'), stmt);
    }
  }
});

test('buildSeedSql: Đà Lạt trip has fewest_transfers 1; Cầu lông has round_transfers 1', () => {
  const trips = rows(buildSeedSql([owner('abcdef1234')], NOW), 'trips');
  const dalat = trips.find((t) => t.name === 'Đà Lạt (seed)');
  const caulong = trips.find((t) => t.name === 'Cầu lông T5 (seed)');
  assert.equal(dalat.fewest_transfers, 1);
  assert.equal(caulong.round_transfers, 1);
  assert.equal(caulong.fewest_transfers, 0);
  for (const t of trips) {
    assert.equal(t.version, 1);
    assert.equal(t.currency, 'VND');
    assert.ok(t.group_token && t.view_token);
  }
});

test('buildSeedSql: shares of each expense sum to its amount', () => {
  const sql = buildSeedSql([owner('abcdef1234')], NOW);
  const shares = rows(sql, 'transaction_shares');
  const txs = rows(sql, 'transactions');
  for (const t of txs) {
    const mine = shares.filter((s) => s.transaction_id === t.id);
    if (t.type === 'payment') {
      assert.equal(mine.length, 0, t.id);
      assert.ok(t.to_id, t.id);
      continue;
    }
    assert.equal(t.split_mode, 'amounts');
    assert.equal(mine.reduce((a, s) => a + s.amount, 0), t.amount, t.description);
    for (const s of mine) assert.equal(s.input_value, s.amount);
    assert.equal(t.root_id, t.id);
    assert.equal(t.is_latest, 1);
  }
});

test('buildSeedSql: seeds every scenario S1–S18', () => {
  const o = 'abcdef1234';
  const sql = buildSeedSql([owner(o)], NOW);
  const trips = rows(sql, 'trips');
  const parts = rows(sql, 'participants');
  const txs = rows(sql, 'transactions');
  const links = rows(sql, 'person_links');
  const users = rows(sql, 'users');
  const pid = (tripName, name) => {
    const trip = trips.find((t) => t.name === tripName);
    return parts.find((p) => p.trip_id === trip.id && p.name === name)?.id;
  };
  const ledger = trips.find((t) => t.preset === 'direct' && t.organiser_user_id === o);
  const lp = (name) => parts.find((p) => p.trip_id === ledger.id && p.name === name);
  const tx = (desc) => txs.find((t) => t.description === desc);

  // S1: Lunch, confirmed payment, Taxi in order.
  const lunch = tx('Lunch');
  const taxi = txs.find((t) => t.description === 'Taxi' && t.trip_id === ledger.id);
  const s1pay = txs.find((t) => t.type === 'payment' && t.status === 'confirmed' && t.payer_id === lp('An').id);
  assert.ok(lunch && taxi && s1pay);
  assert.equal(s1pay.amount_confirmed, 120000);
  assert.ok(lunch.created_at < s1pay.created_at && s1pay.created_at < taxi.created_at);
  // S2, S3, S4, S5
  assert.ok(txs.find((t) => t.status === 'says_paid' && t.amount === 50000 && t.payer_id === lp('An').id));
  assert.equal(tx('Boat').status, 'disabled');
  assert.equal(tx('Coffee').payer_id, lp('An').id);
  assert.equal(tx('Dinner').payer_id, lp('Dũng').id);
  // S6: An (cũ) merged into An
  assert.ok(links.find((l) => l.participant_id === lp('An (cũ)').id && l.person_pid === lp('An').id && l.kind === 'merge'));
  assert.equal(tx('Snack').trip_id, ledger.id);
  // S7: Khoa's direct trip with the owner as participant
  const khoa = users.find((u) => u.name === 'Khoa');
  assert.equal(khoa.google_sub, `seed-khoa-${o.slice(0, 8)}`);
  const khoaLedger = trips.find((t) => t.preset === 'direct' && t.organiser_user_id === khoa.id);
  assert.ok(parts.find((p) => p.trip_id === khoaLedger.id && p.user_id === o));
  assert.equal(tx('Fuel').trip_id, khoaLedger.id);
  // S8: 25 Chi expenses
  const chiExpenses = txs.filter((t) => t.trip_id === ledger.id && t.payer_id !== lp('Chi').id && t.description.startsWith('Ăn vặt'));
  assert.equal(chiExpenses.length, 25);
  // S9: Hội An's An linked to ledger An
  assert.ok(links.find((l) => l.participant_id === pid('Hội An (seed)', 'An') && l.person_pid === lp('An').id && l.kind === 'merge'));
  assert.equal(tx('Lantern tour').trip_id, trips.find((t) => t.name === 'Hội An (seed)').id);
  // S10 + S11
  assert.equal(tx('Room').trip_id, trips.find((t) => t.name === 'Đà Lạt (seed)').id);
  const ice = tx('Ice cream');
  assert.equal(ice.status, 'pending');
  assert.equal(ice.created_by_participant_id, pid('Đà Lạt (seed)', 'Hà'));
  assert.equal(parts.find((p) => p.id === pid('Đà Lạt (seed)', 'Hà')).user_id, null);
  // S12, S13, S14, S15, S16
  assert.equal(tx('Villa').amount, 400000);
  assert.equal(tx('Kayak').trip_id, trips.find((t) => t.name === 'Nha Trang (seed)').id);
  assert.equal(trips.find((t) => t.name === 'Hội An (seed)').fewest_transfers, 0);
  assert.equal(tx('Lantern').payer_id, pid('Hội An (seed)', 'Dũng'));
  assert.equal(tx('Court').amount, 250600);
  assert.ok(txs.find((t) => t.type === 'payment' && t.status === 'confirmed' && t.payer_id === pid('Hội An (seed)', 'Giang')));
  // S17: Đà Lạt has a group token
  assert.ok(trips.find((t) => t.name === 'Đà Lạt (seed)').group_token.startsWith('seed-'));
  // S18: request token on ledger An that findRequest's TOKEN_RE accepts
  assert.match(lp('An').request_token, /^[A-Za-z0-9_-]{32,64}$/);
  // Owner is the admin participant of every group they own.
  for (const t of trips.filter((t) => t.organiser_user_id === o)) {
    assert.ok(parts.find((p) => p.trip_id === t.id && p.user_id === o && p.is_admin === 1), t.name);
  }
});

test('buildSeedSql: two owners get disjoint ids', () => {
  const sql = buildSeedSql([owner('aaaaaaaa-1111'), owner('bbbbbbbb-2222')], NOW);
  const ids = sql.map(parseInsert).filter((r) => r.row.id).map((r) => r.row.id);
  assert.equal(new Set(ids).size, ids.length);
  const tokens = rows(sql, 'trips').flatMap((t) => [t.group_token, t.view_token]);
  assert.equal(new Set(tokens).size, tokens.length);
  const a = ids.filter((id) => id.startsWith('seed-aaaaaaaa-'));
  const b = ids.filter((id) => id.startsWith('seed-bbbbbbbb-'));
  assert.equal(a.length + b.length, ids.length);
  assert.equal(a.length, b.length);
});

test('buildUserCopySql: copies only the target columns, never seed users', () => {
  const sql = buildUserCopySql(
    [{ id: 'u1', google_sub: 'g1', name: 'X', email: 'x', extra_col: 'nope', created_at: NOW }, { id: 'seed-x-khoa', name: 'Khoa', created_at: NOW }],
    ['id', 'google_sub', 'name', 'email', 'created_at'],
  );
  assert.equal(sql.length, 1);
  assert.ok(sql[0].startsWith('INSERT OR IGNORE INTO users (id, google_sub, name, email, created_at)'));
  assert.ok(!sql[0].includes('nope'));
});

test('localD1File and readUsers: finds the non-metadata sqlite and reads users with their ledger', () => {
  const apiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-local-'));
  try {
    assert.equal(localD1File(apiDir), null);
    const dir = path.join(apiDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'metadata.sqlite'), '');
    const file = path.join(dir, 'abc.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE users (id text, name text, google_sub text);
      CREATE TABLE trips (id text, preset text, organiser_user_id text);
      CREATE TABLE participants (id text, trip_id text, user_id text, sort_order integer);
      INSERT INTO users VALUES ('u1', 'A', 'g1'), ('u2', 'B', 'g2');
      INSERT INTO trips VALUES ('t1', 'direct', 'u1'), ('t2', 'trip', 'u2');
      INSERT INTO participants VALUES ('p1', 't1', 'u1', 0);`);
    db.close();
    assert.equal(localD1File(apiDir), file);
    const users = readUsers(file);
    assert.equal(users.length, 2);
    const u1 = users.find((u) => u.id === 'u1');
    assert.equal(u1.ledgerTripId, 't1');
    assert.equal(u1.ledgerOwnerPid, 'p1');
    assert.equal(users.find((u) => u.id === 'u2').ledgerTripId, undefined);
  } finally {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
});

test('buildAttendanceSeedSql: seeds Cầu lông CN (seed) with 7 planned->billed sessions and 7 members', () => {
  const sql = buildAttendanceSeedSql([owner('abcdef1234')], NOW);
  const trips = rows(sql, 'trips');
  const parts = rows(sql, 'participants');
  const txs = rows(sql, 'transactions');
  const shares = rows(sql, 'transaction_shares');

  assert.equal(trips.length, 1);
  assert.equal(trips[0].name, 'Cầu lông CN (seed)');
  assert.equal(trips[0].preset, 'sport');
  assert.equal(parts.length, 7);
  assert.equal(txs.length, 14);
  assert.equal(txs.filter((t) => t.is_latest === 0).length, 7);
  assert.equal(txs.filter((t) => t.is_latest === 1).length, 7);
  for (const head of txs.filter((t) => t.is_latest === 1)) {
    const headShares = shares.filter((s) => s.transaction_id === head.id);
    assert.equal(headShares.reduce((a, s) => a + s.amount, 0), head.amount);
  }
});

test('buildPersonalSeedSql: turns the area on, pairs transfers, skips future dates, bumps the sync epoch', () => {
  const sql = buildPersonalSeedSql([owner('abcdef1234')], NOW);
  assert.match(sql[0], /^INSERT INTO user_personal_settings .* ON CONFLICT\(user_id\) DO UPDATE SET enabled = 1/);
  assert.match(sql.at(-1), /^INSERT INTO personal_sync_state .* epoch = epoch \+ 1/);

  const entries = rows(sql, 'personal_transactions');
  assert.ok(entries.length > 500, `expected a multi-page download, got ${entries.length}`);
  assert.ok(entries.every((e) => e.id.startsWith('seed-abcdef12-p-')));
  assert.ok(entries.every((e) => e.date <= '2026-11-12'));
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);

  const byTransfer = Map.groupBy(entries.filter((e) => e.transfer_id), (e) => e.transfer_id);
  for (const pair of byTransfer.values()) {
    assert.deepEqual(pair.map((e) => e.type).sort(), ['transfer_in', 'transfer_out']);
  }
  // Three empty months in a row (8–10 months back), and one entry far back for all-time search.
  const months = new Set(entries.map((e) => e.date.slice(0, 7)));
  for (const m of ['2026-01', '2026-02', '2026-03']) assert.ok(!months.has(m), `${m} should be empty`);
  assert.ok(entries.some((e) => e.note === 'Mua laptop cũ' && e.date < '2025-01-01'));

  // Same rows on a re-run.
  assert.deepEqual(buildPersonalSeedSql([owner('abcdef1234')], NOW), sql);
});
