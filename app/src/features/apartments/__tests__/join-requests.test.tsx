import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { describeNotification, notificationHref } from '@/features/notifications/describe';
import { renderWithProviders } from '@/test/render';

import {
  cancelJoinRequest,
  decideJoinRequest,
  fetchJoinRequests,
  fetchMyJoinRequests,
  joinApartment,
} from '../api';
import { JoinApartment } from '../components/join-apartment';
import { JoinRequests } from '../components/join-requests';
import { MyJoinRequests } from '../components/my-join-requests';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  joinApartment: jest.fn(),
  fetchMyJoinRequests: jest.fn(),
  cancelJoinRequest: jest.fn(),
  fetchJoinRequests: jest.fn(),
  decideJoinRequest: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('asking to join', () => {
  it('says the request was sent and does not open the apartment', async () => {
    jest.mocked(joinApartment).mockResolvedValue({
      status: 'requested',
      request_id: REQUEST,
      apartment_id: FLAT,
      apartment_name: 'Flat 4B',
    });
    await renderWithProviders(<JoinApartment />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Join code'), '7KQ2-M9XD');
    await user.press(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText('Request sent. An admin of Flat 4B will let you in.'),
    ).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows pending requests, which can be cancelled', async () => {
    jest.mocked(fetchMyJoinRequests).mockResolvedValue([
      {
        id: REQUEST,
        apartmentId: FLAT,
        apartmentName: 'Flat 4B',
        createdAt: '2026-11-14T10:00:00Z',
      },
    ]);
    jest.mocked(cancelJoinRequest).mockResolvedValue();
    await renderWithProviders(<MyJoinRequests />);

    expect(await screen.findByText('Flat 4B')).toBeOnTheScreen();
    expect(screen.getByText(/Waiting for an admin to let you in/)).toBeOnTheScreen();

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Cancel your request to join Flat 4B' }));
    expect(jest.mocked(cancelJoinRequest).mock.calls[0][0]).toBe(REQUEST);
  });

  it('shows nothing when no request is waiting', async () => {
    jest.mocked(fetchMyJoinRequests).mockResolvedValue([]);
    await renderWithProviders(<MyJoinRequests />);

    expect(screen.queryByText(/Waiting for an admin/)).not.toBeOnTheScreen();
  });
});

describe('answering requests', () => {
  beforeEach(() => {
    jest.mocked(fetchJoinRequests).mockResolvedValue([
      {
        id: REQUEST,
        userId: '22222222-2222-2222-2222-222222222222',
        displayName: 'Zubair',
        avatarPath: null,
        createdAt: '2026-11-14T10:00:00Z',
      },
    ]);
    jest.mocked(decideJoinRequest).mockResolvedValue();
  });

  it('lets an admin let someone in', async () => {
    await renderWithProviders(<JoinRequests apartmentId={FLAT} />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Let Zubair in' }));

    expect(decideJoinRequest).toHaveBeenCalledWith(REQUEST, true);
  });

  it('lets an admin decline', async () => {
    await renderWithProviders(<JoinRequests apartmentId={FLAT} />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Decline Zubair' }));

    expect(decideJoinRequest).toHaveBeenCalledWith(REQUEST, false);
  });

  it('says when another admin answered first', async () => {
    jest
      .mocked(decideJoinRequest)
      .mockRejectedValue(
        Object.assign(new Error('x'), { code: '22023', message: 'request_not_pending' }),
      );
    await renderWithProviders(<JoinRequests apartmentId={FLAT} />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Let Zubair in' }));

    expect(
      await screen.findByText('Another admin already answered this request.'),
    ).toBeOnTheScreen();
  });
});

describe('join request notifications', () => {
  it('words each kind and sends a declined one home', () => {
    expect(describeNotification({ type: 'join_request.requested', actorName: 'Zubair' })).toBe(
      'Zubair asked to join the apartment.',
    );
    expect(describeNotification({ type: 'join_request.approved', actorName: 'Anas' })).toBe(
      'Anas let you into the apartment.',
    );
    expect(
      notificationHref({ recordType: 'join_request', recordId: REQUEST, apartmentId: FLAT }),
    ).toBe('/');
  });
});
