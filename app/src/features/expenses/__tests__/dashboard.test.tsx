import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { fetchUnreadNotifications } from '@/features/notifications/api';
import type { UnreadNotification } from '@/features/notifications/unread';
import { addMonths, formatMonth, monthStart, todayInTimeZone } from '@/lib/time';
import { renderWithProviders } from '@/test/render';

import {
  type ExpenseListItem,
  fetchExpensesPage,
  fetchMyBalances,
  fetchMyMonthlyShare,
} from '../api';
import { Dashboard } from '../components/dashboard';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchExpensesPage: jest.fn(),
  fetchMyBalances: jest.fn(),
  fetchMyMonthlyShare: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/notifications/api', () => ({
  ...jest.requireActual('@/features/notifications/api'),
  fetchUnreadNotifications: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));

const apartment: Apartment = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  location: null,
  show_location: false,
  created_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};
const thisMonth = monthStart(todayInTimeZone(apartment.timezone));

function expense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    id: 'e1',
    title: 'Cleaning',
    amount_minor: 20_000,
    currency: 'PKR',
    category_detail: null,
    expense_date: thisMonth,
    due_date: null,
    status: 'provisional',
    paid_status: 'paid',
    created_at: '2026-11-13T09:00:00Z',
    category: null,
    ...overrides,
  };
}

const expensesPage = jest.mocked(fetchExpensesPage);
const balances = jest.mocked(fetchMyBalances);
const monthlyShare = jest.mocked(fetchMyMonthlyShare);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  balances.mockResolvedValue([]);
  monthlyShare.mockResolvedValue(0);
  expensesPage.mockResolvedValue([]);
  jest.mocked(fetchUnreadNotifications).mockResolvedValue([]);
});

it('shows what the user will receive and send, marked provisional (SRS 5.1)', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 0, provisionalMinor: -6667, disputedMinor: 0 },
    { counterpartyId: 'j', finalMinor: 0, provisionalMinor: -6666, disputedMinor: 0 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(
    await screen.findByRole('button', { name: "You'll receive, 133.33 PKR, provisional" }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: "You'll send, 0.00 PKR" })).toBeOnTheScreen();
  expect(screen.queryByText('Net balance')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Settle up/ })).not.toBeOnTheScreen();
});

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

it('lists below a total only the people behind it, and hides the list on a second tap', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 5000, provisionalMinor: 0, disputedMinor: 0 },
    { counterpartyId: 'j', finalMinor: 0, provisionalMinor: -6666, disputedMinor: 0 },
  ]);
  jest.mocked(fetchMembers).mockResolvedValue([member('z', 'Zubair'), member('j', 'Ajmal')]);
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  const send = await screen.findByRole('button', { name: "You'll send, 50.00 PKR" });
  await user.press(send);
  expect(
    await screen.findByRole('button', { name: 'You pay Zubair, 50.00 PKR' }),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Ajmal')).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: "You'll receive, 66.66 PKR, provisional" }));
  expect(
    await screen.findByRole('button', { name: 'Ajmal pays you, 66.66 PKR, provisional' }),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Zubair')).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Ajmal pays you, 66.66 PKR, provisional' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/ledger/[memberId]',
    params: { apartmentId: apartment.id, memberId: 'j' },
  });

  await user.press(screen.getByRole('button', { name: "You'll receive, 66.66 PKR, provisional" }));
  expect(screen.queryByText('Ajmal')).not.toBeOnTheScreen();
});

it('says so when there is nobody to pay', async () => {
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  await user.press(await screen.findByRole('button', { name: "You'll send, 0.00 PKR" }));
  expect(screen.getByText("You don't owe anyone right now.")).toBeOnTheScreen();
});

it('keeps disputed amounts out of the totals and says so', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 2000, provisionalMinor: 0, disputedMinor: 9000 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByRole('button', { name: "You'll send, 20.00 PKR" })).toBeOnTheScreen();
  expect(
    screen.getByText(/Held by open disputes and not counted above: 90.00 PKR from you/),
  ).toBeOnTheScreen();
});

