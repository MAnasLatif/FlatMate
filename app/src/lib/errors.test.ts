import { userErrorMessage } from './errors';

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
});
