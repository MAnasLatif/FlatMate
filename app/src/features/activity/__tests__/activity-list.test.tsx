import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { type ActivityEntry, fetchActivityPage } from '../api';
import { ActivityList } from '../components/activity-list';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('../api', () => ({ ...jest.requireActual('../api'), fetchActivityPage: jest.fn() }));
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

const added: ActivityEntry = {
  id: 2,
  createdAt: '2026-11-24T10:00:00Z',
  actorId: ZUBAIR,
  entityType: 'expense',
  entityId: 'e1',
  action: 'created',
  details: {},
  subject: 'Groceries',
  amountMinor: 30_000,
  personId: null,
  counterpartyId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
  jest.mocked(fetchActivityPage).mockResolvedValue([added]);
});

it('lists what happened, and opens the record', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ActivityList apartmentId={APARTMENT} />);

  await user.press(await screen.findByRole('button', { name: /^Zubair added Groceries,/ }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
    params: { apartmentId: APARTMENT, expenseId: 'e1' },
  });
});

it('filters by type and by who did it', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ActivityList apartmentId={APARTMENT} />);

  await user.press(await screen.findByRole('button', { name: 'Payments' }));
  await waitFor(() =>
    expect(fetchActivityPage).toHaveBeenLastCalledWith(
      APARTMENT,
      { group: 'payments', actorId: null },
      null,
    ),
  );
  jest.mocked(fetchActivityPage).mockResolvedValue([]);
  await user.press(screen.getByRole('button', { name: 'Zubair' }));
  await waitFor(() =>
    expect(fetchActivityPage).toHaveBeenLastCalledWith(
      APARTMENT,
      { group: 'payments', actorId: ZUBAIR },
      null,
    ),
  );
  expect(await screen.findByText('Nothing matches these filters.')).toBeOnTheScreen();
});

it('says so when nothing has happened', async () => {
  jest.mocked(fetchActivityPage).mockResolvedValue([]);
  await renderWithProviders(<ActivityList apartmentId={APARTMENT} />);
  expect(await screen.findByText('Nothing has happened here yet.')).toBeOnTheScreen();
});
