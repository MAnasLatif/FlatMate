import { storageStatusOf, userErrorMessage } from './errors';

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
