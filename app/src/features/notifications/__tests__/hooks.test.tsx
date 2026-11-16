import { act, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test/render';

import {
  fetchNotificationTarget,
  fetchUnreadNotifications,
  markNotificationsRead,
  type NotificationTarget,
} from '../api';
import { useHasUnread, useMarkSeen, useOpenTappedNotification } from '../hooks';
import { type UnreadMatch, type UnreadNotification, unreadMatches } from '../unread';

const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchNotificationTarget: jest.fn(),
  fetchUnreadNotifications: jest.fn(),
  markNotificationsRead: jest.fn(async () => undefined),
}));

const recorded: NotificationTarget = {
  id: 'n-1',
  apartmentId: 'apt',
  recordType: 'payment',
  recordId: 'pay-1',
  type: 'payment.recorded',
};

function unread(overrides: Partial<UnreadNotification>): UnreadNotification {
  return {
    id: 'n-1',
    apartmentId: 'apt',
    recordType: 'expense',
    type: 'expense.created',
    recordId: 'e-1',
    expenseId: null,
    counterpartyId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchUnreadNotifications).mockResolvedValue([]);
});

/** Opens a screen that clears `seen` and shows whether `shown` still has a dot. */
function Place({ seen, shown }: { seen: UnreadMatch | null; shown: UnreadMatch }) {
  useMarkSeen(seen);
  return <Text>{useHasUnread(shown) ? 'dot' : 'no dot'}</Text>;
}

describe('useMarkSeen', () => {
  it('marks read what the opened screen shows, and its dot goes at once', async () => {
    jest
      .mocked(fetchUnreadNotifications)
      .mockResolvedValueOnce([
        unread({ id: 'n-1', recordId: 'e-1' }),
        unread({ id: 'n-2', recordId: 'e-2' }),
      ])
      // What the server says after the first one is read.
      .mockResolvedValue([unread({ id: 'n-2', recordId: 'e-2' })]);
    const match = unreadMatches.expense('apt', 'e-1');
    await renderWithProviders(<Place seen={match} shown={match} />);

    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledWith(['n-1']));
    expect(await screen.findByText('no dot')).toBeOnTheScreen();
    expect(markNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('leaves other places marked', async () => {
    jest
      .mocked(fetchUnreadNotifications)
      .mockResolvedValue([unread({ id: 'n-2', recordId: 'e-2' })]);
    await renderWithProviders(
      <Place
        seen={unreadMatches.expense('apt', 'e-1')}
        shown={unreadMatches.expense('apt', 'e-2')}
      />,
    );

    expect(await screen.findByText('dot')).toBeOnTheScreen();
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it('waits while the screen does not know what it shows', async () => {
    jest.mocked(fetchUnreadNotifications).mockResolvedValue([unread({})]);
    await renderWithProviders(<Place seen={null} shown={unreadMatches.expense('apt', 'e-1')} />);

    expect(await screen.findByText('dot')).toBeOnTheScreen();
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });
});

function TappedNotification() {
  useOpenTappedNotification(ME);
  return null;
}

function tap(notificationId: unknown) {
  jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue({
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: { request: { content: { data: { notificationId } } } },
  } as never);
}

describe('useOpenTappedNotification', () => {
  afterEach(() => jest.mocked(Notifications.useLastNotificationResponse).mockReturnValue(null));

  it('opens the record a tapped push is about, after loading it under the user own access', async () => {
    tap('n-1');
    jest.mocked(fetchNotificationTarget).mockResolvedValue(recorded);
    await renderWithProviders(<TappedNotification />);

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/apartments/[apartmentId]/payments/[paymentId]',
        params: { apartmentId: 'apt', paymentId: 'pay-1' },
      }),
    );
    expect(fetchNotificationTarget).toHaveBeenCalledWith('n-1');
    expect(markNotificationsRead).toHaveBeenCalledWith(['n-1']);
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('opens the app where it starts when the notification cannot be read', async () => {
    tap('n-gone');
    jest.mocked(fetchNotificationTarget).mockResolvedValue(null);
    await renderWithProviders(<TappedNotification />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'));
  });

  it('ignores a push without a notification id', async () => {
    tap(42);
    await renderWithProviders(<TappedNotification />);
    await act(async () => undefined);
    expect(fetchNotificationTarget).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
