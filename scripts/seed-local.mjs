#!/usr/bin/env node
// Seeds this checkout's local D1 with one mock fixture per person-history scenario (S1–S18 in
// docs/manual-testing/person-history.md), for every signed-in user ("owner").
//
//   npm run seed:local                 seed (idempotent: INSERT OR IGNORE, ids seed-<owner8>-...)
//   npm run seed:local -- --reset      delete every seed-% row first, then seed
//   npm run seed:local -- --dry-run    print the SQL (copied account rows redacted), change nothing
//   node scripts/seed-local.mjs --from <checkout>   copy users from that checkout's local D1
//                                                   when this one has none yet
//
// Only ever touches the local D1 (`wrangler d1 execute --local`). Sessions and devices are never copied.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DAY = 86400000;
export const CHECKLIST = 'docs/manual-testing/person-history.md';
const SQL_FILE = '.wrangler/seed-local.sql';

/** The non-metadata `*.sqlite` of the local D1 under `<apiDir>/.wrangler`, or null. */
export function localD1File(apiDir) {
  const dir = path.join(apiDir, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find((n) => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
  return file ? path.join(dir, file) : null;
}

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/**
 * Every row of `users`, each with `ledgerTripId` / `ledgerOwnerPid` when the user already has a
 * `direct` ledger in this database. Opened read-only.
 */
export function readUsers(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    if (!hasTable(db, 'users')) return [];
    const users = db.prepare('SELECT * FROM users').all().map((u) => ({ ...u }));
    if (!hasTable(db, 'trips') || !hasTable(db, 'participants')) return users;
    const ledger = db.prepare("SELECT id FROM trips WHERE preset = 'direct' AND organiser_user_id = ? LIMIT 1");
    const me = db.prepare('SELECT id FROM participants WHERE trip_id = ? AND user_id = ? ORDER BY sort_order LIMIT 1');
    for (const u of users) {
      const t = ledger.get(u.id);
      if (!t) continue;
      u.ledgerTripId = t.id;
      const p = me.get(t.id, u.id);
      if (p) u.ledgerOwnerPid = p.id;
    }
    return users;
  } finally {
    db.close();
  }
}

function tableColumns(sqlitePath, table) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } finally {
    db.close();
  }
}

function tableNames(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  } finally {
    db.close();
  }
}

export function seedCounts(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const count = (sql) => db.prepare(sql).get().c;
    return {
      trips: count("SELECT count(*) c FROM trips WHERE id LIKE 'seed-%'"),
      participants: count("SELECT count(*) c FROM participants WHERE id LIKE 'seed-%'"),
      transactions: count("SELECT count(*) c FROM transactions WHERE id LIKE 'seed-%'"),
      shares: count("SELECT count(*) c FROM transaction_shares WHERE transaction_id LIKE 'seed-%'"),
      person_links: count("SELECT count(*) c FROM person_links WHERE participant_id LIKE 'seed-%'"),
      users: count("SELECT count(*) c FROM users WHERE id LIKE 'seed-%'"),
      ...(hasTable(db, 'personal_transactions')
        ? { personal_entries: count("SELECT count(*) c FROM personal_transactions WHERE id LIKE 'seed-%'") }
        : {}),
    };
  } finally {
    db.close();
  }
}

const normalizeName = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replaceAll("'", "''")}'`;
}

function insert(table, row) {
  const cols = Object.keys(row);
  return `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => lit(row[c])).join(', ')});`;
}

/** `INSERT OR IGNORE` rows for real users, limited to the columns the target `users` table has. */
export function buildUserCopySql(users, targetColumns) {
  const cols = new Set(targetColumns);
  return users
    .filter((u) => !String(u.id).startsWith('seed-'))
    .map((u) => insert('users', Object.fromEntries(Object.entries(u).filter(([k]) => cols.has(k)))));
}

/** A short, id-safe tag for an owner: the first 8 alphanumerics of their user id. */
export function ownerTag(ownerId) {
  return String(ownerId).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
}

/** The seeded ids an owner's checklist needs (S16 URL, S17 group link, S18 token). */
export function seedRefs(ownerId) {
  const o = ownerTag(ownerId);
  return {
    hoianTripId: `seed-${o}-hoian`,
    giangPid: `seed-${o}-hoian-giang`,
    dalatGroupToken: `seed-${o}-dalat-g`,
    requestToken: `seed-r-${o}-an`.padEnd(32, '0'),
    attClubTripId: `seed-${o}-att-club`,
  };
}

/**
 * Pure: the SQL that seeds scenarios S1–S18 for each owner. Every statement is `INSERT OR IGNORE`
 * and every id starts with `seed-<owner8>-`, so running it twice adds nothing.
 */
