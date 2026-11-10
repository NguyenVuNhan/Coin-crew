import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExtractedSportBooking } from '@cc/core';
import { call, json, seedTrip, seedUser, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const anMember = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}` });
const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
  await env.DB.prepare("UPDATE participants SET user_id = ? WHERE id = ?").bind(U.an, PID.A).run();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (env as Record<string, unknown>).GEMINI_API_KEY;
  delete (env as Record<string, unknown>).GEMINI_MODEL;
});

describe('POST /api/trips/:id/sport-booking/extract', () => {
  it('returns 501 when GEMINI_API_KEY is not configured', async () => {
    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(501);
  });

  it('rejects guests with 403', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const g = await guestHeaders(PID.C);
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...g, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-admin members with 403', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const nonAdmin = await anMember();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...nonAdmin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects invalid or oversized imageDataUrl with 422', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const headers = await minh();

    // Missing imageDataUrl
    const res1 = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res1.status).toBe(422);

    // Invalid scheme
    const res2 = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: 'https://example.com/image.png' }),
    });
    expect(res2.status).toBe(422);

    // Oversized (> 2_000_000 chars)
    const longDataUrl = 'data:image/png;base64,' + 'A'.repeat(2_000_001);
    const res3 = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: longDataUrl }),
    });
    expect(res3.status).toBe(422);
  });

  it('parses structured booking fields from Gemini vision response (including fenced JSON)', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{"clubName":"Sân Cầu Lông Putin - 158 Phú Diễn","address":"158 Phú Diễn, Phường Phú Diễn, Hà Nội","phone":"0345747800","date":"2026-11-04","bookingCode":"#4139","totalDuration":"3h30p","totalAmount":168000,"courtSlots":[{"courtName":"Cầu Lông 6","timeRange":"5h00 - 7h00"},{"courtName":"Cầu Lông 5","timeRange":"5h30 - 7h00"}]}\n```',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(200);
    const { extracted } = await json<{ extracted: ExtractedSportBooking }>(res);
    expect(extracted).toEqual({
      clubName: 'Sân Cầu Lông Putin - 158 Phú Diễn',
      address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
      phone: '0345747800',
      date: '2026-11-04',
      bookingCode: '#4139',
      totalDuration: '3h30p',
      totalAmount: 168000,
      courtSlots: [
        { courtName: 'Cầu Lông 6', timeRange: '5h00 - 7h00' },
        { courtName: 'Cầu Lông 5', timeRange: '5h30 - 7h00' },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [calledUrl, calledInit] = firstCall!;
    expect(String(calledUrl)).toContain('gemini-2.5-flash-lite:generateContent?key=test-key');
    const sentBody = JSON.parse(String(calledInit?.body));
    expect(sentBody.contents[0].parts[0].inlineData).toEqual({
      mimeType: 'image/png',
      data: sampleDataUrl.split(',')[1],
    });
    expect(sentBody.generationConfig).toEqual({ responseMimeType: 'application/json' });
  });

  it('uses GEMINI_MODEL env when specified', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    (env as Record<string, unknown>).GEMINI_MODEL = 'gemini-1.5-pro';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"clubName":"Custom Venue"}' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(200);
    const { extracted } = await json<{ extracted: ExtractedSportBooking }>(res);
    expect(extracted.clubName).toBe('Custom Venue');
    expect(extracted.courtSlots).toEqual([]);

    const customCall = fetchSpy.mock.calls[0];
    expect(customCall).toBeDefined();
    const [calledUrl] = customCall!;
    expect(String(calledUrl)).toContain('gemini-1.5-pro:generateContent?key=test-key');
  });

  it('normalizes DD/MM/YYYY date into YYYY-MM-DD and drops invalid date strings', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const headers = await minh();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"clubName":"Sân A","date":"04/11/2026"}' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res1 = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res1.status).toBe(200);
    const body1 = await json<{ extracted: ExtractedSportBooking }>(res1);
    expect(body1.extracted.date).toBe('2026-11-04');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"clubName":"Sân A","date":"next-sunday"}' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res2 = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res2.status).toBe(200);
    const body2 = await json<{ extracted: ExtractedSportBooking }>(res2);
    expect(body2.extracted.date).toBeNull();
  });

  it('handles upstream Gemini error with 502', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Service Unavailable', { status: 503 }),
    );

    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(502);
  });
});
