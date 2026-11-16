import { screen, userEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import SettingsScreen from '@/app/(app)/apartments/[apartmentId]/settings';
import { renderWithProviders } from '@/test/render';

import {
  addCategory,
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
  renameCategory,
} from '../api';

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
  addCategory: jest.fn(async () => undefined),
  renameCategory: jest.fn(async () => undefined),
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
  expect(await screen.findByText('Anas (you)')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Your actions' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add member' })).toBeOnTheScreen();
  expect(screen.queryByText('Save settings')).not.toBeOnTheScreen();

  await user.press(screen.getByText('Expense control'));
  expect(await screen.findByRole('button', { name: 'New category' })).toBeOnTheScreen();
  expect(screen.queryByText('Join codes')).not.toBeOnTheScreen();
});

it('adds a category from the drawer', async () => {
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Expense control'));
  await user.press(await screen.findByRole('button', { name: 'New category' }));
  await user.type(screen.getByTestId('category-name'), 'Gas');
  await user.press(screen.getByTestId('category-save'));

  expect(addCategory).toHaveBeenCalledWith(FLAT, 'Gas');
});

it('renames a category when it is tapped, in the same drawer', async () => {
  jest.mocked(fetchCategories).mockResolvedValue([{ id: 'c-1', name: 'Groceries' }]);
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Expense control'));
  await user.press(await screen.findByRole('button', { name: 'Groceries' }));
  expect(screen.getByText('Rename category')).toBeOnTheScreen();
  expect(screen.getByTestId('category-name')).toHaveDisplayValue('Groceries');
  expect(screen.getByRole('button', { name: 'Archive Groceries' })).toBeOnTheScreen();

  await user.clear(screen.getByTestId('category-name'));
  await user.type(screen.getByTestId('category-name'), 'Food');
  await user.press(screen.getByTestId('category-save'));

  expect(renameCategory).toHaveBeenCalledWith('c-1', 'Food');
});

it('keeps Other as it is: it cannot be renamed or archived', async () => {
  jest.mocked(fetchCategories).mockResolvedValue([
    { id: 'c-1', name: 'Groceries' },
    { id: 'c-2', name: 'Other' },
  ]);
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Expense control'));
  expect(await screen.findByText('For anything that fits nowhere else')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Archive Groceries' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Archive Other' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Other' })).not.toBeOnTheScreen();
});
