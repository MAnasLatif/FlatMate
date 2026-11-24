import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AddExpenseScreen from '@/app/(app)/apartments/[apartmentId]/expenses/new';
import {
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { fetchQuickAdds } from '@/features/quick-add/api';
import { readQueue, updateQueue } from '@/lib/offline-queue';
import { renderWithProviders } from '@/test/render';

import { postExpense } from '../api';
import { QueuedExpenses } from '../components/queued-expenses';
import { newDraft } from '../draft';
import { toQueuedEntry, toQueuedExpense } from '../offline-queue';
import { useSendQueuedExpenses } from '../offline-queue-hooks';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const QUEUED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let mockOnline = true;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/lib/network', () => ({
  ...jest.requireActual('@/lib/network'),
  useIsOnline: () => mockOnline,
}));
// The real queue code, on a store in memory instead of the phone's.
jest.mock('@/lib/offline-queue', () => {
  const actual = jest.requireActual('@/lib/offline-queue');
  const items = new Map<string, string>();
  const store = {
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: async (key: string) => {
      items.delete(key);
    },
  };
  return {
    ...actual,
    readQueue: (userId: string) => actual.readQueue(userId, store),
    updateQueue: (userId: string, change: never) => actual.updateQueue(userId, change, store),
    deleteQueue: (userId: string) => actual.deleteQueue(userId, store),
  };
});
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchCategories: jest.fn(),
}));
jest.mock('@/features/quick-add/api', () => ({
  ...jest.requireActual('@/features/quick-add/api'),
  fetchQuickAdds: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  postExpense: jest.fn(),
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

async function queueGroceries(failure: string | null = null) {
  await updateQueue(ANAS, () => [
    toQueuedEntry({
      id: QUEUED,
      apartmentId: APARTMENT,
      savedAt: new Date().toISOString(),
      draft: { ...newDraft(ANAS, '2026-11-24'), title: 'Groceries', amount: '1200' },
      memberIds: [ANAS, ZUBAIR],
      failure,
    }),
  ]);
}

function Sender() {
  useSendQueuedExpenses(ANAS);
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnline = true;
  onlineManager.setOnline(true);
  await updateQueue(ANAS, () => []);
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT });
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
  jest.mocked(fetchCategories).mockResolvedValue([]);
  jest.mocked(fetchQuickAdds).mockResolvedValue([]);
  jest.mocked(postExpense).mockResolvedValue('expense-1');
});

afterAll(() => onlineManager.setOnline(true));

it('keeps an expense added offline on the phone, sending nothing yet', async () => {
  mockOnline = false;
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  expect(
    await screen.findByText(/You are offline. Saving keeps it on this phone/),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('switch', { name: 'Save as a quick-add' })).not.toBeOnTheScreen();
  await user.type(screen.getByLabelText('What was it for?'), 'Groceries');
  await user.type(screen.getByLabelText('Amount in PKR'), '1200');
  await user.press(screen.getByRole('button', { name: 'Save offline' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(postExpense).not.toHaveBeenCalled();
  const [saved] = await readQueue(ANAS);
  expect(toQueuedExpense(saved)).toMatchObject({
    apartmentId: APARTMENT,
    draft: { title: 'Groceries', amount: '1200' },
    memberIds: [ANAS, ZUBAIR],
    failure: null,
  });
});

it('sends queued expenses by themselves when the connection comes back, once each', async () => {
  onlineManager.setOnline(false);
  await queueGroceries();
  await renderWithProviders(<Sender />);
  expect(postExpense).not.toHaveBeenCalled();

  await act(async () => onlineManager.setOnline(true));
  await waitFor(async () => expect(await readQueue(ANAS)).toEqual([]));
  expect(postExpense).toHaveBeenCalledTimes(1);
  const [apartmentId, expense, requestId] = jest.mocked(postExpense).mock.calls[0];
  expect(apartmentId).toBe(APARTMENT);
  expect(expense).toMatchObject({ title: 'Groceries', amountMinor: 120_000 });
  expect(requestId).toBe(QUEUED);
});

it('keeps one the server turns down, with the reason, and shows it on the dashboard', async () => {
  jest
    .mocked(postExpense)
    .mockRejectedValue({ code: '42501', message: 'not_allowed_to_add_expense' });
  await queueGroceries();
  await renderWithProviders(
    <>
      <Sender />
      <QueuedExpenses apartmentId={APARTMENT} currency="PKR" />
    </>,
  );

  await waitFor(async () =>
    expect(toQueuedExpense((await readQueue(ANAS))[0])?.failure).toEqual(expect.any(String)),
  );
  expect(await screen.findByText('Not sent')).toBeOnTheScreen();
});

it('shows expenses waiting to be sent on the dashboard, opening one to change it', async () => {
  onlineManager.setOnline(false);
  await queueGroceries();
  const user = userEvent.setup();
  await renderWithProviders(<QueuedExpenses apartmentId={APARTMENT} currency="PKR" />);

  await user.press(
    await screen.findByRole('button', { name: 'Groceries, Rs 1,200.00, Waiting to send' }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/expenses/new',
    params: { apartmentId: APARTMENT, queuedId: QUEUED },
  });
});

it('opens a turned-down expense to fix and send it, with its own id', async () => {
  await queueGroceries('This apartment no longer lets you add expenses.');
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT, queuedId: QUEUED });
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  expect(await screen.findByText(/Not sent: This apartment no longer/)).toBeOnTheScreen();
  expect(screen.getByLabelText('What was it for?')).toHaveDisplayValue('Groceries');
  await user.press(screen.getByRole('button', { name: 'Save expense' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(jest.mocked(postExpense).mock.calls[0]?.[2]).toBe(QUEUED);
  await waitFor(async () => expect(await readQueue(ANAS)).toEqual([]));
});

it('deletes a queued expense after confirming, sending nothing', async () => {
  mockOnline = false;
  await queueGroceries();
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT, queuedId: QUEUED });
  const user = userEvent.setup();
  await renderWithProviders(<AddExpenseScreen />);

  await user.press(await screen.findByRole('button', { name: 'Delete it' }));
  await user.press(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(await readQueue(ANAS)).toEqual([]);
  expect(postExpense).not.toHaveBeenCalled();
});

it('says when a queued expense is no longer on the phone', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT, queuedId: QUEUED });
  await renderWithProviders(<AddExpenseScreen />);
  expect(await screen.findByText(/no longer waiting on this phone/)).toBeOnTheScreen();
});
