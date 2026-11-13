import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  leaveApartment,
  type Member,
} from '@/features/apartments/api';
import { fetchDisplayNames } from '@/features/profile/api';
import { renderWithProviders } from '@/test/render';

import { fetchMyExits, fetchSettlementPreview } from '../api';
import { LeaveApartment } from '../components/leave-apartment';
import { PastApartments } from '../components/past-apartments';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '22222222-2222-2222-2222-222222222222',
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  leaveApartment: jest.fn(),
}));
jest.mock('@/features/profile/api', () => ({
  ...jest.requireActual('@/features/profile/api'),
  fetchDisplayNames: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchSettlementPreview: jest.fn(),
  fetchMyExits: jest.fn(),
}));

const apartment: Apartment = {
  id: APARTMENT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  location: null,
  show_location: false,
  created_by: ANAS,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

function member(userId: string, displayName: string): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    displayName,
    avatarPath: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
  jest.mocked(fetchSettlementPreview).mockResolvedValue({
    period: { id: 'p', startsOn: '2026-11-01', endsOn: '2026-11-30' },
    rows: [
      { counterpartyId: ANAS, oweMinor: 10_000, owedMinor: 0, heldOweMinor: 0, heldOwedMinor: 0 },
    ],
  });
});

describe('LeaveApartment', () => {
  it('shows what is still owed before leaving, and leaves after confirming (FR-02.4)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Leave')?.onPress?.();
    });
    jest.mocked(leaveApartment).mockResolvedValue(undefined);
    await renderWithProviders(<LeaveApartment apartmentId={APARTMENT} />);
    const user = userEvent.setup();

    expect(await screen.findByText('You still owe Anas 100.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText(/Leaving keeps every record/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Leave apartment' }));

    expect(leaveApartment).toHaveBeenCalledWith(APARTMENT);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });
});

describe('PastApartments', () => {
  it('lists what the user owed when they left, with names from profiles, and a way to settle', async () => {
    jest.mocked(fetchMyExits).mockResolvedValue([
      {
        id: 'exit',
        apartmentId: APARTMENT,
        apartmentName: 'Flat 4B',
        currency: 'PKR',
        reason: 'left',
        exitedAt: '2026-11-14T10:00:00Z',
        balances: [{ counterpartyId: ANAS, payableMinor: 10_000, heldMinor: 0 }],
      },
    ]);
    jest.mocked(fetchDisplayNames).mockResolvedValue({ [ANAS]: 'Anas' });
    await renderWithProviders(<PastApartments />);
    const user = userEvent.setup();

    expect(await screen.findByText('You owed Anas 100.00 PKR')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'See what is left to settle' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/settlement',
      params: { apartmentId: APARTMENT },
    });
  });
});

describe('names for a former member', () => {
  it('come from profiles when the member list only holds the user', async () => {
    jest
      .mocked(fetchMembers)
      .mockResolvedValue([{ ...member(ZUBAIR, 'Zubair'), leftAt: '2026-11-14T10:00:00Z' }]);
    jest.mocked(fetchDisplayNames).mockResolvedValue({ [ANAS]: 'Anas' });
    await renderWithProviders(<LeaveApartment apartmentId={APARTMENT} />);

    expect(await screen.findByText('You still owe Anas 100.00 PKR')).toBeOnTheScreen();
    expect(fetchDisplayNames).toHaveBeenCalledWith([ANAS]);
  });
});
