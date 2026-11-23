import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useCurrentUserId } from '@/features/auth/session-provider';

import {
  fetchMutedPushCategories,
  fetchNotificationTarget,
  fetchUnreadNotifications,
  markNotificationsRead,
  setPushCategoryEnabled,
} from './api';
import { notificationHref } from './href';
import { type PushCategory, withPushSetting } from './preferences';
import { notificationIdOf, registerThisDevice } from './push';
import type { UnreadMatch, UnreadNotification } from './unread';

export const notificationKeys = {
  /** Everything about the user's notifications: refreshed by the 'notification' change event. */
  all: (userId: string) => ['notifications', userId] as const,
  unread: (userId: string) => ['notifications', userId, 'unread-items'] as const,
  /** Which push groups are off: refreshed by the 'notification_preference' change event. */
  pushPreferences: (userId: string) => ['notification-preferences', userId] as const,
};

/** The push groups the user turned off. */
export function useMutedPushCategories(userId: string) {
  return useQuery({
    queryKey: notificationKeys.pushPreferences(userId),
    queryFn: fetchMutedPushCategories,
  });
}

/** Turns one push group on or off. The switch moves at once and moves back if saving fails. */
export function useSetPushCategory(userId: string) {
  const queryClient = useQueryClient();
  const key = notificationKeys.pushPreferences(userId);
  return useMutation({
    mutationFn: (input: { category: PushCategory; isEnabled: boolean }) =>
      setPushCategoryEnabled(input.category, input.isEnabled),
    onMutate: async ({ category, isEnabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PushCategory[]>(key);
      queryClient.setQueryData<PushCategory[]>(key, (muted) =>
        withPushSetting(muted ?? [], category, isEnabled),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useUnreadNotifications() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: () => fetchUnreadNotifications(userId),
  });
}

/** Tells whether anything unread matches, for the red dots. Call once and use it for every row. */
export function useIsUnread(): (match: UnreadMatch) => boolean {
  const items = useUnreadNotifications().data;
  return useCallback((match: UnreadMatch) => items?.some(match) ?? false, [items]);
}

export function useHasUnread(match: UnreadMatch): boolean {
  return useIsUnread()(match);
}

/** How many unread notifications match, for the number on an icon's badge. */
export function useUnreadCount(match: UnreadMatch): number {
  return useUnreadNotifications().data?.filter(match).length ?? 0;
}

export function useMarkRead(userId: string) {
  const queryClient = useQueryClient();
  const key = notificationKeys.unread(userId);
  return useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    // The dots go at once, not after the server answers.
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<UnreadNotification[]>(key, (items) =>
        items?.filter((item) => !ids.includes(item.id)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) }),
  });
}

/**
 * Marks what a screen shows as read once the user opens it, which clears the
 * red dots that led there. Pass null while the screen does not yet know what
 * it shows. A failure, such as being offline, leaves the dots for next time.
 */
export function useMarkSeen(match: UnreadMatch | null): void {
  const userId = useCurrentUserId();
  const items = useUnreadNotifications().data;
  const { mutate } = useMarkRead(userId);
  const requested = useRef(new Set<string>());
  const key =
    match && items
      ? items
          .filter(match)
          .map((item) => item.id)
          .join(',')
      : '';

  useEffect(() => {
    const ids = key ? key.split(',').filter((id) => !requested.current.has(id)) : [];
    if (ids.length === 0) return;
    ids.forEach((id) => requested.current.add(id));
    mutate(ids, { onError: () => ids.forEach((id) => requested.current.delete(id)) });
  }, [key, mutate]);
}

/**
 * Registers this device for the signed-in user's push notifications, asking
 * for permission the first time, and again whenever Expo issues a new token.
 * Failing to register never blocks the app: the red dots still work.
 */
export function usePushRegistration(userId: string): void {
  useEffect(() => {
    registerThisDevice().catch(() =>
      console.warn('Push notifications are not available on this device.'),
    );
    const subscription = Notifications.addPushTokenListener((devicePushToken) => {
      registerThisDevice(devicePushToken).catch(() =>
        console.warn('Could not register the new push token.'),
      );
    });
    return () => subscription.remove();
  }, [userId]);
}

/**
 * Opens the record a tapped push notification is about. It loads the
 * notification first, which only its owner can read, and then the record's
 * screen checks access again (FR-09.3). Handles taps that launched the app.
 * A notification that is gone opens the app where it would otherwise start.
 */
export function useOpenTappedNotification(userId: string): void {
  const response = Notifications.useLastNotificationResponse();
  const { mutate } = useMarkRead(userId);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = notificationIdOf(response);
    void Notifications.clearLastNotificationResponseAsync();
    if (!id) return;
    fetchNotificationTarget(id)
      .then((target) => {
        if (!target) {
          router.push('/');
          return;
        }
        mutate([target.id]);
        router.push(notificationHref(target));
      })
      .catch(() => router.push('/'));
  }, [response, mutate]);
}
