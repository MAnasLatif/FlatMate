import * as Notifications from 'expo-notifications';

import { registerPushToken, unregisterPushToken } from '../api';
import { getPushToken, rememberRegisteredToken, unregisterThisDevice } from '../push';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// Jest does not load the app config, so the EAS project id is given here.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: '1bbde0d8-94b5-4446-8591-a0179d09d30d' } } },
  },
}));
jest.mock('../api', () => ({
  registerPushToken: jest.fn(async () => undefined),
  unregisterPushToken: jest.fn(async () => undefined),
}));

beforeEach(() => jest.clearAllMocks());

describe('getPushToken', () => {
  it('asks for permission once, and returns nothing when it is refused', async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'undetermined' } as never);
    jest
      .mocked(Notifications.requestPermissionsAsync)
      .mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await getPushToken()).toBeNull();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('does not ask again once refused', async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await getPushToken()).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns the Expo token for the project once allowed', async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'granted' } as never);
    expect(await getPushToken()).toBe('ExponentPushToken[test-token-000001]');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: '1bbde0d8-94b5-4446-8591-a0179d09d30d',
    });
  });
});

describe('unregisterThisDevice', () => {
  it('removes the token this device registered, once', async () => {
    rememberRegisteredToken('ExponentPushToken[phone-000000001]');
    await unregisterThisDevice();
    await unregisterThisDevice();
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(unregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[phone-000000001]');
  });

  it('lets sign-out go ahead when removing the token fails', async () => {
    jest.mocked(unregisterPushToken).mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    rememberRegisteredToken('ExponentPushToken[phone-000000001]');
    await expect(unregisterThisDevice()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('does nothing when no token was registered', async () => {
    await unregisterThisDevice();
    expect(unregisterPushToken).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });
});