export function buildSeedSql(owners, now) {
  const end = Date.parse(now);
  const start = end - 30 * DAY;
  const setup = new Date(start - DAY).toISOString();
  const out = [];

  for (const owner of owners) {
    const o = ownerTag(owner.id);
    const id = (s) => `seed-${o}-${s}`;
    const ownerName = (owner.name || 'Me').trim().slice(0, 40) || 'Me';
    const refs = seedRefs(owner.id);

    const trip = (slug, name, extra = {}) => {
      out.push(insert('trips', {
        id: id(slug), name, preset: 'trip', currency: 'VND', fewest_transfers: 0, round_transfers: 0,
        default_lang: 'vi', organiser_user_id: owner.id, group_token: id(`${slug}-g`), view_token: id(`${slug}-v`),
        version: 1, created_at: setup, ...extra,
      }));
      return id(slug);
    };
    let order = 0;
    const person = (pid, tripId, name, extra = {}) => {
      out.push(insert('participants', {
        id: pid, trip_id: tripId, name, normalized_name: normalizeName(name), user_id: null, is_admin: 0,
        status: 'active', sort_order: order++, created_at: setup, ...extra,
      }));
      return pid;
    };
    const link = (participantId, personPid) =>
      out.push(insert('person_links', { owner_user_id: owner.id, participant_id: participantId, person_pid: personPid, kind: 'merge', created_at: setup }));

    // --- Owner's personal ledger (reuse the real one when it exists).
    let ledger = owner.ledgerTripId;
    let me = owner.ledgerOwnerPid;
    if (!ledger) {
      ledger = trip('ledger', ownerName, { preset: 'direct' });
    }
    if (!me) {
      me = person(id('l-me'), ledger, ownerName, { user_id: owner.id, is_admin: 1 });
    }
    const an = person(id('l-an'), ledger, 'An', { request_token: refs.requestToken });
    const anCu = person(id('l-ancu'), ledger, 'An (cũ)');
    const dung = person(id('l-dung'), ledger, 'Dũng');
    const chi = person(id('l-chi'), ledger, 'Chi');
    link(anCu, an); // S6

    // --- Mock account Khoa with his own ledger holding the owner (S7).
    const khoaId = id('khoa');
    out.push(insert('users', { id: khoaId, google_sub: `seed-khoa-${o}`, name: 'Khoa', custom_profile: 0, created_at: setup }));
    const khoaLedger = trip('khoa-ledger', 'Khoa', { preset: 'direct', organiser_user_id: khoaId });
    const kKhoa = person(id('k-khoa'), khoaLedger, 'Khoa', { user_id: khoaId, is_admin: 1 });
    const kMe = person(id('k-me'), khoaLedger, ownerName, { user_id: owner.id });

    // --- Groups. The owner is each group's admin participant.
    const group = (slug, name, members, extra = {}) => {
      const tripId = trip(slug, name, extra);
      const pids = { me: person(id(`${slug}-me`), tripId, ownerName, { user_id: owner.id, is_admin: 1 }) };
      for (const [key, label] of members) pids[key] = person(id(`${slug}-${key}`), tripId, label);
      return { tripId, ...pids };
    };
    const hoian = group('hoian', 'Hội An (seed)', [['dung', 'Dũng'], ['an', 'An'], ['giang', 'Giang']]);
    link(hoian.an, an); // S9
    const dalat = group('dalat', 'Đà Lạt (seed)', [['an', 'An'], ['binh', 'Bình'], ['minh', 'Minh'], ['ha', 'Hà']], { fewest_transfers: 1 });
    const phuquoc = group('phuquoc', 'Phú Quốc (seed)', [['binh', 'Bình'], ['minh', 'Minh'], ['chi', 'Chi']], { fewest_transfers: 1 });
    const nhatrang = group('nhatrang', 'Nha Trang (seed)', [['binh', 'Bình'], ['minh', 'Minh']], { fewest_transfers: 1 });
    const caulong = group('caulong', 'Cầu lông T5 (seed)', [['chi', 'Chi']], { preset: 'sport', round_transfers: 1 });

    // --- Money, in scenario order.
    const events = [];
    const expense = (tripId, description, amount, payer, shares, extra = {}) =>
      events.push({ kind: 'expense', tripId, description, amount, payer, shares, ...extra });
    const payment = (tripId, from, to, amount, status) => events.push({ kind: 'payment', tripId, from, to, amount, status });

    expense(ledger, 'Lunch', 240000, me, [[me, 120000], [an, 120000]]); // S1
    payment(ledger, an, me, 120000, 'confirmed');
    expense(ledger, 'Taxi', 330000, me, [[me, 165000], [an, 165000]]);
    payment(ledger, an, me, 50000, 'says_paid'); // S2
    expense(ledger, 'Boat', 200000, me, [[me, 100000], [an, 100000]], { status: 'disabled' }); // S3
    expense(ledger, 'Coffee', 90000, an, [[me, 45000], [an, 45000]]); // S4
    expense(ledger, 'Dinner', 400000, dung, [[me, 200000], [dung, 200000]]); // S5
    expense(ledger, 'Snack', 60000, me, [[anCu, 60000]]); // S6
    expense(khoaLedger, 'Fuel', 100000, kKhoa, [[kMe, 100000]]); // S7
    for (let i = 0; i < 25; i++) { // S8
      expense(ledger, `Ăn vặt ${i + 1}`, (10 + ((i * 3) % 5) * 10) * 1000, me, [[chi, (10 + ((i * 3) % 5) * 10) * 1000]]);
    }
    expense(hoian.tripId, 'Lantern tour', 100000, hoian.me, [[hoian.an, 100000]]); // S9
    expense(dalat.tripId, 'Room', 300000, dalat.me, [[dalat.binh, 300000]]); // S10
    expense(dalat.tripId, 'Bus', 90000, dalat.minh, [[dalat.me, 90000]]);
    expense(dalat.tripId, 'Ice cream', 100000, dalat.me, [[dalat.binh, 100000]], { status: 'pending', createdBy: dalat.ha }); // S11
    expense(phuquoc.tripId, 'Villa', 400000, phuquoc.me, [[phuquoc.binh, 400000]]); // S12
    expense(phuquoc.tripId, 'Lunch', 100000, phuquoc.minh, [[phuquoc.me, 100000]]);
    expense(phuquoc.tripId, 'Taxi', 100000, phuquoc.chi, [[phuquoc.me, 100000]]);
    expense(nhatrang.tripId, 'Kayak', 300000, nhatrang.me, [[nhatrang.minh, 300000]]); // S13
    expense(nhatrang.tripId, 'Bar', 300000, nhatrang.minh, [[nhatrang.binh, 300000]]);
    expense(hoian.tripId, 'Lantern', 400000, hoian.dung, [[hoian.me, 200000], [hoian.dung, 200000]]); // S14
    expense(caulong.tripId, 'Court', 250600, caulong.me, [[caulong.me, 125300], [caulong.chi, 125300]]); // S15
    expense(hoian.tripId, 'Tea', 80000, hoian.me, [[hoian.giang, 80000]]); // S16
    payment(hoian.tripId, hoian.giang, hoian.me, 80000, 'confirmed');

    const step = (end - start) / events.length;
    events.forEach((e, i) => {
      const txId = id(`t${String(i + 1).padStart(2, '0')}`);
      const createdAt = new Date(Math.round(start + (i + 0.5) * step)).toISOString();
      const base = {
        id: txId, root_id: txId, parent_id: null, is_latest: 1, trip_id: e.tripId, currency: 'VND',
        spent_on: createdAt.slice(0, 10), created_at: createdAt, updated_at: createdAt,
      };
      if (e.kind === 'payment') {
        out.push(insert('transactions', {
          ...base, type: 'payment', description: '', amount: e.amount,
          amount_confirmed: e.status === 'confirmed' ? e.amount : null,
          payer_id: e.from, to_id: e.to, split_mode: 'equal', status: e.status,
          created_by_participant_id: e.from, confirmed_by_participant_id: e.status === 'confirmed' ? e.to : null,
        }));
        return;
      }
      const status = e.status ?? 'approved';
      out.push(insert('transactions', {
        ...base, type: 'expense', description: e.description, amount: e.amount, amount_confirmed: null,
        payer_id: e.payer, to_id: null, split_mode: 'amounts', status,
        disabled_by_user_id: status === 'disabled' ? owner.id : null,
        created_by_participant_id: e.createdBy ?? e.payer, confirmed_by_participant_id: null,
      }));
      for (const [pid, amount] of e.shares) {
        out.push(insert('transaction_shares', { transaction_id: txId, participant_id: pid, input_value: amount, input_auto: 0, amount }));
      }
    });
  }
  return out;
}

