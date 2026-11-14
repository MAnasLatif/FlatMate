import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import {
  fetchNotification,
  fetchNotificationsPage,
  fetchUnreadCount,
  markNotificationsRead,
  NOTIFICATIONS_PAGE_SIZE,
  registerPushToken,
} from './api';
import { notificationHref } from './describe';
import { getPushToken, notificationIdOf, pushPlatform, rememberRegisteredToken } from './push';

export const notificationKeys = {
  /** Everything about the user's inbox: refreshed by the 'notification' change event. */
  all: (userId: string) => ['notifications', userId] as const,
  list: (userId: string) => ['notifications', userId, 'list'] as const,
  unread: (userId: string) => ['notifications', userId, 'unread'] as const,
};

export function useNotifications(userId: string) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === NOTIFICATIONS_PAGE_SIZE ? pages.length : undefined,
  });
}

export function useUnreadCount(userId: string) {
  return useQuery({ queryKey: notificationKeys.unread(userId), queryFn: fetchUnreadCount });
}

export function useMarkRead(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) }),
  });
}

/**
 * Registers this device for the signed-in user's push notifications, asking
 * for permission the first time, and again whenever Expo issues a new token.
 * Failing to register never blocks the app: the inbox still works.
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
 */
export function useOpenTappedNotification(userId: string): void {
  const response = Notifications.useLastNotificationResponse();
  const markRead = useMarkRead(userId);
  const { mutate } = markRead;

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = notificationIdOf(response);
    void Notifications.clearLastNotificationResponseAsync();
    if (!id) return;
    fetchNotification(id)
      .then((item) => {
        if (!item) {
          router.push('/notifications');
          return;
        }
        mutate([item.id]);
        router.push(notificationHref(item));
      })
      .catch(() => router.push('/notifications'));
  }, [response, mutate]);
}
