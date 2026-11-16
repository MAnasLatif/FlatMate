import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the device can reach the internet. Unknown counts as online, so a
 * slow first check never shows the offline state by mistake; a request that
 * then fails still shows its own error.
 */
export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Tells React Query when the device goes offline or online, and when the app
 * comes to the foreground. Its own detection listens for browser events that
 * React Native never fires. With this, queries pause offline instead of
 * failing, and stale ones refetch on reconnect and on returning to the app.
 */
export function connectQueryClientToDevice(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) =>
      handleFocus(status === 'active'),
    );
    return () => subscription.remove();
  });
}

function subscribeToOnline(onChange: () => void): () => void {
  return onlineManager.subscribe(onChange);
}

function readOnline(): boolean {
  return onlineManager.isOnline();
}

/** Whether the device is online, as React Query sees it. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeToOnline, readOnline);
}