/**
 * Pure: builds SQL for "Cầu lông CN (seed)" with 7 planned->billed sessions per real owner,
 * covering regular, rare, flaky, topGuest, back, new, and wantedStamp.
 */
export function buildAttendanceSeedSql(owners, now) {
  const end = Date.parse(now);
  const setup = new Date(end - 50 * DAY).toISOString();
  const out = [];

  for (const owner of owners) {
    const o = ownerTag(owner.id);
    const id = (s) => `seed-${o}-att-${s}`;
    const ownerName = (owner.name || 'Me').trim().slice(0, 40) || 'Me';
    const tripId = id('club');

    out.push(insert('trips', {
      id: tripId, name: 'Cầu lông CN (seed)', preset: 'sport', currency: 'VND',
      fewest_transfers: 0, round_transfers: 1, default_lang: 'vi', organiser_user_id: owner.id,
      group_token: id('g'), view_token: id('v'), version: 1, created_at: setup,
    }));

    let order = 0;
    const person = (slug, name, extra = {}) => {
      const pid = id(slug);
      out.push(insert('participants', {
        id: pid, trip_id: tripId, name, normalized_name: normalizeName(name), user_id: null,
        is_admin: 0, status: 'active', sort_order: order++, created_at: setup, ...extra,
      }));
      return pid;
    };

    const me = person('me', ownerName, { user_id: owner.id, is_admin: 1 });
    const an = person('an', 'An');
    const binh = person('binh', 'Bình');
    const chi = person('chi', 'Chi');
    const dung = person('dung', 'Dũng');
    const ha = person('ha', 'Hà');
    const giang = person('giang', 'Giang');

    const sessions = [
      [[me, an, binh, chi, ha], [[me, 1], [an, 1], [binh, 1], [chi, 1], [dung, 1], [ha, 1]]],
      [[me, an, binh, chi, ha], [[me, 1], [an, 1], [binh, 1], [chi, 1]]],
      [[me, an, binh, chi, ha], [[me, 1], [an, 1], [chi, 1], [ha, 1]]],
      [[me, an, binh, chi, ha], [[me, 1], [an, 1], [chi, 1]]],
      [[me, an, binh, chi, ha], [[me, 1], [an, 2], [ha, 1]]],
      [[me, an, binh, chi, ha, giang], [[me, 1], [an, 3], [giang, 1]]],
      [[me, an, binh, chi, ha, giang], [[me, 1], [an, 2], [chi, 1], [dung, 1], [ha, 1], [giang, 1]]],
    ];

    const slotRate = 100000;
    sessions.forEach(([planIds, billEntries], idx) => {
      const n = idx + 1;
      const daysAgo = (sessions.length - idx) * 7 - 6;
      const planAt = new Date(end - (daysAgo + 2) * DAY).toISOString();
      const billAt = new Date(end - daysAgo * DAY).toISOString();
      const spentOn = billAt.slice(0, 10);
      const rootId = id(`s${n}-p`);
      const billId = id(`s${n}-b`);

      const planMeta = JSON.stringify({
        sport: {
          planning: true,
          court: slotRate * planIds.length,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: planIds.map((pid) => ({ participantId: pid, maleSlots: 1, femaleSlots: 0 })),
          maleSlotRate: 0,
          femaleSlotRate: 0,
        },
      });

      out.push(insert('transactions', {
        id: rootId, root_id: rootId, parent_id: null, is_latest: 0, trip_id: tripId, type: 'expense',
        description: `Buổi ${n} (Chủ nhật)`, amount: 0, amount_confirmed: null, currency: 'VND',
        payer_id: me, to_id: null, split_mode: 'amounts', status: 'approved', spent_on: spentOn,
        meta_json: planMeta, created_by_participant_id: me, created_at: planAt, updated_at: planAt,
      }));

      const totalSlots = billEntries.reduce((sum, [, slots]) => sum + slots, 0);
      const totalAmount = slotRate * totalSlots;
      const billMeta = JSON.stringify({
        sport: {
          planning: false,
          court: totalAmount,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: billEntries.map(([pid, slots]) => ({ participantId: pid, maleSlots: slots, femaleSlots: 0 })),
          maleSlotRate: slotRate,
          femaleSlotRate: 0,
        },
      });

      out.push(insert('transactions', {
        id: billId, root_id: rootId, parent_id: rootId, is_latest: 1, trip_id: tripId, type: 'expense',
        description: `Buổi ${n} (Chủ nhật)`, amount: totalAmount, amount_confirmed: null, currency: 'VND',
        payer_id: me, to_id: null, split_mode: 'amounts', status: 'approved', spent_on: spentOn,
        meta_json: billMeta, created_by_participant_id: me, created_at: billAt, updated_at: billAt,
      }));

      for (const [pid, slots] of billEntries) {
        const share = slotRate * slots;
        out.push(insert('transaction_shares', {
          transaction_id: billId, participant_id: pid, input_value: share, input_auto: 0, amount: share,
        }));
      }
    });
  }

  return out;
}

