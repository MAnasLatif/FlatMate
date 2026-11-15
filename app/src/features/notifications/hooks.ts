import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useCurrentUserId } from '@/features/auth/session-provider';

import {
  fetchNotificationTarget,
  fetchUnreadNotifications,
  markNotificationsRead,
  registerPushToken,
} from './api';
import { notificationHref } from './href';
import { getPushToken, notificationIdOf, pushPlatform, rememberRegisteredToken } from './push';
import type { UnreadMatch, UnreadNotification } from './unread';

export const notificationKeys = {
  /** Everything about the user's notifications: refreshed by the 'notification' change event. */
  all: (userId: string) => ['notifications', userId] as const,
  unread: (userId: string) => ['notifications', userId, 'unread-items'] as const,
};

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
    let active = true;
    const register = async (token: string | null) => {
      if (!active || !token) return;
      await registerPushToken(token, pushPlatform());
      rememberRegisteredToken(token);
    };
    getPushToken()
      .then(register)
      .catch(() => console.warn('Push notifications are not available on this device.'));
    const subscription = Notifications.addPushTokenListener(() => {
      getPushToken()
        .then(register)
        .catch(() => console.warn('Could not register the new push token.'));
    });
    return () => {
      active = false;
      subscription.remove();
    };
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
