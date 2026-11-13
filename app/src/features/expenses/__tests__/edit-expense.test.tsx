import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import {
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import {
  editExpense,
  type ExpenseDetail,
  fetchAttachments,
  fetchExpenseDetail,
  voidExpense,
} from '../api';
import { EditExpense } from '../components/edit-expense';
import { ExpenseDetailView } from '../components/expense-detail';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
let mockCurrentUser = ANAS;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchExpenseDetail: jest.fn(),
  fetchAttachments: jest.fn(),
  editExpense: jest.fn(),
  voidExpense: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchCategories: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => mockCurrentUser }));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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

function member(userId: string, displayName: string, role: Member['role'] = 'member'): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role,
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    displayName,
    avatarPath: null,
  };
}

/** Rs 100 of snacks Anas paid for, split between Anas and Zubair, now at revision 2. */
const snacks: ExpenseDetail = {
  id: EXPENSE,
  apartmentId: APARTMENT,
  title: 'Snacks',
  description: null,
  categoryId: null,
  categoryName: null,
  amountMinor: 10_000,
  currency: 'PKR',
  expenseDate: '2026-11-12',
  dueDate: null,
  paidStatus: 'paid',
  status: 'provisional',
  revision: 2,
  finalizeAfter: '2026-11-19T10:00:00Z',
  finalizedAt: null,
  createdBy: ANAS,
  createdAt: '2026-11-12T10:00:00Z',
  splitMethod: 'equal',
  splits: [
    { userId: ANAS, amountMinor: 5000, basisPoints: null },
    { userId: ZUBAIR, amountMinor: 5000, basisPoints: null },
  ],
  payers: [{ userId: ANAS, amountMinor: 10_000 }],
  history: [],
};

const edit = jest.mocked(editExpense);

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ANAS;
  jest.mocked(fetchExpenseDetail).mockResolvedValue(snacks);
  jest.mocked(fetchAttachments).mockResolvedValue([]);
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchCategories).mockResolvedValue([]);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
});

describe('EditExpense', () => {
  it('saves a new amount based on the revision it started from, with the reason', async () => {
    edit.mockResolvedValue(undefined);
    await renderWithProviders(<EditExpense apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    const amount = await screen.findByLabelText('Amount in PKR');
    expect(amount).toHaveDisplayValue('100.00');
    await user.clear(amount);
    await user.type(amount, '120');
    await user.type(screen.getByLabelText('Reason for the change'), 'Forgot the drinks');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(edit).toHaveBeenCalledWith(
      EXPENSE,
      2,
      expect.objectContaining({
        title: 'Snacks',
        amountMinor: 12_000,
        participants: [{ userId: ANAS }, { userId: ZUBAIR }],
        payers: [{ userId: ANAS, amountMinor: 12_000 }],
      }),
      'Forgot the drinks',
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('explains when someone else changed the expense first', async () => {
    edit.mockRejectedValue({ code: 'P0001', message: 'expense_changed' });
    await renderWithProviders(<EditExpense apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(/Someone changed this expense while you were editing/),
    ).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not let a member edit an expense someone else added', async () => {
    mockCurrentUser = ZUBAIR;
    await renderWithProviders(<EditExpense apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(
      await screen.findByText(/Only the person who added this expense or an admin/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeOnTheScreen();
  });
});

describe('Edit and void on the expense screen', () => {
  it('offers the creator to edit and void, and voids after confirming', async () => {
    // The confirmation answers "Void", as the user would.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Void')?.onPress?.();
    });
    jest.mocked(voidExpense).mockResolvedValue(undefined);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]/edit',
      params: { apartmentId: APARTMENT, expenseId: EXPENSE },
    });

    await user.press(screen.getByRole('button', { name: 'Void' }));

    expect(alert).toHaveBeenCalledWith('Void this expense?', expect.any(String), expect.any(Array));
    expect(voidExpense).toHaveBeenCalledWith(EXPENSE);
  });

  it('offers an admin who did not add it the same actions', async () => {
    mockCurrentUser = ZUBAIR;
    jest
      .mocked(fetchMembers)
      .mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair', 'admin')]);
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeOnTheScreen();
  });

  it('offers other members neither', async () => {
    mockCurrentUser = ZUBAIR;
    await renderWithProviders(<ExpenseDetailView apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByText('Snacks')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeOnTheScreen();
  });
});