// Starter category keys (apps/api/src/personal/starterCategories.ts). The server creates them
// lazily as `<userId>:<key>`; the seed creates the same rows so either side can go first.
const STARTER_CATEGORIES = [
  ['food', null, 'expense', 'Ăn uống', 'utensils', 0],
  ['transport', null, 'expense', 'Di chuyển', 'bus', 1],
  ['shopping', null, 'expense', 'Mua sắm', 'shopping-bag', 2],
  ['bills', null, 'expense', 'Hóa đơn', 'receipt', 3],
  ['health', null, 'expense', 'Sức khỏe', 'heart-pulse', 4],
  ['invest', null, 'expense', 'Đầu tư', 'trending-up', 5],
  ['tax', null, 'expense', 'Thuế', 'landmark', 6],
  ['fee', null, 'expense', 'Phí', 'badge-percent', 7],
  ['invest-stock', 'invest', 'expense', 'Cổ phiếu', 'candlestick-chart', 0],
  ['invest-crypto', 'invest', 'expense', 'Crypto', 'coins', 1],
  ['invest-etf', 'invest', 'expense', 'ETF', 'pie-chart', 2],
  ['invest-gold', 'invest', 'expense', 'Vàng', 'gem', 3],
  ['salary', null, 'income', 'Lương', 'wallet', 0],
  ['interest', null, 'income', 'Lãi', 'piggy-bank', 1],
  ['dividend', null, 'income', 'Cổ tức', 'coins', 2],
  ['other-income', null, 'income', 'Thu nhập khác', 'gift', 3],
];

/** A raw SQL expression for `insert()` values (a sub-select), never user data. */
const raw = (sql) => ({ raw: sql });

function personalLit(v) {
  return v && typeof v === 'object' && 'raw' in v ? v.raw : lit(v);
}

function personalInsert(table, row) {
  const cols = Object.keys(row);
  return `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => personalLit(row[c])).join(', ')});`;
}

