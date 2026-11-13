import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { fetchMembers, type Member } from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import {
  type ExpenseDetail,
  fetchAttachments,
  fetchExpenseDetail,
  recordBillPayment,
} from '../api';
import { ExpenseDetailView } from '../components/expense-detail';
import { RecordPayment } from '../components/record-payment';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchExpenseDetail: jest.fn(),
  fetchAttachments: jest.fn(),
  recordBillPayment: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const AJMAL = '33333333-3333-3333-3333-333333333333';

function member(userId: string, displayName: string, leftAt: string | null = null): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt,
    leftReason: leftAt ? 'left' : null,
    displayName,
    avatarPath: null,
  };
}

/** Rs 200 cleaning paid by Anas, split equally between three (SRS 5.1). */
const cleaning: ExpenseDetail = {
  id: EXPENSE,
  apartmentId: APARTMENT,
  title: 'Cleaning',
  description: null,
  categoryId: null,
  categoryName: 'Cleaning',
  amountMinor: 20_000,
  currency: 'PKR',
  expenseDate: '2026-11-13',
  dueDate: null,
  paidStatus: 'paid',
  status: 'provisional',
  revision: 1,
  finalizeAfter: '2026-11-20T10:00:00Z',
  finalizedAt: null,
  createdBy: ANAS,
  createdAt: '2026-11-13T10:00:00Z',
  splitMethod: 'equal',
  splits: [
    { userId: ANAS, amountMinor: 6667, basisPoints: null },
    { userId: ZUBAIR, amountMinor: 6667, basisPoints: null },
    { userId: AJMAL, amountMinor: 6666, basisPoints: null },
  ],
  payers: [{ userId: ANAS, amountMinor: 20_000 }],
  history: [
    {
      id: 1,
      actorId: ANAS,
      action: 'created',
      details: { paid: true },
      createdAt: '2026-11-13T10:00:00Z',
    },
  ],
};

const electricity: ExpenseDetail = {
  ...cleaning,
  title: 'Electricity',
  amountMinor: 9000,
  paidStatus: 'unpaid',
  dueDate: '2026-11-20',
  splits: [
    { userId: ANAS, amountMinor: 3000, basisPoints: null },
    { userId: ZUBAIR, amountMinor: 3000, basisPoints: null },
    { userId: AJMAL, amountMinor: 3000, basisPoints: null },
  ],
  payers: [],
  history: [{ ...cleaning.history[0], details: { paid: false } }],
};

const detail = jest.mocked(fetchExpenseDetail);
const members = jest.mocked(fetchMembers);
const recordPayment = jest.mocked(recordBillPayment);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchAttachments).mockResolvedValue([]);
  members.mockResolvedValue([
    member(ANAS, 'Anas'),
    member(ZUBAIR, 'Zubair'),
    member(AJMAL, 'Ajmal'),
  ]);
});

describe('ExpenseDetailView', () => {
  it('shows the expense, who paid, the split, who owes whom and its history', async () => {
    detail.mockResolvedValue(cleaning);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByRole('header', { name: '200.00 PKR' })).toBeOnTheScreen();
    expect(screen.getAllByText('200.00 PKR')).toHaveLength(2); // the amount, and what Anas paid
    expect(screen.getByText('Provisional')).toBeOnTheScreen();
    expect(screen.getByText(/can object until/)).toBeOnTheScreen();
    expect(screen.getByText('Split equally')).toBeOnTheScreen();
    expect(screen.getByText('Zubair owes you 66.67 PKR')).toBeOnTheScreen();
    expect(screen.getByText('Ajmal owes you 66.66 PKR')).toBeOnTheScreen();
    expect(screen.getByText('You added this expense')).toBeOnTheScreen();
    expect(await screen.findByText('No receipt attached.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeOnTheScreen();
  });

  it('lets a member record that an unpaid bill was paid', async () => {
    detail.mockResolvedValue(electricity);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    expect(
      await screen.findByText('Nothing until someone records paying this bill.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Unpaid bill')).toBeOnTheScreen();
    expect(screen.getByText('You added this as an unpaid bill')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]/record-payment',
      params: { apartmentId: APARTMENT, expenseId: EXPENSE },
    });
  });

  it('does not offer a former member to record a payment', async () => {
    detail.mockResolvedValue(electricity);
    members.mockResolvedValue([
      member(ANAS, 'Anas', '2026-11-10T00:00:00Z'),
      member(ZUBAIR, 'Zubair'),
    ]);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByText('Electricity')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeOnTheScreen();
  });

  it('explains when the expense cannot be seen', async () => {
    detail.mockResolvedValue(null);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByText(/This expense is not available/)).toBeOnTheScreen();
  });
});

describe('RecordPayment', () => {
  it('records the signed-in member as paying the whole bill and previews the debts', async () => {
    detail.mockResolvedValue(electricity);
    recordPayment.mockResolvedValue(undefined);
    await renderWithProviders(<RecordPayment apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    expect(await screen.findByText('Zubair will owe you 30.00 PKR')).toBeOnTheScreen();
    expect(screen.getByText('Ajmal will owe you 30.00 PKR')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(recordPayment).toHaveBeenCalledWith(EXPENSE, [{ userId: ANAS, amountMinor: 9000 }]);
    expect(router.back).toHaveBeenCalled();
  });

  it('refuses several payers who do not cover the bill', async () => {
    detail.mockResolvedValue(electricity);
    await renderWithProviders(<RecordPayment apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Several people' }));
    await user.type(screen.getByLabelText('You paid, in PKR'), '50');
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(
      screen.getByText('What people paid must add up to 90.00. It adds up to 50.00.'),
    ).toBeOnTheScreen();
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('explains when someone else recorded the payment first', async () => {
    detail.mockResolvedValue(electricity);
    recordPayment.mockRejectedValue({ code: 'P0001', message: 'expense_not_unpaid' });
    await renderWithProviders(<RecordPayment apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText('This bill has already been paid.')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not offer to pay a bill that is already paid', async () => {
    detail.mockResolvedValue(cleaning);
    await renderWithProviders(<RecordPayment apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(
      await screen.findByText(/already been paid or is no longer available/),
    ).toBeOnTheScreen();
  });
});
