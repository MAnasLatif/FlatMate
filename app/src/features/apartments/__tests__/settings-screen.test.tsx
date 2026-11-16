import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';

import SettingsScreen from '@/app/(app)/apartments/[apartmentId]/settings';
import { renderWithProviders } from '@/test/render';

import {
  addCategory,
  type Apartment,
  fetchApartment,
  fetchActiveInvites,
  fetchCategories,
  fetchMembers,
  type Member,
  renameCategory,
  revokeInvite,
} from '../api';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchActiveInvites: jest.fn(async () => []),
  revokeInvite: jest.fn(async () => undefined),
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
  expect(await screen.findByText('Anas (you)')).toBeOnTheScreen();
  // Codes are created from Add member; the list shows only while one works.
  expect(screen.queryByText('Join codes')).not.toBeOnTheScreen();
  expect(screen.queryByText('Create a join code')).not.toBeOnTheScreen();
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

it('shows each working code with the time left, and copies or deletes it', async () => {
  const hour = 60 * 60 * 1000;
  const at = (offset: number) => new Date(Date.now() + offset).toISOString();
  jest.mocked(fetchActiveInvites).mockResolvedValue([
    {
      id: 'inv-1',
      code: 'ABCD-2345',
      created_at: at(-hour),
      expires_at: at(3 * 24 * hour + 30 * 60 * 1000),
      created_by: ME,
    },
    // Made before codes were kept: listed without the code.
    {
      id: 'inv-2',
      code: null,
      created_at: at(-hour),
      expires_at: at(2 * hour + 30 * 60 * 1000),
      created_by: ME,
    },
    // Already expired by the time the screen shows it.
    {
      id: 'inv-3',
      code: 'WXYZ-6789',
      created_at: at(-8 * 24 * hour),
      expires_at: at(-1000),
      created_by: ME,
    },
  ]);
  const alert = jest.spyOn(Alert, 'alert');
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Manage members'));
  expect(await screen.findByText('ABCD-2345')).toBeOnTheScreen();
  expect(screen.getByText('3 days left')).toBeOnTheScreen();
  expect(screen.getByText('Code not shown')).toBeOnTheScreen();
  expect(screen.getByText('2 hours, 30 minutes left')).toBeOnTheScreen();
  expect(screen.queryByText('WXYZ-6789')).not.toBeOnTheScreen();
  expect(screen.queryByText(/Created|Expires/)).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Copy ABCD-2345' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ABCD-2345');

  await user.press(screen.getByRole('button', { name: /^Delete the code ABCD-2345/ }));
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  buttons.find((button) => button.text === 'Delete')?.onPress?.();
  await waitFor(() => expect(jest.mocked(revokeInvite).mock.calls[0]?.[0]).toBe('inv-1'));
});