/** Deterministic 0..1 numbers so a re-seed builds the same rows. */
function rng(seedText) {
  let a = [...seedText].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pure: Sổ chi tiêu fixtures for /transactions search and date picks (#133 / PR #139), per owner.
 * Turns the personal area on, adds 4 wallets (one archived), a custom sub-category, 6 tags,
 * 3 assets and ~18 months of entries (with 3 empty months 8–10 months back and one entry 26
 * months back), then bumps the owner's sync epoch so every browser copy downloads afresh.
 */
export function buildPersonalSeedSql(owners, now) {
  const VN = 7 * 3600000;
  const todayMs = Date.parse(now) + VN;
  const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = dayStr(todayMs);
  const out = [];

  for (const owner of owners) {
    const o = ownerTag(owner.id);
    const uid = owner.id;
    const pid = (s) => `seed-${o}-p-${s}`;
    const rand = rng(o);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const between = (lo, hi, stepK = 1000) => Math.round((lo + rand() * (hi - lo)) / stepK) * stepK;
    const setup = new Date(todayMs - 800 * DAY).toISOString();
    const nowIso = new Date(Date.parse(now)).toISOString();

    out.push(`INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (${lit(uid)}, 1, ${lit(nowIso)}) ON CONFLICT(user_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at;`);

    // --- Categories: starters (same ids as the server makes) + one seeded sub-category.
    const cat = (key) => `${uid}:${key}`;
    for (const [key, parent, type, name, icon, sort] of STARTER_CATEGORIES) {
      out.push(personalInsert('personal_categories', {
        id: cat(key), user_id: uid, parent_id: parent ? cat(parent) : null, type, name, icon, hidden: 0,
        sort_order: sort, created_at: setup, updated_at: setup,
      }));
    }
    const coffeeCat = pid('cat-coffee');
    out.push(personalInsert('personal_categories', {
      id: coffeeCat, user_id: uid, parent_id: cat('food'), type: 'expense', name: 'Cà phê', icon: 'coffee',
      hidden: 0, sort_order: 0, created_at: setup, updated_at: setup,
    }));

    // --- Wallets. The cash wallet becomes the default only when the owner has none.
    const startDate = dayStr(todayMs - 800 * DAY);
    const wallet = (slug, name, startAmount, kind, sort, extra = {}) => {
      const wid = pid(`w-${slug}`);
      out.push(personalInsert('personal_wallets', {
        id: wid, user_id: uid, name, currency: 'VND', start_amount: startAmount, start_date: startDate,
        is_default: 0, created_at: setup, updated_at: setup,
      }));
      out.push(personalInsert('personal_wallet_settings', {
        wallet_id: wid, user_id: uid, kind, start_cost_vnd: null, icon: null, sort_order: sort,
        archived_at: extra.archivedAt ?? null, updated_at: setup,
      }));
      return wid;
    };
    const cash = wallet('cash', 'Tiền mặt (seed)', 2000000, 'everyday', 100);
    const bank = wallet('bank', 'Techcombank (seed)', 30000000, 'everyday', 101);
    const invest = wallet('invest', 'Ví đầu tư (seed)', 0, 'investment', 102);
    const momo = wallet('momo', 'MoMo cũ (seed)', 500000, 'everyday', 103, { archivedAt: new Date(todayMs - 330 * DAY).toISOString() });
    out.push(`UPDATE personal_wallets SET is_default = 1 WHERE id = ${lit(cash)} AND NOT EXISTS (SELECT 1 FROM personal_wallets WHERE user_id = ${lit(uid)} AND is_default = 1);`);

    // --- Tags and assets: linked by name, so an owner's own same-named tag/asset is reused.
    for (const name of ['congtac', 'giadinh', 'dulich-dalat', 'Tết', 'sinhnhat', 'hoàn-tiền']) {
      out.push(personalInsert('personal_tags', { id: pid(`tag-${normalizeName(name)}`), user_id: uid, name, created_at: setup }));
    }
    const assets = [['btc', 'BTC', 'BTC', 'Crypto', 8], ['fpt', 'FPT', 'cp', 'Cổ phiếu', 0], ['sjc', 'Vàng SJC', 'chỉ', 'Vàng', 1]];
    assets.forEach(([slug, name, unit, group, decimals], i) => out.push(personalInsert('personal_assets', {
      id: pid(`a-${slug}`), user_id: uid, name, unit, group_name: group, decimals, hidden: 0, sort_order: 100 + i,
      created_at: setup, updated_at: setup,
    })));
    const assetRef = (name) => raw(`(SELECT id FROM personal_assets WHERE user_id = ${lit(uid)} AND lower(name) = lower(${lit(name)}))`);

    // --- Entries.
    let n = 0;
    const entry = (date, type, walletId, amount, fields = {}) => {
      if (date > today) return null;
      const id = pid(`e${String(++n).padStart(4, '0')}`);
      const time = fields.time ?? null;
      const rawMs = Date.parse(`${date}T${time ?? '12:00'}:00.000Z`) - VN;
      const stamp = new Date(Math.min(rawMs, Date.parse(now))).toISOString();
      out.push(personalInsert('personal_transactions', {
        id, user_id: uid, wallet_id: walletId, type, amount, category_id: fields.category ?? null,
        transfer_id: fields.transferId ?? null, asset_id: fields.asset ?? null, quantity: fields.quantity ?? null,
        date, time, note: fields.note ?? null, exclude_from_reports: fields.exclude ? 1 : 0, source: 'manual',
        external_ref: null, created_at: stamp, updated_at: stamp, sync_version: 0,
      }));
      for (const tag of fields.tags ?? []) {
        out.push(`INSERT OR IGNORE INTO personal_transaction_tags (transaction_id, tag_id) SELECT ${lit(id)}, id FROM personal_tags WHERE user_id = ${lit(uid)} AND lower(name) = lower(${lit(tag)});`);
      }
      return id;
    };
    const transfer = (date, from, to, amount, note) => {
      if (date > today) return;
      const tid = pid(`x${String(n + 1).padStart(4, '0')}`);
      entry(date, 'transfer_out', from, amount, { transferId: tid, note, exclude: true });
      entry(date, 'transfer_in', to, amount, { transferId: tid, note, exclude: true });
    };
    const time = () => `${String(7 + Math.floor(rand() * 15)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`;

    const coffees = ['Cà phê sữa đá', 'Cà phê muối', 'Bạc xỉu', 'Cà phê đen Highlands', null];
    const meals = ['Phở bò', 'Bún chả Hà Nội', 'Cơm tấm sườn', 'Bánh mì', 'Bún bò Huế', 'Lẩu với bạn'];
    const rides = ['Grab đi làm', 'Grab về nhà', 'Đổ xăng', 'Gửi xe'];
    const shops = ['Shopee: áo khoác', 'Tiki: sách', 'Giày chạy bộ', 'Đồ gia dụng'];

    const base = new Date(todayMs);
    for (let back = 17; back >= 0; back--) {
      if (back >= 8 && back <= 10) continue; // three empty months in a row
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth() - back;
      const first = Date.UTC(y, m, 1);
      const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const on = (d) => dayStr(first + (Math.min(d, daysIn) - 1) * DAY);
      const label = `${new Date(first).getUTCMonth() + 1}/${new Date(first).getUTCFullYear()}`;
      const isTet = new Date(first).getUTCMonth() === 1; // February

      entry(on(1), 'expense', bank, 6500000, { category: cat('bills'), note: 'Tiền nhà', tags: ['giadinh'] });
      entry(on(5), 'income', bank, 25000000, { category: cat('salary'), note: `Lương tháng ${label}`, time: '09:00' });
      entry(on(10), 'expense', bank, between(500000, 1200000), { category: cat('bills'), note: 'Tiền điện', tags: ['giadinh'] });
      entry(on(12), 'expense', bank, 220000, { category: cat('bills'), note: 'Internet FPT' });
      entry(on(28), 'income', bank, between(80000, 150000), { category: cat('interest'), note: 'Lãi tiết kiệm' });
      transfer(on(6), bank, cash, 3000000, 'Rút tiền mặt');
      transfer(on(7), bank, invest, 5000000, 'Nạp ví đầu tư');
      entry(on(8), 'buy', invest, 2000000, { asset: assetRef('BTC'), quantity: between(80000, 160000, 1), note: 'Mua BTC định kỳ' });
      entry(on(9), 'buy', invest, between(2400000, 2800000, 10000), { asset: assetRef('FPT'), quantity: 20, note: 'Mua FPT' });
      for (let i = 0; i < 12; i++) {
        entry(on(1 + Math.floor(rand() * daysIn)), 'expense', cash, between(25000, 65000), { category: coffeeCat, note: pick(coffees), time: time() });
      }
      for (let i = 0; i < 7; i++) {
        entry(on(1 + Math.floor(rand() * daysIn)), 'expense', pick([cash, bank]), between(35000, 450000), { category: cat('food'), note: pick(meals), time: time(), tags: rand() < 0.2 ? ['congtac'] : [] });
      }
      for (let i = 0; i < 5; i++) {
        entry(on(1 + Math.floor(rand() * daysIn)), 'expense', cash, between(20000, 120000), { category: cat('transport'), note: pick(rides) });
      }
      entry(on(15 + Math.floor(rand() * 10)), 'expense', bank, between(300000, 1500000), { category: cat('shopping'), note: pick(shops) });
      if (isTet) {
        entry(on(8), 'expense', cash, 5000000, { category: cat('shopping'), note: 'Lì xì Tết', tags: ['Tết', 'giadinh'] });
        entry(on(9), 'expense', bank, 2500000, { category: cat('shopping'), note: 'Đồ cúng Tết', tags: ['Tết'] });
        entry(on(10), 'income', cash, 2000000, { category: cat('other-income'), note: 'Tiền mừng tuổi', tags: ['Tết'] });
      }
      if (back >= 11 && back <= 15) { // the archived wallet's history
        entry(on(14), 'expense', momo, between(50000, 200000), { category: cat('bills'), note: 'Nạp điện thoại MoMo' });
        entry(on(18), 'expense', momo, between(30000, 90000), { category: coffeeCat, note: 'Cà phê qua MoMo' });
      }
    }

    // A trip two months back, a birthday, a lent amount kept out of reports, a sale, a refund.
    const ago = (days) => dayStr(todayMs - days * DAY);
    for (const [d, note, amount, category] of [[62, 'Vé xe Đà Lạt', 600000, 'transport'], [61, 'Homestay Đà Lạt', 1800000, 'bills'], [61, 'Bánh tráng nướng', 60000, 'food'], [60, 'Dâu tây Đà Lạt', 150000, 'food'], [59, 'Cà phê Túi Mơ To', 90000, 'food']]) {
      entry(ago(d), 'expense', cash, amount, { category: cat(category), note, tags: ['dulich-dalat'] });
    }
    entry(ago(45), 'expense', bank, 850000, { category: cat('shopping'), note: 'Quà sinh nhật mẹ', tags: ['sinhnhat', 'giadinh'] });
    entry(ago(33), 'expense', bank, 3000000, { note: 'Cho Minh mượn', exclude: true });
    entry(ago(95), 'sell', invest, 3200000, { asset: assetRef('FPT'), quantity: 25, note: 'Bán FPT chốt lời' });
    entry(ago(120), 'buy', invest, 8500000, { asset: assetRef('Vàng SJC'), quantity: 10, note: 'Mua 1 chỉ vàng' });
    entry(ago(18), 'income', bank, 250000, { category: cat('other-income'), note: 'Hoàn tiền Shopee', tags: ['hoàn-tiền'] });
    entry(ago(790), 'expense', bank, 12000000, { category: cat('shopping'), note: 'Mua laptop cũ' });

    // One entry on every quick-pick boundary: today, yesterday, this/last week, last 30 days.
    entry(ago(0), 'expense', cash, 45000, { category: coffeeCat, note: 'Cà phê sáng nay', time: '07:45' });
    entry(ago(0), 'expense', cash, 55000, { category: cat('food'), note: 'Bún chả trưa nay', time: '12:10', tags: ['congtac'] });
    entry(ago(1), 'expense', bank, 320000, { category: cat('health'), note: 'Thuốc cảm', time: '20:30' });
    entry(ago(7), 'expense', cash, 150000, { category: cat('food'), note: 'Ăn tối tuần trước', tags: ['congtac'] });
    entry(ago(29), 'expense', bank, 499000, { category: cat('fee'), note: 'Phí thường niên thẻ' });

    // Every browser copy downloads afresh (new epoch) on its next sync.
    out.push(`INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (${lit(uid)}, 1, 1, 0, ${lit(nowIso)}) ON CONFLICT(user_id) DO UPDATE SET version = version + 1, epoch = epoch + 1, updated_at = excluded.updated_at;`);
  }
  return out;
}

// Rows that hang off seeded trips or mock users; deleted by --reset when the table exists.
const RESET_SQL = [
  ['personal_group_link_tags', "DELETE FROM personal_group_link_tags WHERE tag_id LIKE 'seed-%';"],
  ['personal_group_links', "UPDATE personal_group_links SET wallet_id = NULL WHERE wallet_id LIKE 'seed-%';"],
  ['personal_group_links', "UPDATE personal_group_links SET category_id = NULL WHERE category_id LIKE 'seed-%';"],
  ['personal_balance_checks', "DELETE FROM personal_balance_checks WHERE wallet_id LIKE 'seed-%';"],
  ['personal_transaction_tags', "DELETE FROM personal_transaction_tags WHERE transaction_id LIKE 'seed-%' OR tag_id LIKE 'seed-%';"],
  ['personal_transactions', "DELETE FROM personal_transactions WHERE id LIKE 'seed-%' OR wallet_id LIKE 'seed-%';"],
  ['personal_tags', "DELETE FROM personal_tags WHERE id LIKE 'seed-%';"],
  ['personal_assets', "DELETE FROM personal_assets WHERE id LIKE 'seed-%';"],
  ['personal_categories', "DELETE FROM personal_categories WHERE id LIKE 'seed-%';"],
  ['personal_wallet_settings', "DELETE FROM personal_wallet_settings WHERE wallet_id LIKE 'seed-%';"],
  ['personal_wallets', "DELETE FROM personal_wallets WHERE id LIKE 'seed-%';"],
  ['attendance_scores', "DELETE FROM attendance_scores WHERE trip_id LIKE 'seed-%';"],
  ['attendance_counted', "DELETE FROM attendance_counted WHERE trip_id LIKE 'seed-%';"],
  ['attendance_state', "DELETE FROM attendance_state WHERE trip_id LIKE 'seed-%';"],
  ['transaction_shares', "DELETE FROM transaction_shares WHERE transaction_id LIKE 'seed-%' OR participant_id LIKE 'seed-%';"],
  ['transactions', "DELETE FROM transactions WHERE id LIKE 'seed-%' OR trip_id LIKE 'seed-%';"],
  ['person_links', "DELETE FROM person_links WHERE participant_id LIKE 'seed-%' OR person_pid LIKE 'seed-%';"],
  ['notification_logs', "DELETE FROM notification_logs WHERE trip_id LIKE 'seed-%' OR user_id LIKE 'seed-%';"],
  ['user_notification_settings', "DELETE FROM user_notification_settings WHERE user_id LIKE 'seed-%';"],
  ['trip_views', "DELETE FROM trip_views WHERE trip_id LIKE 'seed-%';"],
  ['activity', "DELETE FROM activity WHERE trip_id LIKE 'seed-%';"],
  ['device_participants', "DELETE FROM device_participants WHERE trip_id LIKE 'seed-%';"],
  ['device_expense_grants', "DELETE FROM device_expense_grants WHERE trip_id LIKE 'seed-%';"],
  ['payment_refs', "DELETE FROM payment_refs WHERE trip_id LIKE 'seed-%';"],
  ['membership_requests', "DELETE FROM membership_requests WHERE trip_id LIKE 'seed-%';"],
  ['merge_proposals', "DELETE FROM merge_proposals WHERE trip_id LIKE 'seed-%';"],
  ['player_ratings', "DELETE FROM player_ratings WHERE trip_id LIKE 'seed-%';"],
  ['trip_locations', "DELETE FROM trip_locations WHERE trip_id LIKE 'seed-%';"],
  ['zalo_chat_links', "DELETE FROM zalo_chat_links WHERE trip_id LIKE 'seed-%';"],
  ['participants', "DELETE FROM participants WHERE id LIKE 'seed-%' OR trip_id LIKE 'seed-%';"],
  ['trips', "DELETE FROM trips WHERE id LIKE 'seed-%';"],
  ['users', "DELETE FROM users WHERE id LIKE 'seed-%';"],
];

const short = (id) => String(id).slice(0, 8);

function parseArgs(argv) {
  const args = { from: null, reset: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from' && argv[i + 1]) args.from = argv[++i];
    else if (argv[i] === '--reset') args.reset = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const apiDir = path.join(root, 'apps', 'api');
  const target = localD1File(apiDir);
  if (!target) {
    console.error('No local D1 found. Apply migrations first: cd apps/api && CI=1 npx wrangler d1 migrations apply fsl --local');
    process.exit(1);
  }
  const tables = new Set(tableNames(target));
  if (!tables.has('users') || !tables.has('transactions')) {
    console.error('The local D1 has no schema yet. Apply migrations first: cd apps/api && CI=1 npx wrangler d1 migrations apply fsl --local');
    process.exit(1);
  }

  const isReal = (u) => !String(u.id).startsWith('seed-');
  let owners = readUsers(target).filter(isReal);
  let copySql = [];
  if (owners.length === 0 && args.from) {
    const sourceFile = localD1File(path.join(path.resolve(args.from), 'apps', 'api'));
    if (sourceFile && path.resolve(sourceFile).toLowerCase() !== path.resolve(target).toLowerCase()) {
      const copied = readUsers(sourceFile).filter(isReal).filter((u) => u.google_sub || u.zalo_sub);
      copySql = buildUserCopySql(copied, tableColumns(target, 'users'));
      // Their ledgers live in the source DB, not here: seed fresh ones.
      owners = copied.map(({ ledgerTripId, ledgerOwnerPid, ...u }) => u);
      console.log(`Copying ${copied.length} user(s) from the source checkout: ${copied.map((u) => short(u.id)).join(', ')}`);
    }
  }
  if (owners.length === 0) {
    console.log('Sign in once on the local app, then run `npm run seed:local`.');
    return;
  }
  if (args.reset) {
    // A ledger the seed created goes away with the reset, so seed a new one.
    owners = owners.map((u) => (String(u.ledgerTripId ?? '').startsWith('seed-') ? { ...u, ledgerTripId: undefined, ledgerOwnerPid: undefined } : u));
  }

  const now = new Date().toISOString();
  const resetSql = args.reset ? RESET_SQL.filter(([t]) => tables.has(t)).map(([, s]) => s) : [];
  const personalSql = tables.has('personal_sync_state') ? buildPersonalSeedSql(owners, now) : [];
  const seedSql = [...buildSeedSql(owners, now), ...buildAttendanceSeedSql(owners, now), ...personalSql];

  if (args.dryRun) {
    // Copied rows and owner names are real account data: never print them.
    const redact = (s) => owners.reduce((acc, u) => {
      const name = (u.name || 'Me').trim().slice(0, 40) || 'Me';
      return acc
        .replaceAll(lit(name), "'<owner>'")
        .replaceAll(lit(normalizeName(name)), "'<owner>'")
        .replaceAll(String(u.id), `${short(u.id)}…`);
    }, s);
    const shown = [...resetSql, ...copySql.map(() => '-- INSERT OR IGNORE INTO users (...) -- copied account row, redacted'), ...seedSql.map(redact)];
    console.log(shown.join('\n'));
    return;
  }

  const before = seedCounts(target);
  const sqlPath = path.join(apiDir, SQL_FILE);
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, [...resetSql, ...copySql, ...seedSql].join('\n') + '\n', 'utf8');
  let result;
  try {
    result = spawnSync(`npx wrangler d1 execute fsl --local --file=${SQL_FILE}`, {
      cwd: apiDir, shell: true, encoding: 'utf8', env: { ...process.env, CI: '1' },
    });
  } finally {
    // The file can hold copied account rows; it has done its job.
    fs.rmSync(sqlPath, { force: true });
  }
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    console.error('Failed to execute the seed SQL on the local D1.');
    process.exit(1);
  }
  const after = seedCounts(target);
  const fmt = (c) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`Seed rows before: ${fmt(before)}`);
  console.log(`Seed rows after:  ${fmt(after)}`);
  console.log(`Seeded ${owners.length} owner(s): ${owners.map((u) => short(u.id)).join(', ')}`);
  console.log(`Checklist: ${CHECKLIST}   Cheat sheet: docs/manual-testing/seed-cheat-sheet.md`);
  for (const u of owners) {
    const r = seedRefs(u.id);
    console.log(`  ${short(u.id)}: S16 /people/in/${r.hoianTripId}/${r.giangPid}   S17 /j/${r.dalatGroupToken}   S18 /r/${r.requestToken}`);
    console.log(`  ${short(u.id)}: Attendance /t/${r.attClubTripId}/expenses/new?mode=planning   Awards /t/${r.attClubTripId}/awards`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
