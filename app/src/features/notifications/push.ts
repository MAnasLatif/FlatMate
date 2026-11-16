import Constants from 'expo-constants';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { unregisterPushToken } from './api';

/**
 * The device side of push notifications. The server sends to the Android
 * channel with this id; without the channel Android shows nothing.
 */
export const ANDROID_CHANNEL_ID = 'default';

/** Shows notifications that arrive while the app is open, like ones that arrive while it is closed. */
export function showNotificationsInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * This device's Expo push token, asking for permission the first time. Null
 * when the person has not allowed notifications. Throws where push is not
 * available, such as Expo Go on Android or an emulator without Google Play.
 */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Apartment activity',
      importance: AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('The EAS project id is missing from the app config.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function pushPlatform(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** The token registered for the signed-in user on this device, kept to remove it at sign-out. */
let registeredToken: string | null = null;

export function rememberRegisteredToken(token: string | null): void {
  registeredToken = token;
}

export function takeRegisteredToken(): string | null {
  const token = registeredToken;
  registeredToken = null;
  return token;
}

/** The notification id a push carries in its data, if any. */
export function notificationIdOf(response: Notifications.NotificationResponse): string | null {
  const id = response.notification.request.content.data?.notificationId;
  return typeof id === 'string' ? id : null;
}

/**
 * Removes this device's token, so a signed-out phone stops receiving the
 * user's notifications. A failure is logged and sign-out goes ahead; the
 * next account to sign in on the device takes the token over.
 */
export async function unregisterThisDevice(): Promise<void> {
  const token = takeRegisteredToken();
  if (!token) return;
  try {
    await unregisterPushToken(token);
  } catch {
    console.warn('Could not remove this device from push notifications.');
  }
}
