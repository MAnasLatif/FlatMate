import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test/render';

import {
  fetchNotification,
  fetchNotificationsPage,
  markNotificationsRead,
  type NotificationItem,
} from '../api';
import { Inbox } from '../components/inbox';
import { useOpenTappedNotification } from '../hooks';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchNotificationsPage: jest.fn(),
  fetchNotification: jest.fn(),
  markNotificationsRead: jest.fn(async () => undefined),
}));

const ME = '11111111-1111-1111-1111-111111111111';

const recorded: NotificationItem = {
  id: 'n-1',
  apartmentId: 'apt',
  apartmentName: 'Flat 4B',
  type: 'payment.recorded',
  recordType: 'payment',
  recordId: 'pay-1',
  actorName: 'Zubair',
  createdAt: '2026-11-14T09:14:00Z',
  readAt: null,
};

beforeEach(() => jest.clearAllMocks());

describe('Inbox', () => {
  it('lists notifications with their apartment, and opens one, marking it read', async () => {
    jest.mocked(fetchNotificationsPage).mockResolvedValue([recorded]);
    await renderWithProviders(<Inbox userId={ME} />);

    expect(
      await screen.findByText('Zubair recorded a payment to you. Check that it arrived.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Flat 4B')).toBeOnTheScreen();

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: /^Unread\. Zubair recorded/ }));
    expect(markNotificationsRead).toHaveBeenCalledWith(['n-1']);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/payments/[paymentId]',
      params: { apartmentId: 'apt', paymentId: 'pay-1' },
    });
  });

  it('marks everything read at once', async () => {
    jest.mocked(fetchNotificationsPage).mockResolvedValue([recorded]);
    await renderWithProviders(<Inbox userId={ME} />);
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(markNotificationsRead).toHaveBeenCalledWith(undefined);
  });

  it('explains an empty inbox', async () => {
    jest.mocked(fetchNotificationsPage).mockResolvedValue([]);
    await renderWithProviders(<Inbox userId={ME} />);
    expect(await screen.findByText('No notifications yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeOnTheScreen();
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
    jest.mocked(fetchNotification).mockResolvedValue(recorded);
    await renderWithProviders(<TappedNotification />);

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/apartments/[apartmentId]/payments/[paymentId]',
        params: { apartmentId: 'apt', paymentId: 'pay-1' },
      }),
    );
    expect(fetchNotification).toHaveBeenCalledWith('n-1');
    expect(markNotificationsRead).toHaveBeenCalledWith(['n-1']);
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('opens the inbox when the notification cannot be read', async () => {
    tap('n-gone');
    jest.mocked(fetchNotification).mockResolvedValue(null);
    await renderWithProviders(<TappedNotification />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/notifications'));
  });

  it('ignores a push without a notification id', async () => {
    tap(42);
    await renderWithProviders(<TappedNotification />);
    await act(async () => undefined);
    expect(fetchNotification).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
