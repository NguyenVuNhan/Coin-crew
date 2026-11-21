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
import { requestGroupCopySync, requestTxCopySync } from './txCopy/hooks';

export interface QuickShareInput {
  tripId: string;
  /** Present when editing an existing quick expense (PATCH instead of POST). */
  expenseId?: string;
  /** Stable rootId for the personal group link (defaults to the expenseId returned by the server). */
  rootId?: string;
  expense: {
    description: string;
    amount: number;
    spentOn: string;
    payerId: string;
    mode: SplitMode;
    entries: { participantId: string; value: number }[];
  };
  link: UpdateGroupLinkInput & { intent?: 'shared' | 'loan' | null };
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
    requestGroupCopySync(),
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
  deleteExpense(input: { tripId: string; expenseId: string }): Promise<void>;
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
      let linkRootId: string;
      try {
        const res = input.expenseId
          ? await apiSend<{ expenseId: string; rootId?: string }>(
              `/api/trips/${encodeURIComponent(input.tripId)}/expenses/${encodeURIComponent(input.expenseId)}`,
              'PATCH',
              input.expense,
              input.tripId,
            )
          : await apiSend<{ expenseId: string; rootId?: string }>(
              `/api/trips/${encodeURIComponent(input.tripId)}/expenses`,
              'POST',
              input.expense,
              input.tripId,
            );
        expenseId = res.expenseId;
        linkRootId = input.rootId ?? res.rootId ?? res.expenseId;
      } catch (err) {
        setError(err);
        setIsSaving(false);
        throw err;
      }

      pendingLinkRef.current = { tripId: input.tripId, expenseId: linkRootId, link: input.link };

      try {
        await putGroupLink(linkRootId, input.link);
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

  const deleteExpense = useCallback(
    async (input: { tripId: string; expenseId: string }): Promise<void> => {
      const basePath = `/api/trips/${encodeURIComponent(input.tripId)}/expenses/${encodeURIComponent(input.expenseId)}`;
      try {
        await apiSend(basePath, 'DELETE', undefined, input.tripId);
      } catch {
        await apiSend(`${basePath}/disable`, 'POST', {}, input.tripId);
      }
      await invalidateAfterQuickShare(queryClient, input.tripId);
    },
    [queryClient],
  );

  return {
    save,
    deleteExpense,
    retryLink,
    isSaving,
    error,
  };
}
