import { isAuthError } from '@supabase/supabase-js';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'The email or password is incorrect.',
  email_not_confirmed: 'Confirm your email address first. Enter the code we sent you.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'Choose a stronger password with at least 8 characters.',
  same_password: 'Choose a password different from your current one.',
  otp_expired: 'This code is incorrect or has expired. Request a new one.',
  over_email_send_rate_limit: 'Too many emails were sent. Wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  signup_disabled: 'New sign-ups are closed at the moment.',
  user_banned: 'This account has been suspended.',
};

const NETWORK_MESSAGE = 'Could not reach FlatMate. Check your connection and try again.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Turns an error from Supabase Auth into a sentence that can be shown to the
 * user. Server messages are never shown as-is, since they can expose internals.
 */
export function authErrorMessage(error: unknown): string {
  if (isAuthError(error)) {
    if (error.name === 'AuthRetryableFetchError') {
      return NETWORK_MESSAGE;
    }
    if (error.code && error.code in MESSAGES) {
      return MESSAGES[error.code];
    }
  }
  return FALLBACK_MESSAGE;
}

export function isEmailNotConfirmed(error: unknown): boolean {
  return isAuthError(error) && error.code === 'email_not_confirmed';
}
