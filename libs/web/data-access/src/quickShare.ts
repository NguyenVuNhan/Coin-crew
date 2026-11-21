import { useCallback, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { SplitMode } from '@cc/core';
import { apiSend } from './client';
import { WALLETS_KEY } from './personal';
import {
  PERSONAL_CATEGORIES_KEY,
  PERSONAL_HOLDINGS_KEY,
  PERSONAL_LIST_KEY,
  PERSONAL_SUMMARY_KEY,
  PERSONAL_TAGS_KEY,
  type GroupLinkResponse,
  type UpdateGroupLinkInput,
} from './personalMoney';
import { requestTxCopySync } from './txCopy/hooks';

export interface QuickShareInput {
  tripId: string;
  expense: {
    description: string;
    amount: number;
    spentOn: string;
    payerId: string;
    mode: SplitMode;
    entries: { participantId: string; value: number }[];
  };
  link: UpdateGroupLinkInput & { intent: 'shared' | 'loan' };
}

export class QuickShareLinkError extends Error {
  expenseId: string;

  constructor(expenseId: string, message = 'Failed to link group expense', cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'QuickShareLinkError';
    this.expenseId = expenseId;
  }
}

async function invalidateAfterQuickShare(queryClient: QueryClient, tripId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_SUMMARY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_TAGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_CATEGORIES_KEY }),
    queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
    requestTxCopySync(),
  ]);
}

async function putGroupLink(
  expenseId: string,
  link: QuickShareInput['link'],
): Promise<void> {
  try {
    await apiSend<GroupLinkResponse>(
      `/api/me/personal/group-links/${encodeURIComponent(expenseId)}`,
      'PUT',
      link,
    );
  } catch (err) {
    throw new QuickShareLinkError(
      expenseId,
      err instanceof Error ? err.message : 'Failed to link group expense',
      err,
    );
  }
}

export function useSaveQuickShare(): {
  save(input: QuickShareInput): Promise<{ expenseId: string }>;
  retryLink(): Promise<void>;
  isSaving: boolean;
  error: unknown;
} {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pendingLinkRef = useRef<{
    tripId: string;
    expenseId: string;
    link: QuickShareInput['link'];
  } | null>(null);

  const save = useCallback(
    async (input: QuickShareInput): Promise<{ expenseId: string }> => {
      setIsSaving(true);
      setError(null);
      pendingLinkRef.current = null;

      let expenseId: string;
      try {
        const res = await apiSend<{ expenseId: string }>(
          `/api/trips/${encodeURIComponent(input.tripId)}/expenses`,
          'POST',
          input.expense,
          input.tripId,
        );
        expenseId = res.expenseId;
      } catch (err) {
        setError(err);
        setIsSaving(false);
        throw err;
      }

      pendingLinkRef.current = { tripId: input.tripId, expenseId, link: input.link };

      try {
        await putGroupLink(expenseId, input.link);
      } catch (err) {
        setError(err);
        setIsSaving(false);
        throw err;
      }

      pendingLinkRef.current = null;
      await invalidateAfterQuickShare(queryClient, input.tripId);
      setIsSaving(false);
      return { expenseId };
    },
    [queryClient],
  );

  const retryLink = useCallback(async (): Promise<void> => {
    const pending = pendingLinkRef.current;
    if (!pending) return;

    setIsSaving(true);
    setError(null);

    try {
      await putGroupLink(pending.expenseId, pending.link);
    } catch (err) {
      setError(err);
      setIsSaving(false);
      throw err;
    }

    pendingLinkRef.current = null;
    await invalidateAfterQuickShare(queryClient, pending.tripId);
    setIsSaving(false);
  }, [queryClient]);

  return {
    save,
    retryLink,
    isSaving,
    error,
  };
}
