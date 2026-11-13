import { shouldRetryQuery } from './query-client';

describe('shouldRetryQuery', () => {
  const offline = { message: 'TypeError: Network request failed', code: '' };

  it('retries a connection failure twice, then gives up', () => {
    expect(shouldRetryQuery(0, offline)).toBe(true);
    expect(shouldRetryQuery(1, offline)).toBe(true);
    expect(shouldRetryQuery(2, offline)).toBe(false);
  });

  it('never retries a permission error', () => {
    expect(shouldRetryQuery(0, { message: 'permission denied', code: '42501' })).toBe(false);
  });
});
