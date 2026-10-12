import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { checkUsage, FREE_LIMITS } from '../src/ops/usage';

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const WEBHOOK = 'https://hooks.example.com/alerts';
const opsEnv = { ...env, CF_API_TOKEN: 'token', CF_ACCOUNT_ID: 'acct', OPS_ALERT_WEBHOOK_URL: WEBHOOK };
const now = new Date('2026-10-12T10:00:00.000Z');

function mockCloudflare(usage: { requests: number; rowsRead: number; rowsWritten: number }) {
  const webhookBodies: unknown[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === GRAPHQL) {
      return Response.json({ data: { viewer: { accounts: [{
        workersInvocationsAdaptive: [{ sum: { requests: usage.requests } }],
        d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: usage.rowsRead, rowsWritten: usage.rowsWritten } }],
      }] } } });
    }
    if (url === WEBHOOK) {
      webhookBodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return { spy, webhookBodies };
}

afterEach(() => vi.restoreAllMocks());

describe('checkUsage', () => {
  it('alerts once a day when a metric passes 80%', async () => {
    const { webhookBodies } = mockCloudflare({ requests: 1000, rowsRead: FREE_LIMITS.d1RowsRead * 0.85, rowsWritten: 100 });
    const report = await checkUsage(opsEnv, now);
    expect(report.find((r) => r.metric === 'd1RowsRead')?.ratio).toBeCloseTo(0.85);
    expect(webhookBodies).toHaveLength(1);
    expect(JSON.stringify(webhookBodies[0])).toContain('d1RowsRead');
    await checkUsage(opsEnv, now);
    expect(webhookBodies).toHaveLength(1);
  });

  it('stays quiet under 80%', async () => {
    const { webhookBodies } = mockCloudflare({ requests: FREE_LIMITS.workerRequests * 0.5, rowsRead: 10, rowsWritten: 10 });
    await checkUsage(opsEnv, now);
    expect(webhookBodies).toHaveLength(0);
  });

  it('does nothing without a Cloudflare token', async () => {
    const { spy } = mockCloudflare({ requests: 0, rowsRead: 0, rowsWritten: 0 });
    expect(await checkUsage({ ...env, CF_API_TOKEN: undefined, CF_ACCOUNT_ID: undefined }, now)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
