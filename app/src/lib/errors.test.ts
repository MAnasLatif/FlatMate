import { isRetryableError, storageStatusOf, userErrorMessage } from './errors';

describe('userErrorMessage', () => {
  it('reports a failed request as a connection problem', () => {
    expect(userErrorMessage(new TypeError('Network request failed'), 'Could not save.')).toMatch(
      /check your connection/i,
    );
    expect(userErrorMessage({ message: 'TypeError: Failed to fetch' }, 'Could not save.')).toMatch(
      /check your connection/i,
    );
  });

  it('uses the caller fallback instead of the server message', () => {
    const serverError = { message: 'duplicate key value violates unique constraint "x_pkey"' };
    expect(userErrorMessage(serverError, 'Could not save your name.')).toBe(
      'Could not save your name.',
    );
    expect(userErrorMessage(undefined, 'Could not save.')).toBe('Could not save.');
  });

  it('explains a known error key raised by a database function', () => {
    const error = { message: 'last_admin', code: 'P0001' };
    expect(
      userErrorMessage(error, 'Could not change the role.', {
        last_admin: 'Make someone else an admin first.',
      }),
    ).toBe('Make someone else an admin first.');
  });

  it('explains a known Postgres error code', () => {
    const error = { message: 'duplicate key value', code: '23505' };
    expect(
      userErrorMessage(error, 'Could not add the category.', {
        '23505': 'A category with this name already exists.',
      }),
    ).toBe('A category with this name already exists.');
  });
});

describe('storageStatusOf', () => {
  it('prefers the status code storage puts in the body', () => {
    expect(storageStatusOf({ status: 400, statusCode: '413' })).toBe(413);
  });

  it('falls back to the HTTP status', () => {
    expect(storageStatusOf({ status: 415 })).toBe(415);
    expect(storageStatusOf({ status: 403, statusCode: 'not a number' })).toBe(403);
  });

  it('returns nothing for errors without a status', () => {
    expect(storageStatusOf(new Error('boom'))).toBeUndefined();
    expect(storageStatusOf(null)).toBeUndefined();
  });
});

describe('isRetryableError', () => {
  it('retries a failed connection', () => {
    expect(isRetryableError({ message: 'TypeError: Network request failed', code: '' })).toBe(true);
  });

  it('does not retry an answer the server will give again', () => {
    expect(isRetryableError({ message: 'not_admin', code: 'P0001' })).toBe(false);
    expect(isRetryableError({ message: 'permission denied', code: '42501' })).toBe(false);
    expect(isRetryableError({ message: 'not found', code: 'PGRST116' })).toBe(false);
  });

  it('retries database errors that can pass on a second try', () => {
    expect(isRetryableError({ message: 'deadlock detected', code: '40P01' })).toBe(true);
    expect(isRetryableError({ message: 'canceling statement', code: '57014' })).toBe(true);
    expect(isRetryableError({ message: 'could not connect', code: 'PGRST000' })).toBe(true);
  });

  it('retries storage only for timeouts, rate limits and server errors', () => {
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 400, statusCode: '413' })).toBe(false);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('retries failures it knows nothing about', () => {
    expect(isRetryableError(new Error('boom'))).toBe(true);
  });
});
