import {
  confirmEmailChangeCode,
  requestEmailChange,
  resendConfirmationCode,
  resendEmailChangeCodes,
  signUpWithEmail,
} from '../api';

const mockSignUp = jest.fn(async (..._args: unknown[]) => ({
  data: { session: null },
  error: null,
}));
const mockResend = jest.fn(async (..._args: unknown[]) => ({ error: null }));
const mockUpdateUser = jest.fn(async (..._args: unknown[]) => ({
  data: { user: null },
  error: null as Error | null,
}));
const mockVerifyOtp = jest.fn(async (..._args: unknown[]) => ({
  data: { user: null, session: null },
  error: null as Error | null,
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      resend: (...args: unknown[]) => mockResend(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
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

describe('changing email', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks Supabase to change the email', async () => {
    await requestEmailChange('new@example.test');
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.test' });
  });

  it('resends by asking for the change again, since auth.resend sends nothing for it', async () => {
    await resendEmailChangeCodes('new@example.test');
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.test' });
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('confirms a code with the address it was sent to', async () => {
    await confirmEmailChangeCode('old@example.test', '123456');
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'old@example.test',
      token: '123456',
      type: 'email_change',
    });
  });

  it('throws what Supabase rejects', async () => {
    const rejected = new Error('rejected');
    mockUpdateUser.mockResolvedValueOnce({ data: { user: null }, error: rejected });
    await expect(requestEmailChange('new@example.test')).rejects.toBe(rejected);
  });
});
