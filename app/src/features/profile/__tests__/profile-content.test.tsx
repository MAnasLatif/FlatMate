import { act, screen, userEvent } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { fetchMyAccounts } from '@/features/accounts/api';
import { signOut, updatePassword } from '@/features/auth/api';
import { renderWithProviders } from '@/test/render';

import { fetchProfile, type Profile, removeAvatar, updateDisplayName, uploadAvatar } from '../api';
import { ChangePassword } from '../components/change-password';
import { SignOutButton } from '../components/sign-out-button';
import { NAME_AUTOSAVE_DELAY_MS, ProfileContent } from '../components/profile-content';

const ANAS = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/features/notifications/push', () => ({ unregisterThisDevice: jest.fn() }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
  useSession: () => ({ session: { user: { email: 'anas@example.com' } } }),
}));
jest.mock('@/features/auth/api', () => ({
  signOut: jest.fn(),
  updatePassword: jest.fn(),
}));
jest.mock('@/features/accounts/api', () => ({
  ...jest.requireActual('@/features/accounts/api'),
  fetchMyAccounts: jest.fn(),
}));
jest.mock('@/features/notifications/api', () => ({
  ...jest.requireActual('@/features/notifications/api'),
  fetchMutedPushCategories: jest.fn(async () => []),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchProfile: jest.fn(),
  updateDisplayName: jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
  createAvatarUrl: jest.fn(),
}));

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: ANAS,
  display_name: 'Anas Latif',
  avatar_path: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  onlineManager.setOnline(true);
  jest.mocked(fetchProfile).mockResolvedValue(profile());
  jest.mocked(fetchMyAccounts).mockResolvedValue([]);
  jest.mocked(updateDisplayName).mockResolvedValue();
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderProfile() {
  const view = await renderWithProviders(<ProfileContent />);
  const nameInput = await screen.findByLabelText('Your name');
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  return { view, nameInput, user };
}

async function waitPastAutosave() {
  await act(async () => {
    jest.advanceTimersByTime(NAME_AUTOSAVE_DELAY_MS);
  });
}

describe('ProfileContent', () => {
  it('has no save button for the name', async () => {
    await renderProfile();

    expect(screen.queryByRole('button', { name: 'Save name' })).toBeNull();
  });

  it('saves the name once typing stops', async () => {
    const { nameInput, user } = await renderProfile();

    await user.clear(nameInput);
    await user.type(nameInput, 'M Anas Latif', { skipBlur: true });
    expect(updateDisplayName).not.toHaveBeenCalled();

    await waitPastAutosave();

    expect(updateDisplayName).toHaveBeenCalledTimes(1);
    expect(updateDisplayName).toHaveBeenCalledWith(ANAS, 'M Anas Latif');
  });

  it('saves straight away when the field loses focus, and only once', async () => {
    const { nameInput, user } = await renderProfile();

    await user.clear(nameInput);
    await user.type(nameInput, 'Anas', { submitEditing: true });
    expect(updateDisplayName).toHaveBeenCalledWith(ANAS, 'Anas');

    await waitPastAutosave();

    expect(updateDisplayName).toHaveBeenCalledTimes(1);
  });

  it('saves an unsaved name when the screen closes', async () => {
    const { view, nameInput, user } = await renderProfile();

    await user.clear(nameInput);
    await user.type(nameInput, 'Anas L', { skipBlur: true });
    await act(async () => {
      await view.unmount();
    });

    expect(updateDisplayName).toHaveBeenCalledWith(ANAS, 'Anas L');
  });

  it('does not save an empty name and says how to fix it', async () => {
    const { nameInput, user } = await renderProfile();

    await user.clear(nameInput);
    await waitPastAutosave();

    expect(updateDisplayName).not.toHaveBeenCalled();
    expect(await screen.findByText('Enter your name.')).toBeTruthy();
  });

  it('waits while offline and saves once the device reconnects', async () => {
    const { nameInput, user } = await renderProfile();
    await act(async () => onlineManager.setOnline(false));

    await user.clear(nameInput);
    await user.type(nameInput, 'Anas', { skipBlur: true });
    await waitPastAutosave();

    expect(updateDisplayName).not.toHaveBeenCalled();
    expect(
      screen.getByText('You are offline. Your name will be saved when you reconnect.'),
    ).toBeTruthy();

    await act(async () => onlineManager.setOnline(true));
    await waitPastAutosave();

    expect(updateDisplayName).toHaveBeenCalledWith(ANAS, 'Anas');
  });

  it('opens the photo picker when the avatar is tapped', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/png' }],
    } as ImagePicker.ImagePickerResult);
    const { user } = await renderProfile();

    await user.press(screen.getByRole('button', { name: 'Add a photo' }));

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(uploadAvatar).toHaveBeenCalledWith(ANAS, {
      uri: 'file:///photo.jpg',
      mimeType: 'image/png',
    });
  });

  it('offers to change or remove an existing photo', async () => {
    jest.mocked(fetchProfile).mockResolvedValue(profile({ avatar_path: `${ANAS}/avatar` }));
    const { user } = await renderProfile();

    await user.press(screen.getByRole('button', { name: 'Change or remove your photo' }));

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose a new photo')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Remove photo' }));
    expect(removeAvatar).toHaveBeenCalledWith(ANAS);
  });

  it('opens the change-password modal', async () => {
    const { user } = await renderProfile();

    await user.press(screen.getByRole('button', { name: 'Change password' }));

    expect(router.push).toHaveBeenCalledWith('/change-password');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('has no sign-out button in the page, and lists bank and wallet accounts last', async () => {
    await renderProfile();

    expect(screen.queryByText('Sign out')).toBeNull();
    const rendered = JSON.stringify(screen.toJSON());
    const accountsAt = rendered.indexOf('Bank & wallet accounts');
    expect(accountsAt).toBeGreaterThan(rendered.indexOf('Change password'));
  });
});

describe('ChangePassword', () => {
  it('changes the password and closes the modal', async () => {
    jest.mocked(updatePassword).mockResolvedValue();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderWithProviders(<ChangePassword />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.type(screen.getByLabelText('New password'), 'a-new-password');
    await user.press(screen.getByRole('button', { name: 'Change password' }));

    expect(updatePassword).toHaveBeenCalledWith('a-new-password');
    expect(router.back).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Password changed', expect.any(String));
  });

  it('rejects a short password without sending it', async () => {
    await renderWithProviders(<ChangePassword />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.type(screen.getByLabelText('New password'), 'short');
    await user.press(screen.getByRole('button', { name: 'Change password' }));

    expect(updatePassword).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('SignOutButton', () => {
  it('signs out only after confirming in the sheet', async () => {
    jest.mocked(signOut).mockResolvedValue();
    await renderWithProviders(<SignOutButton />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.press(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    expect(signOut).not.toHaveBeenCalled();
    expect(await screen.findByText('Sign out?')).toBeTruthy();

    const [, confirm] = screen.getAllByRole('button', { name: 'Sign out' });
    await user.press(confirm);

    expect(signOut).toHaveBeenCalled();
  });
});
