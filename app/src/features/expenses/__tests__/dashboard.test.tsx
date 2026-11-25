import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchCategories,
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
  fetchMonthlySpending,
  fetchMyBalances,
  fetchMyMonthlyShare,
} from '../api';
import { Dashboard } from '../components/dashboard';
import { NO_SEARCH } from '../search';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchExpensesPage: jest.fn(),
  fetchMyBalances: jest.fn(),
  fetchMyMonthlyShare: jest.fn(),
  fetchMonthlySpending: jest.fn(),
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
  fetchCategories: jest.fn(),
}));

const apartment: Apartment = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};
const thisMonth = monthStart(todayInTimeZone(apartment.timezone));

// Nothing covered yet unless a test says so: what is open is the whole position.
function expense(overrides: Partial<ExpenseListItem>): ExpenseListItem {
  const position = overrides.my_position_minor ?? null;
  return {
    my_open_minor: position,
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
    my_position_minor: null,
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
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([
      member('11111111-1111-1111-1111-111111111111', 'Anas'),
      member('z', 'Zubair'),
    ]);
  jest.mocked(fetchCategories).mockResolvedValue([{ id: 'c-food', name: 'Food' }]);
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

it('shows what the user will receive and send (SRS 5.1)', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 0, provisionalMinor: -6667, disputedMinor: 0 },
    { counterpartyId: 'j', finalMinor: 0, provisionalMinor: -6666, disputedMinor: 0 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(
    await screen.findByRole('button', {
      name: "You'll receive, Rs 133.33, Includes amounts not final yet",
    }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: "You'll send, Rs 0.00" })).toBeOnTheScreen();
  // Only the figure with a provisional amount in it says so.
  expect(screen.getAllByText('Includes amounts not final yet')).toHaveLength(1);
  expect(screen.queryByText('Net balance')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Settle up/ })).not.toBeOnTheScreen();
});

it('says nothing about provisional amounts once every figure is final', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 2000, provisionalMinor: 0, disputedMinor: 0 },
    { counterpartyId: 'j', finalMinor: -5000, provisionalMinor: 0, disputedMinor: 0 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByRole('button', { name: "You'll send, Rs 20.00" })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: "You'll receive, Rs 50.00" })).toBeOnTheScreen();
  expect(screen.queryByText('Includes amounts not final yet')).not.toBeOnTheScreen();
});

it('shows only the expenses on the tapped side, and all of them on a second tap', async () => {
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Cleaning', my_position_minor: 50_000 }),
    expense({ id: 'e2', title: 'Internet', my_position_minor: -3_000 }),
    expense({ id: 'e3', title: 'Water', my_position_minor: 0 }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Cleaning/ });

  await user.press(screen.getByRole('button', { name: "You'll send, Rs 0.00" }));
  expect(screen.getByRole('button', { name: /Internet/ })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Cleaning/ })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Water/ })).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: "You'll receive, Rs 0.00" }));
  expect(screen.getByRole('button', { name: /Cleaning/ })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Internet/ })).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: "You'll receive, Rs 0.00" }));
  expect(screen.getByRole('button', { name: /Water/ })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /Internet/ })).toBeOnTheScreen();
});

it('says what is left of an expense, and when it is settled, and the filter shows only what is open', async () => {
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Rent', my_position_minor: -100_000, my_open_minor: 0 }),
    expense({ id: 'e2', title: 'Groceries', my_position_minor: -100_000, my_open_minor: -60_000 }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  expect(await screen.findByText('Settled: you owed Rs 1,000.00')).toBeOnTheScreen();
  expect(screen.getByText("You'll send Rs 600.00 of Rs 1,000.00")).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: "You'll send, Rs 0.00" }));
  expect(screen.getByRole('button', { name: /Groceries/ })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /Rent/ })).not.toBeOnTheScreen();
});

it('shows the line under the header only once the list is scrolled', async () => {
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const list = await screen.findByTestId('dashboard-list');
  expect(mockSetOptions).toHaveBeenLastCalledWith({ headerShadowVisible: false });

  const scrollTo = (y: number) =>
    fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 400, height: 2000 },
        layoutMeasurement: { width: 400, height: 800 },
      },
    });
  await scrollTo(40);
  expect(mockSetOptions).toHaveBeenLastCalledWith({ headerShadowVisible: true });

  await scrollTo(0);
  expect(mockSetOptions).toHaveBeenLastCalledWith({ headerShadowVisible: false });
});

