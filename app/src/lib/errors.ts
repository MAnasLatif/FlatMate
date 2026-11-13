const NETWORK_MESSAGE = 'Could not reach FlatMate. Check your connection and try again.';

/**
 * A sentence to show the user when a database, storage or function call fails.
 * Server messages are never shown as-is, since they can expose internals;
 * callers pass their own fallback for the situation.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (isNetworkError(error)) {
    return NETWORK_MESSAGE;
  }
  return fallback;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && /network request failed|failed to fetch/i.test(error.message)) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    /network request failed|failed to fetch/i.test(error.message)
  );
}
