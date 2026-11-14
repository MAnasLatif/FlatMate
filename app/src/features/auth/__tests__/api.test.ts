import { resendConfirmationCode, signUpWithEmail } from '../api';

const mockSignUp = jest.fn(async (..._args: unknown[]) => ({
  data: { session: null },
  error: null,
}));
const mockResend = jest.fn(async (..._args: unknown[]) => ({ error: null }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      resend: (...args: unknown[]) => mockResend(...args),
    },
  },
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `flatmate://${path}` }));

describe('confirmation emails', () => {
  it('send their link back to the app when signing up', async () => {
    await signUpWithEmail({
      displayName: 'Anas',
      email: 'anas@example.test',
      password: 'secret123',
    });
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { data: { display_name: 'Anas' }, emailRedirectTo: 'flatmate://auth/callback' },
      }),
    );
  });

  it('and when sending a new one', async () => {
    await resendConfirmationCode('anas@example.test');
    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'anas@example.test',
      options: { emailRedirectTo: 'flatmate://auth/callback' },
    });
  });
});
