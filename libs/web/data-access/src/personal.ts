import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  WalletsResponse,
  CreateWalletInput,
  CreateWalletResponse,
} from '@cc/core';
import { apiFetch, apiSend, type ApiClientError } from './client';
import { writePersonalHint } from './personalHint';

export function useSetPersonalArea() {
  const queryClient = useQueryClient();

  return useMutation<{ enabled: boolean }, ApiClientError, boolean>({
    mutationFn: (enabled: boolean) =>
      apiSend<{ enabled: boolean }>('/api/me/personal', 'PATCH', { enabled }),
    onSuccess: async (result) => {
      writePersonalHint(result.enabled);
      await queryClient.invalidateQueries({ queryKey: ['me'], exact: true });
    },
  });
}

export const WALLETS_KEY = ['me', 'personal', 'wallets'] as const;

export function useWallets(opts?: { enabled?: boolean }) {
  return useQuery<WalletsResponse, ApiClientError>({
    queryKey: WALLETS_KEY,
    queryFn: () => apiFetch<WalletsResponse>('/api/me/personal/wallets'),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateWallet() {
  const queryClient = useQueryClient();

  return useMutation<CreateWalletResponse, ApiClientError, CreateWalletInput>({
    mutationFn: (input: CreateWalletInput) =>
      apiSend<CreateWalletResponse>('/api/me/personal/wallets', 'POST', input),
    onSuccess: (result) => {
      queryClient.setQueryData<WalletsResponse>(WALLETS_KEY, (previous) => ({
        wallets: [...(previous?.wallets ?? []), result.wallet],
      }));
    },
  });
}
