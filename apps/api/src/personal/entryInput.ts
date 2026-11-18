import { ApiError } from '@cc/api-util/errors';
import { isValidQuantity, type EntryInput } from '@cc/core';
import { optionalTime, requireDate } from './validate';

export function parseNote(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid note');
  }
  const trimmed = v.trim();
  if (trimmed.length > 200) {
    throw new ApiError('VALIDATION', 422, 'Invalid note');
  }
  return trimmed.length === 0 ? null : trimmed;
}

export function parseTags(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 10) {
    throw new ApiError('VALIDATION', 422, 'Invalid tags');
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid tag');
    }
    const trimmed = item.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      throw new ApiError('VALIDATION', 422, 'Invalid tag');
    }
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(trimmed);
    }
  }
  return out;
}

function requireId(v: unknown, message: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ApiError('VALIDATION', 422, message);
  }
  return v;
}

function requirePositiveInt(v: unknown, message: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new ApiError('VALIDATION', 422, message);
  }
  return v;
}

export function parseEntryInput(body: unknown): EntryInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  const input = body as Record<string, unknown>;

  const date = requireDate(input.date);
  const time = optionalTime(input.time);
  const note = parseNote(input.note);
  const tags = parseTags(input.tags);

  if (input.excludeFromReports !== undefined && typeof input.excludeFromReports !== 'boolean') {
    throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
  }

  if (input.type === 'expense' || input.type === 'income') {
    const walletId = requireId(input.walletId, 'Invalid walletId');
    const categoryId = requireId(input.categoryId, 'Invalid categoryId');
    const amount = requirePositiveInt(input.amount, 'Invalid amount');
    const excludeFromReports = input.excludeFromReports ?? false;

    return {
      type: input.type,
      walletId,
      amount,
      categoryId,
      date,
      time,
      note,
      tags,
      excludeFromReports,
    };
  }

  if (input.type === 'transfer') {
    const fromWalletId = requireId(input.fromWalletId, 'Invalid fromWalletId');
    const toWalletId = requireId(input.toWalletId, 'Invalid toWalletId');
    if (fromWalletId === toWalletId) {
      throw new ApiError('VALIDATION', 422, 'Transfer wallets must differ');
    }
    const amountSent = requirePositiveInt(input.amountSent, 'Invalid amountSent');
    let amountReceived: number | undefined;
    if (input.amountReceived !== undefined && input.amountReceived !== null) {
      amountReceived = requirePositiveInt(input.amountReceived, 'Invalid amountReceived');
    }
    const excludeFromReports = input.excludeFromReports ?? true;

    return {
      type: 'transfer',
      fromWalletId,
      toWalletId,
      amountSent,
      ...(amountReceived !== undefined ? { amountReceived } : {}),
      date,
      time,
      note,
      tags,
      excludeFromReports,
    };
  }

  if (input.type === 'buy' || input.type === 'sell') {
    if (input.categoryId !== undefined && input.categoryId !== null) {
      throw new ApiError('VALIDATION', 422, 'Buy/sell cannot have categoryId');
    }
    const walletId = requireId(input.walletId, 'Invalid walletId');
    const assetId = requireId(input.assetId, 'Invalid assetId');
    if (typeof input.quantity !== 'number' || !isValidQuantity(input.quantity)) {
      throw new ApiError('VALIDATION', 422, 'Invalid quantity');
    }
    const amount = requirePositiveInt(input.amount, 'Invalid amount');

    return {
      type: input.type,
      walletId,
      assetId,
      quantity: input.quantity,
      amount,
      date,
      time,
      note,
      tags,
    };
  }

  throw new ApiError('VALIDATION', 422, 'Invalid entry type');
}
