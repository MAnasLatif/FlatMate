import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import MembersScreen from '@/app/(app)/apartments/[apartmentId]/members';

import { fetchPairBalances, fetchPairExpensesPage, type PairExpense } from '../api';
import { PairLedger } from '../components/pair-ledger';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchPairBalances: jest.fn(),
  fetchPairExpensesPage: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const AJMAL = '33333333-3333-3333-3333-333333333333';

const amounts = (finalMinor = 0, provisionalMinor = 0, disputedMinor = 0) => ({
  finalMinor,
  provisionalMinor,
  disputedMinor,
});

function sharedExpense(overrides: Partial<PairExpense>): PairExpense {
  return {
    expenseId: 'e1',
    title: 'Groceries',
    expenseDate: '2026-11-13',
    currency: 'PKR',
    status: 'provisional',
    paidStatus: 'paid',
    oweMinor: 0,
    owedMinor: 0,
    ...overrides,
  };
}

const pairBalances = jest.mocked(fetchPairBalances);
const pairExpenses = jest.mocked(fetchPairExpensesPage);

beforeEach(() => {
  jest.clearAllMocks();
  // Zubair: Anas owes 150.00 for groceries, Zubair owes 66.67 for cleaning (AC-04).
  pairBalances.mockResolvedValue([
    { counterpartyId: ZUBAIR, owe: amounts(0, 15_000), owed: amounts(0, 6667) },
    { counterpartyId: AJMAL, owe: amounts(), owed: amounts(0, 0, 6666) },
  ]);
  pairExpenses.mockResolvedValue([]);
});

describe('PairLedger', () => {
  it('shows both directions, the net and the expenses behind them', async () => {
    pairExpenses.mockResolvedValue([
      sharedExpense({ expenseId: 'g', title: 'Groceries', oweMinor: 15_000 }),
      sharedExpense({ expenseId: 'c', title: 'Cleaning', owedMinor: 6667 }),
      sharedExpense({ expenseId: 'v', title: 'Snacks', status: 'void' }),
    ]);
    await renderWithProviders(
      <PairLedger apartmentId={APARTMENT} counterpartyId={ZUBAIR} name="Zubair" currency="PKR" />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText('You owe Zubair 83.33 PKR')).toBeOnTheScreen();
    expect(screen.getByText('Zubair owes you')).toBeOnTheScreen();
    expect(screen.getByText('66.67 PKR')).toBeOnTheScreen();
    expect(screen.getByText('150.00 PKR')).toBeOnTheScreen();
    expect(screen.getAllByText('Provisional').length).toBeGreaterThan(0);

    expect(await screen.findByText('You owe Zubair 150.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText('Zubair owes you 66.67 PKR')).toBeOnTheScreen();
    expect(screen.getByText('Nothing between you now')).toBeOnTheScreen();
    expect(pairExpenses).toHaveBeenCalledWith(APARTMENT, ZUBAIR, 0);

    await user.press(screen.getByRole('button', { name: /Cleaning/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
      params: { apartmentId: APARTMENT, expenseId: 'c' },
    });
  });

  it('keeps disputed amounts out of the net and says so', async () => {
    await renderWithProviders(
      <PairLedger apartmentId={APARTMENT} counterpartyId={AJMAL} name="Ajmal" currency="PKR" />,
    );

    expect(await screen.findByText('You and Ajmal are square')).toBeOnTheScreen();
    expect(
      screen.getByText('Held by open disputes and not counted above: 66.66 PKR to you.'),
    ).toBeOnTheScreen();
    expect(await screen.findByText('No expenses between you and Ajmal yet.')).toBeOnTheScreen();
  });
});

describe('Members directory', () => {
  const apartment: Apartment = {
    id: APARTMENT,
    name: 'Flat 4B',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    settlement_day: 1,
    approval_days: 7,
    location: null,
    show_location: false,
    created_by: ZUBAIR,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };
  const member = (userId: string, displayName: string, leftAt: string | null = null): Member => ({
    membershipId: `m-${userId}`,
    userId,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt,
    leftReason: leftAt ? 'left' : null,
    displayName,
    avatarPath: null,
  });

  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT });
    jest.mocked(fetchApartment).mockResolvedValue(apartment);
    jest
      .mocked(fetchMembers)
      .mockResolvedValue([
        member(ANAS, 'Anas'),
        member(ZUBAIR, 'Zubair'),
        member(AJMAL, 'Ajmal', '2026-11-10T00:00:00Z'),
      ]);
  });

  it("shows each member's balance with the viewer and opens the pairwise ledger (FR-06.2)", async () => {
    await renderWithProviders(<MembersScreen />);
    const user = userEvent.setup();

    expect(await screen.findByText('You owe 83.33 PKR')).toBeOnTheScreen();
    expect(
      screen.getByText('you owe 150.00 PKR, they owe 66.67 PKR · provisional'),
    ).toBeOnTheScreen();
    expect(screen.getByText('some held by a dispute')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Balance with Anas' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Balance with Zubair' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ZUBAIR },
    });

    await user.press(screen.getByRole('button', { name: 'Balance with Ajmal' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId: APARTMENT, memberId: AJMAL },
    });
  });

  it('still lists the members when balances cannot be loaded', async () => {
    pairBalances.mockRejectedValue(new Error('boom'));
    await renderWithProviders(<MembersScreen />);

    expect(await screen.findByText(/Could not load balances/)).toBeOnTheScreen();
    expect(screen.getByText('Zubair')).toBeOnTheScreen();
  });
});
