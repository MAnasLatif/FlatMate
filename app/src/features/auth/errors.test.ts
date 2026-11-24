import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js';

import { authErrorMessage, isEmailNotConfirmed } from './errors';

describe('authErrorMessage', () => {
  it('explains a known error code', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    expect(authErrorMessage(error)).toBe('The email or password is incorrect.');
  });

  it('explains a password found in a data breach', () => {
    const error = new AuthWeakPasswordError('Password is known to be weak', 422, ['pwned']);
    expect(authErrorMessage(error)).toMatch(/data breach/);
  });

  it('keeps the length advice for a password that is only too short', () => {
    const error = new AuthWeakPasswordError('Password is too short', 422, ['length']);
    expect(authErrorMessage(error)).toBe('Choose a stronger password with at least 8 characters.');
  });

  it('reports a network failure as a connection problem', () => {
    const error = new AuthRetryableFetchError('Failed to fetch', 0);
    expect(authErrorMessage(error)).toMatch(/check your connection/i);
  });

  it('never shows the server message for an unknown code', () => {
    const error = new AuthApiError(
      'internal detail: relation "x" does not exist',
      500,
      'unexpected_failure',
    );
    expect(authErrorMessage(error)).toBe('Something went wrong. Please try again.');
  });

  it('handles errors that are not from Supabase', () => {
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});

describe('isEmailNotConfirmed', () => {
  it('recognises an unconfirmed email', () => {
    expect(
      isEmailNotConfirmed(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed')),
    ).toBe(true);
    expect(isEmailNotConfirmed(new AuthApiError('Invalid', 400, 'invalid_credentials'))).toBe(
      false,
    );
  });
});
