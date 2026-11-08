import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ExtractedSportBooking, SportCourtSlot } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { ApiError } from '@cc/api-util/errors';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && start < end) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function normalizeExtracted(raw: unknown): ExtractedSportBooking {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const cleanString = (val: unknown): string | null => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof val === 'number') {
      return String(val);
    }
    return null;
  };

  const cleanAmount = (val: unknown): number | null => {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      return Math.round(val);
    }
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^\d]/g, '');
      if (cleaned.length > 0) {
        const n = parseInt(cleaned, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      }
    }
    return null;
  };

  const cleanCourtSlots = (val: unknown): SportCourtSlot[] => {
    if (!Array.isArray(val)) return [];
    const slots: SportCourtSlot[] = [];
    for (const item of val) {
      if (item && typeof item === 'object') {
        const cs = item as Record<string, unknown>;
        const courtName = typeof cs.courtName === 'string' ? cs.courtName.trim() : '';
        const timeRange = typeof cs.timeRange === 'string' ? cs.timeRange.trim() : '';
        if (courtName || timeRange) {
          slots.push({ courtName, timeRange });
        }
      }
    }
    return slots;
  };

  return {
    clubName: cleanString(obj.clubName),
    address: cleanString(obj.address),
    phone: cleanString(obj.phone),
    date: cleanString(obj.date),
    bookingCode: cleanString(obj.bookingCode),
    totalDuration: cleanString(obj.totalDuration),
    totalAmount: cleanAmount(obj.totalAmount),
    courtSlots: cleanCourtSlots(obj.courtSlots),
  };
}

export function bookingExtractRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/sport-booking/extract
  app.post('/trips/:id/sport-booking/extract', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'plan_session');

    if (!c.env.GEMINI_API_KEY) {
      throw new ApiError('NOT_IMPLEMENTED', 501, 'AI extraction is not configured.');
    }

    const body = await parseJson<{ imageDataUrl?: unknown }>(c);
    if (!body || typeof body !== 'object' || typeof body.imageDataUrl !== 'string') {
      throw new ApiError('VALIDATION', 422, 'imageDataUrl is required');
    }

    if (body.imageDataUrl.length > 2_000_000) {
      throw new ApiError('VALIDATION', 422, 'imageDataUrl exceeds maximum length of 2,000,000 characters');
    }

    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.imageDataUrl.trim());
    if (!match || !match[1] || !match[2]) {
      throw new ApiError('VALIDATION', 422, 'Invalid image data URL format');
    }

    const rawMime = match[1];
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    const data = match[2];

    const model = c.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(c.env.GEMINI_API_KEY)}`;

    const prompt =
      'Extract sport court booking details from this image. ' +
      'Return a JSON object with:\n' +
      '- clubName: string or null (name of the sport club/venue)\n' +
      '- address: string or null (venue address)\n' +
      '- phone: string or null (venue contact phone number)\n' +
      '- date: string or null (booking date, formatted as YYYY-MM-DD if recognizable)\n' +
      '- bookingCode: string or null (booking reference code or bill number, e.g. "#4139")\n' +
      '- totalDuration: string or null (e.g. "3h30p" or "2h")\n' +
      '- totalAmount: number or null (total booking fee as an integer VND, e.g. 168000)\n' +
      '- courtSlots: array of objects { courtName: string, timeRange: string } (e.g. [{"courtName":"Cầu Lông 6","timeRange":"5h00 - 7h00"}])\n' +
      'If any field is missing or not visible in the screenshot, set its value to null (or [] for courtSlots).';

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (e) {
      throw new ApiError('INTERNAL', 502, `Failed to connect to Gemini API: ${e instanceof Error ? e.message : 'network error'}`);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      throw new ApiError('INTERNAL', 502, `Gemini API error (${geminiRes.status}): ${errText}`);
    }

    let geminiJson: {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    try {
      geminiJson = await geminiRes.json();
    } catch {
      throw new ApiError('INTERNAL', 502, 'Invalid JSON from Gemini API');
    }

    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(stripCodeFences(rawText));
    } catch {
      parsed = null;
    }

    const extracted = normalizeExtracted(parsed);
    return c.json({ extracted });
  });

  return app;
}
