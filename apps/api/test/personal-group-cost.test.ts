import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  ListResponse,
  SyncResponse,
  WalletDetailView,
} from '@cc/core';
import { call, json, memberSid, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function countingEnv() {
  const counter = { queries: 0 };
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { env: { ...env, DB }, counter };
}

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

describe('personal group read-in cost and guards', () => {
  it('list, wallets and sync stay under 50 queries for a user in 60 groups', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);

    const insertTrip = env.DB.prepare(
      `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
       VALUES (?, ?, 'trip', 'VND', 1, 0, ?, ?, ?, 1, '2026-10-01T00:00:00.000Z')`,
    );
    const insertParticipant = env.DB.prepare(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, '2026-10-01T00:00:00.000Z')`,
    );
    const insertTx = env.DB.prepare(
      `INSERT INTO transactions (
        id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
        currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
        meta_json, created_at, updated_at
      ) VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?, 'VND', ?, ?, ?, 'equal', ?, ?, NULL, ?, ?)`,
    );
    const insertShare = env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)',
    );

    const stmts: D1PreparedStatement[] = [];
    for (let g = 0; g < 60; g++) {
      const tripId = `t-cost-${g}`;
      const pMe = `p-cost-me-${g}`;
      const pOther = `p-cost-other-${g}`;

      stmts.push(
        insertTrip.bind(tripId, `Nhóm ${g}`, U.minh, `gtok-cost-${g}`, `vtok-cost-${g}`),
        insertParticipant.bind(pMe, tripId, 'Minh', 'minh', U.minh, 0),
        insertParticipant.bind(pOther, tripId, 'Bạn', 'ban', null, 1),
      );

      for (let i = 0; i < 20; i++) {
        const expId = `e-cost-${g}-${i}`;
        const payer = i % 2 === 0 ? pMe : pOther;
        stmts.push(
          insertTx.bind(
            expId,
            expId,
            tripId,
            'expense',
            `Chi tiêu ${i}`,
            100_000,
            null,
            '2026-11-10',
            payer,
            null,
            'approved',
            pMe,
            '2026-11-10T10:00:00.000Z',
            '2026-11-10T10:00:00.000Z',
          ),
          insertShare.bind(expId, pMe, 50_000),
          insertShare.bind(expId, pOther, 50_000),
        );
      }

      for (let j = 0; j < 5; j++) {
        const payId = `pay-cost-${g}-${j}`;
        const from = j % 2 === 0 ? pMe : pOther;
        const to = j % 2 === 0 ? pOther : pMe;
        stmts.push(
          insertTx.bind(
            payId,
            payId,
            tripId,
            'payment',
            `Trả ${j}`,
            50_000,
            50_000,
            '2026-11-12',
            from,
            to,
            'confirmed',
            pMe,
            '2026-11-12T10:00:00.000Z',
            '2026-11-12T10:00:00.000Z',
          ),
        );
      }
    }

    const BATCH_CHUNK = 200;
    for (let i = 0; i < stmts.length; i += BATCH_CHUNK) {
      await env.DB.batch(stmts.slice(i, i + BATCH_CHUNK));
    }

    const { app } = await import('./helpers');

    const listCounting = countingEnv();
    const listRes = await app.request(
      '/api/me/personal/transactions?month=2026-11&groups=show',
      as(sid),
      listCounting.env,
    );
    expect(listRes.status).toBe(200);
    const listBody = await json<ListResponse>(listRes);
    expect(listBody.groupRows).toHaveLength(60 * 25);
    console.info(`[personal-group-cost] list queries=${listCounting.counter.queries} groupRows=${listBody.groupRows?.length ?? 0}`);
    expect(listCounting.counter.queries).toBeLessThan(50);

    const walletsCounting = countingEnv();
    const walletsRes = await app.request(
      '/api/me/personal/wallets',
      as(sid),
      walletsCounting.env,
    );
    expect(walletsRes.status).toBe(200);
    const walletsBody = await json<{ wallets: WalletDetailView[] }>(walletsRes);
    expect(walletsBody.wallets).toHaveLength(1);
    console.info(`[personal-group-cost] wallets queries=${walletsCounting.counter.queries} wallets=${walletsBody.wallets.length}`);
    expect(walletsCounting.counter.queries).toBeLessThan(50);

    const syncCounting = countingEnv();
    const syncRes = await app.request(
      '/api/me/personal/sync?groups=show',
      as(sid),
      syncCounting.env,
    );
    expect(syncRes.status).toBe(200);
    const syncBody = await json<SyncResponse>(syncRes);
    expect(syncBody.groups?.rows).toHaveLength(60 * 25);
    console.info(`[personal-group-cost] sync queries=${syncCounting.counter.queries} groupRows=${syncBody.groups?.rows.length ?? 0}`);
    expect(syncCounting.counter.queries).toBeLessThan(50);
  }, 30_000);

  it('a switch-off user sees nothing new', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 500_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);
    const { wallet } = await json<{ wallet: { id: string } }>(wRes);

    await runSql(
      `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
       VALUES ('t-off', 'Chuyến đi', 'trip', 'VND', 1, 0, ?, 'gtok-off', 'vtok-off', 1, '2026-10-01T00:00:00.000Z')`,
      U.minh,
    );
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES ('p-off-m', 't-off', 'Minh', 'minh', ?, 'active', 0, '2026-10-01T00:00:00.000Z')`,
      U.minh,
    );
    await runSql(
      `INSERT INTO transactions (
        id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
        currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
        meta_json, created_at, updated_at
      ) VALUES ('e-off-1', 'e-off-1', NULL, 1, 't-off', 'expense', 'Ăn tối', 100000, NULL, 'VND', '2026-11-10', 'p-off-m', NULL, 'equal', 'approved', 'p-off-m', NULL, '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z')`,
    );

    await switchOn(U.minh, 0);

    expect((await postJson('/api/me/personal/group-links/e-off-1', sid, { intent: 'loan' }, 'PUT')).status).toBe(403);
    expect((await call('/api/me/personal/group-settings', as(sid))).status).toBe(403);
    expect((await postJson('/api/me/personal/group-settings', sid, { countLoans: true }, 'PUT')).status).toBe(403);
    expect((await call('/api/me/personal/balance-checks', as(sid))).status).toBe(403);
    expect((await postJson(`/api/me/personal/wallets/${wallet.id}/balance-check`, sid, { skip: true })).status).toBe(403);
    expect((await call('/api/me/personal/transactions?month=2026-11&groups=show', as(sid))).status).toBe(403);
    expect((await call('/api/me/personal/sync?groups=show', as(sid))).status).toBe(403);
  });

  it('a payback repays a loan from an earlier month', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);

    await runSql(
      `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
       VALUES ('t-direct-loan', 'Với Lan', 'direct', 'VND', 1, 0, ?, 'gtok-dl', 'vtok-dl', 1, '2026-10-01T00:00:00.000Z')`,
      U.minh,
    );
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES ('pd-minh', 't-direct-loan', 'Minh', 'minh', ?, 'active', 0, '2026-10-01T00:00:00.000Z')`,
      U.minh,
    );
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES ('pd-lan', 't-direct-loan', 'Lan', 'lan', NULL, 'active', 1, '2026-10-01T00:00:00.000Z')`,
    );

    // October loan: Minh lent Lan 100,000 (paid by Minh, share only for Lan)
    await runSql(
      `INSERT INTO transactions (
        id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
        currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
        meta_json, created_at, updated_at
      ) VALUES ('e-oct-loan', 'e-oct-loan', NULL, 1, 't-direct-loan', 'expense', 'Cho Lan vay', 100000, NULL, 'VND', '2026-10-15', 'pd-minh', NULL, 'amounts', 'approved', 'pd-minh', NULL, '2026-10-15T10:00:00.000Z', '2026-10-15T10:00:00.000Z')`,
    );
    await runSql(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 100000, 100000)',
      'e-oct-loan',
      'pd-lan',
    );

    const linkRes = await postJson(
      '/api/me/personal/group-links/e-oct-loan',
      sid,
      { intent: 'loan' },
      'PUT',
    );
    expect(linkRes.status).toBe(200);

    // November confirmed payment from Lan to Minh
    await runSql(
      `INSERT INTO transactions (
        id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
        currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
        meta_json, created_at, updated_at
      ) VALUES ('pay-nov', 'pay-nov', NULL, 1, 't-direct-loan', 'payment', 'Lan trả nợ', 60000, 60000, 'VND', '2026-11-05', 'pd-lan', 'pd-minh', 'equal', 'confirmed', 'pd-minh', NULL, '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z')`,
    );

    const settingsRes = await postJson(
      '/api/me/personal/group-settings',
      sid,
      { countLoans: true },
      'PUT',
    );
    expect(settingsRes.status).toBe(200);

    const listRes = await call('/api/me/personal/transactions?month=2026-11&groups=show', as(sid));
    expect(listRes.status).toBe(200);
    const body = await json<ListResponse>(listRes);

    const vndTotals = body.totals.find((t) => t.currency === 'VND');
    expect(vndTotals).toEqual({ currency: 'VND', spent: 0, income: 60_000 });
  });
});