it('says so when no expense of the month is on the tapped side', async () => {
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Cleaning', my_position_minor: 50_000 }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();
  await screen.findByRole('button', { name: /Cleaning/ });

  await user.press(screen.getByRole('button', { name: "You'll send, Rs 0.00" }));
  expect(
    screen.getByText(`Nothing to send for the expenses in ${formatMonth(thisMonth)}.`),
  ).toBeOnTheScreen();
});

it('keeps disputed amounts out of the totals and says so', async () => {
  balances.mockResolvedValue([
    { counterpartyId: 'z', finalMinor: 2000, provisionalMinor: 0, disputedMinor: 9000 },
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByRole('button', { name: "You'll send, Rs 20.00" })).toBeOnTheScreen();
  expect(
    screen.getByText(/Held by open disputes and not counted above: Rs 90.00 from you/),
  ).toBeOnTheScreen();
});

it('shows on each expense what the user receives or sends for it', async () => {
  expensesPage.mockResolvedValue([
    expense({ id: 'e1', title: 'Cleaning', my_position_minor: 50_000 }),
    expense({ id: 'e2', title: 'Water', my_position_minor: -3000 }),
    expense({ id: 'e3', title: 'Gas', my_position_minor: 0 }),
  ]);
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByText("You'll receive Rs 500.00")).toBeOnTheScreen();
  expect(screen.getByText("You'll send Rs 30.00")).toBeOnTheScreen();
  expect(screen.getAllByText(/You'll (receive|send) Rs \d/)).toHaveLength(2);
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
  expect(await screen.findByText('Rs 66.67')).toBeOnTheScreen();
  expect(expensesPage).toHaveBeenCalledWith(
    apartment.id,
    '11111111-1111-1111-1111-111111111111',
    thisMonth,
    addMonths(thisMonth, 1),
    0,
    NO_SEARCH,
  );
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
    type: 'expense.created',
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

it('steps back a month, with no forward arrow on the current one', async () => {
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  expect(await screen.findByText(`No expenses in ${formatMonth(thisMonth)}`)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Previous month' }));

  const lastMonth = addMonths(thisMonth, -1);
  expect(await screen.findByText(`No expenses in ${formatMonth(lastMonth)}`)).toBeOnTheScreen();
  expect(expensesPage).toHaveBeenCalledWith(
    apartment.id,
    '11111111-1111-1111-1111-111111111111',
    lastMonth,
    thisMonth,
    0,
    NO_SEARCH,
  );
  expect(monthlyShare).toHaveBeenCalledWith(apartment.id, lastMonth);
  expect(screen.getByRole('button', { name: 'Next month' })).toBeOnTheScreen();
});

it('offers a retry when the balances cannot be loaded', async () => {
  balances.mockRejectedValueOnce(new Error('boom'));
  await renderWithProviders(<Dashboard apartment={apartment} />);
  const user = userEvent.setup();

  expect(await screen.findByText('Could not load your balances.')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: /Tap to try again/ }));

  expect(await screen.findByRole('button', { name: "You'll send, Rs 0.00" })).toBeOnTheScreen();
});

it('offers a retry when the expenses cannot be loaded', async () => {
  expensesPage.mockRejectedValueOnce(new Error('boom'));
  await renderWithProviders(<Dashboard apartment={apartment} />);

  expect(await screen.findByText('Could not load the expenses.')).toBeOnTheScreen();
});

describe('filters', () => {
  it('filters by member, category, status and amount on the server, and shows each filter', async () => {
    await renderWithProviders(<Dashboard apartment={apartment} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Filter expenses' }));
    await user.press(await screen.findByRole('button', { name: 'Zubair' }));
    await user.press(screen.getByRole('button', { name: 'Food' }));
    await user.press(screen.getByRole('button', { name: 'Not paid yet' }));
    await user.type(screen.getByLabelText('Lowest amount'), '100');
    await user.type(screen.getByLabelText('Highest amount'), '2500.50');
    await user.type(screen.getByLabelText('Search expenses'), ' groc ');
    await user.press(screen.getByRole('button', { name: 'Show expenses' }));

    expect(expensesPage).toHaveBeenLastCalledWith(
      apartment.id,
      '11111111-1111-1111-1111-111111111111',
      thisMonth,
      addMonths(thisMonth, 1),
      0,
      {
        query: 'groc',
        memberId: 'z',
        categoryId: 'c-food',
        status: 'unpaid',
        minMinor: 10_000,
        maxMinor: 250_050,
      },
    );
    expect(await screen.findByRole('button', { name: 'Filters, 5 on' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove filter: Zubair' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Remove filter: Rs 100.00 – Rs 2,500.50' }),
    ).toBeOnTheScreen();
  });

  it('removes one filter when its chip is tapped', async () => {
    await renderWithProviders(<Dashboard apartment={apartment} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Filter expenses' }));
    await user.press(await screen.findByRole('button', { name: 'Cancelled' }));
    await user.press(screen.getByRole('button', { name: 'Show expenses' }));
    await user.press(await screen.findByRole('button', { name: 'Remove filter: Cancelled' }));

    expect(expensesPage).toHaveBeenLastCalledWith(
      apartment.id,
      '11111111-1111-1111-1111-111111111111',
      thisMonth,
      addMonths(thisMonth, 1),
      0,
      NO_SEARCH,
    );
    expect(screen.getByRole('button', { name: 'Filter expenses' })).toBeOnTheScreen();
  });

  it('says how to fix an amount range and keeps the sheet open', async () => {
    await renderWithProviders(<Dashboard apartment={apartment} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Filter expenses' }));
    await user.type(await screen.findByLabelText('Lowest amount'), '500');
    await user.type(screen.getByLabelText('Highest amount'), '100');
    await user.press(screen.getByRole('button', { name: 'Show expenses' }));

    expect(
      screen.getByText('The lowest amount must not be more than the highest.'),
    ).toBeOnTheScreen();
    expect(expensesPage).toHaveBeenCalledTimes(1);
  });

  it('says when nothing matches, and clears the filters from there', async () => {
    await renderWithProviders(<Dashboard apartment={apartment} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Filter expenses' }));
    await user.press(await screen.findByRole('button', { name: 'Disputed' }));
    await user.press(screen.getByRole('button', { name: 'Show expenses' }));

    expect(
      await screen.findByText(`No expenses in ${formatMonth(thisMonth)} match these filters.`),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText(`No expenses in ${formatMonth(thisMonth)}`)).toBeOnTheScreen();
  });
});

describe('comparing months', () => {
  it('shows each month newest first, and opens one on the dashboard', async () => {
    const lastMonth = addMonths(thisMonth, -1);
    jest.mocked(fetchMonthlySpending).mockResolvedValue([
      { month: lastMonth, totalMinor: 30_000, myShareMinor: 10_000 },
      { month: thisMonth, totalMinor: 150_000, myShareMinor: 50_000 },
    ]);
    await renderWithProviders(<Dashboard apartment={apartment} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Compare months' }));

    const current = await screen.findByRole('button', {
      name: `${formatMonth(thisMonth)}: apartment total Rs 1,500.00, your share Rs 500.00. Rs 1,200.00 more than ${formatMonth(lastMonth)}.`,
    });
    expect(current).toBeOnTheScreen();
    expect(fetchMonthlySpending).toHaveBeenCalledWith(apartment.id, 6);

    await user.press(
      screen.getByRole('button', {
        name: `${formatMonth(lastMonth)}: apartment total Rs 300.00, your share Rs 100.00.`,
      }),
    );
    expect(await screen.findByText(`No expenses in ${formatMonth(lastMonth)}`)).toBeOnTheScreen();
  });

  it('says so when there is nothing to compare', async () => {
    jest
      .mocked(fetchMonthlySpending)
      .mockResolvedValue([{ month: thisMonth, totalMinor: 0, myShareMinor: 0 }]);
    await renderWithProviders(<Dashboard apartment={apartment} />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Compare months' }));

    expect(await screen.findByText('No expenses in the last 6 months yet.')).toBeOnTheScreen();
  });

  it('offers a retry when the comparison cannot be loaded', async () => {
    jest.mocked(fetchMonthlySpending).mockRejectedValue(new Error('boom'));
    await renderWithProviders(<Dashboard apartment={apartment} />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Compare months' }));

    expect(await screen.findByText('Could not load the comparison.')).toBeOnTheScreen();
  });
});
