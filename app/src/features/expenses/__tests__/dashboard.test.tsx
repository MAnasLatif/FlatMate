import { screen, userEvent } from '@testing-library/react-native';

import type { Apartment } from '@/features/apartments/api';
import { fetchApartment } from '@/features/apartments/api';
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
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
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
});

it('shows what the user will receive, owes and nets to, marked provisional (SRS 5.1)', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 0, provisionalMinor: -6667, disputedMinor: 0 },
    { counterpartyId: 'j', finalMinor: 0, provisionalMinor: -6666, disputedMinor: 0 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByLabelText("You'll receive, 133.33 PKR, provisional")).toBeOnTheScreen();
  expect(screen.getByLabelText('You owe, 0.00 PKR')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Net balance, 133.33 PKR, You are owed overall, provisional'),
  ).toBeOnTheScreen();
});

it('keeps disputed amounts out of the totals and says so', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 2000, provisionalMinor: 0, disputedMinor: 9000 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByLabelText('You owe, 20.00 PKR')).toBeOnTheScreen();
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
  await user.press(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByLabelText('You owe, 0.00 PKR')).toBeOnTheScreen();
});

it('offers a retry when the expenses cannot be loaded', async () => {
  expensesPage.mockRejectedValueOnce(new Error('boom'));
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByText('Could not load the expenses.')).toBeOnTheScreen();
});
