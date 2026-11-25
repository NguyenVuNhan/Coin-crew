import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AssetsResponse,
  AssetView,
  CategoriesResponse,
  CategoryView,
  CreateWalletInput,
  EntriesResponse,
  EntryInput,
  GroupLinkView,
  GroupListQuery,
  GroupSettingsView,
  HoldingsResponse,
  ListResponse,
  PersonalSummary,
  TagView,
  UpdateWalletInput,
  WalletDetailResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { apiFetch, apiSend, type ApiClientError } from './client';
import { WALLETS_KEY } from './personal';
import { requestTxCopySync } from './txCopy/hooks';

export const PERSONAL_SUMMARY_KEY = ['me', 'personal', 'summary'] as const;
export const PERSONAL_CATEGORIES_KEY = ['me', 'personal', 'categories'] as const;
export const PERSONAL_TAGS_KEY = ['me', 'personal', 'tags'] as const;
export const PERSONAL_LIST_KEY = ['me', 'personal', 'list'] as const;
export const PERSONAL_ASSETS_KEY = ['me', 'personal', 'assets'] as const;
export const PERSONAL_HOLDINGS_KEY = ['me', 'personal', 'holdings'] as const;
export const PERSONAL_GROUP_SETTINGS_KEY = ['me', 'personal', 'group-settings'] as const;
export const PERSONAL_BALANCE_CHECKS_KEY = ['me', 'personal', 'balance-checks'] as const;
export const PERSONAL_REPORT_KEY = ['me', 'personal', 'report'] as const;

const LAST_WALLET_STORAGE_KEY = 'cc.personal.lastWallet';

export interface CreateCategoryInput {
  type: 'expense' | 'income';
  name: string;
  icon: string;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  hidden?: boolean;
  sortOrder?: number;
  parentId?: string | null;
}

export interface CategoryResponse {
  category: CategoryView;
}

export interface TagsResponse {
  tags: TagView[];
}

export interface TagResponse {
  tag: TagView;
}

export interface CreateAssetInput {
  name: string;
  unit: string;
  groupName: string;
  decimals: number;
  icon?: string | null;
}

export interface UpdateAssetInput {
  name?: string;
  unit?: string;
  groupName?: string;
  decimals?: number;
  icon?: string | null;
  hidden?: boolean;
}

export interface AssetResponse {
  asset: AssetView;
}

export interface GroupSettingsResponse {
  settings: GroupSettingsView;
}

export interface UpdateGroupSettingsInput {
  defaultGroupCategoryId?: string | null;
  countLoans?: boolean;
}

export interface UpdateGroupLinkInput {
  walletId?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  intent?: 'shared' | 'loan' | null;
  excludeFromReports?: boolean;
}

export interface GroupLinkResponse {
  link: GroupLinkView;
}

export interface BalanceChecksResponse {
  walletIds: string[];
}

export type AnswerBalanceCheckInput = { actual: number } | { skip: true };

export interface AnswerBalanceCheckResponse {
  entryId: string | null;
}

async function invalidateMoney(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_SUMMARY_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY }),
  ]);
}

async function invalidateEntry(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateMoney(queryClient),
    queryClient.invalidateQueries({ queryKey: PERSONAL_TAGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_CATEGORIES_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
  ]);
}

async function invalidateCategories(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_CATEGORIES_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY }),
  ]);
}

async function invalidateTags(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_TAGS_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_REPORT_KEY }),
  ]);
}

/** Reads the last-used wallet id from localStorage, returning null if unavailable or throwing. */
export function readLastWallet(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LAST_WALLET_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists (or clears when null) the last-used wallet id in localStorage, ignoring storage errors. */
export function writeLastWallet(id: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (id === null) {
      localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
    } else {
      localStorage.setItem(LAST_WALLET_STORAGE_KEY, id);
    }
  } catch {
    // Ignore storage errors (private browsing, disabled storage, quota)
  }
}

