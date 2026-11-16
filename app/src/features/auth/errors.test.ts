import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { authErrorMessage, isEmailNotConfirmed } from './errors';

describe('authErrorMessage', () => {
  it('explains a known error code', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    expect(authErrorMessage(error)).toBe('The email or password is incorrect.');
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
