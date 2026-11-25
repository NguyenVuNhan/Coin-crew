import { Hono } from 'hono';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { type HoldingsResponse, type HoldingView } from '@cc/core';
import { loadCachedWalletsSummary } from './wallets';

export function holdingsRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/holdings', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const walletId = c.req.query('walletId') || undefined;
    const db = getDb(c.env);

    const { wallets, holdingsByWallet } = await loadCachedWalletsSummary(db, user.id);

    let targetWallets = wallets.filter((w) => w.kind === 'investment' && !w.archived);
    if (walletId !== undefined) {
      const target = wallets.find((w) => w.id === walletId);
      if (!target) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }
      if (target.kind !== 'investment') {
        return c.json<HoldingsResponse>({ holdings: [] }, 200);
      }
      targetWallets = [target];
    }

    const holdings: HoldingView[] = [];
    for (const wallet of targetWallets) {
      for (const h of holdingsByWallet.get(wallet.id) ?? []) {
        holdings.push({
          walletId: wallet.id,
          assetId: h.assetId,
          quantity: h.quantity,
          cost: h.cost,
          costVnd: h.costVnd,
        });
      }
    }

    return c.json<HoldingsResponse>({ holdings }, 200);
  });

  return app;
}
