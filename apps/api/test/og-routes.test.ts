import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app, seedTrip, seedExpenses, seedMinhBank, T, PID } from './helpers';
import { INDEX_HTML } from './fixtures/indexHtml';

const stubAssets = (res?: () => Response) => ({
  fetch: async () => (res ? res() : new Response(INDEX_HTML, { headers: { 'content-type': 'text/html' } })),
});

async function page(
  path: string,
  overrides: Record<string, unknown> = {},
  assets = stubAssets(),
): Promise<Response> {
  return app.request(path, {}, { ...env, ASSETS: assets, ...overrides } as unknown as typeof env);
}

const text = async (p: string, o?: Record<string, unknown>): Promise<string> => (await page(p, o)).text();

function unescapeHtml(s: string): string {
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function metaContent(html: string, prop: string): string | null {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex1 = new RegExp(`<meta\\s+[^>]*?(?:property|name)=["']${p}["'][^>]*?content=["']([^"']*)["']`, 'i');
  const regex2 = new RegExp(`<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${p}["']`, 'i');
  const m = html.match(regex1) ?? html.match(regex2);
  if (!m) return null;
  return unescapeHtml(m[1] ?? '');
}

/** A sport bill "Cầu lông" paid by Minh, split with An. */
async function seedSportExpense(): Promise<void> {
  const metaJson = JSON.stringify({
    sport: {
      court: 300000,
      shuttlecocks: [{ qty: 2, unitPrice: 60000 }],
      extra: 50000,
      maleSlotRate: 45000,
      femaleSlotRate: 35000,
      rule: { kind: 'equal' },
      entries: [{ participantId: PID.M, maleSlots: 2, femaleSlots: 0 }],
    },
  });

  await env.DB.prepare(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency,
      spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at, meta_json
    ) VALUES (?, ?, NULL, 1, 't-1', 'expense', 'Cầu lông', 500000, 'VND', '2026-10-11', ?, 'equal', 'approved', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', ?)`,
  )
    .bind('e-sport', 'e-sport', PID.M, PID.M, metaJson)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 250000)',
    ).bind('e-sport', PID.M),
    env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 250000)',
    ).bind('e-sport', PID.A),
    env.DB.prepare("UPDATE trips SET preset='sport', version = version + 1 WHERE id='t-1'"),
  ]);
}

