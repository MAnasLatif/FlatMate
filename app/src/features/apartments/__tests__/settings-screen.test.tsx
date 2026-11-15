import { screen, userEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import SettingsScreen from '@/app/(app)/apartments/[apartmentId]/settings';
import { renderWithProviders } from '@/test/render';

import { type Apartment, fetchApartment, fetchMembers, type Member } from '../api';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchActiveInvites: jest.fn(async () => []),
  fetchJoinRequests: jest.fn(async () => []),
  fetchCategories: jest.fn(async () => []),
}));

const apartment: Apartment = {
  id: FLAT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: FLAT });
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([admin]);
});

it('opens on the general settings and moves between the tabs', async () => {
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  expect(await screen.findByText('Save settings')).toBeOnTheScreen();
  expect(screen.queryByText('Join codes')).not.toBeOnTheScreen();

  await user.press(screen.getByText('Manage members'));
  expect(await screen.findByText('Join codes')).toBeOnTheScreen();
  expect(screen.getByText('Members and former members')).toBeOnTheScreen();
  expect(screen.queryByText('Save settings')).not.toBeOnTheScreen();

  await user.press(screen.getByText('Expense control'));
  expect(await screen.findByText('Expense categories')).toBeOnTheScreen();
  expect(screen.queryByText('Join codes')).not.toBeOnTheScreen();
});
