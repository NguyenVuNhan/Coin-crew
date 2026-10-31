import { useInfiniteQuery } from '@tanstack/react-query';
import type { MyActivityItem, MyActivityPage } from '@fsl/core';
import { apiFetch, type ApiClientError } from './client';

export function useMyActivity(opts?: { enabled?: boolean }): {
  items: MyActivityItem[];
  isLoading: boolean;
  error: ApiClientError | null;
  fetchNextPage(): void;
  hasNextPage: boolean;
} {
  const query = useInfiniteQuery({
    enabled: opts?.enabled ?? true,
    queryKey: ['me', 'activity'] as const,
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? `/api/me/activity?before=${encodeURIComponent(pageParam)}`
        : '/api/me/activity';
      return apiFetch<MyActivityPage>(url);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: MyActivityPage) => lastPage.next ?? undefined,
  });

  const items = query.data ? query.data.pages.flatMap((page) => page.items) : [];

  return {
    items,
    isLoading: query.isLoading,
    error: (query.error as ApiClientError | null) ?? null,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    hasNextPage: query.hasNextPage,
  };
}
