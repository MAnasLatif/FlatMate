import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { fetchClosedPeriodsPage, fetchPairObligations, fetchSettlementPreview } from '../api';
import { SettleWith } from '../components/settle-with';
import { SettlementOverview } from '../components/settlement-overview';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const AJMAL = '33333333-3333-3333-3333-333333333333';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchSettlementPreview: jest.fn(),
  fetchClosedPeriodsPage: jest.fn(),
  fetchPairObligations: jest.fn(),
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
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair'), member(AJMAL, 'Ajmal')]);
  jest.mocked(fetchSettlementPreview).mockResolvedValue({
    period: { id: 'p', startsOn: '2026-11-01', endsOn: '2026-11-30' },
    rows: [
      {
        counterpartyId: ZUBAIR,
        oweMinor: 12_000,
        owedMinor: 15_000,
        heldOweMinor: 0,
        heldOwedMinor: 0,
      },
      { counterpartyId: AJMAL, oweMinor: 0, owedMinor: 0, heldOweMinor: 0, heldOwedMinor: 6666 },
    ],
  });
  jest.mocked(fetchClosedPeriodsPage).mockResolvedValue([
    {
      id: 'oct',
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      closedAt: '2026-11-01T00:05:00Z',
      openDisputeCount: 1,
      balances: [
        {
          memberA: ANAS,
          memberB: ZUBAIR,
          finalMinor: 0,
          provisionalMinor: -6000,
          disputedMinor: 0,
        },
      ],
    },
  ]);
});

describe('SettlementOverview', () => {
  it('previews each flatmate and the carried-forward history (FR-08.3, FR-08.5)', async () => {
    await renderWithProviders(<SettlementOverview apartmentId={APARTMENT} />);
    const user = userEvent.setup();

    expect(
      await screen.findByText(/nothing is cleared just because the date passes/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Zubair owes you 30.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText('You owe 120.00 PKR · Zubair owes you 150.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText('66.66 PKR held by disputes')).toBeOnTheScreen();
    expect(await screen.findByText('Zubair owed you 60.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText(/with 1 open dispute carried forward/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: /Zubair owes you 30.00 PKR/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/settlement/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ZUBAIR },
    });
  });
});

describe('SettleWith', () => {
  it('shows which obligations payments cover, oldest first, and offers to pay or net off (AC-09)', async () => {
    jest.mocked(fetchPairObligations).mockResolvedValue([
      {
        expenseId: 'g',
        title: 'Groceries',
        expenseDate: '2026-11-02',
        direction: 'owe',
        amountMinor: 12_000,
        coveredMinor: 0,
        isHeld: false,
      },
      {
        expenseId: 'c',
        title: 'Cleaning',
        expenseDate: '2026-11-01',
        direction: 'owed',
        amountMinor: 10_000,
        coveredMinor: 10_000,
        isHeld: false,
      },
      {
        expenseId: 's',
        title: 'Snacks',
        expenseDate: '2026-11-03',
        direction: 'owed',
        amountMinor: 5000,
        coveredMinor: 2000,
        isHeld: false,
      },
    ]);
    await renderWithProviders(
      <SettleWith apartmentId={APARTMENT} memberId={ZUBAIR} name="Zubair" />,
    );
    const user = userEvent.setup();

    expect(
      await screen.findByRole('button', { name: 'Cleaning, 100.00 PKR, settled' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Snacks, 50.00 PKR, partly settled' }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/30.00 PKR left/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Groceries, 120.00 PKR, open' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Pay or net off with Zubair' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/pay/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ZUBAIR },
    });
  });
});