it("lists the month's expenses with their status and the user's share", async () => {
  monthlyShare.mockResolvedValue(6667);
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Cleaning' }),
    expense({ id: 'e2', title: 'Electricity', paid_status: 'unpaid', status: 'final' }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByText('Cleaning')).toBeOnTheScreen();
  expect(screen.getByText('Electricity')).toBeOnTheScreen();
  expect(screen.getByText('Provisional')).toBeOnTheScreen();
  expect(screen.getByText('Unpaid bill')).toBeOnTheScreen();
  expect(screen.getByText('Final')).toBeOnTheScreen();
  expect(await screen.findByText('66.67 PKR')).toBeOnTheScreen();
  expect(expensesPage).toHaveBeenCalledWith(apartment.id, thisMonth, addMonths(thisMonth, 1), 0);
});

it('opens an expense from the feed', async () => {
  expensesPage.mockResolvedValue([expense({ id: 'e1', title: 'Cleaning' })]);
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  await user.press(await screen.findByRole('button', { name: /Cleaning/ }));

  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
    params: { apartmentId: apartment.id, expenseId: 'e1' },
  });
});

function unread(overrides: Partial<UnreadNotification>): UnreadNotification {
  return {
    id: 'n1',
    apartmentId: apartment.id,
    recordType: 'expense',
    recordId: 'e1',
    expenseId: null,
    counterpartyId: null,
    ...overrides,
  };
}

it('marks with a red dot the expenses that have something new', async () => {
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Cleaning' }),
    expense({ id: 'e2', title: 'Water' }),
    expense({ id: 'e3', title: 'Gas' }),
  ]);
  jest.mocked(fetchUnreadNotifications).mockResolvedValue([
    unread({ id: 'n1', recordType: 'expense', recordId: 'e1' }),
    // A dispute marks the expense it is about.
    unread({ id: 'n2', recordType: 'dispute', recordId: 'd1', expenseId: 'e3' }),
    unread({ id: 'n3', recordType: 'payment', recordId: 'p1', counterpartyId: 'zubair' }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByRole('button', { name: /Cleaning/ })).toBeOnTheScreen();
  expect(screen.getAllByTestId('unread-dot', { includeHiddenElements: true })).toHaveLength(2);
  expect(screen.getByRole('button', { name: /Cleaning/ }).props.accessibilityHint).toBe(
    'New. Opens the expense',
  );
  expect(screen.getByRole('button', { name: /Water/ }).props.accessibilityHint).toBe(
    'Opens the expense',
  );
  expect(screen.getByRole('button', { name: /Gas/ }).props.accessibilityHint).toBe(
    'New. Opens the expense',
  );
});

it('shows no dots when nothing is unread', async () => {
  expensesPage.mockResolvedValue([expense({ id: 'e1', title: 'Cleaning' })]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByRole('button', { name: /Cleaning/ })).toBeOnTheScreen();
  expect(screen.queryByTestId('unread-dot', { includeHiddenElements: true })).toBeNull();
});

it('steps back a month but not past the current one', async () => {
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  expect(await screen.findByText(`No expenses in ${formatMonth(thisMonth)}`)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

  await user.press(screen.getByRole('button', { name: 'Previous month' }));

  const lastMonth = addMonths(thisMonth, -1);
  expect(await screen.findByText(`No expenses in ${formatMonth(lastMonth)}`)).toBeOnTheScreen();
  expect(expensesPage).toHaveBeenCalledWith(apartment.id, lastMonth, thisMonth, 0);
  expect(monthlyShare).toHaveBeenCalledWith(apartment.id, lastMonth);
  expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
});

it('offers a retry when the balances cannot be loaded', async () => {
  balances.mockRejectedValueOnce(new Error('boom'));
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  expect(await screen.findByText('Could not load your balances.')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: /Tap to try again/ }));

  expect(await screen.findByRole('button', { name: "You'll send, 0.00 PKR" })).toBeOnTheScreen();
});

it('offers a retry when the expenses cannot be loaded', async () => {
  expensesPage.mockRejectedValueOnce(new Error('boom'));
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByText('Could not load the expenses.')).toBeOnTheScreen();
});
