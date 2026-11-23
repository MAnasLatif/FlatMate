import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { renderWithProviders } from '@/test/render';

import { fetchMutedPushCategories, setPushCategoryEnabled } from '../api';
import { PushSettingsSection } from '../components/push-settings';
import { withPushSetting } from '../preferences';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchMutedPushCategories: jest.fn(),
  setPushCategoryEnabled: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  jest.mocked(fetchMutedPushCategories).mockResolvedValue(['payments']);
  jest.mocked(setPushCategoryEnabled).mockResolvedValue();
});

describe('withPushSetting', () => {
  it('adds a group turned off once, and removes one turned on', () => {
    expect(withPushSetting(['payments'], 'expenses', false)).toEqual(['payments', 'expenses']);
    expect(withPushSetting(['payments'], 'payments', false)).toEqual(['payments']);
    expect(withPushSetting(['payments', 'members'], 'payments', true)).toEqual(['members']);
  });
});

describe('PushSettingsSection', () => {
  it('shows each group on unless the user turned it off', async () => {
    await renderWithProviders(<PushSettingsSection />);

    expect(await screen.findByRole('switch', { name: 'Expenses' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Payments' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Reminders' })).toBeChecked();
  });

  it('saves a group turned off, and the switch moves at once', async () => {
    let finish: () => void = () => undefined;
    jest.mocked(setPushCategoryEnabled).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await renderWithProviders(<PushSettingsSection />);

    await userEvent.setup().press(await screen.findByRole('switch', { name: 'Reminders' }));

    expect(setPushCategoryEnabled).toHaveBeenCalledWith('reminders', false);
    expect(screen.getByRole('switch', { name: 'Reminders' })).not.toBeChecked();
    finish();
  });

  it('moves the switch back and says so when saving fails', async () => {
    jest.mocked(setPushCategoryEnabled).mockRejectedValue(new Error('boom'));
    await renderWithProviders(<PushSettingsSection />);

    await userEvent.setup().press(await screen.findByRole('switch', { name: 'Expenses' }));

    expect(await screen.findByText(/Could not save your notification settings/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Expenses' })).toBeChecked());
  });

  it('offers a retry when the settings do not load', async () => {
    jest.mocked(fetchMutedPushCategories).mockRejectedValue(new Error('boom'));
    await renderWithProviders(<PushSettingsSection />);

    expect(await screen.findByText(/Could not load your notification settings/)).toBeTruthy();
  });

  it('cannot be changed offline', async () => {
    await renderWithProviders(<PushSettingsSection />);
    await screen.findByRole('switch', { name: 'Expenses' });

    await act(async () => onlineManager.setOnline(false));

    expect(screen.getByRole('switch', { name: 'Expenses' })).toBeDisabled();
    expect(screen.getByText('You are offline. Reconnect to change these.')).toBeTruthy();
  });
});
