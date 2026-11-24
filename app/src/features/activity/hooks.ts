import { useInfiniteQuery } from '@tanstack/react-query';

import { ACTIVITY_PAGE_SIZE, type ActivityFilter, fetchActivityPage } from './api';

export const activityKeys = {
  /** Every change in an apartment adds to its timeline. */
  all: (apartmentId: string) => ['activity', apartmentId] as const,
  list: (apartmentId: string, filter: ActivityFilter) =>
    ['activity', apartmentId, filter.group, filter.actorId] as const,
};

export function useActivity(apartmentId: string, filter: ActivityFilter) {
  return useInfiniteQuery({
    queryKey: activityKeys.list(apartmentId, filter),
    queryFn: ({ pageParam }) => fetchActivityPage(apartmentId, filter, pageParam),
    // A changed filter keeps the entries on screen until the new ones arrive.
    placeholderData: (previous) => previous,
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === ACTIVITY_PAGE_SIZE ? (lastPage[lastPage.length - 1]?.id ?? null) : null,
  });
}
