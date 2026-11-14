import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PushDeviceSettings, PushSubscriptionInput } from '@cc/core';
import { getBrowserSubscription, subscribeBrowser } from '@cc/web-platform/push';
import { apiFetch, apiSend, ApiClientError } from './client';

const PUSH_KEY_QUERY_KEY = ['push', 'key'] as const;
const PUSH_DEVICE_QUERY_KEY = ['push', 'device'] as const;

const DEFAULT_PUSH_SETTINGS: PushDeviceSettings = {
  newSession: true,
  sessionReminder: true,
  reminderLeadMinutes: 30,
  expenseNew: true,
};

async function fetchPushKey(): Promise<string | null> {
  const res = await apiFetch<{ publicKey: string | null }>('/api/push/key');
  return res?.publicKey ?? null;
}

export function usePushKey(): UseQueryResult<string | null> {
  return useQuery<string | null>({
    queryKey: PUSH_KEY_QUERY_KEY,
    queryFn: fetchPushKey,
    staleTime: Infinity,
  });
}

export function usePushDevice(enabled: boolean): UseQueryResult<PushDeviceSettings | null> {
  return useQuery<PushDeviceSettings | null>({
    queryKey: PUSH_DEVICE_QUERY_KEY,
    enabled,
    queryFn: async () => {
      const sub = await getBrowserSubscription();
      if (!sub?.endpoint) return null;
      try {
        const res = await apiFetch<{ settings: PushDeviceSettings }>(
          `/api/push/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`,
        );
        return res?.settings ?? null;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
  });
}

export function useEnablePush(): UseMutationResult<PushDeviceSettings, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<PushDeviceSettings, Error, void>({
    mutationFn: async () => {
      const key = queryClient.getQueryData<string | null>(PUSH_KEY_QUERY_KEY);
      if (typeof key !== 'string') {
        throw new Error('push key not loaded');
      }
      const sub = await subscribeBrowser(key);
      const body: PushSubscriptionInput = {
        endpoint: sub.endpoint ?? '',
        keys: {
          p256dh: sub.keys?.p256dh ?? '',
          auth: sub.keys?.auth ?? '',
        },
      };
      const res = await apiSend<{ settings: PushDeviceSettings }>('/api/push/subscription', 'PUT', body);
      return res.settings;
    },
    onSuccess: async (settings) => {
      queryClient.setQueryData(PUSH_DEVICE_QUERY_KEY, settings);
      await queryClient.invalidateQueries({ queryKey: PUSH_DEVICE_QUERY_KEY });
    },
  });
}

export function useUpdatePushDevice(): UseMutationResult<PushDeviceSettings, Error, Partial<PushDeviceSettings>> {
  const queryClient = useQueryClient();
  return useMutation<
    PushDeviceSettings,
    Error,
    Partial<PushDeviceSettings>,
    { previous: PushDeviceSettings | null | undefined }
  >({
    mutationFn: async (patch) => {
      const sub = await getBrowserSubscription();
      if (!sub?.endpoint) {
        throw new Error('No push subscription');
      }
      const res = await apiSend<{ settings: PushDeviceSettings }>('/api/push/subscription', 'PATCH', {
        endpoint: sub.endpoint,
        ...patch,
      });
      return res.settings;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: PUSH_DEVICE_QUERY_KEY });
      const previous = queryClient.getQueryData<PushDeviceSettings | null>(PUSH_DEVICE_QUERY_KEY);
      const prevSettings = previous ?? DEFAULT_PUSH_SETTINGS;
      queryClient.setQueryData<PushDeviceSettings | null>(PUSH_DEVICE_QUERY_KEY, {
        ...prevSettings,
        ...patch,
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData(PUSH_DEVICE_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PUSH_DEVICE_QUERY_KEY });
    },
  }) as UseMutationResult<PushDeviceSettings, Error, Partial<PushDeviceSettings>>;
}
