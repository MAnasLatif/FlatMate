import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AddExpenseScreen from '@/app/(app)/apartments/[apartmentId]/expenses/new';
import {
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { postExpense } from '@/features/expenses/api';
import { renderWithProviders } from '@/test/render';

import { fetchQuickAdds, type QuickAdd, saveQuickAdd } from '../api';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/expenses/api', () => ({
  ...jest.requireActual('@/features/expenses/api'),
  postExpense: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchCategories: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchQuickAdds: jest.fn(),
  saveQuickAdd: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => ANAS }));

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

const milk: QuickAdd = {
  id: 'q1',
  title: 'Milk',
  amountMinor: 12_050,
  categoryId: 'food',
  categoryDetail: null,
  splitMethod: 'equal',
  participants: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT });
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
  jest.mocked(fetchCategories).mockResolvedValue([{ id: 'food', name: 'Groceries' }]);
  jest.mocked(fetchQuickAdds).mockResolvedValue([milk]);
  jest.mocked(postExpense).mockResolvedValue('expense-1');
  jest.mocked(saveQuickAdd).mockResolvedValue('q2');
});

it('fills in the form from a quick-add, which the user then saves', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  await user.press(await screen.findByRole('button', { name: 'Milk' }));
  expect(screen.getByLabelText('What was it for?')).toHaveDisplayValue('Milk');
  expect(screen.getByLabelText('Amount in PKR')).toHaveDisplayValue('120.50');

  await user.press(screen.getByRole('button', { name: 'Save expense' }));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [, expense] = jest.mocked(postExpense).mock.calls[0];
  expect(expense).toMatchObject({ title: 'Milk', amountMinor: 12_050, categoryId: 'food' });
  expect(saveQuickAdd).not.toHaveBeenCalled();
});

it('saves the expense as a quick-add when asked', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  await user.type(await screen.findByLabelText('What was it for?'), 'Bread');
  await user.type(screen.getByLabelText('Amount in PKR'), '300');
  await user.press(screen.getByRole('switch', { name: 'Save as a quick-add' }));
  await user.press(screen.getByRole('button', { name: 'Save expense' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(saveQuickAdd).toHaveBeenCalledWith(APARTMENT, {
    title: 'Bread',
    amountMinor: 30_000,
    categoryId: null,
    categoryDetail: null,
    splitMethod: 'equal',
    participants: null,
  });
});

it('keeps the expense and offers to try again when the quick-add is not saved', async () => {
  jest
    .mocked(saveQuickAdd)
    .mockRejectedValueOnce({ message: 'too_many_templates' })
    .mockResolvedValueOnce('q2');
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  await user.type(await screen.findByLabelText('What was it for?'), 'Bread');
  await user.type(screen.getByLabelText('Amount in PKR'), '300');
  await user.press(screen.getByRole('switch', { name: 'Save as a quick-add' }));
  await user.press(screen.getByRole('button', { name: 'Save expense' }));

  expect(await screen.findByText('The expense was saved.')).toBeOnTheScreen();
  expect(screen.getByText(/already has 30 quick-adds/)).toBeOnTheScreen();
  expect(router.back).not.toHaveBeenCalled();

  await user.press(screen.getByRole('button', { name: 'Save the quick-add again' }));
  await waitFor(() =>
    expect(screen.queryByText(/already has 30 quick-adds/)).not.toBeOnTheScreen(),
  );
  expect(saveQuickAdd).toHaveBeenCalledTimes(2);
  expect(postExpense).toHaveBeenCalledTimes(1);

  await user.press(screen.getByRole('button', { name: 'Finish' }));
  expect(router.back).toHaveBeenCalled();
});