describe('page routes', () => {
  beforeEach(async () => {
    await seedTrip();
    await seedExpenses();
  });

  it('a group link gets the group card', async () => {
    const res = await page('/j/gtok-1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:title')).toBe('Đà Lạt · Oct 2026');
    expect(metaContent(html, 'og:description')).toContain('tổng chi 4.900.000₫ · 4 người');
    expect(metaContent(html, 'og:image')).toBe('http://localhost:8787/og/trip.png');
    expect(metaContent(html, 'og:url')).toBe('http://localhost:8787/j/gtok-1');
  });

  it('a view-only link gets the same card', async () => {
    const res = await page('/j/vtok-1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:title')).toBe('Đà Lạt · Oct 2026');
  });

  it('an expense link gets the sport breakdown', async () => {
    await seedSportExpense();

    const res = await page('/j/gtok-1/e/e-sport');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:description')?.startsWith('Sân 300.000₫')).toBe(true);
    expect(metaContent(html, 'og:image')?.endsWith('/og/sport.png')).toBe(true);
  });

  it("a sport bill previews the payer's QR once they have bank details", async () => {
    await seedSportExpense();
    await seedMinhBank();

    const html = await text('/j/gtok-1/e/e-sport');
    const image = metaContent(html, 'og:image');
    expect(image).toMatch(/^http:\/\/localhost:8787\/j\/gtok-1\/e\/e-sport\/qr\.png\?v=\d+$/);
    expect(html).not.toContain('19031234565678');

    const res = await page(new URL(image!).pathname + new URL(image!).search);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const header = new DataView(bytes.buffer, bytes.byteOffset + 16, 8);
    expect([header.getUint32(0), header.getUint32(4)]).toEqual([1200, 630]);
  });

  it("a sport bill with the payer's QR leaves the figures to the shared message: no description", async () => {
    await seedSportExpense();
    await seedMinhBank();

    const html = await text('/j/gtok-1/e/e-sport');
    expect(metaContent(html, 'og:title')).toBe('Cầu lông · Đà Lạt · Oct 2026');
    expect(metaContent(html, 'og:description')).toBeNull();
    expect(metaContent(html, 'twitter:description')).toBeNull();
    expect(metaContent(html, 'description')).toBeNull();
  });

  it('the QR picture is not found without bank details or for a plain expense', async () => {
    await seedSportExpense();
    expect((await page('/j/gtok-1/e/e-sport/qr.png')).status).toBe(404);
    await seedMinhBank();
    expect((await page('/j/gtok-1/e/e-1/qr.png')).status).toBe(404);
    expect((await page('/j/nope/e/e-sport/qr.png')).status).toBe(404);
  });

  it('a rejected or missing expense falls back to the group card', async () => {
    const res = await page('/j/gtok-1/e/nope');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:description')).toContain('tổng chi 4.900.000₫');
  });

  it('an unknown token gets the dead card', async () => {
    const res = await page('/j/old');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:description')).toBe(
      'Link này không còn dùng được. Hỏi người tạo nhóm link mới.',
    );
  });

  it('odd paths never fail', async () => {
    const resTrailing = await page('/j/gtok-1/');
    expect(resTrailing.status).toBe(200);
    const htmlTrailing = await resTrailing.text();
    expect(metaContent(htmlTrailing, 'og:description')).toContain('tổng chi');

    const resScript = await page('/j/%E2%80%A6%3Cscript%3E');
    expect(resScript.status).toBe(200);
    const htmlScript = await resScript.text();
    expect(metaContent(htmlScript, 'og:description')).toBe(
      'Link này không còn dùng được. Hỏi người tạo nhóm link mới.',
    );

    const resNested = await page('/j/gtok-1/x/y');
    expect(resNested.status).toBe(200);
    const htmlNested = await resNested.text();
    expect(metaContent(htmlNested, 'og:description')).toContain('tổng chi');
  });

  it('/t paths get the generic card, even for a real trip', async () => {
    for (const path of ['/t/t-1', '/t/t-1/expenses/e-1']) {
      const res = await page(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(metaContent(html, 'og:title')).toBe('CoinCrew (Tiền Đâu)');
      expect(metaContent(html, 'og:description')).toBe('Chia tiền nhóm, trả nhau bằng VietQR.');
      expect(html).not.toContain('Đà Lạt');
    }
  });

  it('never shows a bank account number', async () => {
    await seedMinhBank();
    const body = await text('/j/gtok-1');
    expect(body).not.toContain('19031234565678');
    expect(body).not.toContain('1903');
    expect(body).not.toContain('Techcombank');
  });

  it('is not indexed', async () => {
    for (const path of ['/j/gtok-1', '/t/t-1']) {
      const res = await page(path);
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  });

  it('passes a failing asset fetch through', async () => {
    const assets = stubAssets(() => new Response('no', { status: 503 }));
    const res = await page('/j/gtok-1', {}, assets);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('no');
  });

  it('falls back to the generic card when the database fails', async () => {
    const failingDb = {
      prepare() {
        throw new Error('boom');
      },
    };
    const res = await page('/j/gtok-1', { DB: failingDb });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(metaContent(html, 'og:title')).toBe('CoinCrew (Tiền Đâu)');
  });

  it('reads the cached snapshot instead of rebuilding', async () => {
    await page('/j/gtok-1');
    const trip = await env.DB.prepare("SELECT version FROM trips WHERE id='t-1'").first<{ version: number }>();
    const view1 = await env.DB.prepare(
      "SELECT version, updated_at FROM trip_views WHERE trip_id = 't-1'",
    ).first<{ version: number; updated_at: string }>();

    expect(trip).not.toBeNull();
    expect(view1).not.toBeNull();
    expect(view1?.version).toBe(trip?.version);

    await page('/j/gtok-1');
    const view2 = await env.DB.prepare(
      "SELECT version, updated_at FROM trip_views WHERE trip_id = 't-1'",
    ).first<{ version: number; updated_at: string }>();

    expect(view2?.version).toBe(view1?.version);
    expect(view2?.updated_at).toBe(view1?.updated_at);
  });
});
