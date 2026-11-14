import { type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMembers, useMyMembership } from '@/features/apartments/hooks';
import { expenseKeys } from '@/features/expenses/hooks';
import { subscribeToTopic } from '@/lib/realtime-topic';

import {
  apartmentTopicKeys,
  keysForApartmentChange,
  keysForUserChange,
  userTopicKeys,
} from './changes';

/** Marks cached data stale, and refetches what is on screen. */
function invalidate(
  queryClient: QueryClient,
  keys: QueryKey[],
  before = Number.POSITIVE_INFINITY,
): void {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({
      queryKey,
      predicate: (query) => query.state.dataUpdatedAt < before,
    });
  }
}

/** Keeps the user's own data current while signed in: their apartments, profile and accounts. */
export function useUserChanges(userId: string): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeToTopic(`user:${userId}`, {
        onChange: (kind) => invalidate(queryClient, keysForUserChange(kind, userId)),
        onCatchUp: (before) => invalidate(queryClient, userTopicKeys(userId), before),
      }),
    [queryClient, userId],
  );
}

/**
 * Keeps an open apartment's data current while the user is one of its active
 * members. When the membership ends, the app stops listening and drops the
 * apartment's money data that no screen shows, so the saved copy keeps only
 * what a former member may still see once it is refetched.
 */
export function useApartmentChanges(apartmentId: string): void {
  const queryClient = useQueryClient();
  const members = useMembers(apartmentId);
  const membership = useMyMembership(apartmentId);
  // Until the members load, assume membership: the server refuses the topic otherwise.
  const isActiveMember = members.data === undefined || membership !== undefined;

  useEffect(() => {
    if (!isActiveMember) return;
    return subscribeToTopic(`apartment:${apartmentId}`, {
      onChange: (kind) => invalidate(queryClient, keysForApartmentChange(kind, apartmentId)),
      onCatchUp: (before) => invalidate(queryClient, apartmentTopicKeys(apartmentId), before),
    });
  }, [apartmentId, isActiveMember, queryClient]);

  useEffect(() => {
    if (isActiveMember) return;
    queryClient.removeQueries({ queryKey: expenseKeys.apartment(apartmentId), type: 'inactive' });
    void queryClient.invalidateQueries({ queryKey: expenseKeys.apartment(apartmentId) });
  }, [apartmentId, isActiveMember, queryClient]);
}
