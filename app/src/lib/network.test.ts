import NetInfo, { type NetInfoChangeHandler } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { connectQueryClientToDevice, isOnlineState, useIsOnline } from './network';

describe('isOnlineState', () => {
  it('is offline when the device has no connection or no internet', () => {
    expect(isOnlineState({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('counts an unknown state as online', () => {
    expect(isOnlineState({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true);
  });
});

describe('connectQueryClientToDevice', () => {
  let netInfoListener: NetInfoChangeHandler | undefined;
  let appStateListener: ((status: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
      netInfoListener = listener;
      return () => undefined;
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: () => undefined };
    });
    connectQueryClientToDevice();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
    jest.restoreAllMocks();
  });

  it('marks React Query offline and online with the device', async () => {
    await act(async () =>
      netInfoListener?.({ isConnected: false, isInternetReachable: false } as never),
    );
    expect(onlineManager.isOnline()).toBe(false);

    await act(async () =>
      netInfoListener?.({ isConnected: true, isInternetReachable: true } as never),
    );
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('marks React Query focused only while the app is in the foreground', async () => {
    await act(async () => appStateListener?.('background'));
    expect(focusManager.isFocused()).toBe(false);

    await act(async () => appStateListener?.('active'));
    expect(focusManager.isFocused()).toBe(true);
  });
});

describe('useIsOnline', () => {
  it('follows the online state', async () => {
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    await act(async () => onlineManager.setOnline(false));
    expect(result.current).toBe(false);

    await act(async () => onlineManager.setOnline(true));
    expect(result.current).toBe(true);
  });
});
