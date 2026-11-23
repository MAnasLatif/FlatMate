import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';

import SettingsScreen from '@/app/(app)/apartments/[apartmentId]/settings';
import { renderWithProviders } from '@/test/render';

import {
  addCategory,
  archiveCategory,
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
  renameCategory,
  changeJoinCode,
  updateApartmentReminders,
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
  fetchJoinCode: jest.fn(async () => 'ABCD-2345'),
  changeJoinCode: jest.fn(async () => 'WXYZ-6789'),
  fetchJoinRequests: jest.fn(async () => []),
  fetchCategories: jest.fn(async () => []),
  addCategory: jest.fn(async () => undefined),
  renameCategory: jest.fn(async () => undefined),
  archiveCategory: jest.fn(async () => undefined),
  updateApartmentReminders: jest.fn(async () => undefined),
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
  expect(await screen.findByTestId('join-code')).toHaveTextContent('ABCD-2345');
  expect(screen.getByRole('button', { name: 'Your actions' })).toBeOnTheScreen();
  // Inviting by email is part of the Join code card; there is no separate Add member.
  expect(screen.getByPlaceholderText('friend@example.com')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeOnTheScreen();
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

it('shows the one join code to copy or share, and changes it after asking', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Manage members'));
  expect(await screen.findByTestId('join-code')).toHaveTextContent('ABCD-2345');

  await user.press(screen.getByRole('button', { name: 'Copy' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ABCD-2345');
  await user.press(screen.getByRole('button', { name: 'Share' }));
  expect(share).toHaveBeenCalledWith({
    message: 'Join Flat 4B on FlatMate with this code: ABCD-2345',
  });

  await user.press(screen.getByRole('button', { name: 'Change code' }));
  // The app's own dialog asks first; its button has the same name.
  expect(await screen.findByText('Change the join code?')).toBeOnTheScreen();
  const [, confirmButton] = screen.getAllByRole('button', { name: 'Change code' });
  await user.press(confirmButton);
  await waitFor(() => expect(screen.getByTestId('join-code')).toHaveTextContent('WXYZ-6789'));
  expect(changeJoinCode).toHaveBeenCalledTimes(1);
});

it("asks in the app's dialog before archiving a category", async () => {
  jest.mocked(fetchCategories).mockResolvedValue([{ id: 'c-1', name: 'Groceries' }]);
  await renderWithProviders(<SettingsScreen />);
  const user = userEvent.setup();

  await user.press(await screen.findByText('Expense control'));
  await user.press(await screen.findByRole('button', { name: 'Archive Groceries' }));
  expect(await screen.findByText('Archive "Groceries"?')).toBeOnTheScreen();
  expect(archiveCategory).not.toHaveBeenCalled();

  await user.press(screen.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(jest.mocked(archiveCategory).mock.calls[0]?.[0]).toBe('c-1'));
});

describe('reminders', () => {
  it('shows the schedule on the general settings', async () => {
    await renderWithProviders(<SettingsScreen />);

    expect(await screen.findByRole('switch', { name: 'Bills due' })).toBeChecked();
    expect(screen.getByRole('button', { name: '1 day before', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Settlement day' })).toBeChecked();
    expect(screen.getByRole('button', { name: '2 days before', selected: true })).toBeOnTheScreen();
  });

  it('saves a new lead time at once, keeping the other reminder', async () => {
    await renderWithProviders(<SettingsScreen />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'On the day only' }));

    expect(updateApartmentReminders).toHaveBeenCalledWith(FLAT, {
      dueReminderDays: 0,
      settlementReminderDays: 2,
    });
  });

  it('turns a reminder off and hides its choices', async () => {
    jest
      .mocked(fetchApartment)
      .mockResolvedValueOnce(apartment)
      .mockResolvedValue({ ...apartment, settlement_reminder_days: null });
    await renderWithProviders(<SettingsScreen />);

    await userEvent.setup().press(await screen.findByRole('switch', { name: 'Settlement day' }));

    expect(updateApartmentReminders).toHaveBeenCalledWith(FLAT, {
      dueReminderDays: 1,
      settlementReminderDays: null,
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Settlement day' })).not.toBeChecked(),
    );
    // Only the bill reminder still offers its choices.
    expect(screen.getAllByRole('button', { name: '7 days before' })).toHaveLength(1);
  });

  it('says so and goes back when saving fails', async () => {
    jest.mocked(updateApartmentReminders).mockRejectedValue(new Error('boom'));
    await renderWithProviders(<SettingsScreen />);

    // The first '3 days before' is the bill reminder's.
    const [billChoice] = await screen.findAllByRole('button', { name: '3 days before' });
    await userEvent.setup().press(billChoice);

    expect(await screen.findByText('Could not save the reminders.')).toBeOnTheScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '1 day before', selected: true }),
      ).toBeOnTheScreen(),
    );
  });
});
