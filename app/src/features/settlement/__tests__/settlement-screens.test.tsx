import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { fetchClosedPeriodsPage, fetchPairObligations, fetchSettlementPreview } from '../api';
import { OtherDebts } from '../components/other-debts';
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
  due_reminder_days: 1,
  settlement_reminder_days: 2,
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
    hiddenAt: null,
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
    expect(screen.getByText('Zubair owes you Rs 30.00')).toBeOnTheScreen();
    expect(screen.getByText('You owe Rs 120.00 · Zubair owes you Rs 150.00')).toBeOnTheScreen();
    expect(screen.getByText('Rs 66.66 held by disputes')).toBeOnTheScreen();
    expect(await screen.findByText('Zubair owed you Rs 60.00')).toBeOnTheScreen();
    expect(screen.getByText(/with 1 open dispute carried forward/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: /Zubair owes you Rs 30.00/ }));
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
        source: 'expense',
        sourceId: 'g',
        title: 'Groceries',
        date: '2026-11-02',
        direction: 'owe',
        amountMinor: 12_000,
        coveredMinor: 0,
        isHeld: false,
      },
      {
        source: 'expense',
        sourceId: 'c',
        title: 'Cleaning',
        date: '2026-11-01',
        direction: 'owed',
        amountMinor: 10_000,
        coveredMinor: 10_000,
        isHeld: false,
      },
      {
        source: 'expense',
        sourceId: 's',
        title: 'Snacks',
        date: '2026-11-03',
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
      await screen.findByRole('button', { name: 'Cleaning, Rs 100.00, settled' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Snacks, Rs 50.00, partly settled' }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Rs 30.00 left/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Groceries, Rs 120.00, open' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Pay or net off with Zubair' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/pay/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ZUBAIR },
    });
  });
});

describe('debts that do not come from an expense', () => {
  const otherDebts = [
    {
      source: 'simplification' as const,
      sourceId: 't',
      title: 'Debts simplified through Ajmal',
      date: '2026-11-04',
      direction: 'owe' as const,
      amountMinor: 100_000,
      coveredMinor: 40_000,
      isHeld: false,
    },
    {
      source: 'deposit' as const,
      sourceId: 'd',
      title: 'Flat deposit',
      date: '2026-11-05',
      direction: 'owed' as const,
      amountMinor: 30_000,
      coveredMinor: 0,
      isHeld: false,
    },
    {
      source: 'adjustment' as const,
      sourceId: 'j',
      title: 'Broken mug',
      date: '2026-11-06',
      direction: 'owe' as const,
      amountMinor: 5000,
      coveredMinor: 0,
      isHeld: false,
    },
  ];

  it('lists them on Settle with, offers to pay, and opens what made each one', async () => {
    jest.mocked(fetchPairObligations).mockResolvedValue(otherDebts);
    await renderWithProviders(
      <SettleWith apartmentId={APARTMENT} memberId={ZUBAIR} name="Zubair" />,
    );
    const user = userEvent.setup();

    await user.press(
      await screen.findByRole('button', {
        name: 'Debts simplified through Ajmal, Simplified debts, Rs 1,000.00, partly settled',
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/simplify',
      params: { apartmentId: APARTMENT },
    });

    await user.press(
      screen.getByRole('button', { name: 'Flat deposit, Deposit, Rs 300.00, open' }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/deposits/[depositId]',
      params: { apartmentId: APARTMENT, depositId: 'd' },
    });

    // An adjustment has no screen of its own; its reason is its title.
    expect(screen.getByLabelText('Broken mug, Adjustment, Rs 50.00, open')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Broken mug/ })).not.toBeOnTheScreen();

    expect(screen.getByRole('button', { name: 'Pay or net off with Zubair' })).toBeOnTheScreen();
  });

  it('lists them on the ledger with who owes whom, and leaves expenses to the expense list', async () => {
    jest.mocked(fetchPairObligations).mockResolvedValue([
      {
        source: 'expense',
        sourceId: 'g',
        title: 'Groceries',
        date: '2026-11-02',
        direction: 'owe',
        amountMinor: 12_000,
        coveredMinor: 0,
        isHeld: false,
      },
      ...otherDebts,
    ]);
    await renderWithProviders(
      <OtherDebts
        apartmentId={APARTMENT}
        counterpartyId={ZUBAIR}
        name="Zubair"
        money={(amountMinor) => `Rs ${amountMinor / 100}`}
      />,
    );

    expect(await screen.findByText('Other debts')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: 'Flat deposit, Deposit, Zubair owes you, Rs 300, open',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Broken mug, Adjustment, You owe Zubair, Rs 50, open'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Groceries')).not.toBeOnTheScreen();
  });

  it('shows nothing on the ledger when there are none', async () => {
    jest.mocked(fetchPairObligations).mockResolvedValue([]);
    await renderWithProviders(
      <OtherDebts
        apartmentId={APARTMENT}
        counterpartyId={ZUBAIR}
        name="Zubair"
        money={(amountMinor) => `Rs ${amountMinor / 100}`}
      />,
    );
    await waitFor(() => expect(fetchPairObligations).toHaveBeenCalled());
    expect(screen.queryByText('Other debts')).not.toBeOnTheScreen();
  });
});
