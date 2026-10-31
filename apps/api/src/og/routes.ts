import type { Context } from 'hono';
import { Hono } from 'hono';
import { eq, or } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { trips } from '../db/schema';
import { getSnapshot } from '../trips/snapshot';
import type { PageMeta } from './text';
import { pageMeta } from './text';
import { injectMeta } from './html';
import { findRequest, requestItems } from '../requests/routes';

async function jMeta(c: Context<AppBindings>): Promise<PageMeta> {
  try {
    const segments = c.req.path.split('/').filter(Boolean);
    const rawToken = segments[1];
    if (!rawToken) {
      return pageMeta({ kind: 'dead' });
    }
    let token: string;
    try {
      token = decodeURIComponent(rawToken);
    } catch {
      return pageMeta({ kind: 'dead' });
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) {
      return pageMeta({ kind: 'dead' });
    }

    const db = getDb(c.env);
    const trip = await db
      .select()
      .from(trips)
      .where(or(eq(trips.groupToken, token), eq(trips.viewToken, token)))
      .get();
    if (!trip || trip.preset === 'direct') {
      return pageMeta({ kind: 'dead' });
    }

    const snapshot = await getSnapshot(db, trip);
    const now = new Date();

    if (segments[2] === 'e' && segments[3]) {
      let expenseId: string | undefined;
      try {
        expenseId = decodeURIComponent(segments[3]);
      } catch {
        expenseId = undefined;
      }
      if (expenseId) {
        const expense = snapshot.expenses.find(
          (e) =>
            (e.id === expenseId || e.rootId === expenseId) &&
            (e.status === 'approved' || e.status === 'pending'),
        );
        if (expense) {
          return pageMeta({ kind: 'expense', snapshot, expense, now });
        }
      }
    }

    return pageMeta({ kind: 'group', snapshot, now });
  } catch (err) {
    console.error(err);
    return pageMeta({ kind: 'generic' });
  }
}

/** A request link's card: "Nhan asked you for 120.000₫". Only the amount, never the items. */
async function rMeta(c: Context<AppBindings>): Promise<PageMeta> {
  try {
    const rawToken = c.req.path.split('/').filter(Boolean)[1];
    if (!rawToken) return pageMeta({ kind: 'generic' });
    let token: string;
    try {
      token = decodeURIComponent(rawToken);
    } catch {
      return pageMeta({ kind: 'generic' });
    }
    const db = getDb(c.env);
    const target = await findRequest(db, token);
    if (!target) return pageMeta({ kind: 'generic' });
    const { items, total } = await requestItems(db, target);
    if (total <= 0) return pageMeta({ kind: 'generic' });
    return pageMeta({ kind: 'request', lang: target.lang, ownerName: target.ownerName, total, itemCount: items.length });
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

  app.get('/r/*', async (c) => {
    const page = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url)));
    if (!page.ok) return page;
    const meta = await rMeta(c);
    try {
      return injectMeta(page, meta, c.req.path, c.env.APP_ORIGIN);
    } catch {
      return page;
    }
  });

  return app;
}
