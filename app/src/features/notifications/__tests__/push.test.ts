import * as Notifications from 'expo-notifications';

import { registerPushToken, unregisterPushToken } from '../api';
import {
  getPushToken,
  registerThisDevice,
  rememberRegisteredToken,
  unregisterThisDevice,
} from '../push';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// Jest does not load the app config, so the EAS project id is given here.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: '69bd4e2b-1a34-4c28-a94f-ae66942d4aca' } } },
  },
}));
jest.mock('../api', () => ({
  registerPushToken: jest.fn(async () => undefined),
  unregisterPushToken: jest.fn(async () => undefined),
}));

beforeEach(async () => {
  // Forget any token an earlier test registered.
  await unregisterThisDevice();
  jest.clearAllMocks();
});

function allowNotifications() {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
}

afterEach(() => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);
});

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
      projectId: '69bd4e2b-1a34-4c28-a94f-ae66942d4aca',
    });
  });
});

describe('registerThisDevice', () => {
  const deviceToken = { type: 'android', data: 'fcm-device-token' } as const;

  it('registers the token once allowed, and not again while it is unchanged', async () => {
    allowNotifications();
    await registerThisDevice();
    await registerThisDevice(deviceToken);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    // Jest runs as iOS (the jest-expo default).
    expect(registerPushToken).toHaveBeenCalledWith('ExponentPushToken[test-token-000001]', 'ios');
  });

  it("builds the Expo token from the listener's device token instead of fetching one", async () => {
    // Fetching the device token on Android fires the token listener again,
    // which would loop forever.
    allowNotifications();
    await registerThisDevice(deviceToken);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: '69bd4e2b-1a34-4c28-a94f-ae66942d4aca',
      devicePushToken: deviceToken,
    });
  });

  it('registers nothing when notifications are not allowed', async () => {
    await registerThisDevice();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('does not add the device back when sign-out happens while the token is being fetched', async () => {
    allowNotifications();
    let resolveToken: (value: { data: string }) => void = () => undefined;
    jest.mocked(Notifications.getExpoPushTokenAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveToken = resolve;
      }) as never,
    );
    const registering = registerThisDevice();
    await unregisterThisDevice();
    resolveToken({ data: 'ExponentPushToken[test-token-000001]' });
    await registering;
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('takes the token off again when sign-out happens while it is being saved', async () => {
    allowNotifications();
    let finishSaving: () => void = () => undefined;
    jest.mocked(registerPushToken).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSaving = resolve;
      }) as never,
    );
    const registering = registerThisDevice();
    await waitForCall(registerPushToken);
    await unregisterThisDevice();
    finishSaving();
    await registering;
    expect(unregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[test-token-000001]');
  });
});

async function waitForCall(fn: unknown) {
  for (let i = 0; i < 20 && jest.mocked(fn as jest.Mock).mock.calls.length === 0; i += 1) {
    await Promise.resolve();
  }
}

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
