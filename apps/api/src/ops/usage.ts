import type { Env } from '../env';
import { getDb } from '../db/client';
import { opsAlerts } from '../db/schema';

// Cloudflare free-plan daily limits. To be confirmed against current Cloudflare pricing (spec §14).
export const FREE_LIMITS = { workerRequests: 100_000, d1RowsRead: 5_000_000, d1RowsWritten: 100_000 } as const;
export type UsageMetric = keyof typeof FREE_LIMITS;
export interface UsageLine { metric: UsageMetric; used: number; ratio: number }

const GRAPHQL_QUERY = `query ($accountTag: String!, $date: Date!, $start: Time!, $end: Time!) { viewer { accounts(filter: { accountTag: $accountTag }) { workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end }) { sum { requests } } d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { rowsRead rowsWritten } } } } }`;

interface CloudflareGraphQLResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{ sum?: { requests?: number } }>;
        d1AnalyticsAdaptiveGroups?: Array<{ sum?: { rowsRead?: number; rowsWritten?: number } }>;
      }>;
    };
  };
}

export async function checkUsage(env: Env, now: Date): Promise<UsageLine[]> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return [];
  }

  const day = now.toISOString().slice(0, 10);
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: {
        accountTag: env.CF_ACCOUNT_ID,
        date: day,
        start: `${day}T00:00:00Z`,
        end: now.toISOString(),
      },
    }),
  });

  if (!res.ok) {
    console.warn(`Cloudflare GraphQL query failed with status ${res.status}`);
    return [];
  }

  const data = (await res.json()) as CloudflareGraphQLResponse;
  const account = data.data?.viewer?.accounts?.[0];
  if (!account) {
    console.warn('No accounts found in Cloudflare GraphQL response');
    return [];
  }

  const workerRequests = (account.workersInvocationsAdaptive ?? []).reduce(
    (sum, item) => sum + (item.sum?.requests ?? 0),
    0,
  );
  const d1RowsRead = (account.d1AnalyticsAdaptiveGroups ?? []).reduce(
    (sum, item) => sum + (item.sum?.rowsRead ?? 0),
    0,
  );
  const d1RowsWritten = (account.d1AnalyticsAdaptiveGroups ?? []).reduce(
    (sum, item) => sum + (item.sum?.rowsWritten ?? 0),
    0,
  );

  const lines: UsageLine[] = [
    { metric: 'workerRequests', used: workerRequests, ratio: workerRequests / FREE_LIMITS.workerRequests },
    { metric: 'd1RowsRead', used: d1RowsRead, ratio: d1RowsRead / FREE_LIMITS.d1RowsRead },
    { metric: 'd1RowsWritten', used: d1RowsWritten, ratio: d1RowsWritten / FREE_LIMITS.d1RowsWritten },
  ];

  const db = getDb(env);
  for (const line of lines) {
    if (line.ratio >= 0.8) {
      const inserted = await db
        .insert(opsAlerts)
        .values({ day, metric: line.metric })
        .onConflictDoNothing()
        .returning();

      if (inserted.length > 0 && env.OPS_ALERT_WEBHOOK_URL) {
        const limit = FREE_LIMITS[line.metric];
        await fetch(env.OPS_ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Coin Crew: ${line.metric} is at ${Math.round(line.ratio * 100)}% of the Cloudflare free daily limit (${line.used} of ${limit}). Upgrade before users see errors.`,
          }),
        });
      }
    }
  }

  return lines;
}
