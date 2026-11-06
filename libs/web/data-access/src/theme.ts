import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isThemeId, type MeResponse, type ThemeId, type TripView } from '@cc/core';
import { cacheTheme, readCachedTheme } from '@cc/web-util/themeCache';
import { apiSend, type ApiClientError } from './client';

export function useSetMyTheme() {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    ApiClientError,
    ThemeId | null,
    { previousMe: MeResponse | undefined; previousCached: ThemeId | null }
  >({
    mutationFn: (theme: ThemeId | null) => apiSend('/api/me', 'PATCH', { theme }),
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: ['me'] });
      const previousMe = queryClient.getQueryData<MeResponse>(['me']);
      const previousCached = isThemeId(previousMe?.user?.theme)
        ? previousMe.user.theme
        : readCachedTheme();
      if (previousMe?.user) {
        queryClient.setQueryData<MeResponse>(['me'], {
          ...previousMe,
          user: { ...previousMe.user, theme },
        });
      }
      cacheTheme(theme);
      return { previousMe, previousCached };
    },
    onError: (_err, _theme, context) => {
      if (context) {
        if (context.previousMe !== undefined) {
          queryClient.setQueryData(['me'], context.previousMe);
        }
        cacheTheme(context.previousCached);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useSetGroupTheme(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    ApiClientError,
    ThemeId | null,
    { previousTrip: TripView | undefined }
  >({
    mutationFn: (theme: ThemeId | null) =>
      apiSend('/api/trips/' + tripId, 'PATCH', { theme }, tripId),
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: ['trip', tripId] });
      const previousTrip = queryClient.getQueryData<TripView>(['trip', tripId]);
      if (previousTrip) {
        queryClient.setQueryData<TripView>(['trip', tripId], {
          ...previousTrip,
          trip: { ...previousTrip.trip, theme },
        });
      }
      return { previousTrip };
    },
    onError: (_err, _theme, context) => {
      if (context?.previousTrip !== undefined) {
        queryClient.setQueryData(['trip', tripId], context.previousTrip);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
  });
}