/** Builds a URL query string from a ListQuery/GroupListQuery, skipping undefined or empty filters. */
export function buildListQueryString(query: GroupListQuery): string {
  const params = new URLSearchParams();
  const pairs: [keyof GroupListQuery, string | undefined][] = [
    ['month', query.month],
    ['from', query.from],
    ['to', query.to],
    ['walletId', query.walletId],
    ['categoryId', query.categoryId],
    ['assetId', query.assetId],
    ['tagId', query.tagId],
    ['type', query.type],
    ['tripId', query.tripId],
    ['groups', query.groups],
    ['q', query.q],
    ['recent', query.recent === undefined ? undefined : String(query.recent)],
  ];
  for (const [key, value] of pairs) {
    if (value !== undefined && value !== '') {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useWalletDetails(opts?: { enabled?: boolean }) {
  return useQuery<WalletDetailsResponse, ApiClientError>({
    queryKey: WALLETS_KEY,
    queryFn: () => apiFetch<WalletDetailsResponse>('/api/me/personal/wallets'),
    enabled: opts?.enabled ?? true,
  });
}

export function useAddWallet() {
  const queryClient = useQueryClient();

  return useMutation<WalletDetailResponse, ApiClientError, CreateWalletInput>({
    mutationFn: (input: CreateWalletInput) =>
      apiSend<WalletDetailResponse>('/api/me/personal/wallets/add', 'POST', input),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function useUpdateWallet() {
  const queryClient = useQueryClient();

  return useMutation<
    WalletDetailResponse,
    ApiClientError,
    { id: string; input: UpdateWalletInput }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<WalletDetailResponse>(
        `/api/me/personal/wallets/${encodeURIComponent(id)}`,
        'PATCH',
        input,
      ),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function useReorderWallets() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string[]>({
    mutationFn: (ids: string[]) =>
      apiSend<{ ok: true }>('/api/me/personal/wallets/reorder', 'POST', { ids }),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function useDeleteWallet() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<{ ok: true }>(`/api/me/personal/wallets/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: () => invalidateMoney(queryClient),
  });
}

export function usePersonalSummary(month: string, opts?: { enabled?: boolean }) {
  return useQuery<PersonalSummary, ApiClientError>({
    queryKey: [...PERSONAL_SUMMARY_KEY, month],
    queryFn: () =>
      apiFetch<PersonalSummary>(`/api/me/personal/summary?month=${encodeURIComponent(month)}`),
    enabled: opts?.enabled ?? true,
  });
}

export function useCategories(opts?: { enabled?: boolean }) {
  return useQuery<CategoriesResponse, ApiClientError>({
    queryKey: PERSONAL_CATEGORIES_KEY,
    queryFn: () => apiFetch<CategoriesResponse>('/api/me/personal/categories'),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation<CategoryResponse, ApiClientError, CreateCategoryInput>({
    mutationFn: (input: CreateCategoryInput) =>
      apiSend<CategoryResponse>('/api/me/personal/categories', 'POST', input),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation<
    CategoryResponse,
    ApiClientError,
    { id: string; input: UpdateCategoryInput }
  >({
    mutationFn: ({ id, input }) =>
      apiSend<CategoryResponse>(
        `/api/me/personal/categories/${encodeURIComponent(id)}`,
        'PATCH',
        input,
      ),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, { id: string; moveTo?: string; children?: string }>({
    mutationFn: ({ id, moveTo, children }) => {
      const base = `/api/me/personal/categories/${encodeURIComponent(id)}`;
      const params = new URLSearchParams();
      if (moveTo) params.set('moveTo', moveTo);
      if (children) params.set('children', children);
      const qs = params.toString();
      const path = qs ? `${base}?${qs}` : base;
      return apiSend<{ ok: true }>(path, 'DELETE');
    },
    onSuccess: async () => {
      await Promise.all([invalidateCategories(queryClient), requestTxCopySync()]);
    },
  });
}

export function useTags(opts?: { enabled?: boolean }) {
  return useQuery<TagsResponse, ApiClientError>({
    queryKey: PERSONAL_TAGS_KEY,
    queryFn: () => apiFetch<TagsResponse>('/api/me/personal/tags'),
    enabled: opts?.enabled ?? true,
  });
}

export function useRenameTag() {
  const queryClient = useQueryClient();

  return useMutation<TagResponse, ApiClientError, { id: string; name: string }>({
    mutationFn: ({ id, name }) =>
      apiSend<TagResponse>(`/api/me/personal/tags/${encodeURIComponent(id)}`, 'PATCH', { name }),
    onSuccess: () => invalidateTags(queryClient),
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<{ ok: true }>(`/api/me/personal/tags/${encodeURIComponent(id)}`, 'DELETE'),
    onSuccess: async () => {
      await Promise.all([invalidateTags(queryClient), requestTxCopySync()]);
    },
  });
}

export function usePersonalList(
  query: GroupListQuery,
  opts?: { enabled?: boolean; groups?: boolean },
) {
  const effectiveQuery: GroupListQuery =
    opts?.groups && query.groups === undefined ? { ...query, groups: 'show' } : query;
  return useQuery<ListResponse, ApiClientError>({
    queryKey: [...PERSONAL_LIST_KEY, effectiveQuery],
    queryFn: () =>
      apiFetch<ListResponse>(`/api/me/personal/transactions${buildListQueryString(effectiveQuery)}`),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();

  return useMutation<EntriesResponse, ApiClientError, EntryInput>({
    mutationFn: (input: EntryInput) =>
      apiSend<EntriesResponse>('/api/me/personal/transactions', 'POST', input),
    onSuccess: async () => {
      await Promise.all([invalidateEntry(queryClient), requestTxCopySync()]);
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();

  return useMutation<EntriesResponse, ApiClientError, { id: string; input: EntryInput }>({
    mutationFn: ({ id, input }) =>
      apiSend<EntriesResponse>(
        `/api/me/personal/transactions/${encodeURIComponent(id)}`,
        'PATCH',
        input,
      ),
    onSuccess: async () => {
      await Promise.all([invalidateEntry(queryClient), requestTxCopySync()]);
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation<EntriesResponse, ApiClientError, string>({
    mutationFn: (id: string) =>
      apiSend<EntriesResponse>(
        `/api/me/personal/transactions/${encodeURIComponent(id)}`,
        'DELETE',
      ),
    onSuccess: async () => {
      await Promise.all([invalidateEntry(queryClient), requestTxCopySync()]);
    },
  });
}

export function useRestoreEntries() {
  const queryClient = useQueryClient();

  return useMutation<EntriesResponse, ApiClientError, EntriesResponse>({
    mutationFn: (input: EntriesResponse) =>
      apiSend<EntriesResponse>('/api/me/personal/transactions/restore', 'POST', input),
    onSuccess: async () => {
      await Promise.all([invalidateEntry(queryClient), requestTxCopySync()]);
    },
  });
}

export function useAssets(opts?: { enabled?: boolean }) {
  return useQuery<AssetsResponse, ApiClientError>({
    queryKey: PERSONAL_ASSETS_KEY,
    queryFn: () => apiFetch<AssetsResponse>('/api/me/personal/assets'),
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation<AssetResponse, ApiClientError, CreateAssetInput>({
    mutationFn: (input: CreateAssetInput) =>
      apiSend<AssetResponse>('/api/me/personal/assets', 'POST', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();

  return useMutation<AssetResponse, ApiClientError, { id: string; input: UpdateAssetInput }>({
    mutationFn: ({ id, input }) =>
      apiSend<AssetResponse>(`/api/me/personal/assets/${encodeURIComponent(id)}`, 'PATCH', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, { id: string; moveTo?: string }>({
    mutationFn: ({ id, moveTo }) => {
      const base = `/api/me/personal/assets/${encodeURIComponent(id)}`;
      const path = moveTo ? `${base}?moveTo=${encodeURIComponent(moveTo)}` : base;
      return apiSend<{ ok: true }>(path, 'DELETE');
    },
    onSuccess: async (_data, { moveTo }) => {
      if (moveTo) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
          queryClient.invalidateQueries({ queryKey: PERSONAL_LIST_KEY }),
          queryClient.invalidateQueries({ queryKey: PERSONAL_HOLDINGS_KEY }),
          requestTxCopySync(),
        ]);
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
          requestTxCopySync(),
        ]);
      }
    },
  });
}

export interface VisibilityChange {
  id: string;
  visible: boolean;
}

export function useHoldings(walletId?: string, opts?: { enabled?: boolean }) {
  const path = walletId
    ? `/api/me/personal/holdings?walletId=${encodeURIComponent(walletId)}`
    : '/api/me/personal/holdings';

  return useQuery<HoldingsResponse, ApiClientError>({
    queryKey: [...PERSONAL_HOLDINGS_KEY, walletId ?? 'all'],
    queryFn: () => apiFetch<HoldingsResponse>(path),
    enabled: opts?.enabled ?? true,
  });
}

export function useGroupSettings(opts?: { enabled?: boolean }) {
  return useQuery<GroupSettingsResponse, ApiClientError>({
    queryKey: PERSONAL_GROUP_SETTINGS_KEY,
    queryFn: () => apiFetch<GroupSettingsResponse>('/api/me/personal/group-settings'),
    enabled: opts?.enabled ?? true,
  });
}

export function useUpdateGroupSettings() {
  const queryClient = useQueryClient();

  return useMutation<GroupSettingsResponse, ApiClientError, UpdateGroupSettingsInput>({
    mutationFn: (input: UpdateGroupSettingsInput) =>
      apiSend<GroupSettingsResponse>('/api/me/personal/group-settings', 'PUT', input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PERSONAL_GROUP_SETTINGS_KEY }),
        invalidateMoney(queryClient),
        requestTxCopySync(),
      ]);
    },
  });
}

export function useUpdateGroupLink() {
  const queryClient = useQueryClient();

  return useMutation<
    GroupLinkResponse,
    ApiClientError,
    { rootId: string; input: UpdateGroupLinkInput }
  >({
    mutationFn: ({ rootId, input }) =>
      apiSend<GroupLinkResponse>(
        `/api/me/personal/group-links/${encodeURIComponent(rootId)}`,
        'PUT',
        input,
      ),
    onSuccess: async () => {
      await Promise.all([
        invalidateMoney(queryClient),
        queryClient.invalidateQueries({ queryKey: PERSONAL_TAGS_KEY }),
        queryClient.invalidateQueries({ queryKey: PERSONAL_CATEGORIES_KEY }),
        requestTxCopySync(),
      ]);
    },
  });
}

export function useBalanceChecks(opts?: { enabled?: boolean }) {
  return useQuery<BalanceChecksResponse, ApiClientError>({
    queryKey: PERSONAL_BALANCE_CHECKS_KEY,
    queryFn: () => apiFetch<BalanceChecksResponse>('/api/me/personal/balance-checks'),
    enabled: opts?.enabled ?? true,
  });
}

export function useAnswerBalanceCheck() {
  const queryClient = useQueryClient();

  return useMutation<
    AnswerBalanceCheckResponse,
    ApiClientError,
    { walletId: string; input: AnswerBalanceCheckInput }
  >({
    mutationFn: ({ walletId, input }) =>
      apiSend<AnswerBalanceCheckResponse>(
        `/api/me/personal/wallets/${encodeURIComponent(walletId)}/balance-check`,
        'POST',
        input,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PERSONAL_BALANCE_CHECKS_KEY }),
        invalidateMoney(queryClient),
        requestTxCopySync(),
      ]);
    },
  });
}

async function invalidateVisibility(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PERSONAL_CATEGORIES_KEY }),
    queryClient.invalidateQueries({ queryKey: PERSONAL_ASSETS_KEY }),
  ]);
}

export function useSetWalletVisibility() {
  const queryClient = useQueryClient();

  return useMutation<
    { ok: true },
    ApiClientError,
    { walletId: string; categories?: VisibilityChange[]; assets?: VisibilityChange[] }
  >({
    mutationFn: ({ walletId, categories, assets }) =>
      apiSend<{ ok: true }>(
        `/api/me/personal/wallets/${encodeURIComponent(walletId)}/visibility`,
        'PUT',
        { categories, assets },
      ),
    onSuccess: () => invalidateVisibility(queryClient),
  });
}

export function useSetCategoryWallets() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, { id: string; walletIds: string[] }>({
    mutationFn: ({ id, walletIds }) =>
      apiSend<{ ok: true }>(
        `/api/me/personal/categories/${encodeURIComponent(id)}/wallets`,
        'PUT',
        { walletIds },
      ),
    onSuccess: () => invalidateVisibility(queryClient),
  });
}

export function useSetAssetWallets() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, ApiClientError, { id: string; walletIds: string[] }>({
    mutationFn: ({ id, walletIds }) =>
      apiSend<{ ok: true }>(
        `/api/me/personal/assets/${encodeURIComponent(id)}/wallets`,
        'PUT',
        { walletIds },
      ),
    onSuccess: () => invalidateVisibility(queryClient),
  });
}
