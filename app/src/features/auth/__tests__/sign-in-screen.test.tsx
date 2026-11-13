import { AuthApiError } from '@supabase/supabase-js';
import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { signInWithEmail } from '@/features/auth/api';
import { renderWithProviders } from '@/test/render';

import SignInScreen from '@/app/(auth)/sign-in';

jest.mock('@/features/auth/api', () => ({
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
}));
jest.mock('@/lib/env', () => ({
  getEnv: () => ({ EXPO_PUBLIC_AUTH_GOOGLE_ENABLED: false }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

const signIn = jest.mocked(signInWithEmail);

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('asks for an email and a password before calling the server', async () => {
  await renderWithProviders(<SignInScreen />);
  const user = userEvent.setup();

  await user.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
  expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
  expect(signIn).not.toHaveBeenCalled();
});

it('signs in with the cleaned email address', async () => {
  signIn.mockResolvedValue(undefined);
  await renderWithProviders(<SignInScreen />);

  await fillAndSubmit('  Anas@Example.com ', 'correct horse');

  expect(signIn).toHaveBeenCalledWith('anas@example.com', 'correct horse');
});

it('explains wrong credentials without showing the server message', async () => {
  signIn.mockRejectedValue(
    new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
  );
  await renderWithProviders(<SignInScreen />);

  await fillAndSubmit('anas@example.com', 'wrong password');

  expect(await screen.findByText('The email or password is incorrect.')).toBeOnTheScreen();
  expect(screen.queryByText('Invalid login credentials')).not.toBeOnTheScreen();
});

it('sends an unconfirmed account to the code screen', async () => {
  signIn.mockRejectedValue(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'));
  await renderWithProviders(<SignInScreen />);

  await fillAndSubmit('anas@example.com', 'correct horse');

  expect(router.push).toHaveBeenCalledWith({
    pathname: '/verify-email',
    params: { email: 'anas@example.com' },
  });
});
