import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test/render';

import {
  answerRejoinInvite,
  fetchMyRejoinInvites,
  fetchRejoinInvites,
  hideFormerMember,
  inviteBack,
  type Member,
} from '../api';
import { MemberActionsMenu } from '../components/member-actions-menu';
import { MyRejoinInvites } from '../components/my-rejoin-invites';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
// HeroUI's menu opens in a portal the test renderer does not mount, so its
// items render in place here; the test checks which actions are offered.
jest.mock('heroui-native', () => {
  const actual = jest.requireActual('heroui-native');
  const { Pressable, Text } = jest.requireActual('react-native');
  const PassThrough = ({ children }: { children?: unknown }) => children ?? null;
  const Menu = Object.assign(PassThrough, {
    Trigger: Pressable,
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Item: Pressable,
    ItemTitle: Text,
  });
  return { ...actual, Menu };
});
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchMyRejoinInvites: jest.fn(),
  answerRejoinInvite: jest.fn(),
  fetchRejoinInvites: jest.fn(),
  inviteBack: jest.fn(async () => 'invite-1'),
  hideFormerMember: jest.fn(async () => undefined),
}));

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const arsal: Member = {
  membershipId: 'm-arsal',
  userId: '33333333-3333-3333-3333-333333333333',
  role: 'member',
  canAddExpense: true,
  joinedAt: '2026-11-01T00:00:00Z',
  leftAt: '2026-11-15T00:00:00Z',
  leftReason: 'left',
  hiddenAt: null,
  displayName: 'Arsal',
  avatarPath: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchRejoinInvites).mockResolvedValue([]);
});

describe('MyRejoinInvites', () => {
  it('shows who invited the user back, and rejoining opens the apartment', async () => {
    jest.mocked(fetchMyRejoinInvites).mockResolvedValue([
      {
        id: 'invite-1',
        apartmentId: FLAT,
        apartmentName: 'Flat 4B',
        invitedByName: 'Anas',
        createdAt: '2026-11-15T09:00:00Z',
      },
    ]);
    jest.mocked(answerRejoinInvite).mockResolvedValue(FLAT);
    await renderWithProviders(<MyRejoinInvites />);

    expect(await screen.findByText('Anas invited you back to Flat 4B')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Rejoin Flat 4B' }));

    expect(answerRejoinInvite).toHaveBeenCalledWith('invite-1', true);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/apartments/[apartmentId]',
        params: { apartmentId: FLAT },
      }),
    );
  });

  it('shows nothing when there are no invitations', async () => {
    jest.mocked(fetchMyRejoinInvites).mockResolvedValue([]);
    await renderWithProviders(<MyRejoinInvites />);
    await waitFor(() => expect(fetchMyRejoinInvites).toHaveBeenCalled());
    expect(screen.queryByText(/invited you back/)).not.toBeOnTheScreen();
  });
});

describe('MemberActionsMenu', () => {
  it('offers a former member an invitation back and removal from the list', async () => {
    await renderWithProviders(<MemberActionsMenu apartmentId={FLAT} member={arsal} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Actions for Arsal' }));
    expect(await screen.findByText('Remove from list')).toBeOnTheScreen();
    expect(screen.queryByText('Remove from apartment')).not.toBeOnTheScreen();

    await user.press(screen.getByText('Invite back'));
    await waitFor(() => expect(inviteBack).toHaveBeenCalledWith(FLAT, arsal.userId));
    expect(hideFormerMember).not.toHaveBeenCalled();
  });

  it('offers to withdraw an invitation that is still waiting', async () => {
    jest
      .mocked(fetchRejoinInvites)
      .mockResolvedValue([{ id: 'invite-1', userId: arsal.userId, createdAt: '2026-11-15' }]);
    await renderWithProviders(<MemberActionsMenu apartmentId={FLAT} member={arsal} />);
    await waitFor(() => expect(fetchRejoinInvites).toHaveBeenCalled());

    await userEvent.setup().press(screen.getByRole('button', { name: 'Actions for Arsal' }));
    expect(await screen.findByText('Withdraw invitation')).toBeOnTheScreen();
    expect(screen.queryByText('Invite back')).not.toBeOnTheScreen();
  });

  it('offers a current member the role, permission and removal', async () => {
    await renderWithProviders(
      <MemberActionsMenu
        apartmentId={FLAT}
        member={{ ...arsal, leftAt: null, leftReason: null }}
      />,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Actions for Arsal' }));

    expect(await screen.findByText('Make admin')).toBeOnTheScreen();
    expect(screen.getByText('Stop adding expenses')).toBeOnTheScreen();
    expect(screen.getByText('Remove from apartment')).toBeOnTheScreen();
    expect(screen.queryByText('Invite back')).not.toBeOnTheScreen();
  });
});
