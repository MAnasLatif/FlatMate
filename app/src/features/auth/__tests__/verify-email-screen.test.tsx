import { screen, userEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { resendConfirmationCode } from '@/features/auth/api';
import { renderWithProviders } from '@/test/render';

import VerifyEmailScreen from '@/app/(auth)/verify-email';

jest.mock('@/features/auth/api', () => ({
  confirmEmailWithCode: jest.fn(),
  resendConfirmationCode: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

const email = 'anas@example.test';

describe('VerifyEmailScreen', () => {
  it('right after sign-up, counts down before another code can be sent', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email, codeSent: '1' });
    await renderWithProviders(<VerifyEmailScreen />);

    const resend = screen.getByRole('button', { name: 'resend in 1:00' });
    expect(resend).toBeDisabled();
  });

  it('coming from sign-in, where no code was sent, offers a new code at once', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ email });
    await renderWithProviders(<VerifyEmailScreen />);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'send a new code' }));
    expect(jest.mocked(resendConfirmationCode).mock.calls[0]?.[0]).toBe(email);
    // Sent: the countdown starts again.
    expect(await screen.findByRole('button', { name: 'resend in 1:00' })).toBeDisabled();
    expect(screen.getByText('A new code is on its way.')).toBeOnTheScreen();
  });
});
