import type { Context } from 'hono';
import { Hono } from 'hono';
import { eq, or } from 'drizzle-orm';
import type { ExpenseView } from '@fsl/core';
import type { AppBindings } from '../env';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { trips } from '../db/schema';
import type { TripSnapshot } from '../trips/snapshot';
import { getSnapshot } from '../trips/snapshot';
import type { PageMeta } from './text';
import { pageMeta } from './text';
import { injectMeta } from './html';
import { billQrPayload } from './billQr';
import { qrCardPng } from './qrPng';

function decodeSegment(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/** The trip a link token opens, with its snapshot; null for a malformed or unknown token. */
async function tripByToken(db: Db, rawToken: string | undefined): Promise<{ token: string; snapshot: TripSnapshot } | null> {
  const token = decodeSegment(rawToken);
  if (!token || !/^[A-Za-z0-9_-]{1,64}$/.test(token)) return null;
  const trip = await db
    .select()
    .from(trips)
    .where(or(eq(trips.groupToken, token), eq(trips.viewToken, token)))
    .get();
  if (!trip) return null;
  return { token, snapshot: await getSnapshot(db, trip) };
}

/** An approved or waiting expense by its id or root id. */
function findExpense(snapshot: TripSnapshot, rawId: string | undefined): ExpenseView | undefined {
  const expenseId = decodeSegment(rawId);
  if (!expenseId) return undefined;
  return snapshot.expenses.find(
    (e) => (e.id === expenseId || e.rootId === expenseId) && (e.status === 'approved' || e.status === 'pending'),
  );
}

async function jMeta(c: Context<AppBindings>): Promise<PageMeta> {
  try {
    const segments = c.req.path.split('/').filter(Boolean);
    if (!segments[1]) {
      return pageMeta({ kind: 'dead' });
    }

    const db = getDb(c.env);
    const found = await tripByToken(db, segments[1]);
    if (!found) {
      return pageMeta({ kind: 'dead' });
    }
    const { token, snapshot } = found;
    const now = new Date();

    if (segments[2] === 'e' && segments[3]) {
      const expense = findExpense(snapshot, segments[3]);
      if (expense) {
        const meta = pageMeta({ kind: 'expense', snapshot, expense, now });
        // A sport bill previews the QR of whoever paid it, so the group can pay straight from the chat. Its figures
        // come in the shared message, so the preview leaves them out rather than show a second (maybe stale) copy.
        if ((await billQrPayload(db, snapshot, expense)) !== null) {
          const id = encodeURIComponent(expense.rootId ?? expense.id);
          meta.imagePath = `/j/${encodeURIComponent(token)}/e/${id}/qr.png?v=${snapshot.trip.version}`;
          meta.description = '';
        }
        return meta;
      }
    }

    return pageMeta({ kind: 'group', snapshot, now });
  } catch (err) {
    console.error(err);
    return pageMeta({ kind: 'generic' });
  }
}

export function pageRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/t/*', async (c) => {
    const page = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)));
    if (!page.ok) return page;
    const meta = pageMeta({ kind: 'generic' });
    try {
      return injectMeta(page, meta, c.req.path, c.env.APP_ORIGIN);
    } catch {
      return page;
    }
  });

  // The link-preview picture of a sport bill: the payer's VietQR.
  app.get('/j/:token/e/:id/qr.png', async (c) => {
    const db = getDb(c.env);
    const found = await tripByToken(db, c.req.param('token'));
    const expense = found ? findExpense(found.snapshot, c.req.param('id')) : undefined;
    const payload = found && expense ? await billQrPayload(db, found.snapshot, expense) : null;
    if (payload === null) {
      return c.body(null, 404, { 'cache-control': 'no-store' });
    }
    const png = await qrCardPng(payload);
    return c.body(png, 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex, nofollow',
    });
  });

  app.get('/j/*', async (c) => {
    const page = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)));
    if (!page.ok) return page;
    const meta = await jMeta(c);
    try {
      return injectMeta(page, meta, c.req.path, c.env.APP_ORIGIN);
    } catch {
      return page;
    }
  });

  return app;
}
