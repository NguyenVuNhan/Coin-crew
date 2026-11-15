import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiSend, type ApiClientError } from './client';
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
