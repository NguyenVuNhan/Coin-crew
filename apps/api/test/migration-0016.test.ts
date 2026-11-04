import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { accountMergeRequests, transactions } from '../src/db/schema';

const run = (query: string, ...binds: unknown[]) => env.DB.prepare(query).bind(...binds).run();

describe('migration 0016 (merge claims)', () => {
  it('adds merge claim columns and index to account_merge_requests', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(account_merge_requests)').all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>();

    expect(results.find((c) => c.name === 'initiated_by')).toMatchObject({
      notnull: 1,
      dflt_value: "'survivor'",
    });

    const tripIdCol = results.find((c) => c.name === 'claim_trip_id');
    expect(tripIdCol).toBeDefined();
    expect(tripIdCol?.notnull).toBe(0);

    const participantIdCol = results.find((c) => c.name === 'claim_participant_id');
    expect(participantIdCol).toBeDefined();
    expect(participantIdCol?.notnull).toBe(0);

    const indexInfo = await env.DB.prepare('PRAGMA index_info(account_merge_requests_claim_idx)').all<{
      name: string;
    }>();
    expect(indexInfo.results.map((c) => c.name)).toEqual(['claim_trip_id', 'claim_participant_id', 'status']);
  });

  it('adds claim_request_id to transactions', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(transactions)').all<{
      name: string;
      notnull: number;
    }>();

    const claimRequestIdCol = results.find((c) => c.name === 'claim_request_id');
    expect(claimRequestIdCol).toBeDefined();
    expect(claimRequestIdCol?.notnull).toBe(0);
  });

  it("reads back initiated_by = 'survivor' with null claim columns for default row", async () => {
    await run(
      `INSERT INTO account_merge_requests (
        id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'req-default',
      'u-survivor',
      'u-merged',
      'google',
      'sub-default',
      'pending',
      '2026-11-04T00:00:00.000Z',
      '2026-11-11T00:00:00.000Z',
    );

    const row = await env.DB.prepare(
      'SELECT id, initiated_by, claim_trip_id, claim_participant_id FROM account_merge_requests WHERE id = ?',
    )
      .bind('req-default')
      .first<{
        id: string;
        initiated_by: string;
        claim_trip_id: string | null;
        claim_participant_id: string | null;
      }>();

    expect(row).toEqual({
      id: 'req-default',
      initiated_by: 'survivor',
      claim_trip_id: null,
      claim_participant_id: null,
    });
  });

  it('stores and reads back explicit claim values on account_merge_requests', async () => {
    await run(
      `INSERT INTO account_merge_requests (
        id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at,
        initiated_by, claim_trip_id, claim_participant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'req-claim',
      'u-survivor',
      'u-merged',
      'zalo',
      'sub-claim',
      'pending',
      '2026-11-04T00:00:00.000Z',
      '2026-11-11T00:00:00.000Z',
      'merged',
      't1',
      'p1',
    );

    const row = await env.DB.prepare(
      'SELECT id, initiated_by, claim_trip_id, claim_participant_id FROM account_merge_requests WHERE id = ?',
    )
      .bind('req-claim')
      .first<{
        id: string;
        initiated_by: string;
        claim_trip_id: string | null;
        claim_participant_id: string | null;
      }>();

    expect(row).toEqual({
      id: 'req-claim',
      initiated_by: 'merged',
      claim_trip_id: 't1',
      claim_participant_id: 'p1',
    });
  });

  it("round-trips transaction with claim_request_id = 'r1'", async () => {
    await run(
      `INSERT INTO transactions (
        id, root_id, trip_id, type, amount, spent_on, payer_id, status, created_by_participant_id, created_at, updated_at, claim_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'tx-1',
      'tx-1',
      't1',
      'expense',
      150000,
      '2026-11-04',
      'p1',
      'approved',
      'p1',
      '2026-11-04T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
      'r1',
    );

    const tx = await env.DB.prepare(
      'SELECT id, claim_request_id FROM transactions WHERE id = ?',
    )
      .bind('tx-1')
      .first<{
        id: string;
        claim_request_id: string | null;
      }>();

    expect(tx).toEqual({
      id: 'tx-1',
      claim_request_id: 'r1',
    });
  });

  it('matches Drizzle schema definitions', () => {
    expect(accountMergeRequests.initiatedBy).toBeDefined();
    expect(accountMergeRequests.claimTripId).toBeDefined();
    expect(accountMergeRequests.claimParticipantId).toBeDefined();
    expect(transactions.claimRequestId).toBeDefined();
  });
});
