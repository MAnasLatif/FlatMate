import { screen, userEvent } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import SettingsScreen from '@/app/(app)/apartments/[apartmentId]/settings';
import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { fetchTemplates, fetchWaitingBills, type RecurringTemplate } from '../api';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/notifications/hooks', () => ({ useMarkSeen: jest.fn() }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchJoinCode: jest.fn(async () => 'ABCD-2345'),
  fetchJoinRequests: jest.fn(async () => []),
  fetchCategories: jest.fn(async () => []),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchTemplates: jest.fn(),
  fetchWaitingBills: jest.fn(),
}));

const apartment: Apartment = {
  id: FLAT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: ME,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const admin: Member = {
  membershipId: 'm-1',
  userId: ME,
  role: 'admin',
  canAddExpense: true,
  joinedAt: '2026-11-01T00:00:00Z',
  leftAt: null,
  leftReason: null,
  hiddenAt: null,
  displayName: 'Anas',
  avatarPath: null,
};

const rent: RecurringTemplate = {
  id: 't-rent',
  title: 'Rent',
  kind: 'fixed',
  amountMinor: 9_000_000,
  repeat: 'monthly',
  billDay: 1,
  dueAfterDays: 9,
  collectorId: null,
  splitMethod: 'equal',
  participants: [{ userId: ME }],
  nextBillDate: '2026-12-01',
  isPaused: false,
};

const electricity: RecurringTemplate = {
  ...rent,
  id: 't-power',
  title: 'Electricity',
  kind: 'variable',
  amountMinor: null,
  repeat: 'weekly',
  billDay: null,
  nextBillDate: '2026-12-07',
  isPaused: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([admin]);
  jest.mocked(fetchTemplates).mockResolvedValue([rent, electricity]);
  jest.mocked(fetchWaitingBills).mockResolvedValue([]);
});

it('lists repeatable expenses in a fourth settings tab', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: FLAT });
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Repeatable expenses'));
  expect(await screen.findByText('Rent')).toBeOnTheScreen();
  expect(screen.getByText('Every month on the 1st · next Dec 1, 2026')).toBeOnTheScreen();
  expect(screen.getByText('Rs 90,000.00')).toBeOnTheScreen();
  // A paused expense shows no next date.
  expect(screen.getByText('Every week on Monday')).toBeOnTheScreen();
  expect(screen.getByText('Amount varies')).toBeOnTheScreen();
  expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  expect(screen.queryByText('Waiting for you')).not.toBeOnTheScreen();

  await user.press(screen.getByText('Add repeatable expense'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/recurring/new',
    params: { apartmentId: FLAT },
  });
});

it('opens on the tab from a notification and shows a bill waiting for its amount', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: FLAT, tab: 'recurring' });
  jest
    .mocked(fetchWaitingBills)
    .mockResolvedValue([
      { id: 'bill-1', billDate: '2026-11-05', reason: 'amount_needed', template: electricity },
    ]);
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  expect(await screen.findByText('Waiting for you')).toBeOnTheScreen();
  expect(
    screen.getByText('The bill has arrived. Enter its amount to charge it.'),
  ).toBeOnTheScreen();

  await user.press(screen.getByText('Enter amount'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/recurring/bills/[instanceId]',
    params: { apartmentId: FLAT, instanceId: 'bill-1' },
  });
});
